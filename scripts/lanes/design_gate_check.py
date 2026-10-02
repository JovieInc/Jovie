#!/usr/bin/env python3
"""Warn when a PR touches a marketing or landing path without a completed brief.

Warn-only unless DESIGN_GATE_ENFORCE is truthy (1/true/yes/on); default off.
A brief we cannot read (no Linear key, unmapped URL) is always a warning,
including when enforcement is on. No new secrets; LINEAR_API_KEY is used only
when already in the environment. Path list: design_gate.GATED_PATH_PREFIXES.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import design_gate  # noqa: E402


def linear_issue_description(identifier: str) -> str | None:
    """Return the issue body, or None when Linear is not configured or unread."""
    key = os.environ.get("LINEAR_API_KEY", "").strip()
    if not key or "-" not in identifier:
        return None
    number = identifier.split("-", 1)[1]
    if not number.isdigit():
        return None
    query = (
        'query($n:Float!){issues(filter:{team:{key:{eq:"JOV"}},number:{eq:$n}})'
        '{nodes{description}}}'
    )
    payload = json.dumps({"query": query, "variables": {"n": float(number)}}).encode()
    request = urllib.request.Request(
        "https://api.linear.app/graphql",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": key},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        body = json.load(response)
    if body.get("errors"):
        raise RuntimeError(body["errors"][0].get("message", "linear error"))
    nodes = body.get("data", {}).get("issues", {}).get("nodes") or []
    if not nodes:
        return None
    return nodes[0].get("description") or ""


def status_for_text(text: str, read_text) -> dict:
    link = design_gate.find_brief_link(text)
    doc = None
    if link and link["repoPath"] and read_text is None:
        return {"complete": False, "missing": list(design_gate.BRIEF_STEPS),
                "invalidCapabilityIds": [], "source": "linked-unloaded", "link": link,
                "verified": False}
    if link and link["repoPath"] and read_text is not None:
        try:
            doc = read_text(link["repoPath"])
        except OSError:
            doc = None
        if doc is None:
            # The path was checked and is not in the checkout. That is a missing
            # brief, not an unverified one.
            return {"complete": False, "missing": list(design_gate.BRIEF_STEPS),
                    "invalidCapabilityIds": [], "source": "linked-missing", "link": link,
                    "verified": True}
    status = design_gate.brief_status(text, doc if link else None)
    status["verified"] = True
    return status


def resolve_pr(body: str, read_text=None, fetch_issue=None) -> dict:
    """Find a brief on the PR body, then on a linked JOV issue if we can read it."""
    body = body or ""
    link = design_gate.find_brief_link(body)
    if link and link["repoPath"]:
        return status_for_text(body, read_text)
    if link and not link["repoPath"]:
        return {
            "complete": False, "missing": list(design_gate.BRIEF_STEPS),
            "invalidCapabilityIds": [], "source": "unverified-url", "link": link,
            "verified": False,
        }
    identifier = design_gate.find_issue_identifier(body)
    if identifier and fetch_issue is not None:
        try:
            description = fetch_issue(identifier)
        except Exception:
            description = None
            failed = True
        else:
            failed = description is None
        if failed:
            return {
                "complete": False, "missing": list(design_gate.BRIEF_STEPS),
                "invalidCapabilityIds": [], "source": "issue-unreadable", "link": None,
                "verified": False, "issue": identifier,
            }
        status = status_for_text(description or "", read_text)
        status["issue"] = identifier
        return status
    return {
        "complete": False, "missing": list(design_gate.BRIEF_STEPS),
        "invalidCapabilityIds": [], "source": "no-brief", "link": None,
        "verified": True,
    }


def check(files, body: str, *, enforce: bool = False, read_text=None, fetch_issue=None) -> dict:
    gated = [path for path in files if design_gate.path_is_gated(path)]
    if not gated:
        return {
            "status": "skip", "exit": 0, "level": None, "gatedPaths": [],
            "message": "No marketing or landing paths in this diff.",
            "summary": "Design gate: no marketing or landing paths.",
        }
    status = resolve_pr(body, read_text=read_text, fetch_issue=fetch_issue)
    if status.get("complete"):
        return {
            "status": "pass", "exit": 0, "level": None, "gatedPaths": gated,
            "message": "Design brief is complete.",
            "summary": "Design gate: brief complete for " + ", ".join(gated),
            "brief": status,
        }
    missing = ", ".join(str(step) for step in status.get("missing") or []) or "unknown"
    invalid = status.get("invalidCapabilityIds") or []
    invalid_text = ""
    if invalid:
        invalid_text = " Invalid capability ids: " + ", ".join(
            f"{row['id']} ({row['reason']})" for row in invalid) + "."
    message = (
        f"Design brief incomplete for marketing/landing paths ({status.get('source')}): "
        f"missing steps {missing}.{invalid_text} "
        "Link `Design brief: docs/design/briefs/<slug>.md` with steps 1–9 filled in."
    )
    verified = bool(status.get("verified", True))
    # Unreadable evidence stays a warning even when enforcement is on.
    blocking = enforce and verified
    return {
        "status": "block" if blocking else "warn",
        "exit": 1 if blocking else 0,
        "level": "error" if blocking else "warning",
        "gatedPaths": gated,
        "message": message,
        "summary": "Design gate: " + message,
        "brief": status,
    }


def emit(result: dict) -> int:
    if result.get("level") and result.get("message"):
        print(f"::{result['level']}::{result['message']}")
    else:
        print(result.get("message") or result["status"])
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as handle:
            handle.write(result.get("summary") or result.get("message") or "")
            handle.write("\n")
    return int(result["exit"])


def _read_files(path: str) -> list[str]:
    return [line.strip() for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


def _body_from_event(path: str) -> str:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    pull_request = data.get("pull_request") or {}
    return pull_request.get("body") or ""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Warn on marketing PRs with no completed design brief.")
    parser.add_argument("--event", help="GitHub event JSON path (pull_request.body)")
    parser.add_argument("--body-file", help="PR body text file")
    parser.add_argument("--files-from", help="Newline-separated changed paths")
    parser.add_argument("--repo", default=".", help="Checkout root for brief paths")
    args = parser.parse_args(argv)
    if args.event:
        body = _body_from_event(args.event)
    elif args.body_file:
        body = Path(args.body_file).read_text(encoding="utf-8")
    else:
        body = ""
    files = _read_files(args.files_from) if args.files_from else []
    root = Path(args.repo)
    fetch = linear_issue_description if os.environ.get("LINEAR_API_KEY", "").strip() else None
    result = check(
        files, body, enforce=design_gate.enforce_enabled(),
        read_text=design_gate.repo_reader(root), fetch_issue=fetch,
    )
    return emit(result)


if __name__ == "__main__":
    raise SystemExit(main())
