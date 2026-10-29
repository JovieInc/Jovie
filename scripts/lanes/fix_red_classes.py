#!/usr/bin/env python3
"""Fix-red failure fingerprints: which red is deterministic, which needs a model, and how much it costs.

Gem ledger, 2026-10-21..25: 762 fix-red runs, 34% pushed anything. A model reading a log that says
"API rate limit exceeded", "Unwired: <test file>" or a BEHIND branch is spending money on work a few
lines of Python do every time. The lanes classify each red head by what its failed logs say, route the
deterministic classes to a deterministic fixer, and count LLM runs per (PR, fingerprint) so a model is
not asked again to fix what it has already failed to move (a machine-gap signal then asks for a
machine instead of another run).

Pure functions over parsed values; lane_runner owns every side effect (gh, git, state files).

    python3 fix_red_classes.py measure [--state DIR] [--days N]   # before/after numbers from the ledger
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import migration_renumber
import remediation
from atomic_state import atomic_write_text

SCHEMA = "jovie-fix-red-class/v1"
# Actions a class can route to. `agent` is the default (a model run); the others spend no model.
RERUN, SYNC_MAIN, WIRE_CI_FAST, RENUMBER, STAMP_CHANGELOG, AGENT = (
    "rerun", "sync-main", "wire-ci-fast", "renumber-migrations", "stamp-changelog", "agent")
DETERMINISTIC = frozenset({RERUN, SYNC_MAIN, WIRE_CI_FAST, RENUMBER, STAMP_CHANGELOG})

# remediation.INFRA_TEXT (runner loss, OOM, 5xx) plus the platform failures seen in 52 agent-declined
# fix runs. Kept out of INFRA_TEXT: the exhausted-PR classifier deliberately routes a rate-limited
# design gate to a model (test_engineering_credential_removal_is_not_a_founder_gate).
PLATFORM_TEXT = re.compile(
    remediation.INFRA_TEXT.pattern + r"|API rate limit exceeded|HTTP 408|you must provide a token|"
    r"timed out fetching|lost communication with the server|ECONNRESET", re.IGNORECASE)
QUOTA_TEXT = re.compile(r"github-quota-deferred|Fleet rule evidence is (?:missing|deferred)", re.IGNORECASE)
UNWIRED = re.compile(r"Unwired: (.+?)\. Wire each file into a ci-fast lane")
ATOMIC_TEXT = re.compile(r"use atomic_state\.atomic_write_text for whole-file state")
BODY_TEXT = re.compile(r"red-before-green:|PR body is missing|missing (?:a )?`?## ?(?:Red-before-green|Blast radius)",
                       re.IGNORECASE)
# Source Validation's customer-outcome step. The PR template's internal decision; a public note
# is an author choice and is never invented here. Only the missing-note failure matches.
CHANGELOG_MISSING = re.compile(r"Customer outcome decision missing or invalid \(missing-metadata\)")
INTERNAL_CHANGELOG_NOTE = '<!-- customer-changelog/v1 {"releaseWorthy":false} -->'

# (class, pattern, action). First match wins per check; order is most specific first.
SIGNATURES = (
    ("quota-deferred", QUOTA_TEXT, RERUN),
    ("platform-infra", PLATFORM_TEXT, RERUN),
    ("changelog-decision", CHANGELOG_MISSING, STAMP_CHANGELOG),
    ("migration-number", migration_renumber.LOG_TEXT, RENUMBER),
    ("ci-fast-wiring", UNWIRED, WIRE_CI_FAST),
    ("atomic-write", ATOMIC_TEXT, AGENT),
    ("pr-body", BODY_TEXT, AGENT),
)
BEHIND_CLASS = "stale-branch"
AGGREGATE = ("pr ready", "ci summary", "rollup")
RED = frozenset({"FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "CANCELLED", "ERROR"})
LLM_VERDICTS = frozenset({"fix-pushed", "fix-no-change", "cancelled", "failed"})
DEFAULT_BREAKER_N, MAX_BREAKER_N, MIN_CELL_RUNS = 2, 3, 10


def error_signature(text: str) -> str:
    """The first error-looking line with volatile tokens removed, so two runs of one failure match."""
    for line in str(text or "").splitlines():
        if re.search(r"\b(error|fail(?:ed|ure)?|assert|expected|unwired|violation)\b", line, re.IGNORECASE):
            line = re.sub(r"^\S*\d{4}-\d\d-\d\dT[\d:.]+Z\s*", "", line.strip())
            line = re.sub(r"\b[0-9a-f]{7,40}\b|\d+", "#", line)
            return re.sub(r"\s+", " ", line)[:120]
    return ""


def real_failures(pr: dict) -> list[dict]:
    return [check for check in pr.get("statusCheckRollup") or []
            if str(check.get("conclusion") or "").upper() in RED and str(check.get("name") or "").lower() not in AGGREGATE]


def fingerprint_key(cls: str, names: list[str], signature: str = "") -> str:
    parts = [cls, *sorted({re.sub(r"\s+", " ", str(name)).strip().lower() for name in names})]
    if cls in {"other", "mixed"}:
        parts.append(signature)
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:12]


def classify(pr: dict, logs: dict[str, str] | None = None) -> dict:
    """{cls, key, action, checks, signature, files}. `logs` maps a failing check name to its failed-job log;
    a check with no log is `other`. A BEHIND branch with nothing deterministic to say is `stale-branch`."""
    logs = logs or {}
    names = sorted({str(check.get("name")) for check in real_failures(pr)})
    per_check = []
    for name in names:
        text = logs.get(name) or ""
        hit = next(((cls, action) for cls, pattern, action in SIGNATURES if pattern.search(text)), None)
        per_check.append(hit or ("other", AGENT))
    classes = {cls for cls, _ in per_check}
    if len(classes) == 1:
        cls, action = per_check[0]
    elif classes:
        cls, action = "mixed", AGENT
    else:
        cls, action = "other", AGENT
    signature = error_signature("\n".join(logs.get(name) or "" for name in names)) if cls in {"other", "mixed"} else ""
    if cls in {"other", "mixed"} and pr.get("mergeStateStatus") == "BEHIND":
        cls, action = BEHIND_CLASS, SYNC_MAIN
    files = []
    if cls == "ci-fast-wiring":
        for name in names:
            found = UNWIRED.search(logs.get(name) or "")
            files.extend(item.strip() for item in (found.group(1).split(",") if found else []) if item.strip())
        files = sorted(set(files))
    return {"schema": SCHEMA, "cls": cls, "key": fingerprint_key(cls, names, signature), "action": action,
            "checks": names, "signature": signature, "files": files}


def stamp_internal_changelog(body: str | None) -> str | None:
    """Append the template internal decision when the body has no customer-changelog note.

    None when a note is already present. Malformed, ambiguous, and public notes stay with a
    model. `releaseWorthy:false` does not invent a public changelog entry. `gh --jq .body`
    prints the literal `null` for an empty body.
    """
    text = "" if body is None else str(body)
    if text.strip() == "null":
        text = ""
    if "customer-changelog/v1" in text:
        return None
    separated = text.rstrip() + ("\n\n" if text.strip() else "")
    return separated + INTERNAL_CHANGELOG_NOTE + "\n"


def wire_ci_fast(root: Path, files: list[str]) -> list[str]:
    """Append each unwired script test to the matching ci-fast list; return the files added. A file that
    is missing, already listed or outside scripts/ is left alone (the model path handles it)."""
    lanes = Path(root) / "scripts/ci-fast-lanes.mjs"
    try:
        text = lanes.read_text()
    except OSError:
        return []
    added = []
    for rel in files:
        if not re.fullmatch(r"scripts/[\w./-]+\.test\.(?:mjs|mts|js|ts)", rel) or ".." in rel \
                or not (Path(root) / rel).is_file() or f"'{rel}'" in text:
            continue
        source = (Path(root) / rel).read_text(errors="replace")
        name = "SCRIPT_CONTRACT_VITEST_TESTS" if re.search(r"""from ['"]vitest['"]""", source) else "SCRIPT_CONTRACT_NODE_TESTS"
        match = re.search(rf"(export const {name} = Object\.freeze\(\[\n(?:.*\n)*?)(\]\);)", text)
        if not match:
            continue
        text = text[:match.end(1)] + f"  '{rel}',\n" + text[match.end(1):]
        added.append(rel)
    if added:
        atomic_write_text(lanes, text)
    return added


# ---- measurement ---------------------------------------------------------------------------------

def _epoch(row: dict) -> float | None:
    for key in ("startedAt", "endedAt"):
        try:
            return datetime.fromisoformat(str(row.get(key)).replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
    return None


def historic_key(row: dict) -> str:
    """Ledger rows keep the failing check names, not the log: coarser than the live fingerprint, stable."""
    source = row.get("requestSource") or {}
    names = [name for name, verdict in source.get("checks") or []
             if str(verdict).upper() in RED and str(name).lower() not in AGGREGATE]
    kinds = ",".join(source.get("eventKinds") or [])
    return fingerprint_key("history", names or [f"event:{kinds}"])


def fix_rows(rows: list[dict]) -> list[dict]:
    return sorted((row for row in rows if row.get("kind") == "fix-red"), key=lambda row: _epoch(row) or 0.0)


def breaker_n(rows: list[dict]) -> int:
    """How many no-push LLM runs on one (PR, fingerprint) before the next run is not worth paying for:
    the smallest k where the push rate after k misses falls to half the first-run rate (cells of at least
    MIN_CELL_RUNS runs), else the default. Measured from the ledger so it follows the fleet."""
    seen = defaultdict(int)
    cells = defaultdict(lambda: [0, 0])
    for row in fix_rows(rows):
        if row.get("verdict") not in LLM_VERDICTS or row.get("attemptRefunded"):
            continue
        group = (row.get("pr"), historic_key(row))
        misses = min(seen[group], MAX_BREAKER_N + 2)
        pushed = row.get("verdict") == "fix-pushed"
        cells[misses][0] += 1
        cells[misses][1] += pushed
        seen[group] = 0 if pushed else seen[group] + 1
    first = cells[0]
    if first[0] < MIN_CELL_RUNS or not first[1]:
        return DEFAULT_BREAKER_N
    base = first[1] / first[0]
    for k in range(2, MAX_BREAKER_N + 1):  # 1 would stop after a single miss: the key is coarse
        runs, pushes = cells[k]
        if runs >= MIN_CELL_RUNS and pushes / runs <= base / 2:
            return k
    return DEFAULT_BREAKER_N


def measure(rows: list[dict], now: float, days: int = 5, cost_per_run: dict | None = None,
            merged_prs: set | None = None) -> dict:
    """Fix-red runs/day, push rate and $ per fix push (and per merged fix when `merged_prs` is given) over
    the last `days`. `cost_per_run` maps lane name to USD per run (capacity-metrics.json costUsd / runs)."""
    cost_per_run = cost_per_run or {}
    window = [row for row in fix_rows(rows) if (_epoch(row) or 0) >= now - days * 86400]
    llm = [row for row in window if row.get("verdict") in LLM_VERDICTS and not row.get("attemptRefunded")]
    routed = [row for row in window if str((row.get("reasons") or [""])[0]).startswith(
        ("infra-rerun:", "stamped-changelog:"))]
    pushed = [row for row in llm if row.get("verdict") == "fix-pushed"]
    spend = sum(float(cost_per_run.get(row.get("provider")) or 0) for row in llm)
    merged = {row.get("pr") for row in pushed if merged_prs is not None and row.get("pr") in merged_prs}
    by_class = defaultdict(int)
    for row in routed:
        by_class[str(row["reasons"][0]).split(":", 1)[1].split("+")[0][:40]] += 1
    return {"windowDays": days, "fixRedRuns": len(window), "llmRuns": len(llm), "llmRunsPerDay": round(len(llm) / days, 1),
            "routedWithoutModel": len(routed), "routedByClass": dict(by_class), "pushed": len(pushed),
            "pushRate": round(len(pushed) / len(llm), 3) if llm else None, "spendUsd": round(spend, 2),
            "usdPerPush": round(spend / len(pushed), 2) if pushed and spend else None,
            "usdPerMergedFix": round(spend / len(merged), 2) if merged and spend else None,
            "mergedFixes": len(merged) if merged_prs is not None else None, "breakerN": breaker_n(rows)}


def read_ledger(state: Path) -> list[dict]:
    rows = []
    runs = Path(state) / "runs"
    for path in [*sorted((runs / "ledger-archive").glob("ledger-*.jsonl")), runs / "ledger.jsonl"]:
        try:
            lines = path.read_text(errors="replace").splitlines()
        except OSError:
            continue
        for line in lines:
            if line.startswith("{"):
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
    return rows


def costs_from_metrics(state: Path) -> dict:
    """Lane name -> USD per run, from the capacity metrics the doctor already writes."""
    try:
        data = json.loads((Path(state) / "capacity-metrics.json").read_text())
    except (OSError, ValueError):
        return {}
    lanes = {"openai-codex": "codex", "xai-grok": "grok", "hyperagent": "hyperagent", "anthropic-claude": "claude"}
    out = {}
    for name, row in (data.get("providers") or {}).items():
        if isinstance(row.get("costUsd"), (int, float)) and row.get("runs"):
            out[lanes.get(name, name)] = row["costUsd"] / row["runs"]
    return out


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=["measure"])
    parser.add_argument("--state", default=str(Path.home() / ".local/state/jovie-lanes"))
    parser.add_argument("--days", type=int, default=5)
    parser.add_argument("--now", type=float, default=None)
    args = parser.parse_args(argv)
    now = args.now or datetime.now(timezone.utc).timestamp()
    print(json.dumps(measure(read_ledger(Path(args.state)), now, args.days, costs_from_metrics(Path(args.state))), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
