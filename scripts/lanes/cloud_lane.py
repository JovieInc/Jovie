"""Codex Cloud lane adapter (JOV-10357): dormant, draft-only, disabled by default.

Every external effect is gated on LANES_CLOUD_ENABLED (unset = no provider call, no
ledger write, no network). The dispatcher (lane_runner.run_issue) submits a task, and
the worker's reconciliation turn drives status -> collect -> authorize -> publish.

Authority model:
- Trailers, PR bodies and authors are forgeable provenance, never authority.
- The candidate patch is applied and authorized inside a credential-free quarantine
  (bare temp repo, empty HOME, no GH/SSH/CODEX env); only (baseSha, candTree) crosses
  to the trusted publisher, which fetches the objects, builds exactly one commit
  (commit-tree, single parent = baseSha) and pushes an expected-absent lease to an
  explicit validated https://github.com/JovieInc/Jovie URL. Candidate files are never
  checked out where credentials are present.
- Publication is DRAFT ONLY: a fixed-template PR body, no model text, no @mentions,
  no closing keywords, and promotion out of draft is human-only. is_cloud_origin()
  blocks every ordinary adoption/repair/ready path for cloud-origin PRs.
- Residual risk (documented, activation-gated): a draft PR still runs the repository's
  unchanged CI workflows before review. Activation requires evidence those jobs cannot
  reach privileged secrets, sensitive self-hosted state or publication authority; that
  evidence belongs on the activation checklist, not to this module. Remote status is
  only ever parsed from the anchored first-line grammar, never from summaries or titles.
"""
from __future__ import annotations

import fcntl
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

from cloud_lane_state import (
    REPO, HEX40, OPT_IN_LABEL, RETAINED_VERDICTS, CLAIM_STAGES, UNREADABLE,
    enabled, ledger_path, eligible, read, append, admit, _disposition,
    live_claim, read_evidence, is_cloud_origin, pct, stats,
)
from cloud_lane_quarantine import authorize, discard, _qgit, MAX_PATCH_BYTES
from cloud_lane_process import Bounded, stream_run, OUTPUT_CAP_BYTES, budgeted_gh


DEFAULT_PUSH_URL = "https://github.com/JovieInc/Jovie.git"
PUSH_URL_RE = re.compile(r"https://github\.com/JovieInc/Jovie(?:\.git)?")


TASK_ID = re.compile(r"task_[A-Za-z0-9_-]+")
SUBMIT_LINE = re.compile(r"(?:https://chatgpt\.com/codex/tasks/)?(task_[A-Za-z0-9_-]+)")
STATUS_LINE = re.compile(r"\[(READY|PENDING|APPLIED|ERROR)\]")
# POSIX ERE for `git config --get-regexp`; Python-only groups would silently fail there.
URL_REWRITE_CONFIG = r"^url\..*\.(insteadOf|pushInsteadOf)$"

LIST_MAX_PAGES = 10
DIFF_CAP_BYTES = 2 * 1024 * 1024


# --------------------------------------------------------------------------- CLI contract

def command(provider, prompt, env=None, binary=None):
    """Pinned 0.162.1 contract: exec --env E --attempts 1 --branch main -- <prompt>."""
    if provider != "codex" or not prompt or prompt.startswith("-"):
        return None
    env = env or os.environ.get("CODEX_CLOUD_ENV")
    binary = binary or os.environ.get("CODEX_CLOUD_BINARY")
    if not env or not binary or not Path(binary).is_absolute():
        return None
    return [binary, "cloud", "exec", "--env", env, "--attempts", "1", "--branch", "main", "--", prompt]


def _resolve(run, cmd, timeout, cap=OUTPUT_CAP_BYTES):
    result = stream_run(cmd, timeout=timeout, cap=cap) if run is None else run(cmd)
    return result


def _remote_for(issue, path=None):
    events = read(path)
    accepted = [e for e in events if e.get("issue") == issue and e.get("task")]
    return (accepted[-1]["task"], accepted[-1]) if accepted else (None, None)


def route(issue, provider, labels, text, prompt, *, run=None, now=time.time, path=None,
          main_sha=None, url=DEFAULT_PUSH_URL, run_git=None, fencing_token=None):
    """Reserve and submit once; single-writer per issue across processes.

    The deny-text re-read at submit time covers the issue's title + description
    (v2 §6); the rendered prompt carries repo context that would false-trip it.
    """
    ok, why = eligible(labels, text)
    if not ok:
        return {"route": "gem", "reason": why}
    cmd = command(provider, prompt)
    if not cmd:
        return {"route": "gem", "reason": "provider-unconfigured"}
    base = main_sha or ls_remote_main(url, run_git=run_git)
    if not base:
        return {"route": "gem", "reason": "base-unreadable"}
    path = Path(path or ledger_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix(path.suffix + ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            events = read(path)
        except (ValueError, OSError):
            return {"route": "held", "reason": "ledger-unreadable"}
        if any(e.get("issue") == issue and e["stage"] != "limit" for e in events):
            return {"route": "held", "reason": "already-submitted"}
        stamp = now()
        ok, why = admit(provider, stamp, events)
        if not ok:
            return {"route": "gem", "reason": why}
        append({"issue": issue, "task": issue, "provider": provider, "stage": "submitted",
                "repo": REPO, "env": os.environ.get("CODEX_CLOUD_ENV", ""), "baseSha": base,
                "attempt": 1, "at": stamp}, path)
    try:
        result = _resolve(run, cmd, timeout=300)
    except Exception as error:
        _disposition(issue, provider, "cloud-held", f"unknown-submit-outcome:{type(error).__name__}", path, now())
        return {"route": "held", "reason": "unknown-submit-outcome"}
    # The pinned CLI prints exactly one line: the task URL. A bare id is also accepted;
    # prose, multiple ids or any stderr noise is an unknown outcome and stays held.
    stdout, stderr = (result.stdout or "").strip(), (result.stderr or "").strip()
    match = SUBMIT_LINE.fullmatch(stdout) if result.returncode == 0 and not stderr else None
    if not match:
        _disposition(issue, provider, "cloud-held", "unknown-submit-outcome", path, now())
        return {"route": "held", "reason": "unknown-submit-outcome"}
    remote = match.group(1)
    branch = f"cloud/{issue.lower()}-{remote[:8]}"
    _disposition(issue, provider, "cloud-pending", "submitted", path, now(),
                 task=remote, branch=branch, fencing_token=fencing_token,
                 extra={"baseSha": base, "env": os.environ.get("CODEX_CLOUD_ENV", ""),
                        "attempt": 1})
    return {"route": "cloud", "reason": "ok", "remote": remote, "branch": branch, "baseSha": base}


def status(issue, *, run=None, path=None):
    """Remote status on demand. Only the anchored first-line grammar is authority."""
    try:
        remote, _row = _remote_for(issue, path)
    except (ValueError, OSError):
        return {"state": "unknown", "reason": "ledger-unreadable"}
    if not remote:
        return {"state": "unknown", "reason": "remote-id-missing"}
    binary = os.environ.get("CODEX_CLOUD_BINARY")
    if not binary or not Path(binary).is_absolute():
        return {"state": "unknown", "reason": "provider-unconfigured"}
    try:
        result = _resolve(run, [binary, "cloud", "status", remote], timeout=60)
    except Exception:
        return {"state": "unknown", "remote": remote, "reason": "status-unavailable"}
    line = (result.stdout or "").splitlines()[:1]
    match = STATUS_LINE.match(line[0]) if line else None
    if not match:
        return {"state": "unknown", "remote": remote, "reason": "status-unparseable"}
    state = match.group(1).lower()
    if result.returncode == 0 and state == "ready":
        return {"state": "ready", "remote": remote}
    if result.returncode == 1 and state in ("pending", "applied", "error"):
        return {"state": state, "remote": remote}
    return {"state": "unknown", "remote": remote, "reason": "status-inconsistent"}


def _locate_task(remote, *, run=None, env=None, binary=None):
    """codex cloud list --json (paginated, bounded); returns the task row or a held reason."""
    binary = binary or os.environ.get("CODEX_CLOUD_BINARY")
    env = env or os.environ.get("CODEX_CLOUD_ENV")
    if not binary or not Path(binary).is_absolute() or not env:
        return None, "provider-unconfigured"
    cursor = None
    for _page in range(LIST_MAX_PAGES):
        cmd = [binary, "cloud", "list", "--json", "--limit", "20"]
        if cursor:
            cmd += ["--cursor", cursor]
        try:
            result = _resolve(run, cmd, timeout=60)
        except Exception:
            return None, "list-unavailable"
        if result.returncode != 0 or getattr(result, "truncated", False):
            return None, "list-unavailable"
        try:
            payload = json.loads(result.stdout or "")
        except ValueError:
            return None, "list-unparseable"
        if not isinstance(payload, dict) or not isinstance(payload.get("tasks"), list):
            return None, "list-unparseable"
        for row in payload["tasks"]:
            if isinstance(row, dict) and row.get("id") == remote:
                return row, None
        cursor = payload.get("cursor") or None
        if not cursor:
            return None, "task-not-listed"
    return None, "list-truncated"


def collect(issue, *, run=None, path=None):
    """Identity binding (list) + the pinned-attempt diff. Never trusts a status summary."""
    try:
        remote, submitted = _remote_for(issue, path)
    except (ValueError, OSError):
        return {"ok": False, "reason": "ledger-unreadable"}
    if not remote:
        return {"ok": False, "reason": "remote-id-missing"}
    row, why = _locate_task(remote, run=run)
    if row is None:
        return {"ok": False, "reason": why}
    if row.get("environment_id") != os.environ.get("CODEX_CLOUD_ENV"):
        return {"ok": False, "reason": "environment-mismatch", "remote": remote}
    if row.get("attempt_total") != 1:
        return {"ok": False, "reason": "attempt-mismatch", "remote": remote}
    binary = os.environ.get("CODEX_CLOUD_BINARY")
    if not binary or not Path(binary).is_absolute():
        return {"ok": False, "reason": "provider-unconfigured", "remote": remote}
    try:
        result = _resolve(run, [binary, "cloud", "diff", remote, "--attempt", "1"],
                          timeout=120, cap=DIFF_CAP_BYTES)
    except Exception:
        return {"ok": False, "reason": "diff-unavailable", "remote": remote}
    if result.returncode != 0 or getattr(result, "truncated", False):
        return {"ok": False, "reason": "diff-unavailable", "remote": remote}
    patch = result.stdout or ""
    if len(patch.encode("utf-8")) > MAX_PATCH_BYTES:
        return {"ok": False, "reason": "oversize:bytes", "remote": remote}
    return {"ok": True, "patch": patch, "remote": remote, "baseSha": submitted.get("baseSha")}


# --------------------------------------------------------------- patch authorization


# ------------------------------------------------------------------------ publication

def pr_body(issue, task, base_sha, cand_tree, paths):
    """Fixed template only: no model text, no @mentions, no closing keywords."""
    lines = [f"Refs {issue.upper()}", f"Codex-Cloud-Task: {task}",
             f"Base: {base_sha}", f"Tree: {cand_tree}", "", "Files:"]
    lines += [f"- {path}" for path in sorted(p for p in paths if isinstance(p, str) and p)]
    return "\n".join(lines)


def ls_remote_main(url, *, run_git=None):
    def git(args):
        return run_git(args) if run_git else subprocess.run(args, capture_output=True, text=True,
                                                            timeout=60)
    result = git(["git", "ls-remote", url, "refs/heads/main"])
    if result.returncode != 0:
        return None
    line = (result.stdout or "").strip().splitlines()
    return line[0].split("\t")[0] if line and HEX40.fullmatch(line[0].split("\t")[0]) else None


def _pgit(repo_dir, args, run_git=None):
    cmd = ["git", "-C", str(repo_dir), "-c", "core.hooksPath=/dev/null", *args]
    return run_git(cmd) if run_git else subprocess.run(cmd, capture_output=True, text=True, timeout=180)


def _fence(path, issue, task, stage, token, extra=None):
    """Persist an intent row under the ledger lock; a stale collector or an orphan
    intent (crash between intent and result) refuses the effect forever."""
    path = Path(path or ledger_path())
    with path.with_suffix(path.suffix + ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        events = read(path)
        claims = [e for e in events if e.get("issue") == issue and e["stage"] in CLAIM_STAGES]
        if not claims or claims[-1].get("fencingToken") != token:
            return "stale-token"
        results = {"intent:push": ("pushed",), "intent:pr": ("pr_opened",)}
        for intent, done in results.items():
            if any(e["stage"] == intent and e.get("task") == task for e in events) and \
                    not any(e["stage"] in done and e.get("task") == task for e in events):
                return "reconcile"
        row = {"issue": issue, "task": task, "stage": stage, "fencingToken": token, "at": time.time()}
        if extra:
            row.update(extra)
        append(row, path)
        return None


def publish_candidate(issue, task, quarantine, cand_tree, base_sha, branch, *, repo_dir,
                      url=DEFAULT_PUSH_URL, path=None, fencing_token=None, gh=None,
                      run_git=None, now=time.time, paths=()):
    """Draft-only publication: verified object transfer, one commit, expected-absent push."""
    path = Path(path or ledger_path())
    allow = PUSH_URL_RE  # tests patch this module attribute for local remotes
    if not allow.fullmatch(url):
        return {"route": "held", "reason": "push-url-invalid"}
    rewrite = _pgit(repo_dir, ["config", "--get-regexp", URL_REWRITE_CONFIG], run_git=run_git)
    if rewrite.returncode not in (0, 1) or rewrite.stdout.strip():
        return {"route": "held", "reason": "push-url-rewrite"}
        return {"route": "held", "reason": "push-url-rewrite"}
    live_main = ls_remote_main(url, run_git=run_git)
    if live_main != base_sha:
        return {"route": "held", "reason": "base-moved"}
    existing = _pgit(repo_dir, ["ls-remote", url, f"refs/heads/{branch}"], run_git=run_git)
    if existing.returncode != 0:
        return {"route": "held", "reason": "remote-unreadable"}
    if (existing.stdout or "").strip():
        return {"route": "held", "reason": "branch-exists"}
    # R1: candidate objects cross only via an explicit, verified object transfer.
    qenv = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C",
            "GIT_DIR": str(quarantine / "quarantine.git"),
            "GIT_OBJECT_DIRECTORY": str(quarantine / "quarantine.git/objects"),
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
            "HOME": str(quarantine / "home")}
    if _qgit(qenv, ["update-ref", f"refs/cloud-candidate/{cand_tree}", cand_tree]).returncode != 0:
        return {"route": "held", "reason": "quarantine-ref-failed"}
    if _pgit(repo_dir, ["fetch", "--no-tags", str(quarantine / "quarantine.git"),
                        f"refs/cloud-candidate/{cand_tree}"], run_git=run_git).returncode != 0:
        return {"route": "held", "reason": "object-transfer-failed"}
    kind = _pgit(repo_dir, ["cat-file", "-t", cand_tree], run_git=run_git)
    if kind.returncode != 0 or kind.stdout.strip() != "tree":
        return {"route": "held", "reason": "object-transfer-failed"}
    commit = _pgit(repo_dir, ["-c", "user.name=cloud lane", "-c", "user.email=cloud-lane@jov.ie",
                              "commit-tree", cand_tree, "-p", base_sha, "-m",
                              f"cloud lane candidate {task} on {base_sha}"], run_git=run_git)
    commit_sha = commit.stdout.strip()
    if commit.returncode != 0 or not HEX40.fullmatch(commit_sha):
        return {"route": "held", "reason": "commit-failed"}
    tree_check = _pgit(repo_dir, ["rev-parse", f"{commit_sha}^{{tree}}"], run_git=run_git)
    parents = _pgit(repo_dir, ["rev-list", "--parents", "-n", "1", commit_sha], run_git=run_git)
    if (tree_check.returncode != 0 or tree_check.stdout.strip() != cand_tree
            or parents.returncode != 0 or parents.stdout.strip().split() != [commit_sha, base_sha]):
        return {"route": "held", "reason": "commit-verification-failed"}
    blocked = _fence(path, issue, task, "intent:push", fencing_token,
                     {"branch": branch, "commitSha": commit_sha, "repo": REPO})
    if blocked:
        return {"route": "held", "reason": blocked}
    pushed = _pgit(repo_dir, ["push", f"--force-with-lease=refs/heads/{branch}:", "--no-verify",
                              url, f"{commit_sha}:refs/heads/{branch}"], run_git=run_git)
    if pushed.returncode != 0:
        return {"route": "held", "reason": "push-failed"}
    append({"issue": issue, "task": task, "provider": "codex", "stage": "pushed",
            "fencingToken": fencing_token, "branch": branch, "commitSha": commit_sha,
            "repo": REPO, "at": now()}, path)
    blocked = _fence(path, issue, task, "intent:pr", fencing_token,
                     {"branch": branch, "commitSha": commit_sha, "repo": REPO})
    if blocked:
        return {"route": "held", "reason": blocked}
    body = pr_body(issue, task, base_sha, cand_tree, paths)
    def gh_call(args):
        return gh(args) if gh else budgeted_gh(args)
    created = gh_call(["pr", "create", "--draft", "--repo", REPO, "--base", "main",
                       "--head", branch, "--title", f"{issue.upper()}: cloud lane draft ({task})",
                       "--body", body])
    if created.returncode != 0:
        return {"route": "held", "reason": "pr-create-failed", "commitSha": commit_sha}
    url_match = re.search(r"/pull/(\d+)$", (created.stdout or "").strip().splitlines()[-1] \
                          if (created.stdout or "").strip() else "")
    if not url_match:
        return {"route": "held", "reason": "pr-create-failed", "commitSha": commit_sha}
    number = int(url_match.group(1))
    readback = gh_call(["pr", "view", str(number), "--repo", REPO, "--json",
                        "number,isDraft,baseRefName,headRefName,headRefOid,url"])
    try:
        live = json.loads(readback.stdout or "")
    except ValueError:
        live = {}
    if (readback.returncode != 0 or live.get("number") != number or live.get("isDraft") is not True
            or live.get("baseRefName") != "main" or live.get("headRefName") != branch
            or live.get("headRefOid") != commit_sha
            or not str(live.get("url", "")).startswith(f"https://github.com/{REPO}/pull/")):
        return {"route": "held", "reason": "readback-mismatch", "pr": number, "commitSha": commit_sha}
    append({"issue": issue, "task": task, "provider": "codex", "stage": "pr_opened",
            "pr": number, "prUrl": live["url"], "branch": branch, "commitSha": commit_sha,
            "repo": REPO, "at": now()}, path)
    _disposition(issue, "codex", "cloud-draft-created", "pr-opened", path, now(), task=task,
                 branch=branch, fencing_token=fencing_token, extra={"pr": number, "prUrl": live["url"]})
    return {"route": "pr_opened", "pr": number, "prUrl": live["url"], "commitSha": commit_sha,
            "branch": branch}


def reconcile(*, path=None, repo_dir=None, url=DEFAULT_PUSH_URL, run=None, gh=None,
              run_git=None, guard=None, now=time.time):
    """The worker's reconciliation turn for live cloud claims: status -> collect ->
    authorize -> draft-publish, or an explicit held_* disposition. Never resubmits."""
    try:
        events = read(path)
    except (ValueError, OSError):
        return [{"disposition": "held", "reason": "ledger-unreadable"}]
    out = []
    claims = {}
    for event in events:
        if event["stage"] in CLAIM_STAGES:
            claims[event["issue"]] = event
    for issue, claim in sorted(claims.items()):
        if claim["stage"] != "cloud-pending":
            out.append({"issue": issue, "disposition": claim["stage"]})
            continue
        out.append(_reconcile_one(claim, path=path, repo_dir=repo_dir, url=url, run=run,
                                  gh=gh, run_git=run_git, guard=guard, now=now))
    return out


def _reconcile_one(claim, *, path, repo_dir, url, run, gh, run_git, guard, now):
    issue, task, branch = claim["issue"], claim.get("task"), claim.get("branch")

    def held(reason, extra=None):
        _disposition(issue, "codex", "cloud-held", reason, path, now(), task=task, branch=branch,
                     fencing_token=claim.get("fencingToken"), extra=extra)
        return {"issue": issue, "disposition": "cloud-held", "reason": reason, **(extra or {})}

    for stage, done in (("intent:push", "pushed"), ("intent:pr", "pr_opened")):
        try:
            events = read(path)
        except (ValueError, OSError):
            return {"issue": issue, "disposition": "held", "reason": "ledger-unreadable"}
        if any(e["stage"] == stage and e.get("task") == task for e in events) and \
                not any(e["stage"] == done and e.get("task") == task for e in events):
            return held("reconcile")
    state = status(issue, run=run, path=path)
    if state["state"] in ("pending", "applied", "unknown"):
        return {"issue": issue, "disposition": "wait", "state": state["state"]}
    if state["state"] == "error":
        return held("cloud-error")
    collected = collect(issue, run=run, path=path)
    if not collected.get("ok"):
        return held(collected.get("reason", "collect-failed"))
    base_sha = claim.get("baseSha") or collected.get("baseSha")
    if not base_sha or ls_remote_main(url, run_git=run_git) != base_sha:
        return held("base-moved")
    if guard is not None:
        try:
            guard(branch)
        except Exception as error:
            return held(f"revoked:{type(error).__name__}")
    objects = _pgit(repo_dir, ["rev-parse", "--git-path", "objects"], run_git=run_git)
    if objects.returncode != 0:
        return held("repo-unreadable")
    objects_dir = (Path(repo_dir) / objects.stdout.strip()).resolve()
    verdict = authorize(collected["patch"], base_sha, objects_dir)
    if not verdict.get("ok"):
        reason = verdict["reason"]
        extra = {"paths": verdict.get("paths")} if verdict.get("paths") else None
        if reason.startswith("sensitive:"):
            return held("held_sensitive:" + reason, extra)
        if reason.startswith("oversize:"):
            return held("held_oversize:" + reason, extra)
        return held(reason, extra)
    try:
        result = publish_candidate(issue, task, verdict["quarantine"], verdict["candTree"],
                                   base_sha, branch, repo_dir=repo_dir, url=url, path=path,
                                   fencing_token=claim.get("fencingToken"), gh=gh, run_git=run_git,
                                   now=now, paths=verdict["paths"])
    finally:
        discard(verdict["quarantine"])
    if result.get("route") == "pr_opened":
        return {"issue": issue, "disposition": "cloud-draft-created", "pr": result["pr"],
                "prUrl": result["prUrl"], "commitSha": result["commitSha"]}
    return held(result.get("reason", "publish-failed"))


def main(argv=None):
    if (argv if argv is not None else sys.argv[1:])[:1] != ["stats"]:
        print("usage: cloud_lane.py stats", file=sys.stderr)
        return 2
    print(json.dumps(stats(read()), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
