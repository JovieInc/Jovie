"""Shared contract for outbound third-party API calls (mirror of packages/api-client/contract.ts).

packages/api-client/providers.json is the single source of truth for hosts, budget headers,
priority reserves and retry/breaker defaults, so TS and Python make identical decisions.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional
from urllib.parse import urlsplit

REPO_ROOT = Path(__file__).resolve().parents[2]
PROVIDERS_PATH = REPO_ROOT / "packages" / "api-client" / "providers.json"
CONTRACT: dict = json.loads(PROVIDERS_PATH.read_text())
PRIORITIES = list(CONTRACT["priorities"].keys())
PROVIDERS = list(CONTRACT["providers"].keys())
DEFAULTS: dict = CONTRACT["defaults"]


def provider_spec(provider: str) -> dict:
    spec = CONTRACT["providers"].get(provider)
    if spec is None:
        raise ValueError(f"unknown API provider: {provider}")
    return spec


class BlockedProviderError(ValueError):
    def __init__(self, provider: str, reason: str):
        super().__init__(f"{provider} is blocked: {reason}")
        self.provider = provider


def callable_spec(provider: str) -> dict:
    """The spec of a provider the client may call; blocked providers raise (mirror of callableSpec)."""
    spec = provider_spec(provider)
    if spec.get("status") == "blocked":
        raise BlockedProviderError(provider, spec.get("blockedReason") or "see packages/api-client/providers.json")
    return spec


def priority_policy(priority: str) -> dict:
    policy = CONTRACT["priorities"].get(priority)
    if policy is None:
        raise ValueError(f"unknown API priority: {priority}")
    return policy


def provider_for_url(url: str) -> Optional[str]:
    parts = urlsplit(url)
    for name, spec in CONTRACT["providers"].items():
        if parts.hostname not in spec["hosts"]:
            continue
        if spec.get("pathPrefix") and not parts.path.startswith(spec["pathPrefix"]):
            continue
        return name
    return None


def resource_for(provider: str, url: str) -> str:
    spec = provider_spec(provider)
    path = urlsplit(url).path
    for rule in spec.get("resourceRules") or []:
        if path.startswith(rule["pathPrefix"]):
            return rule["resource"]
    return spec["defaultResource"]
