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
