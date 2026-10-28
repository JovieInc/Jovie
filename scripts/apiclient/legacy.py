"""Bridges the lanes state files that predate the ledger (mirror of legacy.ts).

- github-budget.json  (gh shim's GraphQL floor, scripts/lanes/gh_app_token.py)
- linear-cooldown/<scope>/<resetAt>-<id>.json (lanes + scripts/lib/linear-cooldown.mjs)
- api-budget.json      (Linear snapshot read by lanes doctor/autoscale)
Read as observations, written back as projections: one budget, not two.
"""
from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .store import write_json_atomic


class Hooks:
    def prepare(self):
        return None

    def merge(self, state: dict, prepared, now_ms: int) -> None:
        return None

    def publish(self, state: dict, fail: dict, now_ms: int) -> None:
        return None


def _read_json(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def _write(path: Path, value) -> None:
    try:
        write_json_atomic(path, value)
    except OSError:
        pass  # a projection is advisory; the ledger already holds the truth


def _number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


class GithubBudgetHooks(Hooks):
    """github-budget.json: {remaining, resetAt (epoch s), observedAt (epoch s)} for GraphQL."""

    def __init__(self, state_root):
        self.path = Path(state_root) / "github-budget.json"

    def prepare(self):
        return _read_json(self.path)

    def merge(self, state, prepared, now_ms):
        if not isinstance(prepared, dict) or not _number(prepared.get("remaining")) or not _number(prepared.get("resetAt")):
            return
        observed = prepared["observedAt"] * 1000 if _number(prepared.get("observedAt")) else 0
        reset_at = prepared["resetAt"] * 1000
        current = state["buckets"].get("graphql")
        if reset_at <= now_ms or (current and current["observedAt"] >= observed):
            return
        # The shim file carries no limit; GitHub's GraphQL bucket is 5,000 points/hour.
        limit = current.get("limit") if current and current.get("limit") is not None else 5000
        state["buckets"]["graphql"] = {"limit": limit, "remaining": prepared["remaining"],
                                       "resetAt": reset_at, "observedAt": observed}

    def publish(self, state, fail, now_ms):
        bucket = state["buckets"].get("graphql")
        if not bucket or bucket.get("resetAt") is None or bucket["observedAt"] != now_ms:
            return
        _write(self.path, {"remaining": bucket["remaining"], "resetAt": bucket["resetAt"] // 1000,
                           "observedAt": now_ms / 1000})


def _latest_cooldown(directory: Path) -> int:
    latest = 0
    try:
        names = os.listdir(directory)
    except OSError:
        return 0
    for name in names[:1000]:
        match = re.fullmatch(r"(\d+)-[0-9a-f-]+\.json", name)
        if match:
            latest = max(latest, int(match.group(1)))
    return latest


def _iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class LinearLegacyHooks(Hooks):
    """`scope` is sha256(LINEAR_API_URL + NUL + identity), the lanes cooldown scope."""

    def __init__(self, state_root, scope: str):
        self.scope = scope
        self.cooldown_dir = Path(state_root) / "linear-cooldown" / scope
        self.budget_path = Path(state_root) / "api-budget.json"

    def prepare(self):
        return _latest_cooldown(self.cooldown_dir)

    def merge(self, state, prepared, now_ms):
        reset_at = prepared if isinstance(prepared, int) else 0
        current = state["buckets"].get("requests")
        if reset_at <= now_ms or (current and current["remaining"] == 0 and (current.get("resetAt") or 0) >= reset_at):
            return
        state["buckets"]["requests"] = {"limit": current.get("limit") if current else None, "remaining": 0,
                                        "resetAt": reset_at, "observedAt": now_ms}

    def publish(self, state, fail, now_ms):
        requests = state["buckets"].get("requests")
        complexity = state["buckets"].get("complexity")
        if fail["kind"] == "primary" and requests and requests.get("resetAt"):
            try:
                self.cooldown_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
            except OSError:
                pass
            _write(self.cooldown_dir / f"{requests['resetAt']}-{uuid.uuid4()}.json",
                   {"schema": 1, "resetAt": requests["resetAt"]})
        if not requests or requests["observedAt"] != now_ms:
            return
        iso = _iso(now_ms)
        previous = _read_json(self.budget_path) or {}

        def dim(b):
            return {"remaining": b["remaining"], "limit": b.get("limit"), "reset": b.get("resetAt"),
                    "observedAt": iso} if b else None

        _write(self.budget_path, {
            "schema": 1, "scope": self.scope, "remaining": requests["remaining"], "limit": requests.get("limit"),
            "reset": requests.get("resetAt"),
            "rateLimitedAt": iso if fail["kind"] == "primary" else previous.get("rateLimitedAt"),
            "observedAt": iso, "dimensions": {"requests": dim(requests), "complexity": dim(complexity)},
        })


class CombinedHooks(Hooks):
    def __init__(self, *hooks: Hooks):
        self.hooks = hooks

    def prepare(self):
        return [h.prepare() for h in self.hooks]

    def merge(self, state, prepared, now_ms):
        for hook, value in zip(self.hooks, prepared):
            hook.merge(state, value, now_ms)

    def publish(self, state, fail, now_ms):
        for hook in self.hooks:
            hook.publish(state, fail, now_ms)
