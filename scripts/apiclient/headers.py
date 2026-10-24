"""Budget header parsing and failure classification (mirror of headers.ts).

Pinned against packages/api-client/conformance/headers.json.
"""
from __future__ import annotations

import math
import re
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Any, Mapping, Optional

_UNIT_MS = {"h": 3_600_000, "m": 60_000, "s": 1000, "ms": 1}
_DURATION = re.compile(r"(\d+(?:\.\d+)?)(ms|h|m|s)")


def header(headers: Optional[Mapping[str, Any]], name: str) -> Optional[str]:
    if not headers:
        return None
    getter = getattr(headers, "get", None)
    for key in list(headers.keys()) if hasattr(headers, "keys") else []:
        if str(key).lower() == name:
            value = headers[key]
            if value is None:
                return None
            if isinstance(value, (list, tuple)):
                return str(value[0]) if value else None
            return str(value)
    if callable(getter):
        value = getter(name)
        return None if value is None else str(value)
    return None


def _finite(raw: Optional[str]) -> Optional[float]:
    if raw is None or raw.strip() == "":
        return None
    try:
        value = float(raw.strip())
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def _js_round(value: float) -> int:
    return int(math.floor(value + 0.5))


def _duration_ms(raw: str) -> Optional[float]:
    parts = _DURATION.findall(raw)
    if not parts:
        return None
    return sum(float(n) * _UNIT_MS[u] for n, u in parts)


def _parse_date_ms(raw: str) -> Optional[int]:
    try:
        return _js_round(datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError:
        pass
    try:
        return _js_round(parsedate_to_datetime(raw).timestamp() * 1000)
    except (TypeError, ValueError, IndexError):
        return None


def reset_to_epoch_ms(raw: Optional[str], unit: str, now_ms: int) -> Optional[int]:
    if raw is None or raw.strip() == "":
        return None
    value = raw.strip()
    if unit == "rfc3339":
        return _parse_date_ms(value)
    if unit == "duration":
        ms = _duration_ms(value)
        return None if ms is None else now_ms + _js_round(ms)
    n = _finite(value)
    if n is None or n < 0:
        return None
    if unit == "epoch-ms":
        return _js_round(n)
    if unit == "delta-s":
        return now_ms + _js_round(n * 1000)
    return _js_round(n * 1000)


def _num(value: Optional[float]):
    if value is None:
        return None
    return int(value) if value == int(value) else value


def parse_budget(spec: dict, headers, now_ms: int, fallback_resource: str) -> list:
    out = []
    for h in spec.get("budgetHeaders") or []:
        remaining = _finite(header(headers, h["remaining"]))
        if remaining is None:
            continue
        resource = (h.get("resourceHeader") and header(headers, h["resourceHeader"])) or h.get("resource") or fallback_resource
        out.append({
            "resource": resource,
            "limit": _num(_finite(header(headers, h["limit"]))),
            "remaining": max(0, int(math.floor(remaining))),
            "resetAt": reset_to_epoch_ms(header(headers, h["reset"]), h["resetUnit"], now_ms),
        })
    return out


def retry_after_at(headers, now_ms: int) -> Optional[int]:
    raw = header(headers, "retry-after")
    if raw is None:
        return None
    n = _finite(raw)
    if n is not None:
        return None if n < 0 else now_ms + _js_round(n * 1000)
    return _parse_date_ms(raw)


def _body_codes(body: Any) -> list:
    if not isinstance(body, dict) or not isinstance(body.get("errors"), list):
        return []
    codes = []
    for error in body["errors"]:
        if not isinstance(error, dict):
            continue
        if isinstance(error.get("type"), str):
            codes.append(error["type"])
        ext = error.get("extensions")
        if isinstance(ext, dict) and isinstance(ext.get("code"), str):
            codes.append(ext["code"])
    return codes


def _matches(patterns, text: str) -> bool:
    return any(re.search(p, text, re.I) for p in patterns)


def failure(kind: str, retry_at: Optional[int] = None) -> dict:
    return {"kind": kind, "retryAtMs": retry_at}


def classify_failure(spec: dict, status: Optional[int], headers=None, body: Any = None, text: str = "",
                     network_error: bool = False, now_ms: int = 0) -> dict:
    """primary = bucket empty until reset; secondary = slow down; transient = 5xx/network; client = real 4xx."""
    text = text or ""
    retry_after = retry_after_at(headers, now_ms)
    observations = parse_budget(spec, headers, now_ms, spec["defaultResource"])
    empty = next((o for o in observations if o["remaining"] == 0), None)
    reset_at = empty["resetAt"] if empty else None

    def later(*xs):
        known = [x for x in xs if x is not None]
        return max(known) if known else None

    rate_code = any(c in (spec.get("bodyRateLimitCodes") or []) for c in _body_codes(body))
    if network_error:
        return failure("transient")
    if status is not None and 200 <= status < 400 and not rate_code:
        return failure("none")
    if rate_code or _matches(spec["primaryText"], text):
        return failure("primary", later(reset_at, retry_after))
    if status in (403, 429) and empty is not None:
        return failure("primary", later(reset_at, retry_after))
    if status == 429 or _matches(spec["secondaryText"], text):
        return failure("secondary", retry_after)
    if status == 403 and retry_after is not None:
        return failure("secondary", retry_after)
    if status is None or status >= 500 or status == 408:
        return failure("transient", retry_after)
    return failure("client")
