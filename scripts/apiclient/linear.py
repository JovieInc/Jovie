"""Linear adapter (mirror of linear.ts): one GraphQL transport on the shared ledger, the lanes
cooldown scope as credential identity, and aliased batch reads."""
from __future__ import annotations

import json
from typing import Callable, Optional

from .client import ApiClient
from .legacy import LinearLegacyHooks
from .store import default_state_root, hash_credential

LINEAR_API_URL = "https://api.linear.app/graphql"
LINEAR_BATCH_SIZE = 50
_DEFAULT = object()


class LinearGraphQLError(Exception):
    def __init__(self, errors):
        first = errors[0] if errors else {}
        super().__init__(f"Linear GraphQL: {first.get('message', 'error') if isinstance(first, dict) else 'error'}")
        self.errors = errors


def linear_scope(identity: str) -> str:
    """Same token lanes use for cooldowns: sha256(API URL + NUL + identity)."""
    return hash_credential(LINEAR_API_URL, identity)


class LinearClient:
    def __init__(self, identity: str, authorization: Callable[..., str], legacy_state_root=_DEFAULT, **options):
        """`identity` is the API key or `linear-app:<client id>`; `authorization(rejected=None)`
        returns the header value and receives the rejected value after a 401."""
        self.scope = linear_scope(identity)
        self._authorization = authorization
        self._current: Optional[str] = None
        root = default_state_root() if legacy_state_root is _DEFAULT else legacy_state_root
        if "hooks" not in options and root:
            options["hooks"] = LinearLegacyHooks(root, self.scope)
        self.client = ApiClient("linear", self.scope, authorize=self._authorize, **options)

    def _authorize(self, headers: dict) -> None:
        if self._current is None:
            self._current = self._authorization()
        headers["Authorization"] = self._current
        headers["Content-Type"] = "application/json"

    def _raw(self, query: str, variables: dict, options: dict) -> dict:
        def send():
            return self.client.request(LINEAR_API_URL, method="POST",
                                       body={"query": query, "variables": variables}, **options)
        res = send()
        if res.status == 401 and self._current is not None:
            self._current = self._authorization(rejected=self._current)
            res = send()
        return res.json()

    def graphql(self, query: str, variables: Optional[dict] = None, **options):
        payload = self._raw(query, variables or {}, options)
        if payload.get("errors"):
            raise LinearGraphQLError(payload["errors"])
        return payload.get("data")

    def batch(self, keys, field: Callable[[str], str], **options) -> dict:
        out, unique = {}, list(dict.fromkeys(keys))
        for i in range(0, len(unique), LINEAR_BATCH_SIZE):
            chunk = unique[i:i + LINEAR_BATCH_SIZE]
            query = "query { " + "\n".join(f"k{j}: {field(key)}" for j, key in enumerate(chunk)) + " }"
            payload = self._raw(query, {}, options)
            data = payload.get("data")
            if not data:
                raise LinearGraphQLError(payload.get("errors") or [])
            for j, key in enumerate(chunk):
                out[key] = data.get(f"k{j}")
        return out


def issue_field(selection: str) -> Callable[[str], str]:
    return lambda issue_id: f"issue(id: {json.dumps(issue_id)}) {{ {selection} }}"
