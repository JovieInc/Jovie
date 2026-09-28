#!/usr/bin/env python3
"""Mint a 1h GitHub App installation token (Jovie Bot) so Gem lanes stop sharing Tim's rate limit.
No dependencies: signs the app JWT with the openssl CLI. Caches the token until 10 min before expiry."""
from __future__ import annotations

import base64, json, os, subprocess, sys, time, urllib.request
from pathlib import Path

APP_ID = os.environ.get("JOVIE_BOT_APP_ID", "2934433")
INSTALLATION_ID = os.environ.get("JOVIE_BOT_INSTALLATION_ID", "112037986")
KEY = Path(os.environ.get("JOVIE_BOT_KEY", Path.home() / ".config/jovie-lanes/jovie-bot.pem"))
CACHE = Path(os.environ.get("JOVIE_BOT_TOKEN_CACHE", Path.home() / ".local/state/jovie-lanes/jovie-bot-token.json"))

b64 = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b"=")

def app_jwt(now: int) -> str:
    head = b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    body = b64(json.dumps({"iat": now - 60, "exp": now + 540, "iss": APP_ID}).encode())
    msg = head + b"." + body
    sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(KEY)], input=msg, capture_output=True, check=True).stdout
    return (msg + b"." + b64(sig)).decode()

def token(now: int | None = None) -> str:
    now = int(time.time()) if now is None else now
    try:
        cached = json.loads(CACHE.read_text())
        if cached["expiresAt"] - 600 > now:
            return cached["token"]
    except (OSError, ValueError, KeyError):
        pass
    req = urllib.request.Request(
        f"https://api.github.com/app/installations/{INSTALLATION_ID}/access_tokens", method="POST",
        headers={"Authorization": f"Bearer {app_jwt(now)}", "Accept": "application/vnd.github+json"})
    data = json.load(urllib.request.urlopen(req, timeout=20))
    expires = int(time.mktime(time.strptime(data["expires_at"], "%Y-%m-%dT%H:%M:%SZ"))) - time.timezone
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    old = os.umask(0o077)
    try:
        CACHE.write_text(json.dumps({"token": data["token"], "expiresAt": expires}))
    finally:
        os.umask(old)
    return data["token"]

if __name__ == "__main__":
    sys.stdout.write(token())
