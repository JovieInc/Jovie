#!/usr/bin/env python3
"""Mint a 1h GitHub App installation token (Jovie Bot) so Gem lanes stop sharing Tim's rate limit.
No dependencies: signs the app JWT with the openssl CLI. Caches the token until 10 min before expiry."""
from __future__ import annotations

import base64, calendar, json, os, subprocess, sys, time, urllib.request
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

# One GitHub budget per installation (JOV-7587): every gh call on a lanes host (workers,
# doctor, reconcile, agents) goes through the shim, so the shim is where polling yields.
# GitHub's own rateLimit is the shared truth across hosts; each host re-reads it at most
# once a minute and holds read-only polling below the floor until the reset, keeping the
# rest of the hour for writes (enqueue, merge, comments) instead of starting a quota storm.
BUDGET = Path(os.environ.get("JOVIE_GITHUB_BUDGET", Path.home() / ".local/state/jovie-lanes/github-budget.json"))
FLOOR = int(os.environ.get("JOVIE_GITHUB_FLOOR", "600"))
BUDGET_TTL_S = 60
READ_COMMANDS = {("pr", "list"), ("pr", "view"), ("pr", "checks"), ("pr", "status"), ("pr", "diff"),
                 ("run", "list"), ("run", "view"), ("issue", "list"), ("issue", "view"), ("search",)}
# `gh api` sends a POST as soon as it has a field or a body, so those are writes for REST.
WRITE_FLAGS = {"-X", "--method", "-f", "-F", "--field", "--raw-field", "--input"}
BUDGET_QUERY = "query={rateLimit{remaining resetAt}}"


def is_poll(args: list[str]) -> bool:
    """Read-only calls a lane can skip for one tick. Writes, the budget read itself and
    anything unknown pass."""
    if not args:
        return False
    if args[0] == "api":
        if len(args) > 1 and args[1] == "graphql":
            return not any("mutation" in arg or arg == BUDGET_QUERY for arg in args)
        return not any(arg.split("=")[0] in WRITE_FLAGS for arg in args)
    return tuple(args[:2]) in READ_COMMANDS or tuple(args[:1]) in READ_COMMANDS


def read_budget(gh_token: str, now: float, fetch=None) -> dict | None:
    try:
        cached = json.loads(BUDGET.read_text())
        if now - cached["observedAt"] < BUDGET_TTL_S:
            return cached
    except (OSError, ValueError, KeyError, TypeError):
        pass
    try:
        if fetch is None:
            req = urllib.request.Request("https://api.github.com/graphql", method="POST",
                                         data=json.dumps({"query": "{rateLimit{remaining resetAt}}"}).encode(),
                                         headers={"Authorization": f"Bearer {gh_token}"})
            limit = json.load(urllib.request.urlopen(req, timeout=10))["data"]["rateLimit"]
        else:
            limit = fetch()
        reset = calendar.timegm(time.strptime(limit["resetAt"], "%Y-%m-%dT%H:%M:%SZ"))
        budget = {"remaining": int(limit["remaining"]), "resetAt": reset, "observedAt": now}
    except (OSError, ValueError, KeyError, TypeError):
        return None  # an unreadable budget never blocks work
    BUDGET.parent.mkdir(parents=True, exist_ok=True)
    tmp = BUDGET.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(budget))
    os.replace(tmp, BUDGET)
    return budget


def hold(args: list[str], gh_token: str, now: float | None = None, fetch=None) -> str | None:
    """Why this call waits, or None. Only polling ever waits."""
    now = time.time() if now is None else now
    if not is_poll(args):
        return None
    budget = read_budget(gh_token, now, fetch)
    if budget and budget["remaining"] < FLOOR and now < budget["resetAt"]:
        return f"github-budget-floor: {budget['remaining']} GraphQL points left (< {FLOOR}) until reset"
    return None


if __name__ == "__main__":
    value = token()
    if sys.argv[1:2] == ["--guard"]:
        reason = hold(sys.argv[2:], value)
        if reason:
            sys.stderr.write(f"gh: {reason}\n")
            sys.exit(75)
    sys.stdout.write(value)
