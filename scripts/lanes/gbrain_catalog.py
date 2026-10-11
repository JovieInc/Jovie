#!/usr/bin/env python3
"""Bounded known-catalog read through the host's existing GBrain adapter.

No service, credential, discovery query, retry, or global CLI routing is added.
The reason lane enforces a 20 second process deadline around this worker.
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

PREFIX = "knowledge/external/yc/playbook/"
TOPICS = frozenset({"product-market-fit-retention", "users-first-customers", "launch-mvp",
                   "pricing-unit-economics", "metrics-weekly-growth", "growth-scaling",
                   "founder-focus", "hiring-team", "fundraising-runway", "b2b-sales", "failure-modes"})


def load_adapter(path: Path):
    spec = importlib.util.spec_from_file_location("_gbrain_catalog_adapter", path)
    if spec is None or spec.loader is None:
        raise ValueError("adapter unavailable")
    adapter = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = adapter
    spec.loader.exec_module(adapter)
    return adapter


def read_page(adapter, slug: str, clock=time.monotonic) -> dict:
    if not slug.startswith(PREFIX) or slug[len(PREFIX):] not in TOPICS:
        raise ValueError("unsupported catalog slug")
    auth = adapter.token()
    if not auth:
        raise ValueError("token unavailable")
    deadline = clock() + 19
    initialized = adapter.mcp(auth, {"jsonrpc": "2.0", "id": 1, "method": "initialize",
                                  "params": {"protocolVersion": "2025-03-26", "capabilities": {},
                                             "clientInfo": {"name": "jovie-reason-catalog", "version": "1"}}},
                              "initialize", 5)
    adapter._response_result(initialized, "initialize")
    remaining = min(15, deadline - clock())
    if remaining <= 0:
        raise ValueError("catalog deadline exhausted")
    response = adapter.mcp(auth, {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                                "params": {"name": "get_page", "arguments": {"slug": slug, "source_id": "default"}}},
                           "call", remaining)
    result = adapter._response_result(response, "call")
    if result.get("isError"):
        raise ValueError("catalog provider error")
    content = result.get("content")
    if not isinstance(content, list):
        raise ValueError("catalog content missing")
    texts = [item["text"] for item in content
             if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str)]
    page = json.loads("\n".join(texts))
    if not isinstance(page, dict) or page.get("slug") != slug:
        raise ValueError("catalog page mismatch")
    return page


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else argv
    try:
        if len(args) != 2:
            raise ValueError("catalog arguments invalid")
        page = read_page(load_adapter(Path(args[0])), args[1])
        print(json.dumps(page))
        return 0
    except Exception:
        # Provider exceptions and credentials never enter worker output.
        print("gbrain catalog read failed", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
