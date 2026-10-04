"""Predict, classify, and sequence Symphony file overlaps (JOV-7595).

The classifier is pure.  State and GitHub mutations are kept in the small helpers at
the bottom so admission, the PR event tick, doctor, and tests share one policy.
"""
from __future__ import annotations

import fcntl
import fnmatch
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
import pr_events

HOT_FILES = frozenset({
    "scripts/lanes/lane_runner.py",
    "scripts/lanes/doctor.py",
    "scripts/lanes/pr_events.py",
    "scripts/lanes/hud.py",
})
SHARED_FILES = frozenset({
    "pnpm-lock.yaml",
    ".github/workflow-topology.gen.yml",
    "docs/CRON_REGISTRY.md",
    "scripts/ci-fast-lanes.mjs",
})
WORKSTREAM_PATHS = {
    "symphony-throughput": tuple(sorted(HOT_FILES)),
    "ci": (".github/workflows/*", ".github/workflow-topology.gen.yml", "scripts/ci-fast-lanes.mjs"),
    "docs-changelog": ("README.md", "**/README.md"),
    "ovie-ops": ("scripts/lanes/hud.py", "scripts/lanes/doctor.py"),
    "release-deploy": (".github/workflows/*", "scripts/ci-fast-lanes.mjs"),
}
TASK_TTL_S = 3 * 3600
PATH_TOKEN = re.compile(
    r"(?<![\w.-])(?:`)?((?:\.?[\w@+-]+/)+(?:[\w@+.*-]+\.)[\w*.-]+|"
    r"(?:lane_runner|doctor|pr_events|hud)\.py|README(?:\.[\w-]+)?\.md|"
    r"(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?))(?:`)?"
)
MIGRATION = re.compile(r"(?:^|/)(\d{4})_[^/]+(?:\.sql)?$")
STACK_REF = re.compile(r"(?i)\b(?:stacked?|child)\s+(?:on|of)\s+#(\d{1,7})")
DEP_REF = re.compile(r"(?i)\b(?:after|blocked by|depends? on|parent)\D{0,18}#(\d{1,7})")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def guard_mode(value: str | None = None) -> str:
    value = os.environ.get("SYMPHONY_FILE_OVERLAP_GUARD", "1") if value is None else value
    lowered = str(value).strip().lower()
    if lowered in {"0", "false", "off", "no"}:
        return "off"
    return "flag" if lowered == "flag" else "enforce"


def _issue_labels(issue) -> list[str]:
    values = issue.get("labels", []) if isinstance(issue, dict) else getattr(issue, "labels", [])
    return [str(value.get("name") if isinstance(value, dict) else value) for value in values]


def predict_issue_files(issue, classify) -> dict:
    """Declared paths win; otherwise use the deterministic workstream ownership map."""
    title = issue.get("title", "") if isinstance(issue, dict) else getattr(issue, "title", "")
    description = issue.get("description", "") if isinstance(issue, dict) else getattr(issue, "description", "")
    declared = []
    for match in PATH_TOKEN.finditer(f"{title}\n{description}"):
        path = match.group(1).strip("`.,:;()[]{}")
        if "/" not in path and path in {Path(hot).name for hot in HOT_FILES}:
            path = next(hot for hot in HOT_FILES if Path(hot).name == path)
        if path not in declared:
            declared.append(path)
    migration_numbers = set(re.findall(r"(?i)\bmigration\s+(\d{4})\b|`(\d{4})_[^`]+`", description))
    for groups in migration_numbers:
        number = next((part for part in groups if part), "")
        pattern = f"**/{number}_*"
        if number and pattern not in declared:
            declared.append(pattern)
    if declared:
        return {"files": declared, "source": "issue-declared-paths"}
    stream = classify(title, _issue_labels(issue))
    return {"files": list(WORKSTREAM_PATHS.get(stream, ())), "source": f"workstream:{stream}"}


def _file_rows(actor: dict) -> list[dict]:
    rows = []
    for value in actor.get("files") or []:
        row = value if isinstance(value, dict) else {"path": value}
        path = row.get("path") or row.get("filename")
        if path:
            path = str(path)
            rows.append({**row, "path": path[2:] if path.startswith("./") else path})
    return rows


def _patterns_overlap(left: str, right: str) -> bool:
    return left == right or fnmatch.fnmatch(left, right) or fnmatch.fnmatch(right, left)


def overlapping_files(left: dict, right: dict) -> list[str]:
    overlaps = set()
    for a in _file_rows(left):
        for b in _file_rows(right):
            if _patterns_overlap(a["path"], b["path"]):
                overlaps.add(b["path"] if "*" not in b["path"] else a["path"])
    return sorted(overlaps)


def migration_numbers(actor: dict, *, added_only: bool = False) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for row in _file_rows(actor):
        if "migration" not in row["path"].lower() and not row["path"].startswith("**/"):
            continue
        if added_only:
            change = str(row.get("changeType") or row.get("status") or "").upper()
            if change and change not in {"ADDED", "A"}:
                continue
            if not change and row.get("deletions", 0):
                continue
        match = MIGRATION.search(row["path"])
        if match:
            found.setdefault(match.group(1), []).append(row["path"])
    return found


def shared_file(path: str) -> bool:
    name = Path(path).name.lower()
    lockfile = (name in {"package-lock.json", "yarn.lock", "bun.lock", "bun.lockb", "cargo.lock",
                         "gemfile.lock", "poetry.lock", "pnpm-lock.yaml"} or name.endswith(".lock"))
    return (path in SHARED_FILES or name.startswith("readme") or lockfile
            or generated_file(path) or path.endswith("/meta/_journal.json")
            or ("/meta/" in path and name.endswith("_snapshot.json")))


def generated_file(path: str) -> bool:
    lowered = path.lower()
    return (path == ".github/workflow-topology.gen.yml" or ".gen." in Path(path).name
            or ".generated." in Path(path).name or "/generated/" in lowered or "/__generated__/" in lowered
            or path.endswith("/meta/_journal.json") or
            ("/meta/" in path and Path(path).name.endswith("_snapshot.json")))


def _number(actor: dict) -> int | None:
    try:
        return int(actor.get("number"))
    except (TypeError, ValueError):
        return None


def _stack_parent(left: dict, right: dict) -> tuple[dict, dict] | None:
    for parent, child in ((left, right), (right, left)):
        parent_number = _number(parent)
        if parent.get("headRefName") and child.get("baseRefName") == parent.get("headRefName"):
            return parent, child
        refs = {int(value) for value in STACK_REF.findall(child.get("body") or "")}
        if parent_number in refs:
            return parent, child
    return None


def _dependency_order(left: dict, right: dict) -> tuple[dict, dict] | None:
    for first, later in ((left, right), (right, left)):
        refs = {int(value) for value in DEP_REF.findall(later.get("body") or "")}
        if _number(first) in refs:
            return first, later
    return None


def _foundational(actor: dict) -> int:
    text = " ".join([actor.get("title") or "", *[row["path"] for row in _file_rows(actor)]]).lower()
    return 0 if re.search(r"\b(foundational|contract|shared|schema|types?)\b|(?:^|/)(?:lib|core)/", text) else 1


def ordered(left: dict, right: dict) -> tuple[dict, dict]:
    dependency = _dependency_order(left, right)
    if dependency:
        return dependency
    return tuple(sorted((left, right), key=lambda actor: (
        _foundational(actor), len(_file_rows(actor)), actor.get("createdAt") or "", _number(actor) or 1 << 62
    )))


def actor_ref(actor: dict) -> str:
    if _number(actor) is not None:
        return f"pr:#{_number(actor)}"
    return f"task:{actor.get('identifier') or actor.get('issue') or 'unknown'}"


def classify_pair(left: dict, right: dict, *, existing_first: bool = False) -> dict | None:
    """One overlap decision.  `policyAction` is stable even when flag-only mode is active."""
    duplicate = sorted(set(migration_numbers(left, added_only=True)) &
                       set(migration_numbers(right, added_only=True)))
    files = overlapping_files(left, right)
    stack = _stack_parent(left, right)
    if not files and not duplicate and not stack:
        return None
    first, later = (left, right) if existing_first else (stack or ordered(left, right))
    if duplicate:
        policy = "block"
        files = sorted(set(files + migration_numbers(left, added_only=True)[duplicate[0]]
                           + migration_numbers(right, added_only=True)[duplicate[0]]))
    elif stack:
        first, later = stack
        policy = "stack"
    elif any(path in HOT_FILES for path in files):
        policy = "sequence"
    elif files and all(shared_file(path) for path in files):
        policy = "sequence"
    else:
        policy = "flag"
    return {
        "first": actor_ref(first), "later": actor_ref(later),
        "firstPr": _number(first), "laterPr": _number(later),
        "files": files, "policyAction": policy,
        "regenerateFiles": [path for path in files if generated_file(path)],
        **({"migrationNumber": duplicate[0]} if duplicate else {}),
    }


def queue_owned(pr: dict | None) -> bool:
    """A PR the native merge queue already sequences: queued or armed for auto-merge.  The queue
    tests combined trees and ejects real conflicts. Ordinary ordering must not hold a member
    (2026-10-04: holds on queued #20469/#20447 ejected the whole queue); semantic blocks remain."""
    return bool(pr) and (pr.get("isInMergeQueue") is True or bool(pr.get("autoMergeRequest")))


def open_pr_decisions(prs: list[dict], mode: str | None = None) -> list[dict]:
    mode = guard_mode(mode)
    if mode == "off":
        return []
    eligible = [pr for pr in prs if not pr.get("isDraft")]
    by_number = {_number(pr): pr for pr in eligible}
    decisions = []
    for index, left in enumerate(eligible):
        for right in eligible[index + 1:]:
            decision = classify_pair(left, right)
            if decision:
                owned = queue_owned(by_number.get(decision["laterPr"]))
                # Sequencing waits for the first PR to land; one that is not queued or armed may
                # never land (#20148 held queued #20469 on 2026-10-04), so it only flags.
                idle = decision["policyAction"] == "sequence" \
                    and not queue_owned(by_number.get(decision["firstPr"]))
                queue_ordering = owned and decision["policyAction"] != "block"
                decision["actionTaken"] = "flag" if mode == "flag" or queue_ordering or idle \
                    else decision["policyAction"]
                if owned:
                    decision["queueOwned"] = True
                if idle:
                    decision["firstIdle"] = True
                decisions.append(decision)
    return decisions


def _state_path(state: Path) -> Path:
    return state / "file-overlap.json"


def read_state(state: Path) -> dict:
    try:
        data = json.loads(_state_path(state).read_text())
    except (OSError, ValueError, TypeError):
        data = {}
    data.setdefault("schema", "symphony-file-overlap/v1")
    data.setdefault("active", {})
    data.setdefault("events", [])
    data.setdefault("tasks", {})
    data.setdefault("metrics", {"conflicts_prevented": 0, "overlap_flags": 0,
                                "rebases_caused_by_overlap": 0})
    for name in ("conflicts_prevented", "overlap_flags", "rebases_caused_by_overlap"):
        data["metrics"].setdefault(name, 0)
    return data


def _update_state(state: Path, mutate) -> dict:
    state.mkdir(parents=True, exist_ok=True)
    with open(state / "file-overlap.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = read_state(state)
        mutate(data)
        data["updatedAt"] = now_iso()
        data["mode"] = guard_mode()
        path = _state_path(state)
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps(data, indent=1, sort_keys=True))
        os.replace(tmp, path)
        return data


def _key(decision: dict) -> str:
    return f"{decision['first']}|{decision['later']}|{decision['policyAction']}"


def _ledger(lane, host, decision: dict, kind: str) -> None:
    pr_events.ledger(host, {"schema": "jovie-file-overlap/v1", "kind": kind, "at": now_iso(),
                       "prs": [number for number in (decision.get("firstPr"), decision.get("laterPr")) if number],
                       "files": decision.get("files") or [], "actionTaken": decision.get("actionTaken"),
                       "policyAction": decision.get("policyAction"),
                       **({"issue": decision["issue"]} if decision.get("issue") else {})})


def record_admission(host, lane, issue, decisions: list[dict]) -> None:
    identifier = getattr(issue, "identifier", None) or issue.get("identifier")
    created = []
    def mutate(data):
        active = data["active"]
        seen = set()
        for decision in decisions:
            decision.update(issue=identifier, observedAt=now_iso())
            key = _key(decision)
            seen.add(key)
            if key not in active or active[key].get("actionTaken") != decision.get("actionTaken"):
                created.append(dict(decision))
                data["events"].append(dict(decision))
                data["metrics"]["overlap_flags"] += 1
                if decision["actionTaken"] == "block":
                    data["metrics"]["conflicts_prevented"] += 1
            active[key] = decision
        for key in [key for key, row in active.items() if row.get("issue") == identifier and key not in seen]:
            del active[key]
        data["events"] = data["events"][-200:]
    _update_state(host.state, mutate)
    for decision in created:
        _ledger(lane, host, decision, "file-overlap-admission")


def admission_decisions(host, lane, issue, open_prs: list[dict], tasks: list[dict], classify) -> dict:
    mode = guard_mode()
    predicted = predict_issue_files(issue, classify)
    identifier = getattr(issue, "identifier", None) or issue.get("identifier")
    candidate = {"kind": "task", "identifier": identifier, "files": predicted["files"]}
    decisions = []
    if mode != "off" and predicted["files"]:
        for existing in [*open_prs, *tasks]:
            if existing.get("number") is not None and existing.get("isDraft"):
                continue
            if existing.get("identifier") == identifier:
                continue
            decision = classify_pair(existing, candidate, existing_first=True)
            if not decision:
                continue
            decision["predictionSource"] = predicted["source"]
            decision["actionTaken"] = (
                "flag" if mode == "flag" or decision["policyAction"] == "flag" else "block")
            decisions.append(decision)
    record_admission(host, lane, issue, decisions)
    return {"allowed": not any(row["actionTaken"] == "block" for row in decisions),
            "files": predicted["files"], "source": predicted["source"], "decisions": decisions}


def reserve_task(state: Path, issue, prediction: dict) -> None:
    identifier = getattr(issue, "identifier", None) or issue.get("identifier")
    def mutate(data):
        data["tasks"][identifier] = {"kind": "task", "identifier": identifier,
                                      "files": prediction.get("files") or [],
                                      "source": prediction.get("source"),
                                      "expiresAt": time.time() + TASK_TTL_S}
    _update_state(state, mutate)


def release_task(state: Path, identifier: str) -> None:
    def mutate(data):
        data["tasks"].pop(identifier, None)
        for key in [key for key, row in data["active"].items() if row.get("issue") == identifier]:
            del data["active"][key]
    _update_state(state, mutate)


def local_tasks(state: Path, now: float | None = None) -> list[dict]:
    now = time.time() if now is None else now
    data = read_state(state)
    return [row for row in data["tasks"].values() if float(row.get("expiresAt") or 0) > now]


def _pr_labels(pr: dict) -> set[str]:
    return {str(label.get("name") if isinstance(label, dict) else label) for label in pr.get("labels") or []}


def _hold(lane, number: int, *, add_label: bool) -> None:
    if add_label:
        result = lane.sh(["gh", "api", "-X", "POST", f"repos/{lane.REPO_SLUG}/issues/{number}/labels",
                          "-f", "labels[]=hold"])
        if result.returncode != 0:
            raise RuntimeError(f"file overlap hold failed for PR #{number}")
    lane.sh(["gh", "pr", "merge", str(number), "--repo", lane.REPO_SLUG, "--disable-auto"])


def _retarget_main(lane, pr: dict) -> None:
    if pr.get("baseRefName") != "main":
        result = lane.sh(["gh", "pr", "edit", str(pr["number"]), "--repo", lane.REPO_SLUG, "--base", "main"])
        if result.returncode != 0:
            raise RuntimeError(f"file overlap retarget failed for PR #{pr['number']}")


def _release(lane, pr: dict, record: dict, *, rebase: bool) -> None:
    _retarget_main(lane, pr)
    if record.get("holdApplied"):
        result = lane.sh(["gh", "api", "-X", "DELETE",
                          f"repos/{lane.REPO_SLUG}/issues/{pr['number']}/labels/hold"])
        if result.returncode != 0 and "404" not in str(getattr(result, "stderr", "")):
            raise RuntimeError(f"file overlap release failed for PR #{pr['number']}")
    if rebase:
        result = lane.sh(["gh", "api", "-X", "POST", f"repos/{lane.REPO_SLUG}/issues/{pr['number']}/labels",
                          "-f", "labels[]=lane-fix-dequeued"])
        if result.returncode != 0:
            raise RuntimeError(f"file overlap rebase queue failed for PR #{pr['number']}")


def reconcile_open_prs(host, lane, prs: list[dict]) -> dict:
    """Apply holds once, then release the later PR into the existing rebase lane."""
    mode = guard_mode()
    previous = read_state(host.state)
    previous_pr = {key: row for key, row in previous["active"].items() if row.get("laterPr")}
    by_number = {pr["number"]: pr for pr in prs}
    decisions = open_pr_decisions(prs, mode)
    desired = {_key(row): row for row in decisions}
    if mode == "enforce":
        # Retargeting a legacy child to main removes the base-branch evidence.  Preserve the
        # dependency until its recorded parent leaves the open inventory or the native
        # queue owns ordering. Never restore an old hold over that current decision.
        for key, row in previous_pr.items():
            if row.get("policyAction") == "stack" and row.get("firstPr") in by_number \
                    and row.get("laterPr") in by_number \
                    and not queue_owned(by_number[row["laterPr"]]):
                for current_key, current in list(desired.items()):
                    if current.get("firstPr") == row.get("firstPr") and current.get("laterPr") == row.get("laterPr"):
                        del desired[current_key]
                desired[key] = row
    created, released = [], []

    for key, decision in desired.items():
        old = previous_pr.get(key)
        if old:
            was_enforced = old.get("actionTaken") in {"sequence", "stack", "block"}
            is_enforced = decision.get("actionTaken") in {"sequence", "stack", "block"}
            later = by_number.get(decision.get("laterPr"))
            if later and was_enforced and not is_enforced:
                _release(lane, later, old, rebase=False)
                released.append({**old, "actionTaken": "released", "releasedAt": now_iso()})
            elif later and is_enforced and not was_enforced:
                _retarget_main(lane, later)
                decision["holdApplied"] = "hold" not in {label.lower() for label in _pr_labels(later)}
                _hold(lane, later["number"], add_label=decision["holdApplied"])
                created.append(decision)
            else:
                decision.update({name: old[name] for name in ("holdApplied", "observedAt") if name in old})
            continue
        later = by_number.get(decision.get("laterPr"))
        if not later:
            continue
        decision["observedAt"] = now_iso()
        if decision["actionTaken"] in {"sequence", "stack", "block"}:
            _retarget_main(lane, later)
            decision["holdApplied"] = "hold" not in {label.lower() for label in _pr_labels(later)}
            _hold(lane, later["number"], add_label=decision["holdApplied"])
        created.append(decision)

    remaining_later = {row.get("laterPr") for row in desired.values()
                       if row.get("actionTaken") in {"sequence", "stack", "block"}}
    for key, record in previous_pr.items():
        if key in desired:
            continue
        later = by_number.get(record.get("laterPr"))
        if later and record.get("laterPr") in remaining_later and record.get("holdApplied"):
            inheritor = next(row for row in desired.values() if row.get("laterPr") == record.get("laterPr")
                             and row.get("actionTaken") in {"sequence", "stack", "block"})
            inheritor["holdApplied"] = True
        elif later:
            rebase = (mode == "enforce" and record.get("actionTaken") in {"sequence", "stack", "block"}
                      and record.get("firstPr") not in by_number)
            _release(lane, later, record, rebase=rebase)
            released.append({**record, "actionTaken": "rebase-queued" if rebase else "released",
                             "releasedAt": now_iso()})

    def mutate(data):
        task_rows = {key: row for key, row in data["active"].items() if not row.get("laterPr")}
        data["active"] = {**task_rows, **desired}
        for decision in created:
            data["events"].append(dict(decision))
            data["metrics"]["overlap_flags"] += 1
            if decision["actionTaken"] in {"sequence", "stack", "block"}:
                data["metrics"]["conflicts_prevented"] += 1
        for row in released:
            data["events"].append(row)
            if row["actionTaken"] == "rebase-queued":
                data["metrics"]["rebases_caused_by_overlap"] += 1
        data["events"] = data["events"][-200:]
    state = _update_state(host.state, mutate)
    for decision in created:
        _ledger(lane, host, decision, "file-overlap-sequence")
    for decision in released:
        _ledger(lane, host, decision, "file-overlap-release")
    return {"mode": mode, "pairs": list(desired.values()), "created": len(created),
            "released": len(released), "metrics": state["metrics"]}


def doctor_view(state: Path) -> dict:
    data = read_state(state)
    return {"mode": guard_mode(), "pairs": list(data["active"].values()),
            "metrics": data["metrics"]}
