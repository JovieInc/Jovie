#!/usr/bin/env python3
"""Machine metrics for the lanes doctor: are we building machines, or doing one-offs?

Written by the doctor every few hours (`machine-metrics.json`, plus `fix-red-metrics.json` which the lanes read
for the measured fingerprint breaker); a few small fields go to the public feed for Ovie.

  machineMergeShare        merged PRs in the last 7 days made by a machine path (bot generators, deterministic
                           fixers, PRs whose body says `Machine: built`) over all merged PRs
  recurringFingerprints    classes of work seen 3+ times in 14 days (machine_gap ledger)
  costPerMergedByClass     fix vs new: model-run cost per merged PR (lane receipts, amortized per-run cost)
  daysTo3rdRepeatToMachine median days from a fingerprint's 3rd occurrence to its first merged machine

Pure `build()`; `refresh()` does the single bounded GitHub read (apiclient) and the writes.
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import machine_gap
from atomic_state import atomic_write_text

SCHEMA = "jovie-machine-metrics/v1"
FILE, FIX_FILE, DAILY_FILE = "machine-metrics.json", "fix-red-metrics.json", "machine-daily.jsonl"
REFRESH_S = 6 * 3600
WINDOW_DAYS = 7
PUBLIC_MAX_BYTES = 1200
BOT_AUTHORS = frozenset({"dependabot", "dependabot[bot]", "jovie-bot", "github-actions[bot]", "app/jovie-bot"})
DETERMINISTIC_RESOLUTIONS = frozenset({"wired-ci-fast", "generated-regenerated", "snapped-spacing"})
QUERY = ('query($q:String!,$after:String){search(query:$q,type:ISSUE,first:100,after:$after){'
         'pageInfo{hasNextPage endCursor} nodes{... on PullRequest{number mergedAt body author{login}}}}}')
MAX_PAGES = 4


def _epoch(value) -> float | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _pr_of(row: dict):
    return row.get("pr") or (row.get("result") or {}).get("pr")


def build(rows: list[dict], merged: list[dict], fp_rows: list[dict], now: float, cost_per_run: dict | None = None) -> dict:
    """Metrics from ledger rows, merged PRs [{number, author, body, mergedAt}] and the fingerprint ledger."""
    cost_per_run = cost_per_run or {}
    since = now - WINDOW_DAYS * 86400
    window = [pr for pr in merged if (_epoch(pr.get("mergedAt")) or 0) >= since]
    machine_prs = {_pr_of(row) for row in rows if row.get("kind") == "fix-red"
                   and (row.get("resolution") in DETERMINISTIC_RESOLUTIONS
                        or str((row.get("reasons") or [""])[0]).startswith("infra-rerun:"))}
    built = {pr["number"] for pr in window if re.search(r"^machine:\s*built\b", str(pr.get("body") or ""), re.I | re.M)}
    made = {pr["number"] for pr in window if str(pr.get("author") or "").lower() in BOT_AUTHORS
            or pr["number"] in machine_prs or pr["number"] in built}
    merged_numbers = {pr["number"] for pr in window}
    spend = {"fix": 0.0, "new": 0.0}
    landed = {"fix": set(), "new": set()}
    for row in rows:
        cls = "fix" if row.get("kind") == "fix-red" else "new" if row.get("kind") in {None, "issue", "binding-issue"} and row.get("issue") else None
        stamp = _epoch(row.get("startedAt") or row.get("endedAt"))
        if cls is None or stamp is None or stamp < since or row.get("attemptRefunded"):
            continue
        spend[cls] += float(cost_per_run.get(row.get("provider")) or 0)
        number = _pr_of(row)
        if number in merged_numbers:
            landed[cls].add(number)
    by_class = {cls: (round(spend[cls] / len(landed[cls]), 2) if landed[cls] and spend[cls] else None) for cls in spend}
    recurring = _recurring(fp_rows, now)
    return {"schema": SCHEMA, "at": datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "windowDays": WINDOW_DAYS, "merged": len(window), "machineMade": len(made), "machineBuilt": len(built),
            "machineMergeShare": round(len(made) / len(window), 3) if window else None,
            "recurringFingerprints": len(recurring), "topRecurring": sorted(recurring.items(), key=lambda kv: -kv[1])[:3],
            "costPerMergedByClass": by_class, "daysTo3rdRepeatToMachine": _days_to_machine(fp_rows)}


def _recurring(fp_rows: list[dict], now: float) -> dict:
    counts: dict[str, set] = {}
    for row in fp_rows:
        if now - float(row.get("at", 0)) < machine_gap.WINDOW_S and not row.get("machine"):
            counts.setdefault(row["fp"], set()).add(row.get("subject"))
    return {fp: len(subjects) for fp, subjects in counts.items() if len(subjects) >= machine_gap.RECUR_N}


def _days_to_machine(fp_rows: list[dict]) -> float | None:
    by_fp: dict[str, list[dict]] = {}
    for row in fp_rows:
        by_fp.setdefault(row["fp"], []).append(row)
    gaps = []
    for rows in by_fp.values():
        plain = sorted(float(r["at"]) for r in rows if not r.get("machine"))
        built = sorted(float(r["at"]) for r in rows if r.get("machine"))
        if len(plain) >= machine_gap.RECUR_N and built:
            gaps.append(max(0.0, built[0] - plain[machine_gap.RECUR_N - 1]) / 86400)
    if not gaps:
        return None
    gaps.sort()
    return round(gaps[len(gaps) // 2], 1)


def public_block(record: dict | None) -> dict:
    """Small fields only (the public feed has a byte cap): no per-PR rows, bounded top list."""
    record = record or {}
    block = {key: record.get(key) for key in ("at", "machineMergeShare", "machineMade", "merged", "recurringFingerprints",
                                              "costPerMergedByClass", "daysTo3rdRepeatToMachine", "daily")}
    block["topRecurring"] = [[str(fp)[:24], n] for fp, n in (record.get("topRecurring") or [])[:3]]
    text = json.dumps(block, separators=(",", ":"))
    return block if len(text.encode()) <= PUBLIC_MAX_BYTES else {"at": record.get("at"), "truncated": True}


def fetch_merged(since: float, run=None) -> list[dict]:
    """Merged PRs since `since` with bodies: at most MAX_PAGES budgeted GitHub reads, once per refresh."""
    if run is None:
        from apiclient.gh import run_gh
        run = lambda args: run_gh(args, priority="low")
    stamp = datetime.fromtimestamp(since, timezone.utc).strftime("%Y-%m-%d")
    out, after = [], None
    for _ in range(MAX_PAGES):
        args = ["api", "graphql", "-f", f"query={QUERY}", "-f", f"q=repo:JovieInc/Jovie is:pr is:merged merged:>={stamp}"]
        if after:
            args += ["-f", f"after={after}"]
        result = run(args)
        if result.get("code") != 0:
            return out
        page = json.loads(result["stdout"])["data"]["search"]
        out += [{"number": n["number"], "mergedAt": n.get("mergedAt"), "body": n.get("body") or "",
                 "author": (n.get("author") or {}).get("login")} for n in page["nodes"] if n.get("number")]
        if not page["pageInfo"]["hasNextPage"]:
            break
        after = page["pageInfo"]["endCursor"]
    return out


def daily_row(state: Path, rows: list[dict], record: dict, costs: dict, now: float) -> dict | None:
    """The reading nobody has to remember: once per UTC day, the previous day's fix-red model runs, push rate and
    routed-without-model count (fix_red_classes, when installed) with the machine-made share, appended to
    machine-daily.jsonl and returned for the feed. None when yesterday's row already exists."""
    midnight = now - (now % 86400)
    day = datetime.fromtimestamp(midnight - 1, timezone.utc).strftime("%Y-%m-%d")
    path = Path(state) / DAILY_FILE
    try:
        have = [json.loads(line) for line in path.read_text().splitlines() if line.startswith("{")]
    except (OSError, ValueError):
        have = []
    if any(row.get("date") == day for row in have):
        return have[-1]
    row = {"date": day, "machineMergeShare": record.get("machineMergeShare"), "machineMade": record.get("machineMade"),
           "merged": record.get("merged"), "fixRedLlmRuns": None, "fixRedPushRate": None, "fixRedRouted": None}
    try:
        import fix_red_classes
        measured = fix_red_classes.measure(rows, midnight, 1, costs)
        row.update(fixRedLlmRuns=measured["llmRuns"], fixRedPushRate=measured["pushRate"],
                   fixRedRouted=measured["routedWithoutModel"])
    except Exception:  # fix-red classes are optional here; the share still lands
        pass
    try:
        with open(path, "a") as out:
            out.write(json.dumps(row) + "\n")
    except OSError:
        pass
    return row


def read(state: Path) -> dict | None:
    try:
        data = json.loads((Path(state) / FILE).read_text())
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def refresh(state: Path, now: float | None = None, fetch=None, force: bool = False) -> dict | None:
    """Rebuild and write both metric files when the last build is older than REFRESH_S. Never raises."""
    now = time.time() if now is None else now
    state = Path(state)
    previous = read(state)
    if previous and not force and now - (_epoch(previous.get("at")) or 0) < REFRESH_S:
        return previous
    try:
        import fix_red_classes
        rows = fix_red_classes.read_ledger(state)
        costs = fix_red_classes.costs_from_metrics(state)
        fix_record = {"at": now, "breakerN": fix_red_classes.breaker_n(rows),
                      "measure": fix_red_classes.measure(rows, now, 5, costs)}
        atomic_write_text(state / FIX_FILE, json.dumps(fix_record))
    except Exception:  # fix-red classes are an optional input of this report
        rows, costs = _ledger_rows(state), {}
    if fetch is None and (os.environ.get("LANES_MACHINE_METRICS") == "off" or not (state / "runs" / "ledger.jsonl").exists()):
        return previous  # no lane history here (a fixture, a fresh host) or switched off: no GitHub read
    try:
        merged = (fetch or fetch_merged)(now - WINDOW_DAYS * 86400)
        for pr in merged:  # a merged `Machine: built` PR closes its fingerprint's repeat clock
            if re.search(r"^machine:\s*built\b", pr.get("body") or "", re.I | re.M):
                for row in rows:
                    gate = row.get("machineGate") or {}
                    if _pr_of(row) == pr["number"] and gate.get("fp"):
                        machine_gap.record(state, gate["fp"], "machine", f"PR{pr['number']}", machine=True,
                                           now=_epoch(pr.get("mergedAt")) or now)
        record = build(rows, merged, machine_gap.read(state), now, costs)
        record["daily"] = daily_row(state, rows, record, costs, now)
        atomic_write_text(state / FILE, json.dumps(record))
        return record
    except Exception:
        return previous


def _ledger_rows(state: Path) -> list[dict]:
    rows = []
    try:
        for line in (Path(state) / "runs" / "ledger.jsonl").read_text(errors="replace").splitlines():
            if line.startswith("{"):
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
    except OSError:
        pass
    return rows
