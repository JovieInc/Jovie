#!/usr/bin/env python3
"""The abstraction gate: build the machine when a class of work recurs or costs real money.

Gap (abstraction-gaps.md, 2026-10-25): 57% of merged PRs were fixes and nothing in the coder or
remediation prompts asked "should this be a machine?". Every run records a fingerprint of the class of
work it is doing; the third occurrence of a fingerprint inside 14 days, or work projected above 10 USD,
must build or extend the machine in the same PR, or file a `machine-gap` Linear issue and link it from
the PR body. Waivers: a one-time migration and an incident.

State: `<state>/machine-fingerprints.jsonl`, append-only rows
{"fp", "at", "source", "subject", "estUsd", "machine"}. Pure functions plus one append; no network.

    python3 machine_gap.py ledger [--state DIR]     # fingerprints at or past the threshold
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path

LEDGER = "machine-fingerprints.jsonl"
RECUR_N = 3                 # the 3rd occurrence must build the machine
WINDOW_S = 14 * 86400
COST_USD = 10.0             # projected spend above this must build the machine
WAIVER_LABELS = frozenset({"incident", "one-time-migration"})
WAIVER_TEXT = re.compile(r"machine-gap waiver:\s*(one-time-migration|incident)", re.IGNORECASE)
ESTIMATE_TEXT = re.compile(r"(?:est(?:imate)?[-_ ]?usd|estimated cost)[:= ]+\$?(\d+(?:\.\d+)?)", re.IGNORECASE)
STOP = frozenset({"the", "a", "an", "of", "to", "for", "in", "on", "and", "or", "fix", "feat", "chore", "test", "when", "with", "is", "not"})
MAX_BYTES = 4 * 1024 * 1024
MACHINE_LINE = re.compile(r"^(?:machine-gap|machine):\s*(\S.*)$", re.IGNORECASE | re.MULTILINE)


def fingerprint(title: str, labels=()) -> str:
    """Stable id for a class of work: an explicit `remediation:<fp>` / `factory-fp:<fp>` label, else the
    sorted content words of the title with ids and numbers removed."""
    for label in labels or ():
        name = str(label)
        for prefix in ("remediation:", "factory-fp:"):
            if name.lower().startswith(prefix):
                return name.split(":", 1)[1].strip()[:40]
    text = re.sub(r"\b[a-z]{2,5}-\d+\b|\b[0-9a-f]{7,40}\b|#?\d+", " ", str(title or "").lower())
    words = sorted({w for w in re.findall(r"[a-z][a-z-]{2,}", text) if w not in STOP})[:8]
    return hashlib.sha256(" ".join(words).encode()).hexdigest()[:12] if words else "unclassified"


def check_fingerprint(pr: dict) -> str:
    """Hash the failing check names. A CANCELLED sibling does not open a second class when a
    FAILURE or TIMED_OUT is present: Fleet Rules Evidence cancelled beside Source Validation
    recorded fix-red-6c3efaf400 on seven unrelated lane runs (2026-10-29..31). A rollup that
    is only cancelled still fingerprints those names."""
    red = {"FAILURE", "TIMED_OUT", "CANCELLED"}
    hard = {"FAILURE", "TIMED_OUT"}
    skip = {"pr ready", "ci summary"}
    checks = [c for c in pr.get("statusCheckRollup") or []
              if str(c.get("conclusion") or "").upper() in red and str(c.get("name") or "").lower() not in skip]
    if any(str(c.get("conclusion") or "").upper() in hard for c in checks):
        checks = [c for c in checks if str(c.get("conclusion") or "").upper() in hard]
    names = sorted({str(c.get("name")) for c in checks})
    return "fix-red-" + hashlib.sha256("|".join(names).encode()).hexdigest()[:10]


def read(state: Path) -> list[dict]:
    path = Path(state) / LEDGER
    try:
        if path.stat().st_size > MAX_BYTES:
            return []  # an oversized ledger is not read; the doctor reports it
        lines = path.read_text(errors="replace").splitlines()
    except OSError:
        return []
    rows = []
    for line in lines:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and row.get("fp"):
            rows.append(row)
    return rows


def record(state: Path, fp: str, source: str, subject: str, est_usd: float | None = None,
           machine: bool = False, now: float | None = None) -> None:
    """Append one occurrence (idempotent per fp+subject within the window)."""
    now = time.time() if now is None else now
    if any(r["fp"] == fp and r.get("subject") == subject and now - float(r.get("at", 0)) < WINDOW_S for r in read(state)):
        return
    row = {"fp": fp, "at": now, "source": source, "subject": subject, "estUsd": est_usd, "machine": machine}
    try:
        Path(state).mkdir(parents=True, exist_ok=True)
        with open(Path(state) / LEDGER, "a") as out:
            out.write(json.dumps(row) + "\n")  # one short append: atomic enough for a lock-free ledger
    except OSError:
        pass


def occurrences(rows: list[dict], fp: str, now: float) -> list[dict]:
    return [r for r in rows if r["fp"] == fp and now - float(r.get("at", 0)) < WINDOW_S]


def waiver(text: str, labels=()) -> str | None:
    hit = WAIVER_TEXT.search(str(text or ""))
    if hit:
        return hit.group(1).lower()
    found = {str(label).lower() for label in labels or ()} & WAIVER_LABELS
    return sorted(found)[0] if found else None


def decide(state: Path, fp: str, text: str = "", labels=(), est_usd: float | None = None,
           now: float | None = None) -> dict:
    """{fp, required, reason, occurrences, projectedUsd, waived}. `occurrences` counts this run (the Nth)."""
    now = time.time() if now is None else now
    prior = occurrences(read(state), fp, now)
    explicit = ESTIMATE_TEXT.search(str(text or ""))
    projected = max([float(explicit.group(1)) if explicit else 0.0,
                     sum(float(r.get("estUsd") or 0) for r in prior) + float(est_usd or 0)])
    count = len({r.get("subject") for r in prior}) + 1
    reason = "recurrence" if count >= RECUR_N else "cost" if projected > COST_USD else None
    waived = waiver(text, labels)
    return {"fp": fp, "required": bool(reason) and not waived, "reason": reason, "occurrences": count,
            "projectedUsd": round(projected, 2), "waived": waived if reason else None,
            "alreadyBuilt": any(r.get("machine") for r in prior)}


def clause(decision: dict) -> list[str]:
    """Prompt lines for coder, fix and remediation prompts. Always present; required when the gate trips."""
    head = ["## Abstraction gate (build the machine, not the thing)",
            f"- Work fingerprint `{decision['fp']}`: occurrence {decision['occurrences']} in 14 days, "
            f"projected spend {decision['projectedUsd']} USD."]
    if decision["required"]:
        why = ("this is the 3rd or later occurrence of this class of work in 14 days" if decision["reason"] == "recurrence"
               else f"the task is projected above {COST_USD:g} USD")
        return [*head, f"- REQUIRED: {why}. In this same PR build or extend the loop, generator, template, rule or",
                "  guard that does this class of work every time (extend an existing machine before writing a new",
                "  one), then use it for this instance. If that cannot fit in the diff cap, file a Linear issue labelled",
                "  `machine-gap` describing the machine and link it from the PR body. Put exactly one line in the PR body:",
                "  `Machine: built <path>` or `Machine-gap: <issue identifier>`.",
                "- Waivers (state `Machine-gap waiver: one-time-migration` or `incident` in the PR body): a one-time",
                "  migration and an incident are the only reasons to ship the one-off alone."]
    note = f" (waived: {decision['waived']})" if decision.get("waived") else ""
    return [*head, f"- Before one-off work, ask whether this class recurs. It does not trip the gate yet{note}; if you",
            "  already see it will, build or extend the machine anyway and say so in the PR body (`Machine: built <path>`)."]


def builder_dossier(fp: str, recurrences: int) -> str:
    """Prefix for a remediation event that has recurred: the task is the machine, not the instance."""
    return "\n".join([
        "## Machine-builder task (recurring remediation)",
        f"Event `{fp}` has recurred {recurrences} times in 14 days. Fixing this instance again is the wrong task.",
        "Find why it keeps happening and build or extend the machine that prevents or fixes the whole class:",
        "a guard (lint, invariant, test fixture), a deterministic fixer, or a loop that handles it without a",
        "model. Extend an existing machine (remediation sweep, lanes fix-red classes, system-1 evaluators)",
        "before writing a new one. Put `Machine: built <path>` in the PR body, or file a `machine-gap` Linear",
        "issue and link it as `Machine-gap: <identifier>` if the machine cannot fit in one PR.", ""])


def machine_line(body: str) -> str | None:
    hit = MACHINE_LINE.search(str(body or ""))
    return hit.group(1).strip() if hit else None


def recurring(state: Path, now: float | None = None) -> dict:
    """fp -> occurrences for fingerprints at or past RECUR_N inside the window."""
    now = time.time() if now is None else now
    counts: dict[str, set] = {}
    for row in read(state):
        if now - float(row.get("at", 0)) < WINDOW_S:
            counts.setdefault(row["fp"], set()).add(row.get("subject"))
    return {fp: len(subjects) for fp, subjects in counts.items() if len(subjects) >= RECUR_N}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=["ledger"])
    parser.add_argument("--state", default=str(Path.home() / ".local/state/jovie-lanes"))
    args = parser.parse_args(argv)
    print(json.dumps(recurring(Path(args.state)), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
