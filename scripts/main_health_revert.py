#!/usr/bin/env python3
# api-budget: github-app-core 60/hr - estimate: 12 Main Health wakes/hr x 4 REST reads; a revert (1 read, 4 writes) is exceptional.
# api-budget: github-actions-token 60/hr - the same calls, only when the Jovie Bot installation bucket is exhausted.
"""Open the revert for a culprit commit Main Health named (revert first, canon/MERGE_QUEUE_STEWARD.md).

Run by .github/workflows/main-red-eject.yml (eject job) on a Main Health wake, under the Jovie Bot app token and
push credential that job already sets up: the same REST calls `scripts/main-red-eject.mjs apply` makes (open a PR,
label it, dispatch Merge Queue Green Enroll, which jumps `compounding` PRs), plus closing a revert a forward fix
superseded. No new permission or secret. Policy lives in scripts/lanes/revert_first.py; this file is I/O only.
Every GitHub call goes through the budgeted client (apiclient.gh.run_gh) and retries on GH_FALLBACK_TOKEN when
the installation bucket is exhausted.

  python3 scripts/main_health_revert.py plan    read-only: print the attribution and decision
  python3 scripts/main_health_revert.py apply   close superseded reverts, then open the revert (MAIN_RED_EJECT_MODE)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "lanes"))
import revert_first as rf  # noqa: E402
from apiclient.gh import run_gh  # noqa: E402

REPO = os.environ.get("GITHUB_REPOSITORY") or "JovieInc/Jovie"
DEFERRED = 75


def _gh(args: list[str], priority: str = "repair", run=run_gh) -> str:
    result = run(list(args), priority=priority)
    fallback = os.environ.get("GH_FALLBACK_TOKEN")
    if result["code"] != 0 and fallback and (result.get("deferred") or result["code"] == DEFERRED
                                             or "rate limit" in str(result.get("stderr")).lower()):
        print("::warning::github-app-quota-failover: Jovie Bot installation exhausted; retrying with GITHUB_TOKEN.")
        result = run(list(args), priority=priority, env={**os.environ, "GH_TOKEN": fallback})
    if result["code"] != 0:
        raise RuntimeError(f"gh {' '.join(args[:3])}: {str(result.get('stderr')).strip()[:300]}")
    return result["stdout"]


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True, timeout=120).stdout.strip()


def _epoch(iso) -> float | None:
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


class Io:
    """Injectable side effects, so the glue is tested without gh, git or a clock."""

    def __init__(self, gh=_gh, git=_git, now=time.time):
        self.gh, self.git, self.now = gh, git, now

    def api(self, path: str, priority: str = "poll"):
        return json.loads(self.gh(["api", path], priority) or "null")


def commit_range(io: Io, green: str, red: str) -> list[dict] | None:
    """Commits after `green` up to `red`, oldest first, from the local main checkout (fetch-depth 0)."""
    try:
        out = io.git("log", "--reverse", "--format=%H%x1f%an%x1f%s", f"{green}..{red}")
    except subprocess.CalledProcessError:
        return None
    rows = [line.split("\x1f") for line in out.splitlines() if line.strip()]
    return [{"sha": sha, "author": author, "subject": subject, "pr": rf.parse_pr(subject)}
            for sha, author, subject in rows]


def reverted_on_main(io: Io, culprit: dict) -> str | None:
    """The revert commit on origin/main after `culprit` (ours says `Reverts <sha>`, git's `This reverts commit
    <sha>`, a squash title keeps `(#<pr>)`), or None."""
    needles = [str(culprit["sha"])] + ([f"(#{culprit['pr']})"] if culprit.get("pr") else [])
    try:
        out = io.git("log", "--format=%H%x1f%s", "-F", *[f"--grep={n}" for n in needles], f"{culprit['sha']}..origin/main")
    except subprocess.CalledProcessError:
        return None
    for line in out.splitlines():
        sha, _, subject = line.partition("\x1f")
        if sha.strip() and rf.is_revert(subject):
            return sha.strip()
    return None


def open_reverts(io: Io) -> list[dict]:
    issues = io.api(f"repos/{REPO}/issues?labels={rf.REVERT_LABEL}&state=open&per_page=50") or []
    return [{"number": i["number"], **(rf.read_marker(i.get("body")) or {})} for i in issues if i.get("pull_request")]


def plan(io: Io, mode: str) -> dict:
    runs = (io.api(f"repos/{REPO}/actions/workflows/main-health.yml/runs?branch=main&status=completed&per_page=20")
            or {}).get("workflow_runs") or []
    attribution = rf.name_culprit(runs, None)
    if attribution.get("reason") == "commit-range-unread":
        attribution = rf.name_culprit(runs, commit_range(io, attribution["greenSha"], attribution["failingSha"]))
    culprit = attribution.get("culprit")
    if culprit and culprit.get("pr"):
        # The culprit PR's own labels and marker: a re-land carries its attempt count (revert, re-land, revert, human).
        pr = io.api(f"repos/{REPO}/issues/{culprit['pr']}") or {}
        culprit["labels"] = [label.get("name") for label in pr.get("labels") or []]
        culprit["priorAttempts"] = (rf.read_marker(pr.get("body")) or {}).get("attempt", 0)
    if culprit and culprit.get("sha"):
        culprit["revertedBy"] = reverted_on_main(io, culprit)
    reverts = open_reverts(io)
    return {"attribution": attribution, "openReverts": reverts,
            "decision": rf.decide(attribution, open_reverts=reverts, mode=mode)}


def close_superseded(io: Io, p: dict) -> list[int]:
    closed = []
    for row in p["openReverts"]:
        if not rf.superseded(row, p["attribution"]):
            continue
        io.gh(["api", "-X", "POST", f"repos/{REPO}/issues/{row['number']}/comments", "-f",
               "body=Main Health is green again on main: a forward fix landed first, so this revert is superseded "
               "(revert first, canon/MERGE_QUEUE_STEWARD.md).\n\n---\n_Generated by main-red-eject_"], "repair")
        io.gh(["api", "-X", "PATCH", f"repos/{REPO}/pulls/{row['number']}", "-f", "state=closed"], "repair")
        closed.append(row["number"])
    return closed


def open_revert(io: Io, p: dict) -> dict:
    attribution = p["attribution"]
    named_at = _epoch(attribution.get("redEndedAt")) or io.now()
    r = rf.revert_plan(attribution, named_at=named_at, repo=REPO)
    io.git("fetch", "--no-tags", "origin", "main")
    io.git("switch", "-C", r["branch"], "origin/main")
    try:
        io.git("revert", "--no-edit", r["sha"])
    except subprocess.CalledProcessError as error:
        try:
            io.git("revert", "--abort")
        except subprocess.CalledProcessError:
            pass
        print(f"::warning::revert of #{r['pr']} ({r['sha'][:9]}) conflicts with main; needs a lane: {error}"[:300])
        return {"opened": False, "reason": "revert-conflict", "plan": r}
    io.git("commit", "--amend", "-m", r["commitMessage"])
    io.git("push", "--force-with-lease", "origin", r["branch"])
    # An earlier wake may have opened this PR and then failed to label it (open_reverts filters by label): reuse it
    # rather than a POST that 422s on the same head branch.
    existing = io.api(f"repos/{REPO}/pulls?head={REPO.split('/')[0]}:{r['branch']}&state=open&per_page=1")
    if isinstance(existing, list) and existing:
        pr = existing[0]
    else:
        pr = json.loads(io.gh(["api", "-X", "POST", f"repos/{REPO}/pulls", "-f", f"title={r['title']}", "-f",
                               f"head={r['branch']}", "-f", "base=main", "-f", f"body={r['body']}"], "merge"))
    io.gh(["api", "-X", "POST", f"repos/{REPO}/issues/{pr['number']}/labels",
           *[arg for label in r["labels"] for arg in ("-f", f"labels[]={label}")]], "merge")
    # Green Enroll is the only queue writer; it jumps `compounding` PRs once their checks are green.
    io.gh(["workflow", "run", "merge-queue-green-enroll.yml", "-f", f"pr_number={pr['number']}"], "merge")
    return {"opened": True, "pr": pr["number"], "sla": rf.sla(named_at, _epoch(pr.get("created_at")), io.now()),
            "plan": {k: r[k] for k in ("branch", "sha", "title", "dependencyBump", "deadline")}}


def main(argv: list[str], io: Io | None = None) -> dict:
    io = io or Io()
    command = argv[0] if argv else "plan"
    mode = os.environ.get("MAIN_RED_EJECT_MODE") or "apply"
    p = plan(io, "dry" if command == "plan" else mode)
    if command == "apply" and mode == "apply":
        p["closed"] = close_superseded(io, p)
        if p["decision"]["action"] == "open-revert":
            p["revert"] = open_revert(io, p)
    return p


if __name__ == "__main__":
    result = main(sys.argv[1:])
    text = json.dumps(result, indent=2, default=str)[:20000]
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as handle:
            handle.write(f"### Revert first (Main Health)\n\n```json\n{text[:6000]}\n```\n")
