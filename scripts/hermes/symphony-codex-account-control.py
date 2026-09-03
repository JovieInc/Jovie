#!/usr/bin/env python3
"""Guarded Symphony Codex account inspect/reconnect for official Elixir on Gem.

Read-only binding review. Reconnect is one-time, locked, short-lived, and never
prints token or auth-file content. Does not switch or restart the service.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import pathlib
import re
import secrets
import subprocess
import sys
import time


SCHEMA = "symphony-codex-account-control/v1"
RECEIPT_SCHEMA = "symphony-codex-account-reconnect/v1"
SERVICE = "symphony-elixir.service"
APPROVED_LABELS = ("meetjovie", "jovie", "timwhite-co")
SESSION_TTL_SECONDS = 600
CODE_WAIT_SECONDS = 8
SUPERVISE_POLL_SECONDS = 0.2
USER_CODE_RE = re.compile(r"\b([A-Z0-9]{4,8}-[A-Z0-9]{4,8})\b")
DEVICE_URI_RE = re.compile(r"https://auth\.openai\.com/codex/device[^\s\"']*")
SECRETISH = re.compile(
    r"(access_token|refresh_token|id_token|auth\.json|sk-[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{20,})",
    re.I,
)


def _expand(name: str, default: str) -> pathlib.Path:
    return pathlib.Path(os.path.expanduser(os.environ.get(name, default)))


def _root() -> pathlib.Path:
    return _expand("CODEX_ACCOUNTS_ROOT", "~/.codex-accounts")


def _state_path() -> pathlib.Path:
    return _expand("CODEX_ACCOUNTS_STATE", str(_root() / "state.json"))


def _account_env_path() -> pathlib.Path:
    return _expand("SYMPHONY_CODEX_ACCOUNT_ENV", "~/.config/symphony/codex-account.env")


def _codex_bin() -> str:
    return os.environ.get("CODEX_REAL_BIN") or os.path.expanduser("~/.local/bin/codex")


def _control_dir() -> pathlib.Path:
    path = _root() / "control"
    path.mkdir(parents=True, exist_ok=True)
    os.chmod(path, 0o700)
    return path


def _session_path(session_id: str) -> pathlib.Path:
    return _control_dir() / f"session-{session_id}.json"


def _lock_path(account: str) -> pathlib.Path:
    locks = _root() / "locks"
    locks.mkdir(parents=True, exist_ok=True)
    return locks / f"{account}.lock"


def _approved(account: str) -> bool:
    return account in APPROVED_LABELS


def _now() -> int:
    return int(time.time())


def _iso(ts: int | None = None) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(_now() if ts is None else ts))


def _read_json(path: pathlib.Path) -> dict | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError, TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _atomic_write(path: pathlib.Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def _redact(text: str) -> str:
    return SECRETISH.sub("[redacted]", text)


def parse_device_auth(chunk: str) -> tuple[str | None, str | None]:
    if SECRETISH.search(chunk):
        chunk = _redact(chunk)
    uri = None
    match = DEVICE_URI_RE.search(chunk)
    if match:
        uri = match.group(0)
    code = None
    for candidate in USER_CODE_RE.findall(chunk):
        if candidate.upper() in {"HTTP-404", "UTF8-BOM"}:
            continue
        code = candidate
    return code, uri


def classify_account_state(
    *,
    auth_present: bool,
    cooldown_until: int | None,
    readiness_expires: int | None,
    now: int,
) -> str:
    if cooldown_until is not None and cooldown_until > now:
        return "usage-exhausted"
    if not auth_present:
        return "unknown"
    if readiness_expires is not None and readiness_expires < now:
        return "stale"
    if readiness_expires is None:
        return "stale"
    return "verified"


def parse_binding_label(raw_home: str, accounts_root: pathlib.Path) -> str | None:
    home = pathlib.Path(os.path.expanduser(raw_home)).resolve()
    root = accounts_root.resolve()
    try:
        relative = home.relative_to(root)
    except ValueError:
        return home.name or None
    if len(relative.parts) != 1:
        return home.name or None
    return relative.parts[0]


def _service_active() -> bool | None:
    try:
        result = subprocess.run(
            ["systemctl", "--user", "is-active", "--quiet", SERVICE],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=2,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.returncode == 0


def _binding_review() -> dict:
    env_path = _account_env_path()
    raw_home = None
    try:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped.startswith("CODEX_HOME="):
                if raw_home is not None:
                    raw_home = None
                    break
                raw_home = stripped.split("=", 1)[1].strip().strip("'\"")
    except (OSError, UnicodeError):
        raw_home = None
    label = parse_binding_label(raw_home, _root()) if raw_home else None
    recognized = bool(label and _approved(label))
    return {
        "service": SERVICE,
        "boundLabel": label,
        "recognized": recognized,
        "selectable": False,
        "canSwitch": False,
        "canRestart": False,
        "reviewOnly": True,
        "serviceActive": _service_active(),
    }


def _state_snapshot() -> tuple[dict, dict[str, int], dict[str, dict]]:
    state = _read_json(_state_path()) or {}
    cooldowns = state.get("cooldowns") if isinstance(state.get("cooldowns"), dict) else {}
    readiness = state.get("readiness") if isinstance(state.get("readiness"), dict) else {}
    parsed_cooldowns: dict[str, int] = {}
    for name, raw in cooldowns.items():
        if not isinstance(name, str):
            continue
        try:
            parsed_cooldowns[name] = int(raw)
        except (TypeError, ValueError):
            continue
    parsed_ready: dict[str, dict] = {}
    for name, raw in readiness.items():
        if isinstance(name, str) and isinstance(raw, dict):
            parsed_ready[name] = raw
    return state, parsed_cooldowns, parsed_ready


def _active_session() -> dict | None:
    newest: dict | None = None
    try:
        entries = list(_control_dir().glob("session-*.json"))
    except OSError:
        return None
    for path in entries:
        payload = _read_json(path)
        if not payload or payload.get("schema") != SCHEMA:
            continue
        phase = payload.get("phase")
        if phase not in {
            "starting",
            "confirmation",
            "authorization-pending",
            "succeeded",
            "failed",
            "expired",
        }:
            continue
        expires = payload.get("expiresAt")
        try:
            expires_at = int(expires) if expires is not None else 0
        except (TypeError, ValueError):
            expires_at = 0
        if phase in {"starting", "authorization-pending"} and expires_at and expires_at <= _now():
            payload["phase"] = "expired"
            _atomic_write(path, payload)
            phase = "expired"
        if newest is None or int(payload.get("createdAt") or 0) >= int(newest.get("createdAt") or 0):
            newest = payload
    return newest


def inspect_snapshot() -> dict:
    now = _now()
    _, cooldowns, readiness = _state_snapshot()
    accounts = []
    for label in APPROVED_LABELS:
        account_dir = _root() / label
        auth_present = (account_dir / "auth.json").is_file()
        ready = readiness.get(label) or {}
        try:
            expires = int(ready["expiresAt"]) if "expiresAt" in ready else None
        except (TypeError, ValueError, KeyError):
            expires = None
        state = classify_account_state(
            auth_present=auth_present,
            cooldown_until=cooldowns.get(label),
            readiness_expires=expires,
            now=now,
        )
        accounts.append(
            {
                "label": label,
                "state": state,
                "reconnectEligible": True,
                "authPresent": auth_present,
            }
        )
    binding = _binding_review()
    return {
        "schema": SCHEMA,
        "service": SERVICE,
        "observedAt": _iso(now),
        "availability": "ready",
        "binding": binding,
        "accounts": accounts,
        "session": public_session(_active_session()),
    }


def public_session(session: dict | None) -> dict | None:
    if not session:
        return None
    receipt = session.get("receipt")
    public_receipt = None
    if isinstance(receipt, dict):
        public_receipt = {
            "schema": RECEIPT_SCHEMA,
            "account": receipt.get("account"),
            "completedAt": receipt.get("completedAt"),
            "source": "device-auth",
            "result": "selected-account-verified",
        }
    return {
        "schema": SCHEMA,
        "id": session.get("id"),
        "account": session.get("account"),
        "phase": session.get("phase"),
        "userCode": session.get("userCode"),
        "verificationUri": session.get("verificationUri"),
        "createdAt": session.get("createdAtIso") or _iso(int(session.get("createdAt") or _now())),
        "expiresAt": session.get("expiresAtIso")
        or _iso(int(session.get("expiresAt") or _now() + SESSION_TTL_SECONDS)),
        "receipt": public_receipt,
        "error": session.get("error"),
    }


def _acquire_lock(account: str):
    path = _lock_path(account)
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(descriptor)
        return None
    return descriptor


def start_reconnect(account: str) -> dict:
    if not _approved(account):
        return {
            "schema": SCHEMA,
            "availability": "ready",
            "error": "account_not_approved",
            "session": None,
            "accounts": inspect_snapshot()["accounts"],
            "binding": _binding_review(),
            "service": SERVICE,
            "observedAt": _iso(),
        }
    active = _active_session()
    if active and active.get("phase") in {"starting", "authorization-pending"}:
        if int(active.get("expiresAt") or 0) > _now():
            snapshot = inspect_snapshot()
            snapshot["error"] = "reconnect_already_active"
            return snapshot
    lock = _acquire_lock(account)
    if lock is None:
        snapshot = inspect_snapshot()
        snapshot["error"] = "account_locked"
        return snapshot
    os.close(lock)
    session_id = secrets.token_hex(8)
    now = _now()
    session = {
        "schema": SCHEMA,
        "id": session_id,
        "account": account,
        "phase": "starting",
        "userCode": None,
        "verificationUri": None,
        "createdAt": now,
        "createdAtIso": _iso(now),
        "expiresAt": now + SESSION_TTL_SECONDS,
        "expiresAtIso": _iso(now + SESSION_TTL_SECONDS),
        "receipt": None,
        "error": None,
        "pid": None,
    }
    _atomic_write(_session_path(session_id), session)
    subprocess.Popen(
        [sys.executable, str(pathlib.Path(__file__).resolve()), "_supervise", account, session_id],
        start_new_session=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
    )
    deadline = time.time() + CODE_WAIT_SECONDS
    latest = session
    while time.time() < deadline:
        loaded = _read_json(_session_path(session_id)) or session
        latest = loaded
        if loaded.get("userCode") or loaded.get("phase") in {"failed", "expired", "succeeded"}:
            break
        time.sleep(SUPERVISE_POLL_SECONDS)
    snapshot = inspect_snapshot()
    snapshot["session"] = public_session(latest)
    return snapshot


def _supervise(account: str, session_id: str) -> int:
    if not _approved(account):
        return 2
    lock = _acquire_lock(account)
    if lock is None:
        session = _read_json(_session_path(session_id)) or {"schema": SCHEMA, "id": session_id}
        session.update({"phase": "failed", "error": "account_locked"})
        _atomic_write(_session_path(session_id), session)
        return 1
    try:
        session = _read_json(_session_path(session_id))
        if not session:
            return 1
        account_dir = _root() / account
        account_dir.mkdir(parents=True, exist_ok=True)
        os.chmod(account_dir, 0o700)
        env = os.environ.copy()
        env["CODEX_HOME"] = str(account_dir)
        try:
            proc = subprocess.Popen(
                [_codex_bin(), "login", "--device-auth"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=env,
                text=True,
            )
        except OSError:
            session["phase"] = "failed"
            session["error"] = "codex_unavailable"
            _atomic_write(_session_path(session_id), session)
            return 1
        session["pid"] = proc.pid
        session["phase"] = "authorization-pending"
        _atomic_write(_session_path(session_id), session)
        collected = ""
        deadline = session.get("expiresAt") or (_now() + SESSION_TTL_SECONDS)
        assert proc.stdout is not None
        while True:
            if _now() >= int(deadline):
                proc.kill()
                session["phase"] = "expired"
                session["error"] = "expired"
                _atomic_write(_session_path(session_id), session)
                return 0
            line = proc.stdout.readline()
            if line:
                if SECRETISH.search(line):
                    line = _redact(line)
                collected += line
                code, uri = parse_device_auth(collected)
                changed = False
                if code and session.get("userCode") != code:
                    session["userCode"] = code
                    changed = True
                if uri and session.get("verificationUri") != uri:
                    session["verificationUri"] = uri
                    changed = True
                if changed:
                    _atomic_write(_session_path(session_id), session)
            returncode = proc.poll()
            if returncode is None:
                if not line:
                    time.sleep(SUPERVISE_POLL_SECONDS)
                continue
            if returncode == 0 and session.get("userCode"):
                completed = _iso()
                session["phase"] = "succeeded"
                session["error"] = None
                session["receipt"] = {
                    "schema": RECEIPT_SCHEMA,
                    "account": account,
                    "completedAt": completed,
                    "source": "device-auth",
                    "result": "selected-account-verified",
                }
            elif returncode == 0:
                session["phase"] = "failed"
                session["error"] = "missing_device_code"
            else:
                session["phase"] = "failed"
                session["error"] = "device_auth_failed"
            _atomic_write(_session_path(session_id), session)
            return 0
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
        os.close(lock)


def emit(payload: dict) -> int:
    json.dump(payload, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("inspect", "reconnect", "_supervise"))
    parser.add_argument("--account", dest="account")
    parser.add_argument("supervise_account", nargs="?")
    parser.add_argument("supervise_session", nargs="?")
    args = parser.parse_args(argv)
    if args.command == "inspect":
        return emit(inspect_snapshot())
    if args.command == "reconnect":
        account = args.account or ""
        return emit(start_reconnect(account))
    account = args.supervise_account or args.account or ""
    session_id = args.supervise_session or ""
    if not account or not session_id:
        return 2
    return _supervise(account, session_id)


if __name__ == "__main__":
    sys.exit(main())
