#!/usr/bin/env python3
"""Model-pool check for direct model API calls (HTTP), next to the command check in model_pools.py.

Any Python caller that posts a model request (scripts/apiclient, the PR remediation swarm, the outcome
judge) asks here first. An Anthropic model addressed to a forbidden pool's host (the Vercel AI Gateway,
the metered Anthropic API) is refused and recorded before a byte is sent. Fails closed: a model request to such a
host whose model cannot be read is refused, and so is any request body sent to the metered Anthropic API.
"""
from __future__ import annotations

import json
import re
from urllib.parse import urlsplit

import model_pools as pools

MODEL_FIELD = re.compile(r'"model"\s*:\s*"([^"]*)"')


def pool_for_url(url: str, table: dict) -> str | None:
    """The pool a URL belongs to: a declared host, or a subdomain of one."""
    host = (urlsplit(str(url)).hostname or "").lower()
    for name, row in (table.get("pools") or {}).items():
        if any(host == item or host.endswith("." + item) for item in (row or {}).get("hosts") or ()):
            return name
    return None


def request_model(body) -> str | None:
    """The model a request body names, read from JSON or, for a body that is not valid JSON, by field."""
    if isinstance(body, (bytes, bytearray)):
        body = body.decode("utf-8", "replace")
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except ValueError:
            found = MODEL_FIELD.search(body)
            return found.group(1) or None if found else None
    model = body.get("model") if isinstance(body, dict) else None
    return model if isinstance(model, str) and model else None


def request_refusal(url: str, body, *, site: str, strict: bool = False, table: dict | None = None,
                    state_dir=None) -> dict | None:
    """The recorded refusal for a model request that may not be sent; None when it may.

    A host outside the table is not a model pool and passes, unless `strict` (the caller knows this is a
    model request): then an Anthropic model on an undeclared host is refused like any undeclared pool."""
    table = pools.load() if table is None else table
    pool, model = pool_for_url(url, table), request_model(body)
    row = (table.get("pools") or {}).get(pool or "") or {}
    reason = None
    if pool is None and not strict and table:
        return None
    if pools.is_anthropic(model, table):  # an unreadable table refuses every Anthropic model
        reason = pools.verdict(model, pool, table)
    elif row.get("anthropic") == "forbidden" and body is not None and (model is None or pool == "anthropic-api"):
        reason = (f"{row.get('label', pool)} serves no model here: the metered Anthropic API is never called"
                  if pool == "anthropic-api" else
                  f"the model this request to {row.get('label', pool)} would run cannot be resolved")
    return reason and pools.record_refusal({"model": model or "unresolved", "pool": pool, "site": site, "reason": reason}, state_dir)


def assert_request(url: str, body, *, site: str, strict: bool = False, table: dict | None = None, state_dir=None) -> None:
    refused = request_refusal(url, body, site=site, strict=strict, table=table, state_dir=state_dir)
    if refused:
        raise pools.ModelPoolRefused(refused)
