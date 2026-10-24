"""`gh` through the ledger (mirror of gh.ts): admission by priority, failure classification from
gh's text, headers via `gh api --include`, bounded retries, exit 75 when deferred."""
from __future__ import annotations

import os
import random as _random
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Callable, Optional

from .client import EX_TEMPFAIL
from .contract import DEFAULTS, priority_policy, provider_spec
from .headers import classify_failure, failure, parse_budget
from .policy import backoff_ms, bump, credential_state, decide, observe, record_outcome
from .store import default_store, hash_credential, now_ms

GH_TRANSIENT = re.compile(
    r"HTTP 50[0234]|timed? ?out|unexpected EOF|connection reset|stream error|couldn't respond|ECONNRESET|"
    r"ETIMEDOUT|EAI_AGAIN|Bad Gateway|Service Unavailable|invalid character '<'", re.I)
WRITE_FLAGS = {"-X", "--method", "-f", "-F", "--field", "--raw-field", "--input"}
READ_PORCELAIN = {"list", "view", "checks", "status", "diff"}


def gh_shape(args) -> dict:
    """Which bucket a gh invocation draws on, and whether it mutates."""
    if args and args[0] == "api":
        target = next((a for i, a in enumerate(args) if i > 0 and not a.startswith("-")
                       and args[i - 1] not in WRITE_FLAGS), "")
        method = None
        for i, a in enumerate(args):
            if a in ("-X", "--method"):
                method = (args[i + 1] if i + 1 < len(args) else "GET").upper()
                break
        if target == "graphql":
            mutation = any(re.search(r"\bmutation\b", a) for a in args)
            return {"resource": "graphql", "write": mutation, "idempotent": not mutation}
        has_fields = any(a in WRITE_FLAGS and a not in ("-X", "--method") for a in args)
        effective = method or ("POST" if has_fields else "GET")
        write = effective not in ("GET", "HEAD")
        return {"resource": "search" if target.lstrip("/").startswith("search/") else "core", "write": write,
                "idempotent": (not write) or effective in ("PUT", "DELETE")}
    read = bool(args) and (args[0] == "search" or (len(args) > 1 and args[1] in READ_PORCELAIN))
    return {"resource": "graphql", "write": not read, "idempotent": read}


def split_included(stdout: str):
    """`gh api -i` output: status line + headers, blank line, body."""
    if not re.match(r"HTTP/[\d.]+ \d{3}", stdout):
        return None
    match = re.search(r"\r?\n\r?\n", stdout)
    if not match:
        return None
    headers = {}
    for line in re.split(r"\r?\n", stdout[:match.start()])[1:]:
        colon = line.find(":")
        if colon > 0:
            headers[line[:colon].strip().lower()] = line[colon + 1:].strip()
    return headers, stdout[match.end():]


def default_run(args, env) -> tuple:
    try:
        proc = subprocess.run(["gh", *args], env=env, capture_output=True, text=True)
    except OSError as error:
        return 127, "", str(error)
    return proc.returncode, proc.stdout, proc.stderr


def gh_credential(env) -> str:
    if env.get("JOVIE_GITHUB_CREDENTIAL"):
        return env["JOVIE_GITHUB_CREDENTIAL"]
    token = env.get("GH_TOKEN") or env.get("GITHUB_TOKEN")
    return hash_credential("github", token) if token else "gh-cli-login"


def run_gh(args, priority: str = "default", credential: Optional[str] = None, store=None, env=None,
           run: Callable = default_run, now: Callable[[], int] = now_ms, sleep: Optional[Callable] = None,
           random: Callable[[], float] = _random.random, max_attempts: Optional[int] = None,
           max_wait_ms: Optional[int] = None, log: Optional[Callable[[str], None]] = None) -> dict:
    """Returns {code, stdout, stderr, deferred}; code 75 means retry later, not a verdict."""
    args = list(args)
    env = {**(os.environ if env is None else env), "NO_COLOR": "1", "GH_FORCE_TTY": "0"}
    spec = provider_spec("github")
    store = store if store is not None else default_store(env)
    credential = credential or gh_credential(env)
    sleep = sleep or (lambda ms: time.sleep(ms / 1000))
    log = log or (lambda line: sys.stderr.write(line + "\n"))
    max_attempts = max_attempts or DEFAULTS["maxAttempts"]
    budget = DEFAULTS["maxWaitMs"][priority_policy(priority)["class"]] if max_wait_ms is None else max_wait_ms
    deadline = now() + budget
    shape = gh_shape(args)
    include = bool(args) and args[0] == "api" and not any(a in ("--paginate", "-i", "--include", "--silent") for a in args)
    argv = ["api", "--include", *args[1:]] if include else args

    def defer(reason: str, retry_at) -> dict:
        until = f" until {datetime.fromtimestamp(retry_at / 1000, tz=timezone.utc).isoformat()}" if retry_at else ""
        log(f"::warning::github-quota-deferred: gh {' '.join(args[:2])} {reason}{until}; not a verdict on this change.")
        return {"code": EX_TEMPFAIL, "stdout": "", "stderr": reason, "deferred": True}

    def ledger(fn):
        def inner(led):
            at = now()
            return fn(credential_state(led, credential, at), at)
        return store.transact("github", inner)

    attempt = 0
    while True:
        def admit(s, at):
            d = decide(s, priority, {shape["resource"]: 1}, at, write=shape["write"],
                       min_write_interval_ms=spec.get("minWriteIntervalMs"))
            if d["action"] != "go":
                bump(s, priority, "shed" if d["action"] == "shed" else "waited", at)
            return d

        d = ledger(admit)
        if d["action"] == "shed":
            return defer(f"shed ({d['reason']})", d["until"])
        if d["action"] == "wait":
            until = d["until"] if d["until"] is not None else now() + 1000
            if until > deadline:
                return defer(f"waits past budget ({d['reason']})", until)
            sleep(max(0, until - now()))
            continue
        attempt += 1
        code, stdout, stderr = run(argv, env)
        included = split_included(stdout) if include else None
        headers = included[0] if included else None
        if included:
            status = int(re.match(r"HTTP/[\d.]+ (\d{3})", stdout).group(1))
        else:
            status = 200 if code == 0 else None
        body = included[1] if included else stdout
        at = now()
        fail = failure("none") if code == 0 else classify_failure(spec, status, headers, None, f"{stderr}\n{body}",
                                                                  now_ms=at)
        # Without HTTP evidence, only gh's known transport wording is transient.
        if fail["kind"] == "transient" and status is None and not GH_TRANSIENT.search(stderr):
            fail = failure("client", fail["retryAtMs"])
        ledger(lambda s, t: (observe(s, parse_budget(spec, headers, t, shape["resource"]), t),
                             record_outcome(s, priority, shape["resource"], fail, d["probe"], t)))
        result = {"code": code, "stdout": body, "stderr": stderr, "deferred": False}
        if fail["kind"] in ("none", "client"):
            return result
        if fail["kind"] == "transient" and not shape["idempotent"]:
            return result
        delay = backoff_ms(attempt, fail, now(), random)
        if attempt >= max_attempts or now() + delay > deadline:
            return defer(f"{fail['kind']} after {attempt} attempt(s)", fail["retryAtMs"])
        sleep(delay)
