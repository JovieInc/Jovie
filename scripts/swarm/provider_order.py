"""Credits-first provider order for the PR Remediation Swarm (pure; no network, no secrets).

Tim 2026-11-19: spend credit-backed or prepaid sources first, pay-as-you-go last; fall through only
when a source's credits read zero or it answers with a quota/credits-exhausted error; the daily cap
applies to out-of-pocket spend. Contract (Tim 2026-09-02, 2026-11-19): never the Vercel AI Gateway,
and never buy Gateway or API while the Max Grok and Kimi OAuth seats exist.

Off unless SWARM_PROVIDER_ORDER == "on" (missing or anything else = off). Off keeps today's single
provider (SWARM_BASE_URL + SWARM_API_KEY), classified as credits (the Workers AI relay is paid from
Cloudflare startup credits, infra/workers-ai-relay/README.md), and still refuses banned hosts.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

FUNDING_RANK = {"credits": 0, "prepaid": 1, "payg": 2}
TIER = {"credits": "credit", "prepaid": "credit", "payg": "oop"}  # which daily cap a source draws on
# Never the Vercel AI Gateway, whatever a variable says (contract above). Host match, not substring.
BANNED_HOSTS = re.compile(r"(^|\.)ai-gateway\.vercel\.sh$", re.I)
# A source is exhausted only on these; a plain 429 rate limit is not exhaustion (no fall-through).
EXHAUSTED = re.compile(r"\b402\b|payment required|insufficient[_ ](funds|credits?|balance|quota)|"
                       r"(credit|credits|balance|quota)[^\n]{0,40}(exhausted|exceeded|depleted|used up)|"
                       r"out of (usage )?credits|positive credit balance is required|daily free allocation", re.I)
# USD per token, Workers AI list prices read 2026-11-19 (developers.cloudflare.com/workers-ai/platform/pricing).
# A model missing here and in the provider's own `prices` is never called: no default estimate.
PRICES = {
    "@cf/zai-org/glm-5.3-flash": {"in": 0.15e-6, "cached": 0.03e-6, "out": 0.50e-6},
    "@cf/zai-org/glm-5.3": {"in": 1.40e-6, "cached": 0.26e-6, "out": 4.40e-6},
}


@dataclass(frozen=True)
class Provider:
    name: str
    base_url: str
    key_file_env: str  # env var naming the staged key file (the key itself never enters env)
    funding: str
    probe: str = "none"  # "none": no balance endpoint; "credits-endpoint": GET {base}/credits balance > 0
    prices: dict = field(default_factory=dict, compare=False, hash=False)

    @property
    def tier(self) -> str:
        return TIER[self.funding]


def banned(base_url: str) -> bool:
    return bool(BANNED_HOSTS.search(urlparse(base_url).hostname or ""))


def resolve(env: dict) -> tuple[list[Provider], list[str]]:
    """Ordered providers (credits, prepaid, then payg; config order within a tier) and the reasons any
    configured entry was refused. Never raises; an unreadable config yields no providers."""
    refused: list[str] = []
    if env.get("SWARM_PROVIDER_ORDER") != "on":
        base = env.get("SWARM_BASE_URL") or ""
        if not base:
            return [], ["no-provider: SWARM_BASE_URL unset (there is no Gateway fallback)"]
        probe = "none" if env.get("SWARM_CREDIT_PROBE") == "off" else "credits-endpoint"
        rows = [{"name": "workers-ai-relay", "base_url": base, "key_file_env": "SWARM_KEY_FILE",
                 "funding": "credits", "probe": probe}]
    else:
        try:
            rows = json.loads(env.get("SWARM_PROVIDERS") or "[]")
            assert isinstance(rows, list)
        except (ValueError, AssertionError):
            return [], ["SWARM_PROVIDERS unreadable: model slots closed"]
    out = []
    for i, r in enumerate(rows):
        if not isinstance(r, dict):
            refused.append(f"#{i}: not an object")
            continue
        name, base, funding = str(r.get("name") or f"#{i}"), str(r.get("base_url") or ""), r.get("funding")
        if funding not in FUNDING_RANK:
            refused.append(f"{name}: funding must be credits|prepaid|payg")
        elif not base.startswith("https://"):
            refused.append(f"{name}: base_url must be https")
        elif banned(base):
            refused.append(f"{name}: the Vercel AI Gateway is banned")
        elif not r.get("key_file_env"):
            refused.append(f"{name}: key_file_env missing")
        else:
            out.append(Provider(name, base.rstrip("/"), str(r["key_file_env"]), funding,
                                str(r.get("probe") or "none"), dict(r.get("prices") or {})))
    out.sort(key=lambda p: FUNDING_RANK[p.funding])
    return out, refused


def price(p: Provider, model: str) -> dict | None:
    """USD/token for (provider, model), or None when unpriced (the model is then never called)."""
    row = p.prices.get(model) or PRICES.get(model)
    try:
        unit = {"in": float(row["in"]), "out": float(row["out"])}
        unit["cached"] = float(row.get("cached") or unit["in"])
    except (TypeError, KeyError, ValueError):
        return None
    return unit if unit["in"] > 0 and unit["out"] > 0 else None


def exhausted(text: str) -> bool:
    return bool(EXHAUSTED.search(text or ""))


def cost(tokens: dict, unit: dict) -> float:
    """tokens = {in, cached, out, reasoning}; reasoning bills as output."""
    return (tokens.get("in", 0) * unit["in"] + tokens.get("cached", 0) * unit["cached"]
            + (tokens.get("out", 0) + tokens.get("reasoning", 0)) * unit["out"])


def tiers_with_room(spent: dict | None, caps_cents: dict, attempt_cents: float) -> set[str]:
    """Cap tiers ('credit', 'oop') with room for one more attempt. Unreadable spend: none."""
    if spent is None:
        return set()
    return {t for t, cap in caps_cents.items() if cap - spent.get(t, 0) >= attempt_cents}


def admitted(providers: list[Provider], tiers: set[str], balance_ok) -> list[Provider]:
    """Providers an attempt may use, in order: tier has room and the balance probe (if any) is positive."""
    return [p for p in providers if p.tier in tiers and balance_ok(p)]
