#!/usr/bin/env python3
"""Keep security-review suppressions auditable in structured output.

Reviewers may record an intentionally suppressed security finding with this marker:
<!-- jovie-security-suppression {"type":"secret-scan","reason":"..."} -->
The marker is machine-readable, while workflows emit a visible, fixed notice.
"""

from __future__ import annotations

import argparse
import collections
import html
import json
import re
import sys
from pathlib import Path
from typing import Any


MARKER = re.compile(
    r"<!--\s*jovie-security-suppression\s+(.*?)\s*-->", re.DOTALL
)
NOTICE = (
    "Security finding suppressions are present; review suppressed findings and "
    "reasons below."
)


def flatten(value: Any) -> list[dict[str, Any]]:
    """Flatten paginated GitHub API responses without accepting scalar records."""
    if isinstance(value, list):
        result: list[dict[str, Any]] = []
        for item in value:
            result.extend(flatten(item))
        return result
    return [value] if isinstance(value, dict) else []


def author_for(record: dict[str, Any]) -> str:
    """Resolve normalized or native GitHub authors, including deleted users."""
    author = record.get("author")
    if isinstance(author, str) and author.strip():
        return author.strip()
    if isinstance(author, dict):
        login = author.get("login")
        if isinstance(login, str) and login.strip():
            return login.strip()

    user = record.get("user")
    if isinstance(user, dict):
        login = user.get("login")
        if isinstance(login, str) and login.strip():
            return login.strip()
    return "unknown"


def extract(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Extract valid markers, failing closed when a marker is malformed."""
    findings: list[dict[str, Any]] = []
    for record in records:
        body = record.get("body")
        if not isinstance(body, str):
            continue
        for raw in MARKER.findall(body):
            try:
                marker = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid suppression marker: {exc}") from exc
            if not isinstance(marker, dict):
                raise ValueError("suppression marker payload must be a JSON object")

            suppression_type = marker.get("type")
            reason = marker.get("reason")
            if not isinstance(suppression_type, str) or not suppression_type.strip():
                raise ValueError(
                    "suppression marker requires a non-empty string 'type'"
                )
            if not isinstance(reason, str) or not reason.strip():
                raise ValueError(
                    "suppression marker requires a non-empty string 'reason'"
                )
            findings.append(
                {
                    "type": suppression_type.strip(),
                    "reason": reason.strip(),
                    "author": author_for(record),
                    "source": record.get("source", "review"),
                    "pr_number": record.get("pr_number"),
                }
            )
    return findings


def normalize(report: dict[str, Any]) -> dict[str, Any]:
    """Preserve suppressed findings and add a notice without hiding active data."""
    suppressed = report.get("suppressedFindings", [])
    if not isinstance(suppressed, list):
        raise ValueError("suppressedFindings must be an array")
    output = dict(report)
    output["suppressedFindings"] = suppressed
    if suppressed:
        output["suppressionNotice"] = {
            "id": "security.suppressions.active",
            "severity": "info",
            "message": NOTICE,
            "unsuppressible": True,
        }
    return output


def markdown_summary(report: dict[str, Any]) -> str:
    """Render a fixed notice and escaped reasons for the Actions summary."""

    def cell(value: Any) -> str:
        return (
            html.escape(str(value), quote=False)
            .replace("|", "\\|")
            .replace("\r", " ")
            .replace("\n", " ")
        )

    suppressed = report.get("suppressedFindings", [])
    if not isinstance(suppressed, list):
        raise ValueError("suppressedFindings must be an array")

    lines = [
        "### Security suppression audit",
        "",
        f"Suppressed security findings: **{len(suppressed)}**",
    ]
    if not suppressed:
        lines.extend(["", "No security finding suppressions detected."])
        return "\n".join(lines) + "\n"

    lines.extend(
        [
            "",
            NOTICE,
            "",
            "| Type | Author | PR | Reason |",
            "| --- | --- | ---: | --- |",
        ]
    )
    for finding in suppressed:
        if not isinstance(finding, dict):
            raise ValueError("suppressed finding must be a JSON object")
        lines.append(
            "| {type} | {author} | {pr_number} | {reason} |".format(
                type=cell(finding.get("type", "unknown")),
                author=cell(finding.get("author", "unknown")),
                pr_number=cell(finding.get("pr_number") or "—"),
                reason=cell(finding.get("reason", "")),
            )
        )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("normalize", "audit"), required=True)
    parser.add_argument(
        "--input", required=True, help="JSON report or GitHub API response"
    )
    parser.add_argument("--output", help="write structured JSON here instead of stdout")
    parser.add_argument(
        "--summary-output", help="append an escaped Markdown audit summary here"
    )
    args = parser.parse_args()
    data = json.loads(Path(args.input).read_text(encoding="utf-8"))

    if args.mode == "normalize":
        if not isinstance(data, dict):
            raise ValueError("normalize input must be a JSON object")
        result = normalize(data)
    else:
        suppressions = extract(flatten(data))
        by_type = collections.Counter(item["type"] for item in suppressions)
        by_author = collections.Counter(item["author"] for item in suppressions)
        result = {
            "total": len(suppressions),
            "byType": dict(sorted(by_type.items())),
            "byAuthor": dict(sorted(by_author.items())),
            "suppressedFindings": suppressions,
        }
        if suppressions:
            result["suppressionNotice"] = {
                "id": "security.suppressions.active",
                "severity": "info",
                "message": NOTICE,
                "unsuppressible": True,
            }

    rendered = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)
    if args.summary_output:
        if args.mode != "audit":
            raise ValueError("--summary-output is only supported in audit mode")
        with Path(args.summary_output).open("a", encoding="utf-8") as summary:
            summary.write(markdown_summary(result))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"security suppression audit: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
