#!/usr/bin/env python3
"""Gem Cursor CLI worker: install path, auto-update, fail-closed health.

Symphony and this Cursor CLI keep-alive run on gem (Ubuntu Symphony).
Never say "the Mac." Locked inventory: gem=Ubuntu Symphony; Pro=Tim's
MacBook Pro (mac.lan / M5 32GB — where Ops/Grok Bot local tools run);
Air=MacBook Air powered off on desk; PC=dead. Cursor CLI install and
auto-update target gem only. Pro may hold a logged-in Cursor for
reference only.

This worker never selects a Symphony route, never leases an issue, and never
claims useful-turn capacity. Official Codex app-server on :4041 stays
untouched. Controller (symphony-elixir / burrito) updates stay on
update-symphony-burrito.sh --managed-controller-only. This worker updates
only the Cursor CLI and never stops running fallback-ship / grok-sidecar
units. JOV-5492 capacity evidence (maxConcurrent=0) is an admission gate,
not a useful-turn proof. Health is throughput classification, not HTTP 200.
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
PICKUP_SCHEMA = "symphony-fallback-pickup/v1"
CAPACITY_SCHEMA = "symphony-provider-capacity/v1"
FLEET_GATE_SCHEMA = "jovie-fleet-gate/v1"
REQUESTED_MODEL = "cursor-grok-4.6-high-fast"
ENROLLED_CURSOR_MODELS = frozenset({"cursor-grok-4.6-high-fast", "gpt-5.6-luna"})
NON_ENROLLMENT_MODELS = frozenset({"auto"})
WRAPPER_NAME = "cursor-agent-std"
WORKER_NAME = "cursor-cli-worker.py"
DEFAULT_INSTALL_URL = "https://cursor.com/install"
STALE_AFTER_DAYS = 2
DORMANT_AFTER_SECONDS = 600
EXIT_OK = 0
EXIT_UNHEALTHY = 2
EXIT_DEGRADED = 3
AUTH_FAILURE = re.compile(r"not authenticated|not logged in|unauthori[sz]ed|\b401\b", re.I)
VERSION_STAMP = re.compile(r"(20\d{2}\.\d{2}\.\d{2})")
HOST_ROLE = "gem"
HOST_LABEL = "Ubuntu Symphony"
CURSOR_CLI_TARGET = "gem"
PRO_ROLE = "ops_grok_bot"
PRO_CURSOR_ROLE = "reference_only"
HOSTS = {
    "gem": "Ubuntu Symphony",
    "pro": "Tim's MacBook Pro (mac.lan / M5 32GB — where Ops/Grok Bot local tools run)",
    "air": "MacBook Air powered off on desk",
    "pc": "dead",
}
PINNED_EXECUTABLE = "/home/timwhite/.local/bin/cursor-agent-std"
CODEX_STATUS = "out_until_weekly_reset"
ADMISSION_GATE = "JOV-5492"


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


def pickup_path(env=None):
    configured = (env or os.environ).get("SYMPHONY_FALLBACK_PICKUP_RECEIPT")
    if configured:
        return pathlib.Path(configured)
    return _home(env) / ".local/state/symphony-fallback/pickup/latest.json"


def capacity_path(env=None):
    configured = (env or os.environ).get("SYMPHONY_PROVIDER_CAPACITY_STATE")
    if configured:
        return pathlib.Path(configured)
    return _home(env) / ".local/state/symphony-fallback/provider-capacity.json"


def fleet_gate_path(env=None):
    configured = (env or os.environ).get("GEM_FLEET_GATE_RECEIPT")
    if configured:
        return pathlib.Path(configured)
    return _home(env) / ".local/state/gem-priority-gate/latest.json"


def registry_path(env=None):
    configured = (env or os.environ).get("SYMPHONY_MODEL_REGISTRY")
    if configured:
        return pathlib.Path(configured)
    return pathlib.Path(__file__).resolve().with_name("config") / "model-registry.json"


def load_json_dict(path):
    try:
        payload = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _runnable(path):
    return bool(path) and pathlib.Path(path).is_file() and os.access(path, os.X_OK)


def newest_version_binary(env=None):
    versions = versions_dir(env)
    if not versions.is_dir():
        return None
    folders = sorted((p for p in versions.iterdir() if p.is_dir()), key=lambda p: p.name)
    for folder in reversed(folders):
        candidate = folder / "cursor-agent"
        if _runnable(candidate):
            return candidate
    return None


def official_binary(env=None):
    override = (env or os.environ).get("CURSOR_AGENT_REAL")
    if override and _runnable(override):
        return pathlib.Path(override)
    newest = newest_version_binary(env)
    if newest is not None:
        return newest
    path_hit = shutil.which("cursor-agent")
    if path_hit and _runnable(path_hit):
        return pathlib.Path(path_hit)
    return None


def selected_is_newest(binary, env=None):
    newest = newest_version_binary(env)
    if newest is None or binary is None:
        return True
    try:
        return pathlib.Path(binary).resolve() == newest.resolve()
    except OSError:
        return False


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


def enrolled_cursor_models(env=None):
    registry = load_json_dict(registry_path(env))
    models = registry.get("models")
    enrolled = set()
    if isinstance(models, list):
        for item in models:
            if not isinstance(item, dict) or item.get("provider") != "cursor":
                continue
            model = item.get("model")
            if isinstance(model, str) and model.strip():
                enrolled.add(model.strip())
    return enrolled or set(ENROLLED_CURSOR_MODELS)


def catalog_gap(listed, env=None):
    enrolled = enrolled_cursor_models(env)
    observed = {name for name in listed if name and name not in NON_ENROLLMENT_MODELS}
    return sorted(observed - enrolled)


def pickup_age_seconds(pickup, now=None):
    observed = pickup.get("observedAt") if isinstance(pickup, dict) else None
    if not isinstance(observed, str) or not observed:
        return None
    try:
        parsed = time.strptime(observed, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return None
    now = now or time.time()
    return max(0, now - time.mktime(parsed))


def admission_blocked(gate):
    if not isinstance(gate, dict) or gate.get("schema") != FLEET_GATE_SCHEMA:
        return False
    gem = (gate.get("concurrency") or {}).get("gem") or {}
    work = gate.get("workAdmission") or {}
    if not isinstance(gem, dict):
        gem = {}
    if not isinstance(work, dict):
        work = {}
    return (
        gem.get("maxConcurrent") == 0
        or work.get("newIssueLeaseAllowed") is False
        or work.get("allowed") is False
    )


def provider_seats_available(capacity):
    if not isinstance(capacity, dict) or capacity.get("schema") != CAPACITY_SCHEMA:
        return False
    providers = capacity.get("providers")
    if not isinstance(providers, dict):
        return False
    for name in ("cursor", "grok", "kimi"):
        item = providers.get(name)
        if not isinstance(item, dict) or item.get("status") != "available":
            continue
        for key in ("limit", "observedCapacity", "verifiedIdentityCapacity"):
            value = item.get(key)
            if isinstance(value, int) and not isinstance(value, bool) and value > 0:
                return True
    return False


def classify_throughput(*, cli_ready, env=None, now=None):
    now = now or time.time()
    gate = load_json_dict(fleet_gate_path(env))
    pickup = load_json_dict(pickup_path(env))
    capacity = load_json_dict(capacity_path(env))
    gate_present = gate.get("schema") == FLEET_GATE_SCHEMA
    pickup_present = pickup.get("schema") == PICKUP_SCHEMA
    capacity_present = capacity.get("schema") == CAPACITY_SCHEMA
    if admission_blocked(gate):
        return {
            "throughput": "admission_held",
            "admissionGate": ADMISSION_GATE,
            "detail": "JOV-5492 capacity evidence still blocks admission (maxConcurrent=0)",
        }
    seats = bool(cli_ready or provider_seats_available(capacity))
    if pickup_present:
        event = pickup.get("event")
        reason = pickup.get("reason")
        lock_count = pickup.get("lockCount")
        age = pickup_age_seconds(pickup, now)
        fresh = age is not None and age <= DORMANT_AFTER_SECONDS
        if event == "lease_start" or (isinstance(lock_count, int) and not isinstance(lock_count, bool) and lock_count > 0):
            return {
                "throughput": "delivering",
                "admissionGate": "",
                "detail": "pickup lease in progress",
            }
        if fresh and event == "idle" and reason == "no_eligible_issue":
            return {
                "throughput": "idle_no_work",
                "admissionGate": "",
                "detail": "no eligible issue",
            }
        if seats and (not fresh or event in {"idle", "refuse", "red"}):
            return {
                "throughput": "dormant_with_capacity",
                "admissionGate": "",
                "detail": "dormant while seats exist",
            }
    elif seats and (gate_present or capacity_present):
        return {
            "throughput": "dormant_with_capacity",
            "admissionGate": "",
            "detail": "dormant while seats exist",
        }
    return {
        "throughput": "unknown",
        "admissionGate": "",
        "detail": "throughput unobserved",
    }


def apply_throughput(payload, env=None, now=None):
    cli_reasons = [
        reason
        for reason in (payload.get("reasons") or [])
        if reason not in {"dormant_with_capacity"}
    ]
    cli_ready = payload.get("authenticated") is True and not cli_reasons
    classification = classify_throughput(cli_ready=cli_ready, env=env, now=now)
    payload["throughput"] = classification["throughput"]
    payload["admissionGate"] = classification["admissionGate"]
    payload["throughputDetail"] = classification["detail"]
    reasons = list(cli_reasons)
    if reasons:
        status = "unhealthy"
        if classification["throughput"] == "dormant_with_capacity" and "dormant_with_capacity" not in reasons:
            reasons.append("dormant_with_capacity")
    elif classification["throughput"] == "admission_held":
        status = "admission_held"
    elif classification["throughput"] == "dormant_with_capacity":
        reasons.append("dormant_with_capacity")
        status = "unhealthy"
    else:
        status = "ready"
    payload["reasons"] = reasons
    payload["status"] = status
    return payload


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
        if not selected_is_newest(binary, env):
            reasons.append("stale_binary_selected")
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
    payload = {
        "schema": SCHEMA,
        "observedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now or time.time())),
        "status": "unhealthy" if reasons else "ready",
        "requestedModel": REQUESTED_MODEL,
        "wrapperPath": str(wrapper),
        "executable": str(binary) if binary is not None else "",
        "pinnedExecutable": PINNED_EXECUTABLE,
        "version": version or "",
        "authenticated": authenticated,
        "models": sorted(models),
        "enrolledModels": sorted(enrolled_cursor_models(env)),
        "catalogGap": catalog_gap(models, env),
        "reasons": reasons,
        "hostRole": HOST_ROLE,
        "hostLabel": HOST_LABEL,
        "cursorCliTarget": CURSOR_CLI_TARGET,
        "proRole": PRO_ROLE,
        "proCursorRole": PRO_CURSOR_ROLE,
        "hosts": dict(HOSTS),
        "codex": CODEX_STATUS,
        "throughput": "unknown",
        "admissionGate": "",
        "throughputDetail": "throughput unobserved",
    }
    return apply_throughput(payload, env=env, now=now)


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
    throughput = payload.get("throughput")
    if status == "ready":
        return {"status": "ready", "detail": f"cursor-cli {payload.get('requestedModel')}"}
    if status == "admission_held" or throughput == "admission_held":
        return {"status": "admission_held", "detail": "cursor-cli admission_held"}
    if throughput == "dormant_with_capacity" or "dormant_with_capacity" in reasons:
        return {"status": "unhealthy", "detail": "cursor-cli dormant_with_capacity"}
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


def _should_update(reasons, env=None):
    if "binary_stale" in reasons or "stale_binary_selected" in reasons:
        return True
    return (env or os.environ).get("CURSOR_AGENT_UPDATE") == "1"


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
    if _should_update(reasons, env) and official_binary(env) is not None:
        ok, _detail = run_update(official_binary(env), env)
        try:
            install_wrapper(env)
        except OSError:
            payload = probe_health(env, now=now)
            payload["reasons"] = list(payload.get("reasons") or []) + ["wrapper_install_failed"]
            payload["status"] = "unhealthy"
            write_receipt(payload, env)
            return EXIT_DEGRADED, payload
        payload = probe_health(env, now=now)
        if not ok and payload.get("status") == "ready":
            write_receipt(payload, env)
            return EXIT_OK, payload
        if not selected_is_newest(official_binary(env), env) or "binary_stale" in (
            payload.get("reasons") or []
        ):
            extra = list(payload.get("reasons") or [])
            if "stale_binary_selected" not in extra:
                extra.append("stale_binary_selected")
            payload["reasons"] = extra
            payload["status"] = "unhealthy"
    write_receipt(payload, env)
    if payload.get("status") == "ready":
        return EXIT_OK, payload
    return EXIT_UNHEALTHY, payload


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
