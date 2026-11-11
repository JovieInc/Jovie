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


def company_guard_pin_win(before_pin: str, after_pin: str, before: dict, after: dict) -> str:
    """Measure pinned company registries for pin-bump repairs; never infer a CI pass.

    The caller reads canon/guards.json at each exact JovieInc/ci pin. Reuse the
    result with pr_events.repair_evidence_body; publication still runs Fleet.
    A no-growth pin needs its own measured evidence, not an invented win.
    """
    if any(not isinstance(pin, str) or not re.fullmatch(r"[0-9a-f]{40}", pin)
           for pin in (before_pin, after_pin)) or before_pin == after_pin:
        raise ValueError("pin measurement requires two distinct exact company pins")

    def enforcing(registry):
        if not isinstance(registry, dict) or registry.get("schema") != "company-guards/v1":
            raise ValueError("pin measurement requires the company guard registry")
        rows = registry.get("guards")
        if not isinstance(rows, list) or any(
                not isinstance(row, dict) or not isinstance(row.get("id"), str)
                or not re.fullmatch(r"[a-z0-9-]+", row["id"])
                or row.get("mode") not in {"enforce", "ratchet", "shadow"} for row in rows):
            raise ValueError("pin measurement requires complete guard modes and identifiers")
        if len({row["id"] for row in rows}) != len(rows):
            raise ValueError("pin measurement requires unique guard identifiers")
        return {row["id"] for row in rows if row["mode"] in {"enforce", "ratchet"}}

    old, new = enforcing(before), enforcing(after)
    if not old < new:
        raise ValueError("pin measurement cannot claim growth without preserving existing enforcing guards")
    compare = f"https://github.com/JovieInc/ci/compare/{before_pin}...{after_pin}"
    query = (
        "python3 -c 'import base64,json,subprocess; "
        f"pins=(\"{before_pin}\",\"{after_pin}\"); "
        "[print(p,sum(g[\"mode\"] in (\"enforce\",\"ratchet\") for g in "
        "json.loads(base64.b64decode(subprocess.check_output([\"gh\",\"api\","
        "\"repos/JovieInc/ci/contents/canon/guards.json?ref=\"+p,\"--jq\",\".content\"])))"
        "[\"guards\"])) for p in pins]'"
    )
    section = "\n".join([
        "## Win", "", "- Claim: The company pin adds registered enforcing guards without removing existing ones.",
        "- Area: quality", "- Theme: company-guard-policy",
        f"- Metric: Registered enforcing company guards | count | higher | {len(old)} | {len(new)} | "
        f"JovieInc/ci canon/guards.json at both exact pins (shadow excluded) | {query}",
        f"- Verify: {compare}", "",
    ])
    validate(section)
    return section
