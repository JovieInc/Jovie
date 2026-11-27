"""Tech-debt stock collectors for the waste loop (observe only).

Repair stays with existing loops: ds-cert-loop for cert-screens.debt; size ratchets /
human PRs for oversized files. Split from waste.py for the company size-500 budget.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from urllib.parse import quote

REPO = Path(os.environ.get("CAPACITY_REPO") or Path(__file__).resolve().parents[2])
CERT_SCREENS = REPO / "docs" / "design-system" / "cert-screens.json"


def _sh(cmd: list[str], timeout: int = 25, cwd: Path | None = None) -> str | None:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, errors="surrogateescape", timeout=timeout, cwd=cwd)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return out.stdout if out.returncode == 0 else None


WORKFLOW_BYTES_METRIC = "debt.workflow_max_bytes"
LOCAL_MAIN = "refs/remotes/origin/main"
GIT_SHA = re.compile(r"[0-9a-f]{40}(?:[0-9a-f]{24})?")


def workflow_size(repo: Path, sh) -> dict:
    revision = sh(["git", "rev-parse", "--verify", f"{LOCAL_MAIN}^{{commit}}"], 5, repo)
    if revision is None:
        return {}
    sha = revision.strip()
    tree = sh(["git", "ls-tree", "-l", "-z", sha, "--", ".github/workflows/"], 10, repo)
    if not tree:
        return {}

    largest: tuple[int, str] | None = None
    for entry in tree.rstrip("\0").split("\0"):
        metadata, path = entry.split("\t", 1)
        mode, kind, _, size = metadata.split()
        if mode not in ("100644", "100755") or kind != "blob" or not path.endswith((".yml", ".yaml")):
            continue
        if largest is None or int(size) > largest[0]:
            largest = (int(size), path)
    if largest is None:
        return {}
    size, path = largest
    return {
        "workflowMaxBytes": size,
        "evidence": {WORKFLOW_BYTES_METRIC: {
            "sha": sha, "path": path, "ref": LOCAL_MAIN, "url": f"https://github.com/JovieInc/Jovie/blob/{sha}/{quote(path, errors='surrogateescape')}",
        }},
    }


def col_debt(repo: Path | None = None, sh=_sh) -> dict:
    root = repo or REPO
    out = workflow_size(root, sh)
    files = sh(["git", "ls-files", "*.ts", "*.tsx", "*.mjs", "*.py"], 30, root)
    if files is not None:
        big = 0
        for f in files.splitlines():
            try:
                with open(root / f, "rb") as h:
                    big += sum(1 for _ in h) > 1500
            except OSError:
                pass
        out["oversizedFiles"] = big
    try:
        debt = json.loads((root / "docs" / "design-system" / "cert-screens.json").read_text()).get("debt") or {}
        if isinstance(debt, dict):
            out["certScreenEntries"] = len(debt)
    except (OSError, ValueError, TypeError):
        pass
    return out


def debt_signal_context(row: dict) -> str:
    evidence = row.get("evidence")
    if not evidence:
        return ""
    return (f" Repair owner: {row['repairOwner']}. "
            f"Local origin/main: [{evidence['path']}]({evidence['url']}) at `{evidence['sha']}` "
            f"({row['value']:.0f} bytes).")


def evidence_sha(measurement: dict) -> str | None:
    evidence = measurement.get("evidence")
    if not isinstance(evidence, dict) or evidence.get("ref") != LOCAL_MAIN:
        return None
    sha = evidence.get("sha")
    if not isinstance(sha, str) or not GIT_SHA.fullmatch(sha):
        return None
    if not isinstance(evidence.get("url"), str) or not evidence["url"]:
        return None
    return sha


def debt_closure(row: dict, baseline: dict, repo: Path) -> bool:
    if not row.get("settleAtCeiling"):
        return row["value"] <= baseline["value"] * 0.8
    previous = evidence_sha(baseline)
    current = evidence_sha(row)
    baseline_value = baseline.get("value")
    if not previous or not current or previous == current or not isinstance(baseline_value, (int, float)):
        return False
    if not 0 < row["value"] < baseline_value:
        return False
    tip = _sh(["git", "rev-parse", "--verify", f"{LOCAL_MAIN}^{{commit}}"], 5, repo)
    return bool(tip and tip.strip() == current and
                _sh(["git", "merge-base", "--is-ancestor", previous, current], 5, repo) is not None)


def debt_receipts(row: dict, baseline: dict, now: str) -> list[dict]:
    if not row.get("settleAtCeiling"):
        return []
    return [
        {"metric": row["id"], "value": measure["value"], "at": at, "sha": measure["evidence"]["sha"],
         "evidence": measure["evidence"]["url"], "note": note}
        for measure, at, note in [(baseline, baseline["since"], "Before"), (row, now, "After")]
    ]
