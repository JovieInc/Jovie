"""One credential order for every provider (mirror of packages/api-client/credentials.ts).

own, then shared, then pooled (opt-in per call site), then fail closed. Every fallback past
`own` is logged, so a call never silently runs on someone else's quota or wallet.
"""
from __future__ import annotations

import json
import sys
from typing import Callable, Optional

CREDENTIAL_TIERS = ("own", "shared", "pooled")


class CredentialUnavailableError(RuntimeError):
    def __init__(self, provider: str, tried: list):
        super().__init__(f"{provider}: no credential (tried {', '.join(tried) or 'none'}); failing closed")
        self.provider = provider
        self.tried = tried


def _log_stderr(event: dict) -> None:
    sys.stderr.write(json.dumps(event) + "\n")


def resolve_credential(provider: str, sources: dict, allow_pooled: bool = False,
                       log: Optional[Callable[[dict], None]] = None) -> tuple:
    """Returns (tier, value) for the first tier whose source yields a value."""
    log = log or _log_stderr
    tried: list = []
    for tier in CREDENTIAL_TIERS:
        source = sources.get(tier)
        if source is None or (tier == "pooled" and not allow_pooled):
            continue
        tried.append(tier)
        value = source()
        if value is None or value == "":
            continue
        if tier != "own":
            log({"schema": "jovie.api-client.credential/v1", "provider": provider, "tier": tier,
                 "skipped": tried[:-1], "outcome": "fallback"})
        return tier, value
    log({"schema": "jovie.api-client.credential/v1", "provider": provider, "tried": tried,
         "outcome": "unavailable"})
    raise CredentialUnavailableError(provider, tried)
