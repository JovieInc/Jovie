"""Hyperagent webhook receiver contract (ha-webhook-auth-only-v1).

Hyperagent's hosted webhook compares one shared secret. Extra Timestamp /
Signature HMAC headers are ignored and do not conflict. Authorization Bearer
and X-HA-Access are not substitutes for the secret header.

Documented header: X-Hyperagent-Webhook-Secret
Documented statuses:
  202 accepted
  401 secret header missing
  403 secret present but wrong

https://www.hyperagent.com/docs/concepts/agents/invocations/webhooks
"""

from __future__ import annotations

from hmac import compare_digest

HA_WEBHOOK_SECRET_HEADER = "X-Hyperagent-Webhook-Secret"


def authorize_hyperagent_webhook(
    headers: dict[str, str],
    expected_secret: str,
) -> int:
    """Return the Hyperagent webhook status for these request headers."""
    if not expected_secret:
        raise ValueError("expected_secret is required; unauthenticated HA endpoints are forbidden")

    submitted = _header(headers, HA_WEBHOOK_SECRET_HEADER)
    if submitted is None or submitted == "":
        return 401
    if not compare_digest(submitted, expected_secret):
        return 403
    return 202


def _header(headers: dict[str, str], name: str) -> str | None:
    wanted = name.casefold()
    for key, value in headers.items():
        if key.casefold() == wanted:
            return value
    return None
