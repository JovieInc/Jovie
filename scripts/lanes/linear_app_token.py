"""Linear OAuth app token (client credentials) for the lanes harness.

Linear quotas are per user: every request by one user shares one budget across API keys,
so lanes on Tim's key competed with Codex, Summer, MCP and the Linear sync and ran dry
(2026-10-11). The "Jovie Lanes" app has its own quota. When its client credentials are
installed (linear-app.env), every lanes Linear call uses one shared app token per host.
Without them lanes Linear access fails closed: there is no personal-key fallback (Tim
2026-10-20), so a personal key can be revoked without breaking lanes.

The token is minted with HTTP Basic client credentials, cached mode 0600 in the lanes
state dir with its expiry, and re-minted only near expiry or after Linear rejects it
(401). It is never minted per request, and a failed mint backs off before the next try.
Linear revokes every existing app token when a mint asks for different scopes, so the
scope is one constant and never varies. The token is never printed or logged.
"""
from __future__ import annotations

import base64
import fcntl
import hashlib
import json
import math
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

TOKEN_URL = "https://api.linear.app/oauth/token"
# Changing this string revokes every token already minted for the app. Never vary it per call.
SCOPE = "read,write,issues:create,comments:create"
SCHEMA = "jovie-linear-app-token/v1"
RENEW_MARGIN_S = 86400  # tokens live ~30 days; renew a day early
MINT_BACKOFF_S = 300
CACHE_NAME = "linear-app-token.json"


class TokenUnavailable(RuntimeError):
    """No usable app token right now; callers treat Linear as unavailable until retry_at."""

    def __init__(self, reason: str, retry_at: float):
        super().__init__(f"linear app token unavailable: {reason}")
        self.retry_at = retry_at


def default_path() -> Path | None:
    """The installed credentials file. The release self-test and local-test backends never
    read the host's file; an explicit LANES_LINEAR_APP_ENV still selects one."""
    configured = os.environ.get("LANES_LINEAR_APP_ENV")
    if configured:
        return Path(configured)
    if os.environ.get("LANES_SELFTEST") == "1" or os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return None
    return Path.home() / ".config/jovie-lanes/linear-app.env"


def env_values(path: Path) -> dict:
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if line.startswith("export "):
            line = line[len("export "):].strip()
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def credentials(path: Path | None) -> tuple[str, str] | None:
    if path is None or not path.is_file():
        return None
    values = env_values(path)
    client_id, secret = values.get("LINEAR_CLIENT_ID"), values.get("LINEAR_CLIENT_SECRET")
    return (client_id, secret) if client_id and secret else None


def client_tag(client_id: str) -> str:
    return hashlib.sha256(client_id.encode()).hexdigest()[:16]


def _read(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) and data.get("schema") == SCHEMA else {}


def _write_private(path: Path, payload: dict) -> None:
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    fd = os.open(tmp, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
    try:
        os.write(fd, json.dumps(payload).encode())
    finally:
        os.close(fd)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def _usable(record: dict, tag: str, now: float, rejected: str | None) -> str | None:
    token, expires = record.get("accessToken"), record.get("expiresAt")
    if record.get("client") != tag or record.get("scope") != SCOPE or not isinstance(token, str) or not token:
        return None
    if type(expires) not in (int, float) or not math.isfinite(expires) or expires - RENEW_MARGIN_S <= now:
        return None
    return None if token == rejected else token


def mint(client_id: str, secret: str, timeout: float = 20) -> tuple[str, float]:
    basic = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
    request = urllib.request.Request(
        TOKEN_URL, method="POST",
        data=urllib.parse.urlencode({"grant_type": "client_credentials", "scope": SCOPE}).encode(),
        headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode() or "{}")
    token, lifetime = payload.get("access_token"), payload.get("expires_in")
    if not isinstance(token, str) or not token or type(lifetime) not in (int, float) or lifetime <= 0:
        raise ValueError("token response malformed")
    if str(payload.get("token_type") or "bearer").lower() != "bearer":
        raise ValueError("token type is not bearer")
    return token, float(lifetime)


def token(client_id: str, secret: str, state: Path | None, *, rejected: str | None = None,
          now: float | None = None, mint_fn=None) -> str:
    """One shared token per host. `rejected` is a token Linear just answered 401 for: a
    sibling may already have replaced it; otherwise mint once, under the lock."""
    now = time.time() if now is None else now
    tag = client_tag(client_id)
    if state is None:
        raise TokenUnavailable("no-state-dir", now + MINT_BACKOFF_S)
    state.mkdir(parents=True, exist_ok=True)
    path = state / CACHE_NAME
    with open(state / "linear-app-token.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        record = _read(path)
        cached = _usable(record, tag, now, rejected)
        if cached:
            return cached
        failed = record.get("mintFailedAt")
        if record.get("client") == tag and type(failed) in (int, float) and 0 <= now - failed < MINT_BACKOFF_S:
            raise TokenUnavailable("mint-backoff", failed + MINT_BACKOFF_S)
        try:
            access, lifetime = (mint_fn or mint)(client_id, secret)
        except Exception as error:
            _write_private(path, {"schema": SCHEMA, "client": tag, "scope": SCOPE, "mintFailedAt": now,
                                  "mintError": type(error).__name__})
            raise TokenUnavailable(f"mint-failed:{type(error).__name__}", now + MINT_BACKOFF_S) from None
        _write_private(path, {"schema": SCHEMA, "client": tag, "scope": SCOPE, "accessToken": access,
                              "mintedAt": now, "expiresAt": now + lifetime})
        return access


def status(state: Path | None, now: float | None = None) -> dict | None:
    """Redacted view for status/doctor: never the token itself."""
    if state is None:
        return None
    record = _read(state / CACHE_NAME)
    if not record:
        return None
    now = time.time() if now is None else now
    expires = record.get("expiresAt")
    return {"client": record.get("client"), "scope": record.get("scope"),
            "expiresInS": round(expires - now) if type(expires) in (int, float) else None,
            "mintFailedAt": record.get("mintFailedAt"), "mintError": record.get("mintError")}
