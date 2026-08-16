#!/usr/bin/env python3
"""Gem PR rehabilitation: bounded exact-head repair without issue pickup."""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import os
import pathlib
import subprocess
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
try:
    from gem_repo_registry import by_github
except ImportError:  # pragma: no cover - deployed Gem supplies this module

    def by_github(repo):
        class Policy:
            pr_drain = False
            repo_class = "registry_unavailable"
            default_branch = "main"

        return Policy()


from gem_gate_contract import drain_state_dir, gate_state_dir, validate_gate_result
from gem_rehabilitation_policy import bounded_selection, decide_action

REPO = os.environ.get("GEM_PR_DRAIN_REPO", "JovieInc/Jovie")
REPO_POLICY = by_github(REPO)
JOVIE_REPOSITORIES = frozenset({"jovieinc/jovie", "itstimwhite/jovie"})


def is_jovie_repository(repo):
    return repo.casefold() in JOVIE_REPOSITORIES


def repo_drain_enabled(repo, policy_enabled):
    """Registry admission enables stabilization, never direct issue pickup."""
    return bool(policy_enabled)


IS_JOVIE_REPOSITORY = is_jovie_repository(REPO)
POLICY_ENABLED = repo_drain_enabled(REPO, bool(REPO_POLICY.pr_drain))
ROOT = pathlib.Path(os.environ.get("GEM_WORKSPACE", "/home/timwhite/gem-workspace"))
STATE = drain_state_dir(ROOT, REPO)
ARTIFACT = STATE / "latest.json"
TARGET = int(os.environ.get("GEM_PR_DRAIN_TARGET", "5"))
MAX_CAP = int(os.environ.get("GEM_PR_DRAIN_MAX_PARALLEL", "4"))
GATE = ROOT / "scripts" / "gem-priority-gate.py"
EXCLUDED = {"needs-human-taste", "needs-human-review", "hold", "no-auto", "gated", "taste"}
MAIN_GREEN_LABELS = {
    "main-green-fix",
    "main-green",
    "main-repair",
    "main-red-fix",
    "ci-bottleneck",
    "runner-repair",
    "workflow-repair",
    "control-plane-repair",
    "main-green-fix-pr",
}
MAIN_GREEN_TOKENS = (
    "main workflow",
    "main repair",
    "runner",
    "workflow",
    "control-plane",
    "control plane",
    "ci throughput",
    "ci bottleneck",
    "drain infrastructure",
    "repair routing",
    "main green",
)
WORK_GATE_CACHE = {"checked_at": 0.0, "blocker": "fleet_gate_not_checked"}


def run_process(args, *, timeout=90):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)


def run(*args, timeout=90):
    process = run_process(args, timeout=timeout)
    if process.returncode:
        detail = process.stderr.strip() or process.stdout.strip()
        raise RuntimeError(f"{' '.join(args)}: {detail}")
    return process.stdout


def gate_args(*, dry_run=False):
    args = [
        "python3",
        str(GATE),
        "--consumer",
        "remediation",
        "--repo",
        REPO,
        "--state-dir",
        str(gate_state_dir(ROOT, REPO)),
        "--integrity-receipt",
        str(ROOT / "state" / "integrity.json"),
        "--concurrency-evidence",
        str(ROOT / "state" / "concurrency.json"),
    ]
    if dry_run:
        args.append("--dry-run")
    return args


def evaluate_remediation_gate(*, dry_run=False, timeout=300):
    gate = run_process(gate_args(dry_run=dry_run), timeout=timeout)
    return validate_gate_result(gate.returncode, gate.stdout, "remediation")


def work_mutation_blocker(max_age=15.0):
    now = time.monotonic()
    if now - WORK_GATE_CACHE["checked_at"] < max_age:
        return WORK_GATE_CACHE["blocker"]
    try:
        receipt = evaluate_remediation_gate(dry_run=True)
        blocker = (
            None
            if receipt["remediationAdmission"]["pushAllowed"]
            else f"remediation_push_gate_{receipt['state'].lower()}"
        )
    except Exception as error:
        blocker = f"fleet_gate_invalid_fail_closed:{type(error).__name__}"
    WORK_GATE_CACHE.update(checked_at=now, blocker=blocker)
    return blocker


def gh_json(*args):
    return json.loads(run("gh", "api", *args))


def capacity():
    cpus = os.cpu_count() or 2
    memory = 0
    try:
        for line in pathlib.Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                memory = int(line.split()[1]) * 1024
                break
    except OSError:
        pass
    by_memory = max(1, memory // (2 * 1024**3)) if memory else 1
    return max(1, min(MAX_CAP, cpus, by_memory))


def labels(pr):
    return {label["name"].lower() for label in pr.get("labels", [])}


def excluded(pr):
    head = pr.get("head", {}).get("ref", "")
    title = pr.get("title", "")
    return (
        pr.get("draft")
        or head.startswith("gtmq_")
        or "[graphite mq]" in title.lower()
        or bool(labels(pr) & EXCLUDED)
    )


def priority_class(pr):
    if labels(pr) & EXCLUDED:
        return "taste_or_human"
    if (
        pr.get("draft")
        or pr.get("head", {}).get("ref", "").startswith("gtmq_")
        or "[graphite mq]" in pr.get("title", "").lower()
    ):
        return "generated_draft"
    if labels(pr) & MAIN_GREEN_LABELS:
        return "main_green_fix"
    haystack = " ".join(
        [
            pr.get("title", ""),
            pr.get("body", ""),
            pr.get("head", {}).get("ref", ""),
            " ".join(str(path) for path in pr.get("changed_files", [])),
        ]
    ).lower()
    return (
        "main_green_fix"
        if any(token in haystack for token in MAIN_GREEN_TOKENS)
        else "existing_pr_remediation"
    )


def policy_decision(*, main_green, queue_count, target, worker_capacity):
    intake = bool(main_green and queue_count <= target)
    return {
        "main_green": main_green,
        "queue_count": queue_count,
        "target": target,
        "capacity": worker_capacity,
        "pr_drain": True,
        "new_issue_intake": intake,
        "reason": (
            "main_green_and_queue_at_or_below_target"
            if intake
            else "main_not_green"
            if not main_green
            else "eligible_queue_above_target"
        ),
    }


def select_prs(prs, *, main_green, worker_capacity):
    eligible = [
        pr
        for pr in prs
        if pr.get("base", {}).get("ref", REPO_POLICY.default_branch)
        == REPO_POLICY.default_branch
        and not excluded(pr)
    ]
    for pr in eligible:
        pr["priority_class"] = priority_class(pr)
    eligible.sort(key=lambda pr: (pr.get("created_at", ""), pr.get("number", 0)))
    if main_green:
        return bounded_selection(eligible, max(0, worker_capacity))
    main_repairs = [pr for pr in eligible if pr["priority_class"] == "main_green_fix"]
    others = [pr for pr in eligible if pr["priority_class"] != "main_green_fix"]
    return bounded_selection(main_repairs + others, max(0, worker_capacity))


def inventory():
    all_open = gh_json(
        f"repos/{REPO}/pulls", "-X", "GET", "-f", "state=open", "-f", "per_page=100"
    )
    all_open.sort(key=lambda pr: (pr.get("created_at", ""), pr.get("number", 0)))
    eligible = []
    for pr in all_open:
        if excluded(pr) or pr.get("base", {}).get("ref") != REPO_POLICY.default_branch:
            continue
        details = gh_json(f"repos/{REPO}/pulls/{pr['number']}")
        pr.update(
            {
                key: details.get(key)
                for key in ("mergeable", "mergeable_state", "head", "base", "body")
            }
        )
        files = gh_json(
            f"repos/{REPO}/pulls/{pr['number']}/files",
            "-X",
            "GET",
            "-f",
            "per_page=100",
        )
        pr["changed_files"] = [item.get("filename", "") for item in files]
        pr["priority_class"] = priority_class(pr)
        eligible.append(pr)
    return all_open, eligible


def auth_status():
    try:
        run("gh", "auth", "status", timeout=20)
    except Exception as error:
        return False, f"github_auth_unavailable:{type(error).__name__}"
    return True, "github_auth_ok"


def update_one(pr):
    result = {
        "number": pr["number"],
        "head": pr.get("head", {}).get("ref"),
        "before_state": pr.get("mergeable_state"),
        "priority_class": pr.get("priority_class") or priority_class(pr),
    }
    blocker = work_mutation_blocker(max_age=0)
    if blocker:
        return {
            **result,
            "action": "work_admission_blocked",
            "result": "skipped",
            "reason": blocker,
        }
    head_sha = pr.get("head", {}).get("sha")
    if not isinstance(head_sha, str) or not head_sha:
        return {
            **result,
            "action": "api_update_branch",
            "result": "skipped",
            "reason": "expected_head_sha_missing_fail_closed",
        }
    action = decide_action(
        state="GREEN",
        push_allowed=True,
        mergeable_state=pr.get("mergeable_state", "unknown"),
        expected_head=head_sha,
        attempt=int(pr.get("repair_attempt", 0)),
    )
    if action != "exact_head_branch_update":
        return {
            **result,
            "action": action,
            "result": "skipped",
            "reason": "classified_for_bounded_rehabilitation",
        }
    try:
        response = run(
            "gh",
            "api",
            "-X",
            "PUT",
            f"repos/{REPO}/pulls/{pr['number']}/update-branch",
            "-f",
            f"expected_head_sha={head_sha}",
            timeout=90,
        )
        return {
            **result,
            "action": "api_update_branch",
            "result": "ok",
            "response": response.strip()[:500],
        }
    except Exception as error:
        return {
            **result,
            "action": "api_update_branch",
            "result": "error",
            "error": f"{type(error).__name__}",
        }


def write_artifact(document):
    STATE.mkdir(parents=True, exist_ok=True)
    temporary = ARTIFACT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(document, indent=2) + "\n")
    temporary.replace(ARTIFACT)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    document = {
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "repo": REPO,
        "target": TARGET,
        "dry_run": args.dry_run,
        "ownership": {
            "controller": "Gem",
            "implementation": "Symphony",
            "stabilization": "Gem",
            "promotion": "Gem native merge queue controller",
            "directGemPickup": False,
        },
        "processed": [],
        "errors": [],
    }
    try:
        if not POLICY_ENABLED:
            raise RuntimeError(
                f"PR drain disabled by Gem repo policy for {REPO} "
                f"({REPO_POLICY.repo_class}); monitor only"
            )
        gate_timeout = int(os.environ.get("GEM_PRIORITY_GATE_TIMEOUT", "300"))
        gate = evaluate_remediation_gate(dry_run=args.dry_run, timeout=gate_timeout)
        document["priority_gate"] = gate
        if not gate["remediationAdmission"]["localAllowed"]:
            document.update(
                status="ok",
                remediation_admission="blocked",
                capacity=capacity(),
                intake="blocked_remediation_admission",
                selected=[],
            )
            write_artifact(document)
            print(json.dumps(document, indent=2))
            return 0

        authenticated, reason = auth_status()
        document["auth"] = {"github": reason}
        if not authenticated:
            raise RuntimeError(reason)
        all_open, eligible = inventory()
        worker_capacity = capacity()
        document.update(
            open_count=len(all_open),
            eligible_count=len(eligible),
            capacity=worker_capacity,
            inventory=[
                {
                    "number": pr["number"],
                    "created_at": pr["created_at"],
                    "title": pr["title"],
                    "head": pr["head"]["ref"],
                    "mergeable_state": pr.get("mergeable_state"),
                    "priority_class": priority_class(pr),
                    "excluded": excluded(pr),
                }
                for pr in all_open
            ],
        )
        main_green = gate["signals"]["main"]["status"] == "green"
        decision = policy_decision(
            main_green=main_green,
            queue_count=len(eligible),
            target=TARGET,
            worker_capacity=worker_capacity,
        )
        document["policy_decision"] = decision
        document["intake"] = (
            "allowed_main_green_queue_at_or_below_target"
            if decision["new_issue_intake"]
            else f"paused_{decision['reason']}"
        )
        selected = select_prs(
            eligible, main_green=main_green, worker_capacity=worker_capacity
        )
        document["selected"] = [
            {
                "number": pr["number"],
                "priority_class": pr["priority_class"],
                "created_at": pr.get("created_at"),
                "title": pr.get("title"),
            }
            for pr in selected
        ]
        if args.dry_run:
            document["processed"] = [
                {
                    "number": pr["number"],
                    "priority_class": pr["priority_class"],
                    "action": "dry_run",
                    "result": "skipped",
                    "reason": "dry_run_no_mutation",
                }
                for pr in selected
            ]
        else:
            with concurrent.futures.ThreadPoolExecutor(
                max_workers=max(1, len(selected))
            ) as executor:
                document["processed"] = list(executor.map(update_one, selected))
    except Exception as error:
        document["errors"].append(f"{type(error).__name__}:{error}")
        document["status"] = "error"
        write_artifact(document)
        print(json.dumps(document, indent=2))
        return 1
    document["status"] = "ok"
    write_artifact(document)
    print(json.dumps(document, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
