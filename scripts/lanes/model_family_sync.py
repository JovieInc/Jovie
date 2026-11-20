#!/usr/bin/env python3
"""Daily model-family sync on the lanes host (no new spend: the public Gateway catalog and the local Codex catalog).

Reads the provider lists (model_families.collect), folds new ids into ops/registry/capacity.json `modelFamilies` as
available, and when a family has a newer id available on every required path (Tim: latest available on the OpenAI
subscription seats) opens a PR from a throwaway worktree that moves the alias, its pricing paths and the lane model
registry rows, and appends ops/models/family-changelog.jsonl. The move is also written to gbrain
`decisions/models/` (Ship now / Re-evaluate when / Then) and the PR body lists the model-task-registry tasks that
run the old id: those stay gated by the summer-config decision core (#311) and eval v3 and are not moved here.
When the registry has been behind a provider list for more than 7 days, or unsynced that long, an alarm page
`models/alarms/<day>` is written and the receipt says `alarm`; Summer reads gbrain and the automation registry row.

    model_family_sync.py run [--dry-run] [--repo PATH]    one sync now (the manual trigger)
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
from atomic_state import atomic_write_text  # noqa: E402
import model_families as MF  # noqa: E402

INTERVAL_S = 24 * 3600
RETRY_S = 1800
STATE_FILE = "model-family-sync.json"
CHANGELOG = "ops/models/family-changelog.jsonl"
BASE = "origin/main"


def _read(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, sort_keys=True))
    os.replace(temporary, path)


def changelog_lines(moves: list[dict], events: list[dict], stamp: str) -> str:
    rows = [{"at": stamp, **e} for e in events] + [{"at": stamp, **m} for m in moves]
    return "".join(json.dumps(r, sort_keys=True) + "\n" for r in rows)


def affected_tasks(moves: list[dict], task_registry: dict) -> list[str]:
    old = {m["from"] for m in moves}
    return sorted(t["id"] for t in task_registry.get("tasks", []) if any(o in str(t.get("currentModel", "")) for o in old))


def decision(moves: list[dict], events: list[dict], tasks: list[str], stamp: str) -> dict:
    moved = ", ".join(f"{m['family']} {m['from']} -> {m['to']}" for m in moves)
    return {
        "title": f"OpenAI model families moved to latest available ({stamp[:10]})", "area": "models", "date": stamp[:10],
        "chosen": "Move the family aliases",
        "options": [{"name": "Move the family aliases", "summary": "latest available on the subscription seats and the API (standing preference)"},
                    {"name": "Hold the old ids", "summary": "keep the previous ids until an eval says otherwise"}],
        "context": f"The daily sync found newer ids available on every required path: {moved}. Tim's standing preference is latest available on OpenAI "
                   f"subscriptions because each round is more efficient and cheaper. Model-registry tasks that name the old ids stay eval-gated: {', '.join(tasks) or 'none'}.",
        "shipNow": f"Merge the registry PR: {moved}.", "reevaluateWhen": ["a family gets a newer id on all required paths", "a quality regression is measured on the new id"],
        "then": "Re-run the affected task evals (summer-config decision core, eval v3) before moving a task's own model.",
        "evidence": [f"{e['family']}: {e['id']} first seen {stamp} on {', '.join(e['paths'])}" for e in events]}


def pr_body(moves: list[dict], events: list[dict], tasks: list[str]) -> str:
    rows = "\n".join(f"- `{m['family']}`: `{m['from']}` -> `{m['to']}`" for m in moves) or "- no alias move; availability recorded only"
    new = "\n".join(f"- `{e['id']}` ({e['family']}) on {', '.join(e['paths'])}" for e in events) or "- none"
    gated = "\n".join(f"- `{t}`" for t in tasks) or "- none"
    return f"""## Summary
Daily model-family sync (scripts/lanes/model_family_sync.py). Moves family aliases to the latest id available on every required path.

{rows}

New ids recorded as available:
{new}

## Gate
Tasks in ops/models/task-registry.json that run an old id are not changed here and stay gated by the summer-config decision core (#311) and eval v3:
{gated}

## Verification
`python3 scripts/lanes/model_families.py check`, `node scripts/model-id-guard.mjs`, capacity registry tests.

## Fleet Rules
Evidence: provider lists read by the sync job (Gateway catalog, Codex catalog); no spend, no key.
"""


def _git(args: list[str], cwd: Path, run) -> subprocess.CompletedProcess:
    return run(["git", *args], cwd=str(cwd), capture_output=True, text=True, timeout=300)


def open_pr(repo: Path, evidence: dict, now: float, run=subprocess.run, gh=None) -> dict:
    """Throwaway worktree off origin/main: apply, commit, push, open the PR. Idempotent per set of moves."""
    if gh is None:
        from apiclient import run_gh as gh  # noqa: PLC0415  (the one gh path)
    _git(["fetch", "origin", "main"], repo, run)
    stamp = MF._now_iso(now)
    wt = Path(os.environ.get("MODEL_SYNC_WORKTREES", str(Path.home() / ".local/state/jovie-model-sync"))) / f"wt-{int(now)}"
    wt.parent.mkdir(parents=True, exist_ok=True)
    made = _git(["worktree", "add", "--detach", str(wt), BASE], repo, run)
    if made.returncode != 0:
        return {"status": "worktree-failed", "error": made.stderr[-200:]}
    try:
        capacity_text = (wt / "ops/registry/capacity.json").read_text()
        models_text = (wt / "scripts/backlog-orchestrator/config/model-registry.json").read_text()
        result = MF.sync(capacity_text, models_text, evidence, now)
        if not (result["events"] or result["moves"]):
            return {"status": "no-change"}
        digest = "-".join(sorted(m["to"] for m in result["moves"])) or "avail-" + "-".join(sorted(e["id"] for e in result["events"]))
        branch = f"bot/model-families-{digest}"[:100]
        remote = _git(["ls-remote", "--heads", "origin", branch], repo, run)
        if branch in remote.stdout:
            return {"status": "pr-exists", "branch": branch}
        atomic_write_text(wt / "ops/registry/capacity.json", result["capacityText"])
        atomic_write_text(wt / "scripts/backlog-orchestrator/config/model-registry.json", result["modelsText"])
        log = wt / CHANGELOG
        log.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_text(log, (log.read_text() if log.exists() else "") + changelog_lines(result["moves"], result["events"], stamp))
        import subprocess as _sp  # noqa: PLC0415
        for cmd in (["node", "scripts/capacity-registry.mjs", "canon", "--write"],):
            _sp.run(cmd, cwd=str(wt), capture_output=True, text=True, timeout=120)
        tasks = affected_tasks(result["moves"], _read(wt / "ops/models/task-registry.json"))
        title = "chore(models): " + (", ".join(f"{m['family'].split(':')[1]} -> {m['to']}" for m in result["moves"]) or "record new model ids")
        steps = [["checkout", "-b", branch], ["add", "-A"], ["commit", "-m", f"{title}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"],
                 ["push", "-u", "origin", branch]]
        for step in steps:
            done = _git(step, wt, run)
            if done.returncode != 0:
                return {"status": "git-failed", "step": step[0], "error": done.stderr[-200:]}
        body = pr_body(result["moves"], result["events"], tasks) + "\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n"
        pr = gh(["pr", "create", "--base", "main", "--head", branch, "--title", title[:100], "--body", body], priority="report")
        return {"status": "pr-opened", "branch": branch, "moves": result["moves"], "events": result["events"], "tasks": tasks,
                "decision": decision(result["moves"], result["events"], tasks, stamp), "pr": getattr(pr, "stdout", str(pr))[-200:]}
    finally:
        _git(["worktree", "remove", "--force", str(wt)], repo, run)


def alarm_page(alarms: list[dict], day: str) -> str:
    lines = "\n".join(f"- {json.dumps(a, sort_keys=True)}" for a in alarms)
    return f"---\ntype: alarm\narea: models\n---\n\n# Model registry behind a provider list ({day})\n\n{lines}\n\nThe registry is more than 7 days behind a provider list. Run model_family_sync.py run or fix the missing path.\n"


def tick(state_dir: Path, repo: Path, run=subprocess.run, now: float | None = None, fetch=None, codex=None, put=None, record=None, open_pr_fn=None) -> dict:
    if os.environ.get("LANES_SELFTEST") or os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return {"status": "selftest-skipped"}
    now = time.time() if now is None else now
    path = Path(state_dir) / STATE_FILE
    state = _read(path)
    if now < float(state.get("nextAttemptAt", 0)):
        return {"status": "current", "lastRun": state.get("lastRun")}
    state["nextAttemptAt"] = now + RETRY_S  # persisted first: a crash is never a retry storm
    _write(path, state)
    try:
        gateway = (fetch or MF.fetch_gateway)()
    except Exception as error:  # a dead source gives no evidence and removes nothing
        gateway = None
        state["gatewayError"] = type(error).__name__
    evidence = MF.collect(gateway, codex if codex is not None else MF.read_codex())
    out = (open_pr_fn or open_pr)(repo, evidence, now, run=run)
    registry = json.loads((repo / "ops/registry/capacity.json").read_text()) if (repo / "ops/registry/capacity.json").exists() else {}
    alarms = MF.stale(registry, now) if registry else []
    day = MF._now_iso(now)[:10]
    if put is None:
        import yc_corpus  # noqa: PLC0415
        put = yc_corpus.gbrain_put
    if out.get("decision"):
        if record is None:
            import model_radar  # noqa: PLC0415
            record = model_radar.record_decision
        record(out["decision"])
    if alarms:
        put(f"models/alarms/{day}", f"Model registry stale {day}", alarm_page(alarms, day))
    result = {"status": out["status"], "alarm": bool(alarms), "alarms": len(alarms), "at": MF._now_iso(now)}
    if out["status"] in ("no-change", "pr-opened", "pr-exists"):
        state["nextAttemptAt"] = now + INTERVAL_S
    state["lastRun"] = result
    _write(path, state)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--repo", type=Path, default=HERE.parents[1])
    r.add_argument("--state", type=Path, default=Path.home() / ".local/state/jovie-model-sync")
    r.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    if args.dry_run:
        return MF.main(["sync"])
    state_file = args.state / STATE_FILE
    if state_file.exists():
        state_file.unlink()  # manual trigger ignores the daily window
    print(json.dumps(tick(args.state, args.repo), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
