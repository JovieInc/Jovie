#!/usr/bin/env python3
"""
Launchd entrypoint for codex-issue-shipper.

Gates (fail-closed, in order):
  1. Pause sentinel (~/.hermes/shipping-paused)
  2. gbrain reachability (doctor --fast --json)
  3. Primary ~/Jovie checkout on origin/main (self-contained git checks)
  4. Exec tsx scripts/hermes/jobs/codex-issue-shipper.ts from JOVIE_REPO

The checkout guard is embedded here so a hijacked ~/Jovie branch cannot
disable the guard by serving stale TypeScript.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

JOB = "codex-issue-shipper"
EVENT = "stale_checkout_abort"

SHIPPER_CRITICAL_PREFIXES = (
    "scripts/hermes/jobs/codex-issue-shipper.ts",
    "scripts/hermes/lib/codex-issue-shipper.ts",
    "scripts/hermes/lib/ship-ledger.ts",
    "scripts/hermes/lib/shipper-checkout-guard.ts",
    "scripts/hermes/lib/heavy-job-lock.ts",
    "scripts/hermes/shipper-gated-entrypoint.py",
)


def hermes_home() -> Path:
    return Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))


def jovie_repo() -> Path:
    env = os.environ.get("HERMES_JOVIE_REPO")
    if env:
        return Path(env).expanduser()
    return Path.cwd()


def log_event(event: str, **fields: object) -> None:
    payload = {
        "job": JOB,
        "event": event,
        "ts": datetime.now(timezone.utc).isoformat(),
        **fields,
    }
    line = json.dumps(payload, separators=(",", ":"))
    print(line, flush=True)
    jobs_log = hermes_home() / "logs" / "jobs.jsonl"
    try:
        jobs_log.parent.mkdir(parents=True, exist_ok=True)
        with jobs_log.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError:
        pass


def run_git(repo: Path, *args: str, timeout: int = 60) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return completed.stdout.strip()


def is_git_worktree(repo: Path) -> bool:
    git_entry = repo / ".git"
    return git_entry.is_file()


def is_shipper_critical(path: str) -> bool:
    normalized = path.strip().removeprefix("./")
    return any(
        normalized == prefix or normalized.startswith(prefix + "/")
        for prefix in SHIPPER_CRITICAL_PREFIXES
    )


def dirty_paths_are_only_detritus(porcelain: str) -> bool:
    lines = [line for line in porcelain.splitlines() if line.strip()]
    if not lines:
        return True
    for line in lines:
        payload = line[3:].strip()
        path = payload.split(" -> ")[-1].strip() if " -> " in payload else payload
        if is_shipper_critical(path):
            return False
    return True


def checkout_reasons(
    *,
    branch: str,
    head: str,
    origin_main: str,
    dirty: bool,
    porcelain: str,
    worktree: bool,
) -> list[str]:
    reasons: list[str] = []
    if worktree:
        reasons.append("dispatcher repoRoot is a git worktree, not the primary checkout")
    if branch != "main":
        reasons.append(f"branch is {branch or '(detached)'}, expected main")
    if head != origin_main:
        reasons.append(f"HEAD {head[:12]} != origin/main {origin_main[:12]}")
    if dirty and not dirty_paths_are_only_detritus(porcelain):
        reasons.append("working tree has shipper-critical edits")
    return reasons


def can_auto_recover(
    *,
    branch: str,
    head: str,
    origin_main: str,
    dirty: bool,
    porcelain: str,
    worktree: bool,
) -> bool:
    if worktree:
        return False
    if dirty and not dirty_paths_are_only_detritus(porcelain):
        return False
    return branch != "main" or head != origin_main or dirty


def auto_recover(repo: Path) -> None:
    porcelain = run_git(repo, "status", "--porcelain")
    if porcelain.strip():
        stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
        subprocess.run(
            [
                "git",
                "-C",
                str(repo),
                "stash",
                "push",
                "-u",
                "-m",
                f"shipper-checkout-guard auto-recover {stamp}",
            ],
            check=True,
            timeout=60,
        )
    run_git(repo, "checkout", "main", timeout=60)
    run_git(repo, "reset", "--hard", "origin/main", timeout=60)


def read_checkout_snapshot(repo: Path) -> dict[str, object]:
    branch = run_git(repo, "branch", "--show-current")
    head = run_git(repo, "rev-parse", "HEAD")
    origin_main = run_git(repo, "rev-parse", "origin/main")
    porcelain = run_git(repo, "status", "--porcelain")
    return {
        "branch": branch,
        "head": head,
        "origin_main": origin_main,
        "dirty": bool(porcelain.strip()),
        "porcelain": porcelain,
        "worktree": is_git_worktree(repo),
    }


def assert_primary_checkout_fresh(repo: Path) -> tuple[bool, bool, dict[str, object], list[str]]:
    run_git(repo, "fetch", "origin", "main", timeout=120)
    snapshot = read_checkout_snapshot(repo)
    reasons = checkout_reasons(
        branch=str(snapshot["branch"]),
        head=str(snapshot["head"]),
        origin_main=str(snapshot["origin_main"]),
        dirty=bool(snapshot["dirty"]),
        porcelain=str(snapshot["porcelain"]),
        worktree=bool(snapshot["worktree"]),
    )
    if not reasons:
        return True, False, snapshot, []

    if can_auto_recover(
        branch=str(snapshot["branch"]),
        head=str(snapshot["head"]),
        origin_main=str(snapshot["origin_main"]),
        dirty=bool(snapshot["dirty"]),
        porcelain=str(snapshot["porcelain"]),
        worktree=bool(snapshot["worktree"]),
    ):
        auto_recover(repo)
        snapshot = read_checkout_snapshot(repo)
        reasons = checkout_reasons(
            branch=str(snapshot["branch"]),
            head=str(snapshot["head"]),
            origin_main=str(snapshot["origin_main"]),
            dirty=bool(snapshot["dirty"]),
            porcelain=str(snapshot["porcelain"]),
            worktree=bool(snapshot["worktree"]),
        )
        if not reasons:
            return True, True, snapshot, []

    return False, False, snapshot, reasons


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


def send_telegram(message: str) -> None:
    token = os.environ.get("HERMES_TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("HERMES_TELEGRAM_CHAT_ID")
    chat_file = hermes_home() / "state" / "telegram-chat-id"
    if not chat_id and chat_file.is_file():
        chat_id = chat_file.read_text(encoding="utf-8").strip()
    if not token or not chat_id:
        return
    payload = json.dumps(
        {
            "chat_id": chat_id,
            "text": message[:4000],
            "disable_web_page_preview": True,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=10)
    except (urllib.error.URLError, TimeoutError):
        pass


def send_slack(message: str) -> None:
    webhook = os.environ.get("HERMES_SLACK_WEBHOOK_URL") or os.environ.get(
        "SLACK_WEBHOOK_URL"
    )
    if not webhook:
        return
    payload = json.dumps({"text": message[:3000]}).encode("utf-8")
    request = urllib.request.Request(
        webhook,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=10)
    except (urllib.error.URLError, TimeoutError):
        pass


def notify_abort(repo: Path, snapshot: dict[str, object], reasons: Iterable[str], recovered: bool) -> None:
    lines = [
        "codex-issue-shipper stale_checkout_abort",
        f"repo: {repo}",
        f"branch: {snapshot.get('branch') or '(detached)'}",
        f"head: {str(snapshot.get('head', ''))[:12]}",
        f"origin/main: {str(snapshot.get('origin_main', ''))[:12]}",
        f"worktree: {'yes' if snapshot.get('worktree') else 'no'}",
        f"recovered: {'yes' if recovered else 'no'}",
        "reasons:",
        *[f"- {reason}" for reason in reasons],
    ]
    message = "\n".join(lines)
    send_telegram(message)
    send_slack(message)


def gbrain_alive() -> bool:
    gbrain_bin = os.environ.get("HERMES_GBRAIN_BIN")
    candidates: list[str] = []
    if gbrain_bin:
        candidates.append(gbrain_bin)
    home_bin = hermes_home() / "bin" / "gbrain"
    if home_bin.is_file():
        candidates.append(str(home_bin))
    which = subprocess.run(
        ["bash", "-lc", "command -v gbrain"],
        capture_output=True,
        text=True,
    )
    if which.returncode == 0 and which.stdout.strip():
        candidates.append(which.stdout.strip())
    for candidate in candidates:
        try:
            completed = subprocess.run(
                [candidate, "doctor", "--fast", "--json"],
                capture_output=True,
                text=True,
                timeout=30,
            )
        except (subprocess.TimeoutExpired, OSError):
            continue
        if completed.returncode != 0 or not completed.stdout.strip():
            continue
        try:
            status = json.loads(completed.stdout).get("status", "")
        except json.JSONDecodeError:
            continue
        if status in ("error", "fail", "failed", "dead", ""):
            continue
        return True
    return False


def resolve_tsx() -> str:
    for candidate in (
        os.environ.get("TSX_BIN"),
        str(Path.home() / ".bun/bin/tsx"),
        "tsx",
    ):
        if not candidate:
            continue
        if candidate == "tsx":
            return candidate
        if Path(candidate).is_file():
            return candidate
    return "tsx"


def main() -> int:
    load_env_file(hermes_home() / ".env")
    pause_sentinel = hermes_home() / "shipping-paused"
    if pause_sentinel.is_file():
        log_event("paused_skip")
        return 0

    if not gbrain_alive():
        log_event("gbrain_abort")
        print(f"{JOB}: gbrain dead/unreachable — refusing to dispatch", file=sys.stderr)
        return 3

    repo = jovie_repo()
    if not (repo / ".git").exists():
        log_event(EVENT, repo=str(repo), error="not a git repository")
        print(f"{JOB}: {repo} is not a git repository", file=sys.stderr)
        return 4

    try:
        ok, recovered, snapshot, reasons = assert_primary_checkout_fresh(repo)
    except subprocess.CalledProcessError as err:
        log_event(EVENT, repo=str(repo), error=str(err))
        print(f"{JOB}: checkout guard failed: {err}", file=sys.stderr)
        return 5

    if not ok:
        notify_abort(repo, snapshot, reasons, recovered=False)
        log_event(
            EVENT,
            repo=str(repo),
            branch=snapshot.get("branch"),
            head=str(snapshot.get("head", ""))[:12],
            originMain=str(snapshot.get("origin_main", ""))[:12],
            worktree=bool(snapshot.get("worktree")),
            reasons=list(reasons),
        )
        print(
            f"{JOB}: stale_checkout_abort — refusing to dispatch from {repo}",
            file=sys.stderr,
        )
        return 6

    if recovered:
        log_event("stale_checkout_recovered", repo=str(repo))

    shipper = repo / "scripts" / "hermes" / "jobs" / "codex-issue-shipper.ts"
    if not shipper.is_file():
        log_event("missing_shipper", path=str(shipper))
        print(f"{JOB}: missing {shipper}", file=sys.stderr)
        return 7

    tsx = resolve_tsx()
    os.chdir(repo)
    os.execvp(tsx, [tsx, str(shipper)])


if __name__ == "__main__":
    raise SystemExit(main())