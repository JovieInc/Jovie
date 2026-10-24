"""GitHub adapter (mirror of github.ts): REST with ETag reuse, GraphQL, Link pagination and
aliased batch reads instead of one call per PR."""
from __future__ import annotations

import json
import re
from typing import Callable, Optional, Union

from .client import ApiClient
from .store import hash_credential

GITHUB_API = "https://api.github.com"
GRAPHQL_BATCH_SIZE = 50


class GraphQLError(Exception):
    def __init__(self, errors):
        first = errors[0] if errors else {}
        super().__init__(f"GitHub GraphQL: {first.get('message', 'error') if isinstance(first, dict) else 'error'}")
        self.errors = errors


def next_link(header: Optional[str]) -> Optional[str]:
    for part in (header or "").split(","):
        if 'rel="next"' in part:
            match = re.search(r"<([^>]+)>", part)
            return match.group(1) if match else None
    return None


class GitHubClient:
    def __init__(self, token: Union[str, Callable[[], str]], credential: Optional[str] = None, **options):
        """`credential` is the rate-limit bucket: pass `app-installation:<id>` for rotating
        installation tokens; it defaults to a hash of a static token."""
        self._token = token
        if credential is None:
            credential = hash_credential("github", token) if isinstance(token, str) else "github-default"
        self.client = ApiClient("github", credential, authorize=self._authorize, **options)

    def _authorize(self, headers: dict) -> None:
        token = self._token() if callable(self._token) else self._token
        headers["Authorization"] = f"Bearer {token}"
        headers.setdefault("Accept", "application/vnd.github+json")
        headers["X-GitHub-Api-Version"] = "2022-11-28"

    @staticmethod
    def url(path: str) -> str:
        return path if path.startswith("http") else f"{GITHUB_API}/{path.lstrip('/')}"

    def rest(self, method: str, path: str, body=None, **options):
        return self.client.request(self.url(path), method=method, body=body, **options)

    def _raw(self, query: str, variables: dict, options: dict) -> dict:
        res = self.client.request(f"{GITHUB_API}/graphql", method="POST",
                                  body={"query": query, "variables": variables}, **options)
        return res.json()

    def graphql(self, query: str, variables: Optional[dict] = None, **options):
        payload = self._raw(query, variables or {}, options)
        if payload.get("errors"):
            raise GraphQLError(payload["errors"])
        return payload.get("data")

    def paginate(self, path: str, max_pages: int = 50, **options) -> list:
        items, url = [], self.url(path)
        for _ in range(max_pages):
            if not url:
                break
            res = self.client.request(url, **options)
            body = res.json()
            rows = body if isinstance(body, list) else next((v for v in body.values() if isinstance(v, list)), [])
            items.extend(rows)
            url = next_link(res.headers.get("link"))
        return items

    def batch(self, keys, field: Callable[[str], str], **options) -> dict:
        out, unique = {}, list(dict.fromkeys(keys))
        for i in range(0, len(unique), GRAPHQL_BATCH_SIZE):
            chunk = unique[i:i + GRAPHQL_BATCH_SIZE]
            query = "query { " + "\n".join(f"k{j}: {field(key)}" for j, key in enumerate(chunk)) + " }"
            # Per-alias misses (unknown PR) come back as null + errors.
            payload = self._raw(query, {}, options)
            data = payload.get("data")
            if not data:
                raise GraphQLError(payload.get("errors") or [])
            for j, key in enumerate(chunk):
                out[key] = data.get(f"k{j}")
        return out


def pull_request_field(owner: str, repo: str, selection: str) -> Callable[[str], str]:
    return lambda number: (f"repository(owner: {json.dumps(owner)}, name: {json.dumps(repo)}) "
                           f"{{ pullRequest(number: {int(number)}) {{ {selection} }} }}")
