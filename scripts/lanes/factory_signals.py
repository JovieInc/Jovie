#!/usr/bin/env python3
"""Adapters that turn the fleet's own signals into `jovie-factory-signal/v1` files (factory_intake.py).

- sentinel: a doctor alert that recurs on >= RECUR_DAYS distinct days has a root cause nobody fixed
  (the doctor's Tracker issue closes when the condition clears, so it never asks for the fix).
- cheap-fixer: >= HANDOFF_MIN receipts for one failure class that handed off instead of fixing.
- audit: rows of factory-audit/SYNTHESIS.md the active workers do not already own; the acceptance
  criteria and metric are curated per row (a table row cannot carry them), a row without a curated
  entry is reported, never filed.

`write` is idempotent (one file per fingerprint) and prints what it wrote or skipped.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import pathlib as _pl, sys as _sys  # noqa: E402
_sys.path[:0] = [p for p in [str(_pl.Path(__file__).resolve().parent)] if p not in _sys.path]  # sibling module of the release
from atomic_state import atomic_write_text  # noqa: E402
import factory_intake  # noqa: E402  (shared receipt identity and legacy episode formatting)

SCHEMA = "jovie-factory-signal/v1"
RECUR_DAYS = 3
HANDOFF_MIN = 5
IGNORED_ALERTS = frozenset({"orphan-prs", "aged-prs"})   # per-PR housekeeping, not factory faults


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "x"


def sentinel_signals(state: Path, now: datetime | None = None) -> list[dict]:
    """Counts distinct UTC days each doctor alert key was seen (kept in factory-recurrence.json)."""
    now = now or datetime.now(timezone.utc)
    today = now.replace(tzinfo=now.tzinfo or timezone.utc).astimezone(timezone.utc).date()
    cutoff = today - timedelta(days=13)
    try:
        alerts = json.loads((state / "doctor.json").read_text()).get("alerts") or {}
    except (OSError, ValueError):
        return []
    path = state / "factory-recurrence.json"
    try:
        seen = json.loads(path.read_text())
    except (OSError, ValueError):
        seen = {}
    # Persist only distinct calendar days in the inclusive UTC window, including cleared keys.
    cleaned = {}
    for key, days in (seen.items() if isinstance(seen, dict) else []):
        recent = set()
        for day in days if isinstance(days, list) else []:
            if not isinstance(day, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
                continue
            try:
                observed = date.fromisoformat(day)
            except ValueError:
                continue
            if cutoff <= observed <= today:
                recent.add(day)
        cleaned[key] = sorted(recent)
    seen = cleaned
    day = today.isoformat()
    for key in alerts:
        days = seen.setdefault(key.split(":")[0] if key.startswith("pr-inventory") else key, [])
        if day not in days:
            days.append(day)
        days.sort()
    atomic_write_text(path, json.dumps(seen))
    out = []
    for key, days in sorted(seen.items()):
        if key in alerts and key.split(":")[0] not in IGNORED_ALERTS and len(days) >= RECUR_DAYS:
            out.append({"schema": SCHEMA, "fingerprint": f"sentinel-{slug(key)}", "source": "doctor-sentinel", "evidence": {"days": days},
                        "title": f"Fix the root cause of the recurring `{key}` alarm",
                        "problem": f"The doctor alert `{key}` fired on {len(days)} of the last 14 days ({', '.join(days[-5:])}). "
                                   f"Latest text: {str(alerts[key])[:400]}. A tracker issue closes when the condition clears, "
                                   "so nothing has removed the cause.",
                        "acceptance": ["The cause is identified from state/ledger evidence and fixed in code or config, not by "
                                       "raising a threshold or muting the alert",
                                       "A hermetic test reproduces the condition and fails without the fix",
                                       f"The `{key}` alert does not fire for 7 consecutive days after install"],
                        "metric": {"name": f"days per 14 with `{key}` firing", "baseline": len(days), "target": 0,
                                   "measuredBy": "state/factory-recurrence.json via factory_signals.py sentinel"}})
    return out


def cheap_fixer_signals(receipt_dir: Path) -> list[dict]:
    groups: dict[tuple, list] = defaultdict(list)
    totals: Counter = Counter()
    # The root receipt matches both globs; resolve aliases before counting observations.
    paths = {p.resolve() for p in [*receipt_dir.glob("**/receipt.json"), *receipt_dir.glob("*.json")]}
    for path in sorted(paths):
        try:
            row = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        if not isinstance(row, dict) or row.get("schema") != "jovie-cheap-fixer-receipt/v1":
            continue
        cls = row.get("failureClass") or "unknown"
        outcome = row.get("outcome", "")
        match = row.get("classMatch") or ""
        if not all(isinstance(value, str) for value in (cls, outcome, match)) or not outcome:
            continue
        totals[cls] += 1
        # handoff-unfixable-class is the designed answer for infra/metadata/unknown failures, not a gap
        if outcome.startswith("handoff") and "unfixable" not in outcome:
            groups[(cls, outcome)].append((os.path.relpath(path, receipt_dir.resolve()), match))
    out = []
    for (cls, outcome), matches in sorted(groups.items()):
        if len(matches) < HANDOFF_MIN:
            continue
        top = Counter(match for _, match in matches).most_common(3)
        share = round(len(matches) / totals[cls], 2)
        out.append({"schema": SCHEMA, "fingerprint": f"cheap-fixer-{slug(cls)}-{slug(outcome)}", "source": "cheap-fixer",
                    "evidence": {"receipts": [path for path, _ in matches]},
                    "title": f"Cheap fixer: stop handing off `{cls}` failures ({outcome})",
                    "problem": f"{len(matches)} of {totals[cls]} `{cls}` red checks ended `{outcome}` instead of a fix. "
                               f"Most common class matches: {top}. Each handoff spends a stronger model and a seat.",
                    "acceptance": [f"The deterministic or cheap-model rung handles the top class match `{top[0][0] or cls}`",
                                   "Replay of the saved receipts shows the handoff share for this class and outcome fell",
                                   "No increase in fixes that fail CI after push (approved fixes stay >= 95% green)"],
                    "metric": {"name": f"{cls} {outcome} share of {cls} receipts", "baseline": share, "target": round(share / 2, 2),
                               "measuredBy": "cheap-fixer receipt replay"}})
    return out


# Rows of SYNTHESIS.md the active workers already own (run-waste, closed-loop, CI-capacity, golden path).
AUDIT_OWNED = frozenset({2, 3, 4, 6, 7, 8, 9})
AUDIT_CURATED = {
    1: {"title": "Native holds: propose ruleset non_fast_forward beyond main, a required hold check, and non-expiring human holds",
        "acceptance": ["Impact on lane branches is evaluated first: list every lane/agent flow that force-pushes or rebases a non-main ref "
                       "(lane-fix branches, epics, Graphite) and show each survives a `non_fast_forward` rule on refs/heads/**",
                       "A written proposal (ruleset JSON diff, cutover plan, rollback) is opened as a PR for review; the ruleset is NOT changed by this issue",
                       "Human hold labels stop expiring (epics.HOLD_EXPIRY_S, pr_events.HUMAN_HOLD_LABELS) with a test, or the "
                       "proposal says why not"],
        "metric": {"name": "holds lost to expiry or force-push per week", "baseline": "unmeasured (count first)", "target": 0,
                   "measuredBy": "fleet_ledger.py gates + hold expiry events in the run ledger"}},
    5: {"title": "Scoped per-family GitHub App tokens instead of the shared lane principal (relates to #23060)",
        "acceptance": ["Inventory every lane/automation token and the permissions each actually uses (canon/agent-identities.json, "
                       "codex_lane.py, claude_lane.py)",
                       "Each family (codex, claude, grok, hyperagent, cheap-fixer, doctor) gets a token scoped to its repos and permissions, "
                       "or an issue explains the blocker; no change reduces the lanes' ability to push and open PRs",
                       "The sandbox/approval-bypass flags are replaced or each remaining use is justified in code with a test"],
        "metric": {"name": "automation principals with repo-wide write they do not use", "baseline": "unmeasured (inventory first)",
                   "target": 0, "measuredBy": "token permission inventory vs observed API calls (api-ledger)"}},
    10: {"title": "Reconcile .claude/rules/release.md with scripts/lanes/README.md on who enrolls PRs",
         "acceptance": ["Decide from code which statement is true (the enroll workflow is the sole queue writer per the lanes README)",
                        "Both documents state the same rule; rule-scopes.json hashes are refreshed",
                        "A test or check fails when the two documents contradict on the enrollment owner"],
         "metric": {"name": "contradictory statements about queue enrollment", "baseline": 1, "target": 0,
                    "measuredBy": "grep of both docs plus the new consistency check"}},
}
ROW = re.compile(r"^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*[^|]*\|\s*([\d.]+)\s*\|")


def audit_signals(synthesis: Path, owned=AUDIT_OWNED, curated=AUDIT_CURATED) -> tuple[list[dict], list[int]]:
    out, uncurated = [], []
    for line in synthesis.read_text().splitlines():
        match = ROW.match(line)
        if not match:
            continue
        number = int(match.group(1))
        if number in owned:
            continue
        entry = curated.get(number)
        if entry is None:
            uncurated.append(number)
            continue
        out.append({"schema": SCHEMA, "fingerprint": f"audit-{number}-{slug(entry['title'])[:40]}",
                    "source": "factory-audit-synthesis", "title": entry["title"],
                    "problem": f"Factory audit item {number} (ROI {match.group(3)}): {match.group(2)[:1200]}",
                    "acceptance": entry["acceptance"], "metric": entry["metric"]})
    return out, uncurated


def write(state: Path, signals: list[dict]) -> dict:
    directory = state / "factory-signals"
    directory.mkdir(parents=True, exist_ok=True)
    written, kept = [], []
    for signal in signals:
        path = directory / f"{signal['fingerprint']}.json"
        previous = {}
        try:
            previous = json.loads(path.read_text())
            unchanged = isinstance(previous, dict) and {k: v for k, v in previous.items()
                                                       if k not in {"_observedAt", "_receiptHistory"}} == signal
        except (OSError, ValueError):
            unchanged = False
        (kept if unchanged else written).append(signal["fingerprint"])
        if not unchanged:
            # Persist observation time with the evidence so copying/restoring a signal is not a new observation.
            content = {**signal, "_observedAt": datetime.now(timezone.utc).isoformat()}
            previous = previous if isinstance(previous, dict) else {}
            history = factory_intake.receipt_history(previous)
            if "_receiptHistory" not in previous and factory_intake.receipt_keys(previous) and \
                    factory_intake.validate(previous) is None:
                # Retain the one pre-upgrade receipt set before refreshing an old signal.
                # It binds an opaque legacy digest/body to the observations it covered.
                description = factory_intake.body(previous)
                history[factory_intake.EVIDENCE.search(description)[1]] = description
            if factory_intake.receipt_keys(signal) or history:
                content["_receiptHistory"] = history
            atomic_write_text(path, json.dumps(content, indent=1))
    return {"written": written, "alreadyPresent": kept}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--state", default=os.environ.get("LANES_STATE") or str(Path.home() / ".local/state/jovie-lanes"))
    parser.add_argument("--synthesis", help="path to factory-audit SYNTHESIS.md")
    parser.add_argument("--cheap-fixer", help="directory of cheap-fixer receipts")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    state = Path(args.state)
    signals = sentinel_signals(state)
    skipped: dict = {}
    if args.cheap_fixer:
        signals += cheap_fixer_signals(Path(args.cheap_fixer))
    if args.synthesis:
        audit, skipped["auditNeedsCuratedAcceptance"] = audit_signals(Path(args.synthesis))
        signals += audit
    result = {"signals": [s["fingerprint"] for s in signals], **skipped}
    if not args.dry_run:
        result.update(write(state, signals))
    print(json.dumps(result, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
