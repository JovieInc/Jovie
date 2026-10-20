"""Provider-aware client layer for every outbound third-party API call from Python.

Same contract and on-disk ledger as packages/api-client (TS). See .claude/rules/external-apis.md.
"""
from __future__ import annotations

from .client import EX_TEMPFAIL, ApiClient, ApiError, ApiResponse
from .contract import CONTRACT, PRIORITIES, PROVIDERS, provider_for_url, resource_for
from .store import (
    FileLedgerStore, MemoryLedgerStore, credential_label, default_state_root, default_store, hash_credential,
)

__all__ = [
    "CONTRACT", "EX_TEMPFAIL", "PRIORITIES", "PROVIDERS", "ApiClient", "ApiError", "ApiResponse",
    "FileLedgerStore", "MemoryLedgerStore", "credential_label", "default_state_root", "default_store",
    "hash_credential", "provider_for_url", "resource_for",
]
