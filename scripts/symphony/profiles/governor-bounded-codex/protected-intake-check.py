#!/usr/bin/env python3
"""Fail-closed Symphony intake gate for protected issues, pull requests, and branches.

The pinned scheduler matches labels and states only. This check runs from the
governor-bounded-codex after_create hook before clone, before_run lease checks,
and routing. A missing or unparseable list, or unresolved linkage, refuses
every candidate. One protected match refuses that issue.

Host install is held. Copy this file to ~/.local/bin/symphony-protected-intake-check
and protected-items.json to ~/.config/symphony/protected-items.json only after
the exact SHA is approved. Do not install the workflow from this script.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

SCHEMA = "symphony-protected-items/v1"
IDENTIFIER_RE = re.compile(r"^JOV-[0-9]+$")
PULL_URL_RE = re.compile(r"https://github\.com/JovieInc/Jovie/pull/(\d+)\b", re.IGNORECASE)
LINEAR_QUERY = """
query($id: String!) {
  issue(id: $id) {
    identifier
    branchName
    labels { nodes { name } }
    attachments { nodes { url } }
  }
}
"""
EXIT_LIST = 66
EXIT_LINKAGE = 75
EXIT_PROTECTED = 78
BLOCK_REASONS = {
    "protected-list-unavailable": EXIT_LIST,
    "linkage-unresolved": EXIT_LINKAGE,
}


class ProtectedListError(Exception):
    """The checked-in denylist cannot be trusted."""


class LinkageUnresolved(Exception):
    """Pull-request or branch linkage for an issue cannot be proven."""


def latch_path() -> Path:
    override = os.environ.get("SYMPHONY_PROTECTED_INTAKE_LATCH")
    if override:
        return Path(override)
    return Path.home() / ".local/state/symphony-elixir/protected-intake-block.json"


def read_latch(path: Path) -> str | None:
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return "protected-list-unavailable"
    reason = payload.get("reason") if isinstance(payload, dict) else None
    if reason in BLOCK_REASONS:
        return reason
    return "protected-list-unavailable"


def write_latch(path: Path, reason: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps({"reason": reason}) + "\n", encoding="utf-8")
    temporary.replace(path)


def resolve_list_path(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    env_path = os.environ.get("SYMPHONY_PROTECTED_ITEMS")
    if env_path:
        return Path(env_path)
    sibling = Path(__file__).resolve().parent / "protected-items.json"
    if sibling.is_file():
        return sibling
    return Path.home() / ".config/symphony/protected-items.json"


def _string_list(value: object, *, name: str) -> list[str]:
    if (
        not isinstance(value, list)
        or not value
        or any(not isinstance(item, str) or not item.strip() or any(ch.isspace() for ch in item) for item in value)
        or len(value) != len(set(value))
    ):
        raise ProtectedListError(f"{name} malformed")
    return value


def load_protected_list(path: Path) -> dict[str, object]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ProtectedListError("protected-list-unavailable") from exc
    if not isinstance(payload, dict):
        raise ProtectedListError("protected-list-unavailable")
    expected = {"schema", "pull_requests", "issues", "branches", "labels", "label_patterns"}
    if set(payload) != expected or payload.get("schema") != SCHEMA:
        raise ProtectedListError("protected-list-unavailable")
    pulls = payload["pull_requests"]
    if (
        not isinstance(pulls, list)
        or not pulls
        or any(type(number) is not int or number <= 0 for number in pulls)
        or len(pulls) != len(set(pulls))
    ):
        raise ProtectedListError("protected-list-unavailable")
    issues = _string_list(payload["issues"], name="issues")
    if any(IDENTIFIER_RE.fullmatch(issue) is None for issue in issues):
        raise ProtectedListError("protected-list-unavailable")
    branches = _string_list(payload["branches"], name="branches")
    labels = _string_list(payload["labels"], name="labels")
    patterns = _string_list(payload["label_patterns"], name="label_patterns")
    if any(not pattern.endswith("*") or "*" in pattern[:-1] or pattern == "*" for pattern in patterns):
        raise ProtectedListError("protected-list-unavailable")
    return {
        "pull_requests": set(pulls),
        "issues": set(issues),
        "branches": set(branches),
        "labels": {label.casefold() for label in labels},
        "label_prefixes": tuple(pattern[:-1].casefold() for pattern in patterns),
    }


def label_protected(protected: dict[str, object], label: str) -> bool:
    folded = label.casefold()
    if folded in protected["labels"]:
        return True
    return any(folded.startswith(prefix) for prefix in protected["label_prefixes"])


def normalize_issue(raw: object) -> dict[str, object]:
    if not isinstance(raw, dict) or raw.get("linkage") != "resolved":
        raise LinkageUnresolved("linkage is not resolved")
    identifier = raw.get("identifier")
    if not isinstance(identifier, str) or IDENTIFIER_RE.fullmatch(identifier) is None:
        raise LinkageUnresolved("identifier unresolved")
    pulls = raw.get("pull_requests")
    if not isinstance(pulls, list) or any(type(number) is not int or number <= 0 for number in pulls):
        raise LinkageUnresolved("pull_requests unresolved")
    if "branch" not in raw:
        raise LinkageUnresolved("branch unresolved")
    branch = raw.get("branch")
    if branch is not None and (
        not isinstance(branch, str) or not branch or any(ch.isspace() for ch in branch)
    ):
        raise LinkageUnresolved("branch unresolved")
    labels = raw.get("labels")
    if not isinstance(labels, list) or any(not isinstance(label, str) or not label.strip() for label in labels):
        raise LinkageUnresolved("labels unresolved")
    return {
        "identifier": identifier,
        "pull_requests": pulls,
        "branch": branch,
        "labels": labels,
    }


def refusal(protected: dict[str, object], issue: dict[str, object]) -> str | None:
    if issue["identifier"] in protected["issues"]:
        return "issue"
    if any(number in protected["pull_requests"] for number in issue["pull_requests"]):
        return "pull_request"
    branch = issue["branch"]
    if isinstance(branch, str) and branch in protected["branches"]:
        return "branch"
    if any(label_protected(protected, label) for label in issue["labels"]):
        return "label"
    return None


def evaluate_intake(protected: dict[str, object], issues: list[object]) -> dict[str, object]:
    try:
        normalized = [normalize_issue(issue) for issue in issues]
    except LinkageUnresolved:
        return {"blocked": "linkage-unresolved", "admitted": [], "refused": []}
    identifiers = [issue["identifier"] for issue in normalized]
    if len(identifiers) != len(set(identifiers)):
        return {"blocked": "linkage-unresolved", "admitted": [], "refused": []}
    admitted: list[str] = []
    refused: list[dict[str, str]] = []
    for issue in normalized:
        match = refusal(protected, issue)
        if match is None:
            admitted.append(issue["identifier"])
        else:
            refused.append(
                {
                    "identifier": issue["identifier"],
                    "reason": "protected-item",
                    "match": match,
                }
            )
    return {"blocked": None, "admitted": admitted, "refused": refused}


def pull_numbers_from_attachments(nodes: object) -> list[int]:
    if not isinstance(nodes, list):
        raise LinkageUnresolved("attachments unresolved")
    numbers: list[int] = []
    for node in nodes:
        if not isinstance(node, dict) or not isinstance(node.get("url"), str):
            raise LinkageUnresolved("attachment url unresolved")
        match = PULL_URL_RE.search(node["url"])
        if match:
            numbers.append(int(match.group(1)))
    return numbers


def linear_issue(identifier: str) -> dict[str, object]:
    key = os.environ.get("LINEAR_API_KEY")
    if not isinstance(key, str) or not key.strip():
        raise LinkageUnresolved("linear credentials unavailable")
    request = urllib.request.Request(
        os.environ.get("LINEAR_API_URL", "https://api.linear.app/graphql"),
        data=json.dumps({"query": LINEAR_QUERY, "variables": {"id": identifier}}).encode(),
        headers={"Authorization": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except (OSError, ValueError, urllib.error.URLError) as exc:
        raise LinkageUnresolved("linear linkage unavailable") from exc
    if not isinstance(payload, dict) or payload.get("errors"):
        raise LinkageUnresolved("linear linkage unavailable")
    issue = (payload.get("data") or {}).get("issue") if isinstance(payload.get("data"), dict) else None
    if not isinstance(issue, dict) or issue.get("identifier") != identifier:
        raise LinkageUnresolved("linear issue unresolved")
    branch = issue.get("branchName")
    if branch is not None and (not isinstance(branch, str) or not branch or any(ch.isspace() for ch in branch)):
        raise LinkageUnresolved("branch unresolved")
    labels = issue.get("labels")
    attachments = issue.get("attachments")
    if not isinstance(labels, dict) or not isinstance(attachments, dict):
        raise LinkageUnresolved("linear linkage unparseable")
    label_nodes = labels.get("nodes")
    if not isinstance(label_nodes, list):
        raise LinkageUnresolved("labels unresolved")
    names: list[str] = []
    for node in label_nodes:
        if not isinstance(node, dict) or not isinstance(node.get("name"), str) or not node["name"].strip():
            raise LinkageUnresolved("labels unresolved")
        names.append(node["name"])
    return {
        "branch": branch,
        "labels": names,
        "pull_requests": pull_numbers_from_attachments(attachments.get("nodes")),
    }


def github_pulls(identifier: str, branch: str | None) -> list[int]:
    queries = [f"repo:JovieInc/Jovie is:pr {identifier}"]
    if branch:
        queries.append(f"repo:JovieInc/Jovie is:pr head:{branch}")
    numbers: list[int] = []
    for query in queries:
        try:
            completed = subprocess.run(
                [
                    "gh",
                    "api",
                    "-H",
                    "Accept: application/vnd.github+json",
                    "search/issues",
                    "-f",
                    f"q={query}",
                    "-f",
                    "per_page=20",
                ],
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise LinkageUnresolved("github linkage unavailable") from exc
        if completed.returncode != 0:
            raise LinkageUnresolved("github linkage unavailable")
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise LinkageUnresolved("github linkage unparseable") from exc
        items = payload.get("items") if isinstance(payload, dict) else None
        total = payload.get("total_count") if isinstance(payload, dict) else None
        if not isinstance(items, list) or type(total) is not int or total > len(items):
            raise LinkageUnresolved("github linkage truncated")
        for item in items:
            if not isinstance(item, dict) or type(item.get("number")) is not int:
                raise LinkageUnresolved("github linkage unparseable")
            if "pull_request" not in item:
                continue
            numbers.append(item["number"])
    return numbers


def resolve_live(
    identifier: str,
    *,
    linear=linear_issue,
    github=github_pulls,
) -> dict[str, object]:
    if IDENTIFIER_RE.fullmatch(identifier) is None:
        raise LinkageUnresolved("identifier unresolved")
    try:
        issue = linear(identifier)
        extra = github(identifier, issue["branch"])
    except LinkageUnresolved:
        raise
    except Exception as exc:
        raise LinkageUnresolved("linkage lookup failed") from exc
    pulls = issue["pull_requests"]
    if not isinstance(pulls, list):
        raise LinkageUnresolved("pull_requests unresolved")
    return {
        "identifier": identifier,
        "labels": issue["labels"],
        "pull_requests": sorted(set(pulls) | set(extra)),
        "branch": issue["branch"],
        "linkage": "resolved",
    }


def resolve_from_file(identifier: str, path: Path) -> dict[str, object]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise LinkageUnresolved("linkage file unavailable") from exc
    if not isinstance(payload, dict) or identifier not in payload or not isinstance(payload[identifier], dict):
        raise LinkageUnresolved("linkage missing")
    entry = dict(payload[identifier])
    entry["identifier"] = identifier
    return entry


def resolve_for_identifier(identifier: str) -> dict[str, object]:
    if "SYMPHONY_INTAKE_LINKAGE_FILE" in os.environ:
        path = os.environ["SYMPHONY_INTAKE_LINKAGE_FILE"]
        if not path:
            raise LinkageUnresolved("linkage file unavailable")
        return resolve_from_file(identifier, Path(path))
    return resolve_live(identifier)


def blocked_document(reason: str) -> dict[str, object]:
    return {"blocked": reason, "admitted": [], "refused": []}


def load_for_cli(explicit: str | None) -> dict[str, object]:
    return load_protected_list(resolve_list_path(explicit))


def command_batch(issues_file: str, list_path: str | None) -> int:
    try:
        protected = load_for_cli(list_path)
    except ProtectedListError:
        json.dump(blocked_document("protected-list-unavailable"), sys.stdout)
        sys.stdout.write("\n")
        return EXIT_LIST
    try:
        payload = json.loads(Path(issues_file).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        json.dump(blocked_document("linkage-unresolved"), sys.stdout)
        sys.stdout.write("\n")
        return EXIT_LINKAGE
    issues = payload.get("issues") if isinstance(payload, dict) else None
    if not isinstance(issues, list):
        json.dump(blocked_document("linkage-unresolved"), sys.stdout)
        sys.stdout.write("\n")
        return EXIT_LINKAGE
    decision = evaluate_intake(protected, issues)
    json.dump(decision, sys.stdout)
    sys.stdout.write("\n")
    blocked = decision["blocked"]
    if blocked is None:
        return 0
    return BLOCK_REASONS[blocked]


def command_workspace(workspace: str, list_path: str | None) -> int:
    latch = latch_path()
    held = read_latch(latch)
    if held is not None:
        print(held)
        return BLOCK_REASONS[held]
    try:
        protected = load_for_cli(list_path)
    except ProtectedListError:
        try:
            write_latch(latch, "protected-list-unavailable")
        except OSError:
            print("latch-write-failed", file=sys.stderr)
        print("protected-list-unavailable")
        return EXIT_LIST
    identifier = Path(workspace).name
    try:
        issue = resolve_for_identifier(identifier)
        decision = evaluate_intake(protected, [issue])
    except LinkageUnresolved:
        decision = blocked_document("linkage-unresolved")
    blocked = decision["blocked"]
    if blocked is not None:
        try:
            write_latch(latch, blocked)
        except OSError:
            print("latch-write-failed", file=sys.stderr)
        print(blocked)
        return BLOCK_REASONS[blocked]
    if decision["refused"]:
        print("protected-item")
        return EXIT_PROTECTED
    print("admitted")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", dest="list_path", default=None)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--issues-file")
    group.add_argument("--workspace")
    args = parser.parse_args(argv)
    if args.issues_file:
        return command_batch(args.issues_file, args.list_path)
    return command_workspace(args.workspace, args.list_path)


if __name__ == "__main__":
    raise SystemExit(main())
