#!/usr/bin/env python3
"""Gem Cursor CLI worker: install path, auto-update, fail-closed health.

This is the isolated Cursor lane's host contract. It never selects a Symphony
route, never leases an issue, and never claims useful-turn capacity. Official
Codex app-server on :4041 stays untouched.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time

SCHEMA = "symphony-cursor-cli-health/v1"
REQUESTED_MODEL = "cursor-grok-4.6-high-fast"
WRAPPER_NAME = "cursor-agent-std"
WORKER_NAME = "cursor-cli-worker.py"
DEFAULT_INSTALL_URL = "https://cursor.com/install"
STALE_AFTER_DAYS = 21
EXIT_OK = 0
EXIT_UNHEALTHY = 2
EXIT_DEGRADED = 3
AUTH_FAILURE = re.compile(r"not authenticated|not logged in|unauthori[sz]ed|\b401\b", re.I)
VERSION_STAMP = re.compile(r"(20\d{2}\.\d{2}\.\d{2})")


def _home(env=None):
    env = env or os.environ
    override = env.get("SYMPHONY_CURSOR_CLI_HOME")
    return pathlib.Path(override) if override else pathlib.Path.home()


def wrapper_source():
    return pathlib.Path(__file__).resolve().with_name(WRAPPER_NAME)


def dest_bin(env=None):
    return _home(env) / ".local/bin"


def wrapper_path(env=None):
    configured = (env or os.environ).get("GEM_CURSOR_EXECUTABLE")
    if configured:
        return pathlib.Path(configured)
    return dest_bin(env) / WRAPPER_NAME


def versions_dir(env=None):
    return _home(env) / ".local/share/cursor-agent/versions"


def state_dir(env=None):
    return _home(env) / ".local/state/symphony-cursor-cli"


def health_path(env=None):
    configured = (env or os.environ).get("GEM_CURSOR_HEALTH_RECEIPT")
    if configured:
        return pathlib.Path(configured)
    return state_dir(env) / "health.json"


def _runnable(path):
    return bool(path) and pathlib.Path(path).is_file() and os.access(path, os.X_OK)


def official_binary(env=None):
    override = (env or os.environ).get("CURSOR_AGENT_REAL")
    if override and _runnable(override):
        return pathlib.Path(override)
    versions = versions_dir(env)
    if versions.is_dir():
        folders = sorted((p for p in versions.iterdir() if p.is_dir()), key=lambda p: p.name)
        for folder in reversed(folders):
            candidate = folder / "cursor-agent"
            if _runnable(candidate):
                return candidate
    path_hit = shutil.which("cursor-agent")
    if path_hit and _runnable(path_hit):
        return pathlib.Path(path_hit)
    return None


def install_wrapper(env=None):
    source = wrapper_source()
    if not source.is_file():
        raise FileNotFoundError(f"missing wrapper source {source}")
    destination = dest_bin(env) / WRAPPER_NAME
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp")
    shutil.copy2(source, temporary)
    temporary.chmod(0o755)
    temporary.replace(destination)
    worker_dst = dest_bin(env) / "cursor-cli-worker"
    worker_tmp = worker_dst.with_name(f".{worker_dst.name}.tmp")
    shutil.copy2(pathlib.Path(__file__), worker_tmp)
    worker_tmp.chmod(0o755)
    worker_tmp.replace(worker_dst)
    return destination


def _captured(command, timeout=20, env=None, cwd=None):
    merged = os.environ.copy()
    if env:
        merged.update(env)
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        cwd=cwd,
        env=merged,
    )


def _probe_text(binary, args, timeout=20, env=None):
    try:
        result = _captured([str(binary), *args], timeout=timeout, env=env)
    except (OSError, subprocess.TimeoutExpired):
        return None, ""
    return result, (result.stdout or "") + "\n" + (result.stderr or "")


def parse_version(text):
    match = VERSION_STAMP.search(text or "")
    return match.group(1) if match else None


def version_age_days(stamp, now=None):
    if not stamp:
        return None
    try:
        parsed = time.strptime(stamp, "%Y.%m.%d")
    except ValueError:
        return None
    now = now or time.time()
    return max(0, (now - time.mktime(parsed)) / 86400)


def parse_models(text):
    names = set()
    if not text:
        return names
    if "Available models:" in text:
        rest = text.split("Available models:", 1)[1].replace("\n", " ")
        names.update(part.strip().rstrip(".") for part in rest.split(",") if part.strip())
    for match in re.finditer(r"cursor-grok-4\.6-high(?:-fast)?", text):
        names.add(match.group(0))
    return names


def probe_health(env=None, now=None):
    reasons = []
    wrapper = wrapper_path(env)
    binary = official_binary(env)
    if not _runnable(wrapper):
        reasons.append("wrapper_missing")
    if binary is None:
        reasons.append("binary_missing")
    version = None
    authenticated = False
    models = set()
    if binary is not None:
        version_result, version_text = _probe_text(binary, ["--version"], env=env)
        version = parse_version(version_text)
        if version_result is None or version_result.returncode != 0:
            reasons.append("version_probe_failed")
        status_result, status_text = _probe_text(binary, ["status"], env=env)
        whoami_result, whoami_text = _probe_text(binary, ["whoami"], env=env)
        auth_text = f"{status_text}\n{whoami_text}"
        if AUTH_FAILURE.search(auth_text):
            reasons.append("unauthenticated")
        elif (status_result and status_result.returncode == 0) or (
            whoami_result and whoami_result.returncode == 0
        ):
            authenticated = True
        else:
            reasons.append("auth_unproven")
        models_result, models_text = _probe_text(binary, ["models"], env=env)
        models = parse_models(models_text)
        if models_result is not None and models_result.returncode == 0:
            if REQUESTED_MODEL not in models:
                reasons.append("requested_model_unlisted")
        age = version_age_days(version, now=now)
        if age is not None and age > STALE_AFTER_DAYS:
            reasons.append("binary_stale")
    status = "ready" if not reasons else "unhealthy"
    return {
        "schema": SCHEMA,
        "observedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now or time.time())),
        "status": status,
        "requestedModel": REQUESTED_MODEL,
        "wrapperPath": str(wrapper),
        "executable": str(binary) if binary is not None else "",
        "version": version or "",
        "authenticated": authenticated,
        "models": sorted(models),
        "reasons": reasons,
    }


def write_receipt(payload, env=None):
    path = health_path(env)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)
    return path


def hud_projection(payload):
    if not isinstance(payload, dict) or payload.get("schema") != SCHEMA:
        return {"status": "unknown", "detail": "cursor-cli health receipt missing"}
    status = payload.get("status")
    reasons = payload.get("reasons") if isinstance(payload.get("reasons"), list) else []
    if status == "ready":
        return {"status": "ready", "detail": f"cursor-cli {payload.get('requestedModel')}"}
    detail = ",".join(str(reason) for reason in reasons) or "unhealthy"
    return {"status": "unhealthy", "detail": f"cursor-cli {detail}"}


def run_update(binary, env=None):
    if binary is None:
        return False, "binary_missing"
    result, text = _probe_text(binary, ["update"], timeout=120, env=env)
    if result is None:
        return False, "update_failed"
    if result.returncode != 0 and AUTH_FAILURE.search(text):
        return False, "unauthenticated"
    return result.returncode == 0, "updated" if result.returncode == 0 else "update_failed"


def run_official_install(env=None):
    installer = (env or os.environ).get("CURSOR_AGENT_INSTALL_BIN")
    if installer and _runnable(installer):
        result = _captured([installer], timeout=180, env=env)
        return result.returncode == 0, "installed" if result.returncode == 0 else "install_failed"
    if (env or os.environ).get("CURSOR_AGENT_INSTALL") != "1":
        return False, "install_not_authorized"
    url = (env or os.environ).get("CURSOR_AGENT_INSTALL_URL") or DEFAULT_INSTALL_URL
    result = _captured(
        ["bash", "-lc", f"curl -fsSL {url} | bash"],
        timeout=180,
        env=env,
    )
    return result.returncode == 0, "installed" if result.returncode == 0 else "install_failed"


def reconcile(env=None, now=None):
    try:
        install_wrapper(env)
    except OSError:
        payload = probe_health(env, now=now)
        payload["reasons"] = list(payload.get("reasons") or []) + ["wrapper_install_failed"]
        payload["status"] = "unhealthy"
        write_receipt(payload, env)
        return EXIT_DEGRADED, payload
    payload = probe_health(env, now=now)
    reasons = set(payload.get("reasons") or [])
    if "binary_missing" in reasons:
        ok, _detail = run_official_install(env)
        if not ok:
            write_receipt(payload, env)
            return EXIT_UNHEALTHY, payload
        payload = probe_health(env, now=now)
        reasons = set(payload.get("reasons") or [])
    if "binary_stale" in reasons:
        ok, _detail = run_update(official_binary(env), env)
        payload = probe_health(env, now=now)
        if not ok and payload.get("status") != "ready":
            write_receipt(payload, env)
            return EXIT_UNHEALTHY, payload
    write_receipt(payload, env)
    return (EXIT_OK if payload.get("status") == "ready" else EXIT_UNHEALTHY), payload


def receipt_digest(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        choices=("health", "reconcile", "install-wrapper", "hud"),
    )
    args = parser.parse_args(argv)
    if args.command == "install-wrapper":
        path = install_wrapper()
        print(f"INSTALLED {path}")
        return EXIT_OK
    if args.command == "health":
        payload = probe_health()
        write_receipt(payload)
        print(json.dumps(payload, indent=2, sort_keys=True))
        return EXIT_OK if payload["status"] == "ready" else EXIT_UNHEALTHY
    if args.command == "hud":
        try:
            payload = json.loads(health_path().read_text(encoding="utf-8"))
        except (OSError, ValueError):
            payload = {}
        print(json.dumps(hud_projection(payload), indent=2, sort_keys=True))
        return EXIT_OK
    code, payload = reconcile()
    print(json.dumps(payload, indent=2, sort_keys=True))
    return code


if __name__ == "__main__":  # pragma: no cover - CLI entry
    raise SystemExit(main())
