#!/usr/bin/env python3
"""Launchd entrypoint for the codex issue shipper.

Fail-closed preflight gates (pause, gbrain, grok, primary-checkout freshness)
run before execing the TypeScript shipper from the primary ~/Jovie checkout.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg: str) -> None:
    print(f"{utc_now()} shipper-gate {msg}", flush=True)


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = value.strip().strip('"').strip("'")


def append_jobs_log(hermes_home: Path, payload: dict) -> None:
    jobs_log = hermes_home / "logs" / "jobs.jsonl"
    jobs_log.parent.mkdir(parents=True, exist_ok=True)
    entry = {"ts": utc_now(), **payload}
    with jobs_log.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, separators=(",", ":")) + "\n")


def send_telegram(hermes_home: Path, text: str) -> bool:
    token = os.environ.get("HERMES_TELEGRAM_BOT_TOKEN") or os.environ.get(
        "TELEGRAM_BOT_TOKEN"
    )
    chat_id = os.environ.get("HERMES_TELEGRAM_CHAT_ID")
    if not chat_id:
        chat_file = hermes_home / "state" / "telegram-chat-id"
        if chat_file.is_file():
            chat_id = chat_file.read_text(encoding="utf-8").strip()
    if not token or not chat_id:
        return False
    try:
        import urllib.request

        body = json.dumps(
            {
                "chat_id": chat_id,
                "text": text[:4000],
                "disable_web_page_preview": True,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


def send_slack(text: str) -> bool:
    webhook = os.environ.get("SLACK_WEBHOOK_URL", "").strip()
    if not webhook:
        return False
    try:
        import urllib.request

        body = json.dumps({"text": text[:4000]}).encode("utf-8")
        req = urllib.request.Request(
            webhook,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


def notify_abort(hermes_home: Path, event: str, detail: str) -> None:
    message = f"Ovie shipper {event}\n{detail}"
    append_jobs_log(
        hermes_home,
        {
            "job": "codex-issue-shipper",
            "event": event,
            "detail": detail,
        },
    )
    send_telegram(hermes_home, message)
    send_slack(message)


def pause_active(hermes_home: Path) -> bool:
    if os.environ.get("HERMES_PAUSE") == "1":
        return True
    for name in ("PAUSE", "shipping-paused"):
        if (hermes_home / name).is_file():
            return True
    return False


def gbrain_alive(hermes_home: Path) -> bool:
    gbrain_bin = os.environ.get("HERMES_GBRAIN_BIN")
    if not gbrain_bin:
        for candidate in (
            hermes_home / "bin" / "gbrain",
            Path("/opt/homebrew/bin/gbrain"),
            Path("/usr/local/bin/gbrain"),
        ):
            if candidate.is_file():
                gbrain_bin = str(candidate)
                break
    if not gbrain_bin:
        gbrain_bin = shutil.which("gbrain") or str(hermes_home() / "bin" / "gbrain")
    if not Path(gbrain_bin).is_file():
        return False
    try:
        proc = subprocess.run(
            [gbrain_bin, "doctor", "--fast", "--json"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            return False
        status = json.loads(proc.stdout).get("status", "")
        return status not in ("", "error", "fail", "failed", "dead")
    except Exception:
        return False


def grok_alive() -> bool:
    grok_bin = os.environ.get("HERMES_GROK_BIN")
    if grok_bin and Path(grok_bin).is_file():
        candidates = [grok_bin]
    else:
        path = os.environ.get("PATH", "")
        candidates = []
        for part in path.split(":"):
            candidate = Path(part) / "grok"
            if candidate.is_file():
                candidates.append(str(candidate))
    for candidate in candidates:
        try:
            proc = subprocess.run(
                [candidate, "--version"],
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
            if proc.returncode == 0:
                return True
        except Exception:
            continue
    return False


SHIPPER_CRITICAL_PATHS = {
    "scripts/hermes/jobs/codex-issue-shipper.ts",
    "scripts/hermes/lib/codex-issue-shipper.ts",
    "scripts/hermes/lib/ship-ledger.ts",
    "scripts/hermes/shipper-gated-entrypoint.py",
}


def parse_dirty_paths(porcelain: str) -> list[str]:
    paths: list[str] = []
    for line in porcelain.splitlines():
        trimmed = line.rstrip()
        if len(trimmed) <= 3:
            continue
        path = trimmed[3:].strip()
        if path:
            paths.append(path)
    return paths


def dirty_paths_are_recoverable(paths: Iterable[str]) -> bool:
    materialized = list(paths)
    if not materialized:
        return True
    return all(path not in SHIPPER_CRITICAL_PATHS for path in materialized)


def describe_checkout(branch: str, head: str, origin_main: str, dirty: bool) -> str:
    parts: list[str] = []
    if branch != "main":
        parts.append(f"on '{branch}' (not main)")
    if head != origin_main:
        parts.append(f"HEAD {head[:8]} != origin/main {origin_main[:8]}")
    if dirty:
        parts.append("working tree dirty")
    return "; ".join(parts) if parts else "fresh"


def recover_checkout(repo_root: Path, detail: str, dirty: bool) -> tuple[bool, str | None]:
    try:
        if dirty:
            subprocess.run(
                [
                    "git",
                    "stash",
                    "push",
                    "-m",
                    f"shipper-stale-checkout-recovery: {detail}",
                ],
                cwd=repo_root,
                check=True,
                timeout=60,
            )
        subprocess.run(
            ["git", "checkout", "main"],
            cwd=repo_root,
            check=True,
            timeout=60,
        )
        subprocess.run(
            ["git", "reset", "--hard", "origin/main"],
            cwd=repo_root,
            check=True,
            timeout=60,
        )
        return True, None
    except subprocess.CalledProcessError as err:
        return False, f"exit {err.returncode}"
    except Exception as err:  # noqa: BLE001
        return False, str(err)


def checkout_gate(repo_root: Path, hermes_home: Path) -> bool:
    try:
        subprocess.run(
            ["git", "fetch", "origin", "main"],
            cwd=repo_root,
            check=True,
            timeout=120,
        )
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=repo_root,
            text=True,
            timeout=30,
        ).strip()
        head = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_root,
            text=True,
            timeout=30,
        ).strip()
        origin_main = subprocess.check_output(
            ["git", "rev-parse", "origin/main"],
            cwd=repo_root,
            text=True,
            timeout=30,
        ).strip()
        porcelain = subprocess.check_output(
            ["git", "status", "--porcelain", "--untracked-files=no"],
            cwd=repo_root,
            text=True,
            timeout=30,
        )
    except Exception as err:  # noqa: BLE001
        notify_abort(
            hermes_home,
            "checkout_check_failed",
            f"repo={repo_root}\nerror={err}",
        )
        return False

    dirty_paths = parse_dirty_paths(porcelain)
    dirty = bool(dirty_paths)
    fresh = branch == "main" and head == origin_main and not dirty
    if fresh:
        return True

    detail = describe_checkout(branch, head, origin_main, dirty)
    branch_or_behind = branch != "main" or head != origin_main
    dirty_only = dirty and not branch_or_behind
    attempt_recovery = not (dirty_only and not dirty_paths_are_recoverable(dirty_paths))

    recovered = False
    recovery_error: str | None = None
    recovery_blocked: str | None = None
    if not attempt_recovery:
        recovery_blocked = "dirty shipper-critical files"
    else:
        recovered, recovery_error = recover_checkout(repo_root, detail, dirty)
        if recovered:
            append_jobs_log(
                hermes_home,
                {
                    "job": "codex-issue-shipper",
                    "event": "stale_checkout_recovered",
                    "detail": detail,
                    "stashed": dirty,
                    "dirtyPaths": dirty_paths,
                },
            )
        elif recovery_error:
            append_jobs_log(
                hermes_home,
                {
                    "job": "codex-issue-shipper",
                    "event": "stale_checkout_recovery_failed",
                    "detail": detail,
                    "error": recovery_error,
                    "dirtyPaths": dirty_paths,
                },
            )

    lines = [
        f"repo: {repo_root}",
        f"detail: {detail}",
    ]
    if recovery_blocked:
        lines.append(f"recovery skipped: {recovery_blocked}")
    elif recovered:
        lines.append(
            "disk recovery: succeeded (this tick still aborts — next launchd re-exec loads fresh dispatcher code)"
        )
    elif recovery_error:
        lines.append(f"disk recovery: failed ({recovery_error})")
    if dirty_paths:
        lines.append(f"dirty paths: {', '.join(dirty_paths)}")

    notify_abort(hermes_home, "stale_checkout_abort", "\n".join(lines))
    return False


def resolve_tsx(repo_root: Path) -> str | None:
    for candidate in (
        repo_root / "node_modules" / ".bin" / "tsx",
        Path(os.environ.get("TSX_BIN", "")),
    ):
        if candidate and Path(candidate).is_file():
            return str(candidate)
    path = os.environ.get("PATH", "")
    for part in path.split(":"):
        candidate = Path(part) / "tsx"
        if candidate.is_file():
            return str(candidate)
    return None


def main() -> int:
    hermes_home = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
    load_env_file(hermes_home / ".env")

    repo_root = Path(
        os.environ.get("HERMES_JOVIE_REPO", os.environ.get("JOVIE_REPO", Path.cwd()))
    ).resolve()
    shipper_ts = repo_root / "scripts" / "hermes" / "jobs" / "codex-issue-shipper.ts"

    if pause_active(hermes_home):
        log("SKIP: pause sentinel active")
        append_jobs_log(
            hermes_home,
            {"job": "codex-issue-shipper", "event": "paused_skip"},
        )
        return 0

    if not gbrain_alive(hermes_home):
        notify_abort(
            hermes_home,
            "gbrain_gate_abort",
            "gbrain is dead/unreachable — refusing to dispatch blind",
        )
        return 3

    if not grok_alive():
        notify_abort(
            hermes_home,
            "grok_gate_abort",
            "grok CLI is missing or unhealthy — refusing to dispatch blind",
        )
        return 4

    if not checkout_gate(repo_root, hermes_home):
        return 5

    tsx_bin = resolve_tsx(repo_root)
    if not tsx_bin:
        notify_abort(
            hermes_home,
            "tsx_missing_abort",
            f"tsx not found for repo={repo_root}",
        )
        return 6

    if not shipper_ts.is_file():
        notify_abort(
            hermes_home,
            "shipper_missing_abort",
            f"missing shipper entrypoint: {shipper_ts}",
        )
        return 7

    log(f"preflight OK: exec {shipper_ts}")
    os.execv(tsx_bin, [tsx_bin, str(shipper_ts)])


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as err:  # noqa: BLE001
        log(f"FATAL: {err}")
        raise SystemExit(1) from err
