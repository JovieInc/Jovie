"""Pure Codex terminal reset evidence and durable observation validation."""
from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone


LIMIT = re.compile(r"usage limit|rate limit|too many requests|\b429\b|quota", re.I)

AUTH = re.compile(r"not logged in|login required|unauthori[sz]ed|invalid.*(token|credential)|\b401\b", re.I)

RESET_AT = re.compile(r"(?:try again|resets?|available)\s+(?:at|on)\s+([0-9T:\-\. ]+(?:AM|PM|Z)?)", re.I)

RESET_IN = re.compile(r"try again in\s+((?:\d+\s*(?:days?|hours?|hrs?|minutes?|mins?|seconds?|secs?|[dhms])\s*)+)", re.I)

def parse_reset(text: str, now: float) -> float | None:
    """The reset instant codex printed, if any; None means 'unknown, use the default'."""
    match = RESET_IN.search(text)
    if match:
        seconds = 0
        for amount, unit in re.findall(r"(\d+)\s*([a-z]+)", match.group(1), re.I):
            seconds += int(amount) * {"d": 86400, "h": 3600, "m": 60, "s": 1}[unit[0].lower()]
        return now + seconds if seconds else None
    match = RESET_AT.search(text)
    if not match:
        return None
    raw = match.group(1).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            continue
    for fmt in ("%I:%M %p", "%I %p", "%H:%M"):
        try:
            clock = datetime.strptime(raw.upper(), fmt)
        except ValueError:
            continue
        local = datetime.fromtimestamp(now).replace(hour=clock.hour, minute=clock.minute, second=0)
        if local.timestamp() <= now:
            local += timedelta(days=1)
        return local.timestamp()
    return None

def pending_terminal_observation(entry: dict, ledger: dict, now: float) -> str | None:
    """One durable terminal event can wake the existing observer, never grant capacity."""
    event = entry.get("lastObservation") or {}
    if not isinstance(event, dict) or event.get("schema") != "jovie.codex-terminal-observation/v1":
        return None
    stamp, identity = event.get("observedAt"), event.get("id")
    if (event.get("source") != "codex-cli-terminal" or event.get("kind") not in ("rate", "limit")
            or event.get("kind") != entry.get("lastKind") or stamp != entry.get("lastRunAt")
            or type(stamp) not in (int, float) or not 0 <= stamp <= now
            or not isinstance(identity, str) or not re.fullmatch(r"[0-9a-f]{32}", identity)
            or identity == ledger.get("observationId")
            or event.get("bankedUntil") != entry.get("exhaustedUntil")
            or type(event.get("bankedUntil")) not in (int, float) or event["bankedUntil"] <= stamp):
        return None
    last = ledger.get("reconciledAt")
    return None if type(last) in (int, float) and stamp < last else identity

def terminal_context(output: str) -> str:
    """Use the last closing failure, so an earlier quoted reset cannot win."""
    lines = output[-20000:].splitlines()[-30:]
    for index in range(len(lines) - 1, -1, -1):
        if LIMIT.search(lines[index]) or AUTH.search(lines[index]):
            return "\n".join(lines[index:])
    return "\n".join(lines)

def terminal_observation(output: str, kind: str, code: int, now: float, until: float) -> dict:
    """Retain the bounded reset phrase, not the surrounding transcript or credentials."""
    closing = terminal_context(output)
    condition = (AUTH if kind == "auth" else LIMIT).search(closing)
    reason = condition.group(0)
    if kind == "auth" and reason.lower().startswith("invalid"):
        reason = "invalid credential"  # AUTH's wildcard must never persist intervening text.
    relative = RESET_IN.search(closing) if kind != "auth" else None
    reset = relative or (RESET_AT.search(closing) if kind != "auth" else None)
    reported = parse_reset(closing, now) if reset else None
    basis = {"rate": "policy-rate-backoff", "limit": "policy-usage-cooldown", "auth": "policy-auth-cooldown"}[kind]
    if reported is not None:
        raw = reset.group(1).strip()
        basis = ("cli-relative-duration" if relative else "cli-utc-timestamp" if raw.endswith("Z")
                 else "cli-timestamp-assumed-utc" if "-" in raw else "cli-clock-local")
    phrase = reset.group(0).strip() if reset else reason
    return {"schema": "jovie.codex-terminal-observation/v1", "id": uuid.uuid4().hex,
            "source": "codex-cli-terminal", "kind": kind, "exitCode": code,
            "observedAt": now, "condition": reason, "message": phrase[:512], "messageTruncated": len(phrase) > 512,
            "reportedResetAt": reported, "resetBasis": basis, "bankedUntil": until}


IMMEDIATE_RESET = re.compile(r"(?:\b(?:rate|usage) limits?\b.{0,30}\b(?:reset|restored)\b|\b(?:reset|restored)\b.{0,30}\b(?:rate|usage) limits?\b)", re.I)

BANKED_GRANT = re.compile(r"\b(?:banked resets?|reset credits?|credits?\s+(?:for|to)\s+reset)\b", re.I)

UNASSERTED = re.compile(r"\b(?:if|would|could|might|may|hypothetical|proposal|considering)\b", re.I)

HISTORICAL = re.compile(r"\b(?:yesterday|last (?:week|month|year)|previously|historically)\b", re.I)

NEGATED = re.compile(r"\b(?:no|not|never|won't|will not|didn't|did not)\b", re.I)

def parse_announcement(message: dict) -> dict | None:
    if not isinstance(message, dict) or not isinstance(message.get("messageId"), str):
        return None
    body = message.get("messageBody")
    if not isinstance(body, str) or not body.strip():
        return None
    flags = {"immediateReset": False, "bankedCreditGrant": False}
    if UNASSERTED.search(body) or HISTORICAL.search(body):
        return {"messageId": message["messageId"], "createdAt": message.get("createdAt"), **flags, "digest": hashlib.sha256(body.encode()).hexdigest()}
    for clause in re.split(r"(?:[.;\n]|\b(?:and|but)\b)", body):
        if NEGATED.search(clause) or UNASSERTED.search(clause) or HISTORICAL.search(clause):
            continue
        banked = bool(BANKED_GRANT.search(clause))
        flags["bankedCreditGrant"] |= banked
        flags["immediateReset"] |= bool(IMMEDIATE_RESET.search(clause)) and not banked
    return {"messageId": message["messageId"], "createdAt": message.get("createdAt"), **flags,
            "digest": hashlib.sha256(body.encode()).hexdigest()}
