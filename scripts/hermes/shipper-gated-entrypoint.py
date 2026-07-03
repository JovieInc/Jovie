#!/usr/bin/env python3
"""Launchd entrypoint: pause → gbrain → checkout guard → exec codex-issue-shipper."""

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

JOB = "codex-issue-shipper"
EVENT = "stale_checkout_abort"
CRITICAL = (
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
    return Path(env).expanduser() if env else Path.cwd()


def log_event(event: str, **fields: object) -> None:
    payload = {"job": JOB, "event": event, "ts": datetime.now(timezone.utc).isoformat(), **fields}
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
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
        timeout=timeout,
    ).stdout.strip()


def is_critical(path: str) -> bool:
    normalized = path.strip().removeprefix("./")
    return any(normalized == p or normalized.startswith(p + "/") for p in CRITICAL)


def detritus_only(porcelain: str) -> bool:
    lines = [line for line in porcelain.splitlines() if line.strip()]
    for line in lines:
        payload = line[3:].strip()
        path = payload.split(" -> ")[-1].strip() if " -> " in payload else payload
        if is_critical(path):
            return False
    return True


def snapshot(repo: Path) -> dict[str, object]:
    porcelain = run_git(repo, "status", "--porcelain")
    return {
        "branch": run_git(repo, "branch", "--show-current"),
        "head": run_git(repo, "rev-parse", "HEAD"),
        "origin_main": run_git(repo, "rev-parse", "origin/main"),
        "dirty": bool(porcelain.strip()),
        "porcelain": porcelain,
        "worktree": (repo / ".git").is_file(),
    }


def reasons(s: dict[str, object]) -> list[str]:
    out: list[str] = []
    if s["worktree"]:
        out.append("dispatcher repoRoot is a git worktree, not the primary checkout")
    if s["branch"] != "main":
        out.append(f"branch is {s['branch'] or '(detached)'}, expected main")
    if s["head"] != s["origin_main"]:
        out.append(f"HEAD {str(s['head'])[:12]} != origin/main {str(s['origin_main'])[:12]}")
    if s["dirty"] and not detritus_only(str(s["porcelain"])):
        out.append("working tree has shipper-critical edits")
    return out


def recover(repo: Path) -> None:
    porcelain = run_git(repo, "status", "--porcelain")
    if porcelain.strip():
        stamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
        subprocess.run(
            ["git", "-C", str(repo), "stash", "push", "-u", "-m", f"shipper-checkout-guard auto-recover {stamp}"],
            check=True,
            timeout=60,
        )
    run_git(repo, "checkout", "main", timeout=60)
    run_git(repo, "reset", "--hard", "origin/main", timeout=60)


def assert_fresh(repo: Path) -> tuple[bool, bool, dict[str, object], list[str]]:
    run_git(repo, "fetch", "origin", "main", timeout=120)
    snap = snapshot(repo)
    why = reasons(snap)
    if not why:
        return True, False, snap, []
    if snap["worktree"] or (snap["dirty"] and not detritus_only(str(snap["porcelain"]))):
        return False, False, snap, why
    if snap["branch"] != "main" or snap["head"] != snap["origin_main"] or snap["dirty"]:
        recover(repo)
        snap = snapshot(repo)
        why = reasons(snap)
        if not why:
            return True, True, snap, []
    return False, False, snap, why


def load_env(path: Path) -> None:
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


def post_json(url: str, payload: dict[str, object]) -> None:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=10)
    except (urllib.error.URLError, TimeoutError):
        pass


def notify(repo: Path, snap: dict[str, object], why: list[str]) -> None:
    message = "\n".join(
        [
            "codex-issue-shipper stale_checkout_abort",
            f"repo: {repo}",
            f"branch: {snap.get('branch') or '(detached)'}",
            f"head: {str(snap.get('head', ''))[:12]}",
            f"origin/main: {str(snap.get('origin_main', ''))[:12]}",
            f"worktree: {'yes' if snap.get('worktree') else 'no'}",
            "reasons:",
            *[f"- {reason}" for reason in why],
        ]
    )
    token = os.environ.get("HERMES_TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("HERMES_TELEGRAM_CHAT_ID")
    chat_file = hermes_home() / "state" / "telegram-chat-id"
    if not chat_id and chat_file.is_file():
        chat_id = chat_file.read_text(encoding="utf-8").strip()
    if token and chat_id:
        post_json(
            f"https://api.telegram.org/bot{token}/sendMessage",
            {"chat_id": chat_id, "text": message[:4000], "disable_web_page_preview": True},
        )
    webhook = os.environ.get("HERMES_SLACK_WEBHOOK_URL") or os.environ.get("SLACK_WEBHOOK_URL")
    if webhook:
        post_json(webhook, {"text": message[:3000]})


def gbrain_alive() -> bool:
    candidates = [os.environ.get("HERMES_GBRAIN_BIN"), str(hermes_home() / "bin" / "gbrain")]
    which = subprocess.run(["bash", "-lc", "command -v gbrain"], capture_output=True, text=True)
    if which.returncode == 0 and which.stdout.strip():
        candidates.append(which.stdout.strip())
    for candidate in [c for c in candidates if c]:
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
        if status not in ("error", "fail", "failed", "dead", ""):
            return True
    return False


def resolve_tsx() -> str:
    for candidate in (os.environ.get("TSX_BIN"), str(Path.home() / ".bun/bin/tsx"), "tsx"):
        if candidate and (candidate == "tsx" or Path(candidate).is_file()):
            return candidate
    return "tsx"


def main() -> int:
    load_env(hermes_home() / ".env")
    if (hermes_home() / "shipping-paused").is_file():
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
        ok, recovered, snap, why = assert_fresh(repo)
    except subprocess.CalledProcessError as err:
        log_event(EVENT, repo=str(repo), error=str(err))
        print(f"{JOB}: checkout guard failed: {err}", file=sys.stderr)
        return 5

    if not ok:
        notify(repo, snap, why)
        log_event(
            EVENT,
            repo=str(repo),
            branch=snap.get("branch"),
            head=str(snap.get("head", ""))[:12],
            originMain=str(snap.get("origin_main", ""))[:12],
            worktree=bool(snap.get("worktree")),
            reasons=why,
        )
        print(f"{JOB}: stale_checkout_abort — refusing to dispatch from {repo}", file=sys.stderr)
        return 6

    if recovered:
        log_event("stale_checkout_recovered", repo=str(repo))

    shipper = repo / "scripts" / "hermes" / "jobs" / "codex-issue-shipper.ts"
    if not shipper.is_file():
        log_event("missing_shipper", path=str(shipper))
        print(f"{JOB}: missing {shipper}", file=sys.stderr)
        return 7

    os.chdir(repo)
    os.execvp(resolve_tsx(), [resolve_tsx(), str(shipper)])


if __name__ == "__main__":
    raise SystemExit(main())