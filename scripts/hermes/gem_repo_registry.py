#!/usr/bin/env python3
"""Versioned, fail-closed Gem repository policy registry."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


REGISTRY = Path(
    os.environ.get(
        "GEM_REPO_REGISTRY",
        Path(__file__).with_name("config") / "gem-repo-registry.json",
    )
)


@dataclass(frozen=True)
class Repo:
    id: str
    github: str
    repo_class: str
    owner: str
    kpi: str
    local_path: str
    default_branch: str
    health: bool
    pr_drain: bool
    issue_intake: bool


def load_registry(path: Path = REGISTRY) -> list[Repo]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1:
        raise RuntimeError(f"unsupported Gem repo registry: {path}")
    repos: list[Repo] = []
    seen: set[str] = set()
    for raw in data.get("repos", []):
        github = str(raw.get("github", "")).strip()
        policies = raw.get("policies") or {}
        if not github or "/" not in github or github.casefold() in seen:
            raise RuntimeError(f"invalid or duplicate Gem repository: {github!r}")
        seen.add(github.casefold())
        repos.append(
            Repo(
                id=str(raw.get("id") or github.replace("/", "-")),
                github=github,
                repo_class=str(raw.get("class") or "unknown"),
                owner=str(raw.get("owner") or "unassigned"),
                kpi=str(raw.get("kpi") or "unassigned"),
                local_path=str(raw.get("local_path") or ""),
                default_branch=str(raw.get("default_branch") or "main"),
                health=bool(policies.get("health", False)),
                pr_drain=bool(policies.get("pr_drain", False)),
                issue_intake=bool(policies.get("issue_intake", False)),
            )
        )
    if not repos:
        raise RuntimeError(f"empty Gem repo registry: {path}")
    return repos


def by_github(github: str) -> Repo:
    for repo in load_registry():
        if repo.github.casefold() == github.casefold():
            return repo
    raise ValueError(f"repo is not in Gem allowlist: {github}")


def pr_drain_repos() -> list[Repo]:
    return [repo for repo in load_registry() if repo.pr_drain]


def health_repos() -> list[Repo]:
    return [repo for repo in load_registry() if repo.health]
