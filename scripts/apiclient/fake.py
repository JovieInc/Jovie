"""Fake provider transport with a real budget, resets, ETags and scripted faults (mirror of
fake-provider.ts), so every adapter is tested against limit behavior."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from urllib.parse import urlsplit


class FakeClock:
    def __init__(self, start: int = int(datetime(2026, 10, 20, 12, tzinfo=timezone.utc).timestamp() * 1000)):
        self.now = start

    def read(self) -> int:
        return self.now

    def sleep(self, ms) -> None:
        self.now += max(0, int(ms))


DEFAULT_LIMITS = {
    "github": {"core": 5000, "graphql": 5000, "search": 30},
    "linear": {"requests": 5000, "complexity": 3_000_000},
    "generic": {"requests": 100},
}


class FakeProvider:
    """Call it like a transport: (method, url, headers, body, timeout_s) -> (status, headers, text)."""

    def __init__(self, style: str, clock: FakeClock, limits=None, window_ms: int = 3_600_000,
                 complexity_per_call: int = 10, handler=None):
        self.style, self.clock, self.window_ms = style, clock, window_ms
        self.limits = limits or DEFAULT_LIMITS[style]
        self.complexity = complexity_per_call
        self.handler = handler
        self.windows: dict = {}
        self.faults: list = []
        self.calls: list = []

    def window(self, resource: str) -> dict:
        w = self.windows.get(resource)
        if w is None:
            limit = self.limits.get(resource, 1000)
            w = self.windows[resource] = {"limit": limit, "remaining": limit, "resetAt": self.clock.now + self.window_ms}
        while self.clock.now >= w["resetAt"]:
            w["remaining"] = w["limit"]
            w["resetAt"] += self.window_ms
        return w

    def fault(self, *faults: dict) -> None:
        self.faults.extend(faults)

    def set_remaining(self, resource: str, remaining: int) -> None:
        self.window(resource)["remaining"] = remaining

    def budget(self, resource: str) -> dict:
        return dict(self.window(resource))

    def _resource(self, path: str) -> str:
        if self.style == "github":
            if path == "/graphql":
                return "graphql"
            return "search" if path.startswith("/search/") else "core"
        return "requests"

    def _budget_headers(self, resource: str) -> dict:
        if self.style == "linear":
            r, c = self.window("requests"), self.window("complexity")
            return {"x-ratelimit-requests-limit": str(r["limit"]), "x-ratelimit-requests-remaining": str(r["remaining"]),
                    "x-ratelimit-requests-reset": str(r["resetAt"]),
                    "x-ratelimit-complexity-limit": str(c["limit"]),
                    "x-ratelimit-complexity-remaining": str(c["remaining"]),
                    "x-ratelimit-complexity-reset": str(c["resetAt"]), "x-complexity": str(self.complexity)}
        w = self.window(resource)
        out = {"x-ratelimit-limit": str(w["limit"]), "x-ratelimit-remaining": str(w["remaining"]),
               "x-ratelimit-reset": str(w["resetAt"] // 1000)}
        if self.style == "github":
            out.update({"x-ratelimit-used": str(w["limit"] - w["remaining"]), "x-ratelimit-resource": resource})
        return out

    def _reply(self, status, path, method, body, headers):
        self.calls.append({"method": method, "path": path, "status": status})
        text = "" if status == 304 else json.dumps(body)
        return status, {"content-type": "application/json", **headers}, text

    def __call__(self, method, url, headers, body, timeout_s):
        parts = urlsplit(url)
        path = parts.path
        resource = self._resource(path)
        fault = self.faults.pop(0) if self.faults else None
        kind = fault and fault["kind"]
        if kind == "network":
            self.calls.append({"method": method, "path": path, "status": 0})
            raise ConnectionError("fetch failed")
        if kind == "secondary":
            return self._reply(403, path, method, {"message": "You have exceeded a secondary rate limit."},
                               {**self._budget_headers(resource), "retry-after": str(fault.get("retryAfterS", 60))})
        if kind == "status":
            extra = {"retry-after": str(fault["retryAfterS"])} if "retryAfterS" in fault else {}
            return self._reply(fault["status"], path, method, {"message": f"fault {fault['status']}"},
                               {**self._budget_headers(resource), **extra})
        w = self.window(resource)
        if w["remaining"] <= 0 or kind == "graphql-rate-limited":
            if self.style == "github":
                return self._reply(403, path, method, {"message": "API rate limit exceeded for installation ID 1."},
                                   self._budget_headers(resource))
            if self.style == "linear":
                return self._reply(400, path, method, {"errors": [{"message": "Rate limit exceeded",
                                                                   "extensions": {"code": "RATELIMITED"}}]},
                                   self._budget_headers(resource))
            return self._reply(429, path, method, {"message": "Too Many Requests"}, self._budget_headers(resource))
        lower = {k.lower(): v for k, v in (headers or {}).items()}
        reply = (self.handler({"method": method, "url": url, "path": path, "query": parts.query, "body": body,
                               "headers": lower}) if self.handler else None) or {"body": {"ok": True, "path": path}}
        text = json.dumps(reply.get("body"))
        etag = '"' + hashlib.sha1(text.encode()).hexdigest() + '"'
        if method == "GET" and lower.get("if-none-match") == etag:
            return self._reply(304, path, method, None, {**self._budget_headers(resource), "etag": etag})
        w["remaining"] -= 1
        if self.style == "linear":
            self.window("complexity")["remaining"] -= self.complexity
        return self._reply(reply.get("status", 200), path, method, reply.get("body"),
                           {**self._budget_headers(resource), "etag": etag, **reply.get("headers", {})})
