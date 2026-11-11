"""Canonical measured-Win validation for the existing PR repair loop."""
import json
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[2]


def validate(win_section: str) -> None:
    if not isinstance(win_section, str) or not re.match(r"\A## Win\s*\n", win_section):
        raise ValueError("measured win requires a complete ## Win section")
    if re.search(r"^#{1,6}\s+|customer-changelog/v1", win_section.split("\n", 1)[1], re.M):
        raise ValueError("measured win must contain only Win evidence; use the dedicated repair fields")
    # Use the same policy as Fleet; never publish a repair that will fail it again.
    checked = subprocess.run(["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { requiredWinErrors, winSectionErrors } from './scripts/lib/wins-ledger.mjs';
const body = readFileSync(0, 'utf8');
console.log(JSON.stringify([
  ...requiredWinErrors({ labels: ['compounding'], body }), ...winSectionErrors(body),
]));
"""], cwd=ROOT, input=win_section, text=True, capture_output=True, check=True, timeout=10)
    problems = json.loads(checked.stdout)
    if problems:
        raise ValueError("measured win policy: " + "; ".join(problems))


def company_guard_pin(files: list[dict], comparison: dict) -> str:
    """Generate a measured Win for a pin-only workflow edit, never a speed claim.

    Pass fresh REST PR files and `node packages/api-client/cli.ts gh --priority repair -- api repos/JovieInc/ci/compare/OLD...NEW`.
    Feed the returned section to pr_events.repair_evidence_body(win_section=...).
    The caller owns the GitHub read and exact-head binding; this helper does no I/O
    except the existing canonical Win validation. Mismatched evidence fails closed.
    """
    workflows = [file for file in files if file.get("filename") == ".github/workflows/company-guards.yml"]
    if len(workflows) != 1 or workflows[0].get("status") != "modified":
        raise ValueError("company guard Win requires one modified workflow pin")
    patch = workflows[0].get("patch")
    if not isinstance(patch, str):
        raise ValueError("company guard pin patch unavailable")
    changed = [line for line in patch.splitlines() if line.startswith(("+", "-"))]
    pins = {}
    for sign in ("-", "+"):
        for marker in ("company-guards.yml@", "ci-ref: "):
            matches = [re.fullmatch(re.escape(sign + "# " + marker) + r"([0-9a-f]{40})", line)
                       for line in changed]
            matches = [match.group(1) for match in matches if match]
            if len(matches) != 1:
                raise ValueError("company guard Win requires both exact old and new pins")
            pins[sign, marker] = matches[0]
    old, new = pins["-", "ci-ref: "], pins["+", "ci-ref: "]
    if len(changed) != 4 or old == new or any(
            pins[sign, "company-guards.yml@"] != pins[sign, "ci-ref: "] for sign in ("-", "+")):
        raise ValueError("company guard workflow change is not a consistent pin-only bump")
    url = f"https://github.com/JovieInc/ci/compare/{old}...{new}"
    count = comparison.get("ahead_by")
    commits = comparison.get("commits")
    if (comparison.get("html_url") != url or comparison.get("status") != "ahead"
            or type(count) is not int or count <= 0
            or type(comparison.get("behind_by")) is not int or comparison["behind_by"] != 0
            or type(comparison.get("total_commits")) is not int or comparison["total_commits"] != count
            or (comparison.get("base_commit") or {}).get("sha") != old
            or (comparison.get("merge_base_commit") or {}).get("sha") != old
            or not isinstance(commits, list) or len(commits) != count
            or not isinstance(commits[-1], dict) or commits[-1].get("sha") != new):
        raise ValueError("upstream comparison must completely match the workflow's forward pin bump")
    section = "\n".join([
        "## Win", "",
        "- Claim: Bring the shared company guard pin up to the verified upstream target.",
        "- Area: ci", "- Theme: guard-freshness",
        f"- Metric: upstream guard commits behind target | commits | lower | {count} | 0 | "
        f"GitHub compare API, old pin versus adopted target | "
        f"node packages/api-client/cli.ts gh --priority repair -- api repos/JovieInc/ci/compare/{old}...{new} --jq .ahead_by && "
        f"node packages/api-client/cli.ts gh --priority repair -- api repos/JovieInc/ci/compare/{new}...{new} --jq .ahead_by",
        f"- Verify: {url}", "",
    ])
    validate(section)
    return section
