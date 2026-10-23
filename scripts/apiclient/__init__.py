"""Provider-aware client layer for every outbound third-party API call from Python.

Same contract and on-disk ledger as packages/api-client (TS). See .claude/rules/external-apis.md.
"""
from __future__ import annotations

from .client import EX_TEMPFAIL, ApiClient, ApiError, ApiResponse, BudgetExhaustedError
from .contract import CONTRACT, PRIORITIES, PROVIDERS, BlockedProviderError, provider_for_url, resource_for
from .credentials import CREDENTIAL_TIERS, CredentialUnavailableError, resolve_credential
from .gh import gh_shape, run_gh
from .github import GitHubClient, GraphQLError, pull_request_field
from .legacy import CombinedHooks, GithubBudgetHooks, Hooks, LinearLegacyHooks
from .linear import LINEAR_API_URL, LinearClient, LinearGraphQLError, issue_field, linear_scope
from .store import (
    FileLedgerStore, MemoryLedgerStore, credential_label, default_state_root, default_store, hash_credential,
)

__all__ = [
    "CONTRACT", "CREDENTIAL_TIERS", "EX_TEMPFAIL", "BlockedProviderError", "BudgetExhaustedError",
    "CredentialUnavailableError", "resolve_credential", "LINEAR_API_URL", "PRIORITIES", "PROVIDERS", "ApiClient", "ApiError", "ApiResponse",
    "CombinedHooks", "FileLedgerStore", "GitHubClient", "GithubBudgetHooks", "GraphQLError", "Hooks",
    "LinearClient", "LinearGraphQLError", "LinearLegacyHooks", "MemoryLedgerStore", "credential_label",
    "default_state_root", "default_store", "gh_shape", "hash_credential", "issue_field", "linear_scope",
    "provider_for_url", "pull_request_field", "resource_for", "run_gh",
]
