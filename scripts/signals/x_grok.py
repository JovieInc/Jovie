"""X posts for the market-signal watcher, read through the Grok CLI's server-side X search.

INTERNAL USE ONLY (Tim, 2026-10-21). This feeds Jovie's own signals, research and Summer's
market-intel cards. It runs on Tim's existing SuperGrok OAuth seat (`~/.grok/auth.json`), so it
must never back a customer-facing or distributed feature: do not import it from apps/** or
packages/**, and do not expose its output outside internal tooling.

What the Grok CLI can reach (probed 2026-10-21, grok 1.0.46): `x_keyword_search`,
`x_semantic_search`, `x_user_search` and `x_thread_fetch`. None of them reads a user's bookmarks
or likes, so this source tracks named accounts (sources.json `x.accounts`) plus optional search
queries (`x.queries`) instead of Tim's bookmarks. Bookmarks still arrive through the browser
export inbox.

X has no push trigger, so this is a backstop poll: one call per watcher run (every
REFRESH_INTERVAL_S), admitted through the shared api-client ledger (provider `xai-grok-cli`,
priority `poll`, so it is shed first) and capped per day. Publish-to-observed dwell is recorded as
a jovie-stage-event/v1 row per post (entity `market-signal`, stage `published`).

Grok sometimes prints an invented example before the real answer. Every post must therefore
come from a requested handle (or a query), and its snowflake id must encode the same time as
its createdAt; anything else is dropped.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from apiclient.contract import provider_spec  # noqa: E402
from apiclient.headers import classify_failure, failure  # noqa: E402
from apiclient.policy import bump, credential_state, decide, record_outcome  # noqa: E402
from apiclient.store import default_store, now_ms as _now_ms  # noqa: E402

PROVIDER = "xai-grok-cli"
CREDENTIAL = "grok-cli-login"  # the CLI's own OAuth login; no key is read or stored here
DEFAULT_MODEL = "grok-4.7-build-fast"
TIMEOUT_S = 240
TWITTER_EPOCH_MS = 1288834974657
MAX_SKEW_MS = 36 * 3600 * 1000
POST_SCHEMA = {
    "type": "object", "required": ["posts"],
    "properties": {"posts": {"type": "array", "items": {
        "type": "object", "required": ["handle", "postId", "createdAt", "text"],
        "properties": {"handle": {"type": "string"}, "postId": {"type": "string"}, "createdAt": {"type": "string"},
                       "text": {"type": "string"}, "links": {"type": "array", "items": {"type": "string"}}}}}}}


def snowflake_ms(post_id: str) -> Optional[int]:
    return (int(post_id) >> 22) + TWITTER_EPOCH_MS if re.fullmatch(r"\d{15,25}", post_id or "") else None


def parse_time(value: str) -> Optional[int]:
    text = str(value or "").strip()
    for parse in (lambda t: datetime.fromisoformat(t.replace("Z", "+00:00")),
                  lambda t: datetime.strptime(t, "%a, %d %b %Y %H:%M:%S %Z").replace(tzinfo=timezone.utc)):
        try:
            moment = parse(text)
            return int((moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)).timestamp() * 1000)
        except ValueError:
            continue
    return None


def build_query(accounts: list[str]) -> str:
    return "(" + " OR ".join(f"from:{handle}" for handle in accounts) + ") -filter:replies -filter:retweets"


def build_prompt(accounts: list[str], queries: list[str], since: str, limit: int) -> str:
    searches = ([build_query(accounts)] if accounts else []) + list(queries)
    calls = "\n".join(f'- x_keyword_search query "{q} since:{since}" limit {limit}' for q in searches)
    return ("Call these searches, one call each, and no other tool:\n" + calls + "\n"
            "Return exactly one JSON object {\"posts\": [...]} with every result: handle without @, postId, "
            "createdAt as returned, text verbatim (at most 600 chars), links = expanded non-x.com URLs. "
            "Never invent or illustrate posts; return an empty list when a search finds nothing.")


def default_run(argv: list[str], env: dict, timeout_s: int = TIMEOUT_S) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(argv, env=env, capture_output=True, text=True, timeout=timeout_s,
                              stdin=subprocess.DEVNULL, cwd=env.get("SIGNALS_GROK_CWD") or None)
    except (OSError, subprocess.TimeoutExpired) as error:
        return 124, "", f"{type(error).__name__}: {error}"
    return proc.returncode, proc.stdout, proc.stderr


def json_objects(text: str) -> list:
    decoder, out, index = json.JSONDecoder(), [], 0
    while True:
        start = text.find("{", index)
        if start < 0:
            return out
        try:
            value, end = decoder.raw_decode(text, start)
        except ValueError:
            index = start + 1
            continue
        out.append(value)
        index = end


def verified_posts(result: dict, accounts: list[str], queries: list[str]) -> list[dict]:
    """Posts that pass the provenance checks, newest first, unique by id."""
    candidates = []
    structured = result.get("structuredOutput")
    for value in ([structured] if isinstance(structured, dict) else []) + json_objects(str(result.get("text") or "")):
        if isinstance(value, dict) and isinstance(value.get("posts"), list):
            candidates += [post for post in value["posts"] if isinstance(post, dict)]
    allowed = {handle.lower() for handle in accounts}
    posts, seen = [], set()
    for post in candidates:
        post_id, handle = str(post.get("postId") or ""), str(post.get("handle") or "").lstrip("@")
        minted, created = snowflake_ms(post_id), parse_time(post.get("createdAt"))
        if post_id in seen or minted is None or created is None or abs(minted - created) > MAX_SKEW_MS:
            continue
        if not queries and handle.lower() not in allowed:
            continue
        seen.add(post_id)
        links = [link for link in (post.get("links") or []) if isinstance(link, str) and link.startswith("https://")
                 and not re.match(r"https://(x|twitter)\.com/", link)]
        posts.append({"id": post_id, "author": handle, "text": str(post.get("text") or "")[:1200],
                      "createdAt": datetime.fromtimestamp(minted / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                      "url": f"https://x.com/{handle or 'i'}/status/{post_id}", "links": links[:3]})
    return sorted(posts, key=lambda post: post["createdAt"], reverse=True)


def search_posts(accounts: list[str], queries: list[str], since: str, *, env=None, run: Callable = default_run,
                 store=None, now: Callable[[], int] = _now_ms, limit: int = 20,
                 log: Optional[Callable[[str], None]] = None) -> dict:
    """One Grok CLI call admitted by the shared ledger. Returns {status, posts, costUsd, ...};
    status `deferred` means the ledger shed it (not an error), `failed` carries `error`."""
    env = dict(os.environ if env is None else env)
    log = log or (lambda line: sys.stderr.write(line + "\n"))
    spec = provider_spec(PROVIDER)
    store = store if store is not None else default_store(env)
    resource = spec["defaultResource"]

    def ledger(fn):
        return store.transact(PROVIDER, lambda led: fn(credential_state(led, CREDENTIAL, now()), now()))

    def admit(state, at):
        decision = decide(state, "poll", {resource: 1}, at)
        if decision["action"] != "go":
            bump(state, "poll", "shed", at)
        return decision

    decision = ledger(admit)
    if decision["action"] != "go":
        log(json.dumps({"provider": PROVIDER, "deferred": decision.get("reason")}))
        return {"status": "deferred", "reason": decision.get("reason"), "posts": [], "costUsd": 0.0}
    binary = env.get("SIGNALS_GROK_BIN") or "grok"
    argv = [binary, "-p", build_prompt(accounts, queries, since, limit), "--tools", "x_search", "--deny", "mcp__*",
            "--max-turns", "4", "-m", env.get("SIGNALS_GROK_MODEL") or DEFAULT_MODEL,
            "--json-schema", json.dumps(POST_SCHEMA), "--no-auto-update"]
    code, stdout, stderr = run(argv, env)
    result = next((value for value in json_objects(stdout) if isinstance(value, dict) and "stopReason" in value), None)
    at = now()
    fail = failure("none") if code == 0 and result is not None else \
        classify_failure(spec, None, None, None, f"{stderr}\n{stdout[-2000:]}", network_error=code in (124, 127),
                         now_ms=at)
    if fail["kind"] == "none" and (code != 0 or result is None):
        fail = failure("transient")
    ledger(lambda state, t: record_outcome(state, "poll", resource, fail, decision.get("probe", False), t))
    if result is None or code != 0:
        return {"status": "failed", "error": f"grok exit {code}: {(stderr or stdout).strip()[-200:]}", "posts": [],
                "costUsd": 0.0}
    posts = verified_posts(result, accounts, queries)
    return {"status": "ok", "posts": posts, "costUsd": float(result.get("total_cost_usd") or 0.0),
            "turns": result.get("num_turns")}
