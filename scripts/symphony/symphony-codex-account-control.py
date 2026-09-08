#!/usr/bin/env python3
"""Guarded Symphony Codex inspect/reconnect. Binding review is read-only."""
from __future__ import annotations
import fcntl, json, os, pathlib, re, secrets, subprocess, sys, time

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
    r"(access_token|refresh_token|id_token|auth\.json|sk-[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{20,})", re.I
)
ACTIVE_PHASES = {"starting", "authorization-pending"}
SESSION_PHASES = ACTIVE_PHASES | {"succeeded", "failed", "expired"}

def _expand(name, default):
    return pathlib.Path(os.path.expanduser(os.environ.get(name, default)))
def _root(): return _expand("CODEX_ACCOUNTS_ROOT", "~/.codex-accounts")
def _now(): return int(time.time())
def _iso(ts=None): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(_now() if ts is None else ts))

def _read_json(path):
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError, TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None

def _atomic_write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)

def _save(path, session, **fields):
    session.update(fields); _atomic_write(path, session)

def _session_path(session_id):
    control = _root() / "control"
    control.mkdir(parents=True, exist_ok=True); os.chmod(control, 0o700)
    return control / f"session-{session_id}.json"

def parse_device_auth(chunk):
    if SECRETISH.search(chunk): chunk = SECRETISH.sub("[redacted]", chunk)
    uri = DEVICE_URI_RE.search(chunk)
    code = next((c for c in USER_CODE_RE.findall(chunk) if c.upper() not in {"HTTP-404", "UTF8-BOM"}), None)
    return code, uri.group(0) if uri else None

def classify_account_state(*, auth_present, cooldown_until, readiness_expires, now):
    if cooldown_until is not None and cooldown_until > now: return "usage-exhausted"
    if not auth_present: return "unknown"
    return "stale" if readiness_expires is None or readiness_expires < now else "verified"

def parse_binding_label(raw_home, accounts_root):
    home = pathlib.Path(os.path.expanduser(raw_home)).resolve()
    try:
        relative = home.relative_to(accounts_root.resolve())
    except ValueError:
        return home.name or None
    return relative.parts[0] if len(relative.parts) == 1 else home.name or None

def _codex_home():
    try:
        homes = [
            line.strip().split("=", 1)[1].strip().strip("'\"")
            for line in _expand("SYMPHONY_CODEX_ACCOUNT_ENV", "~/.config/symphony/codex-account.env")
            .read_text(encoding="utf-8").splitlines()
            if line.strip().startswith("CODEX_HOME=")
        ]
        return homes[0] if len(homes) == 1 else None
    except (OSError, UnicodeError):
        return None

def _binding_review():
    raw_home = _codex_home()
    label = parse_binding_label(raw_home, _root()) if raw_home else None
    try:
        active = subprocess.run(
            ["systemctl", "--user", "is-active", "--quiet", SERVICE],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False, timeout=2,
        ).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        active = None
    return {
        "service": SERVICE, "boundLabel": label,
        "recognized": bool(label and label in APPROVED_LABELS),
        "selectable": False, "canSwitch": False, "canRestart": False,
        "reviewOnly": True, "serviceActive": active,
    }

def _active_session():
    newest = None
    try: entries = list((_root() / "control").glob("session-*.json"))
    except OSError: return None
    for path in entries:
        payload = _read_json(path)
        if not payload or payload.get("schema") != SCHEMA or payload.get("phase") not in SESSION_PHASES:
            continue
        try: expires_at = int(payload.get("expiresAt") or 0)
        except (TypeError, ValueError): expires_at = 0
        if payload.get("phase") in ACTIVE_PHASES and expires_at and expires_at <= _now():
            payload["phase"] = "expired"; _atomic_write(path, payload)
        if newest is None or int(payload.get("createdAt") or 0) >= int(newest.get("createdAt") or 0):
            newest = payload
    return newest

def inspect_snapshot():
    now = _now()
    state = _read_json(_expand("CODEX_ACCOUNTS_STATE", str(_root() / "state.json"))) or {}
    cooldowns = {}
    for name, value in (state.get("cooldowns") if isinstance(state.get("cooldowns"), dict) else {}).items():
        if isinstance(name, str):
            try: cooldowns[name] = int(value)
            except (TypeError, ValueError): continue
    readiness = state.get("readiness") if isinstance(state.get("readiness"), dict) else {}
    accounts = []
    for label in APPROVED_LABELS:
        ready = readiness.get(label) if isinstance(readiness.get(label), dict) else {}
        try: expires = int(ready["expiresAt"]) if "expiresAt" in ready else None
        except (TypeError, ValueError, KeyError): expires = None
        auth_present = (_root() / label / "auth.json").is_file()
        accounts.append({
            "label": label, "reconnectEligible": True,
            "state": classify_account_state(
                auth_present=auth_present, cooldown_until=cooldowns.get(label),
                readiness_expires=expires, now=now,
            ),
        })
    return {
        "schema": SCHEMA, "service": SERVICE, "observedAt": _iso(now),
        "availability": "ready", "binding": _binding_review(),
        "accounts": accounts, "session": public_session(_active_session()),
    }

def public_session(session):
    if not session: return None
    receipt = session.get("receipt") if isinstance(session.get("receipt"), dict) else None
    created = int(session.get("createdAt") or _now())
    expires = int(session.get("expiresAt") or created + SESSION_TTL_SECONDS)
    return {
        "schema": SCHEMA, "id": session.get("id"), "account": session.get("account"),
        "phase": session.get("phase"), "userCode": session.get("userCode"),
        "verificationUri": session.get("verificationUri"),
        "createdAt": session.get("createdAtIso") or _iso(created),
        "expiresAt": session.get("expiresAtIso") or _iso(expires),
        "error": session.get("error"),
        "receipt": {
            "schema": RECEIPT_SCHEMA, "account": receipt.get("account"),
            "completedAt": receipt.get("completedAt"), "source": "device-auth",
            "result": "selected-account-verified",
        } if receipt else None,
    }

def _acquire_lock(account):
    locks = _root() / "locks"
    locks.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(locks / f"{account}.lock", os.O_RDWR | os.O_CREAT, 0o600)
    try: fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(descriptor)
        return None
    return descriptor

def start_reconnect(account):
    snapshot = inspect_snapshot()
    if account not in APPROVED_LABELS:
        snapshot["error"] = "account_not_approved"; snapshot["session"] = None
        return snapshot
    active = _active_session()
    if active and active.get("phase") in ACTIVE_PHASES and int(active.get("expiresAt") or 0) > _now():
        snapshot["error"] = "reconnect_already_active"
        return snapshot
    lock = _acquire_lock(account)
    if lock is None:
        snapshot["error"] = "account_locked"
        return snapshot
    os.close(lock)
    session_id, now = secrets.token_hex(8), _now()
    session = {
        "schema": SCHEMA, "id": session_id, "account": account, "phase": "starting",
        "userCode": None, "verificationUri": None, "createdAt": now, "createdAtIso": _iso(now),
        "expiresAt": now + SESSION_TTL_SECONDS, "expiresAtIso": _iso(now + SESSION_TTL_SECONDS),
        "receipt": None, "error": None, "pid": None,
    }
    _atomic_write(_session_path(session_id), session)
    subprocess.Popen(
        [sys.executable, str(pathlib.Path(__file__).resolve()), "_supervise", account, session_id],
        start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
    )
    deadline, latest = time.time() + CODE_WAIT_SECONDS, session
    while time.time() < deadline:
        latest = _read_json(_session_path(session_id)) or session
        if latest.get("userCode") or latest.get("phase") in {"failed", "expired", "succeeded"}: break
        time.sleep(SUPERVISE_POLL_SECONDS)
    snapshot = inspect_snapshot()
    snapshot["session"] = public_session(latest)
    return snapshot

def _supervise(account, session_id):
    if account not in APPROVED_LABELS: return 2
    lock, path = _acquire_lock(account), _session_path(session_id)
    if lock is None:
        _save(path, _read_json(path) or {"schema": SCHEMA, "id": session_id}, phase="failed", error="account_locked")
        return 1
    try:
        session = _read_json(path)
        if not session: return 1
        account_dir = _root() / account
        account_dir.mkdir(parents=True, exist_ok=True); os.chmod(account_dir, 0o700)
        env = os.environ.copy(); env["CODEX_HOME"] = str(account_dir)
        try:
            proc = subprocess.Popen(
                [os.environ.get("CODEX_REAL_BIN") or os.path.expanduser("~/.local/bin/codex"), "login", "--device-auth"],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, text=True,
            )
        except OSError:
            _save(path, session, phase="failed", error="codex_unavailable")
            return 1
        _save(path, session, pid=proc.pid, phase="authorization-pending")
        collected, deadline = "", int(session.get("expiresAt") or (_now() + SESSION_TTL_SECONDS))
        assert proc.stdout is not None
        while True:
            if _now() >= deadline:
                proc.kill(); _save(path, session, phase="expired", error="expired"); return 0
            line = proc.stdout.readline()
            if line:
                if SECRETISH.search(line): line = SECRETISH.sub("[redacted]", line)
                collected += line
                code, uri = parse_device_auth(collected)
                updated = {}
                if code and session.get("userCode") != code: updated["userCode"] = code
                if uri and session.get("verificationUri") != uri: updated["verificationUri"] = uri
                if updated: _save(path, session, **updated)
            returncode = proc.poll()
            if returncode is None:
                if not line: time.sleep(SUPERVISE_POLL_SECONDS)
                continue
            if returncode == 0 and session.get("userCode"):
                _save(path, session, phase="succeeded", error=None, receipt={
                    "schema": RECEIPT_SCHEMA, "account": account, "completedAt": _iso(),
                    "source": "device-auth", "result": "selected-account-verified",
                })
            else:
                _save(path, session, phase="failed",
                      error="missing_device_code" if returncode == 0 else "device_auth_failed")
            return 0
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
        os.close(lock)

def emit(payload):
    json.dump(payload, sys.stdout, indent=2, sort_keys=True); sys.stdout.write("\n"); return 0

def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    if not args: return 2
    command, rest = args[0], args[1:]
    if command == "inspect": return emit(inspect_snapshot())
    if command == "reconnect":
        idx = rest.index("--account") if "--account" in rest else -1
        return emit(start_reconnect(rest[idx + 1] if idx >= 0 and idx + 1 < len(rest) else ""))
    if command == "_supervise" and len(rest) >= 2: return _supervise(rest[0], rest[1])
    return 2

if __name__ == "__main__":
    sys.exit(main())
