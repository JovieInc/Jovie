"""The one way to call a third-party API from Python (mirror of client.ts).

Shared host budget, priority reserves, pacing, bounded full-jitter retries that honor resets,
a per-credential circuit breaker, and ETag/TTL caching.
"""
from __future__ import annotations

import json
import random as _random
import re
import sys
import time
import urllib.error
import urllib.request
from typing import Callable, Optional
from urllib.parse import urlsplit

from .cache import MemoryResponseCache, cache_key, cacheable, to_cached
from .contract import DEFAULTS, priority_policy, provider_spec, resource_for
from .headers import classify_failure, failure, parse_budget
from .policy import backoff_ms, bump, credential_state, decide, observe, record_outcome
from .store import credential_label, default_store, now_ms

EX_TEMPFAIL = 75
_MUTATION = re.compile(r"^\s*mutation\b")


class ApiError(Exception):
    """Infrastructure, never a verdict: retry after retry_at (exit 75)."""

    exit_code = EX_TEMPFAIL

    def __init__(self, kind: str, provider: str, message: str, retry_at=None, status=None, failure_kind=None):
        super().__init__(f"{provider} {kind}: {message}")
        self.kind = kind
        self.provider = provider
        self.retry_at = retry_at
        self.status = status
        self.failure = failure_kind


class ApiResponse:
    def __init__(self, status: int, headers: dict, text: str, from_cache: Optional[str], attempts: int):
        self.status = status
        self.headers = headers
        self.text = text
        self.from_cache = from_cache
        self.attempts = attempts

    def json(self):
        return json.loads(self.text)


def urllib_transport(method: str, url: str, headers: dict, body: Optional[str], timeout_s: float):
    data = body.encode() if body is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            return response.status, {k.lower(): v for k, v in response.headers.items()}, response.read().decode()
    except urllib.error.HTTPError as error:
        raw = b""
        try:
            raw = error.read()
        except Exception:
            pass
        hdrs = {k.lower(): v for k, v in (error.headers or {}).items()}
        return error.code, hdrs, raw.decode(errors="replace")
    except urllib.error.URLError as error:
        raise ConnectionError(str(error.reason)) from None


def _graphql_query(body: Optional[str]) -> str:
    try:
        query = json.loads(body or "").get("query")
    except (ValueError, AttributeError):
        return ""
    return query if isinstance(query, str) else ""


def _maybe_json(text: str, headers: dict):
    if not re.search("json", headers.get("content-type", ""), re.I):
        return None
    try:
        return json.loads(text)
    except ValueError:
        return None


def _log_stderr(event: dict) -> None:
    sys.stderr.write(json.dumps(event) + "\n")


class ApiClient:
    def __init__(self, provider: str, credential: str, authorize: Optional[Callable[[dict], None]] = None,
                 store=None, cache=None, transport=None, now: Callable[[], int] = now_ms,
                 sleep: Optional[Callable[[float], None]] = None, random: Callable[[], float] = _random.random,
                 log: Callable[[dict], None] = _log_stderr, hooks=None):
        self.provider = provider
        self.credential = credential
        self.spec = provider_spec(provider)
        self.authorize = authorize
        self.store = store if store is not None else default_store()
        self.cache = cache if cache is not None else MemoryResponseCache()
        self.transport = transport or urllib_transport
        self.now = now
        self.sleep = sleep or (lambda ms: time.sleep(ms / 1000))
        self.random = random
        self.log = log
        self.hooks = hooks

    def _ledger(self, fn):
        def run(ledger):
            at = self.now()
            return fn(credential_state(ledger, self.credential, at), at)
        return self.store.transact(self.provider, run)

    def _transition(self, change, at) -> None:
        if change:
            self.log({"schema": "jovie.api-client.breaker/v1", "provider": self.provider,
                      "credential": credential_label(self.credential), **change, "at": at})

    def state(self) -> Optional[dict]:
        return self.store.read(self.provider)["credentials"].get(self.credential)

    def request(self, url: str, method: str = "GET", headers: Optional[dict] = None, body=None,
                priority: str = "default", costs: Optional[dict] = None, write: Optional[bool] = None,
                idempotent: Optional[bool] = None, cache_ttl_ms: Optional[int] = None,
                conditional: Optional[bool] = None, max_attempts: Optional[int] = None,
                max_wait_ms: Optional[int] = None, timeout_ms: Optional[int] = None) -> ApiResponse:
        method = method.upper()
        text_body = body if body is None or isinstance(body, str) else json.dumps(body)
        is_graphql = urlsplit(url).path.endswith("/graphql")
        read = method in ("GET", "HEAD") or (is_graphql and not _MUTATION.search(_graphql_query(text_body)))
        write = (not read) if write is None else write
        idempotent = (read or method in ("PUT", "DELETE")) if idempotent is None else idempotent
        policy = priority_policy(priority)
        resource = resource_for(self.provider, url)
        costs = costs or {resource: 1}
        max_attempts = max_attempts or DEFAULTS["maxAttempts"]
        deadline = self.now() + (DEFAULTS["maxWaitMs"][policy["class"]] if max_wait_ms is None else max_wait_ms)
        conditional = method == "GET" and (bool(self.spec.get("conditionalGet")) if conditional is None else conditional)
        key = cache_key([self.provider, self.credential, method, url, (headers or {}).get("accept", ""),
                         "" if method == "GET" else (text_body or "")])
        timeout_s = (timeout_ms or DEFAULTS["timeoutMs"]) / 1000

        if read and cache_ttl_ms:
            hit = self.cache.get(key)
            if hit and self.now() - hit["storedAt"] < cache_ttl_ms:
                self._ledger(lambda s, at: bump(s, priority, "cacheHits", at))
                return ApiResponse(hit["status"], dict(hit["headers"]), hit["body"], "ttl", 0)

        attempt = 0
        while True:
            prepared = self.hooks.prepare() if self.hooks else None

            def admit(s, at):
                if self.hooks:
                    self.hooks.merge(s, prepared, at)
                d = decide(s, priority, costs, at, write=write,
                           min_write_interval_ms=self.spec.get("minWriteIntervalMs"))
                if d["action"] == "shed":
                    bump(s, priority, "shed", at)
                if d["action"] == "wait":
                    bump(s, priority, "waited", at)
                if d["action"] == "go" and attempt > 0:
                    bump(s, priority, "retries", at)
                return d

            d = self._ledger(admit)
            self._transition(d.get("transition"), self.now())
            if d["action"] == "shed":
                raise ApiError("shed", self.provider, f"{priority} shed ({d['reason']})", retry_at=d["until"])
            if d["action"] == "wait":
                until = d["until"] if d["until"] is not None else self.now() + 1000
                if until > deadline:
                    raise ApiError("budget", self.provider, f"{priority} would wait past its budget ({d['reason']})",
                                   retry_at=until)
                self.sleep(max(0, until - self.now()) + int(self.random() * 250))
                continue
            attempt += 1
            send_headers = dict(headers or {})
            if self.authorize:
                self.authorize(send_headers)
            stored = self.cache.get(key) if (conditional or cache_ttl_ms) else None
            if conditional and stored and stored.get("etag"):
                send_headers["If-None-Match"] = stored["etag"]
            elif conditional and stored and stored.get("lastModified"):
                send_headers["If-Modified-Since"] = stored["lastModified"]
            status, resp_headers, text = None, {}, ""
            try:
                status, resp_headers, text = self.transport(method, url, send_headers, text_body, timeout_s)
                resp_headers = {k.lower(): v for k, v in resp_headers.items()}
            except (OSError, ConnectionError):
                status = None
            at = self.now()
            not_modified = status == 304 and stored is not None
            if not_modified:
                fail = failure("none")
            else:
                fail = classify_failure(self.spec, status, resp_headers, _maybe_json(text, resp_headers), text,
                                        network_error=status is None, now_ms=at)
            observations = parse_budget(self.spec, resp_headers, at, resource) if status is not None else []

            def settle(s, t):
                observe(s, observations, t)
                if not_modified:
                    bump(s, priority, "notModified", t)
                res = observations[0]["resource"] if observations else resource
                return record_outcome(s, priority, res, fail, d["probe"], t), s, t

            change, state, settled_at = self._ledger(settle)
            self._transition(change, at)
            if self.hooks:
                self.hooks.publish(state, fail, settled_at)
            if status is not None and fail["kind"] in ("none", "client"):
                if not_modified:
                    return ApiResponse(stored["status"], dict(stored["headers"]), stored["body"], "etag", attempt)
                if read and (conditional or cache_ttl_ms) and cacheable(status, resp_headers, text):
                    self.cache.set(key, to_cached(status, resp_headers, text, at))
                return ApiResponse(status, resp_headers, text, None, attempt)
            retryable = fail["kind"] in ("primary", "secondary") or (fail["kind"] == "transient" and idempotent)
            delay = backoff_ms(attempt, fail, self.now(), self.random)
            if not retryable or attempt >= max_attempts or self.now() + delay > deadline:
                path = urlsplit(url).path
                raise ApiError("exhausted", self.provider,
                               f"{method} {path} {fail['kind']} after {attempt} attempt(s)",
                               retry_at=fail["retryAtMs"], status=status, failure_kind=fail["kind"])
            self.sleep(delay)
