"""Merge-to-production lag, measured from real deploys (Tim/lead 2026-10-25: alarms come from measured data).

For every successful production deploy that followed a successful deploy, one GitHub compare of the previous
deploy's head to this one gives the batch size (commits) and the age of its oldest commit at deploy completion.
Samples accumulate in a state file (one compare per new deploy; a 7 day backfill is spread over ticks).

  * `lag_summary`: p50/p95 over the trailing 7 days, published as the tracked metric with its target.
  * `limits`: the alarm limits are the p95 of the trailing 7 days, recomputed weekly (frozen in between so an
    alarm cannot drift down with a degrading pipeline). Until a week of samples exists the measured seed
    constants in deploy_health.REPOS apply.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import throughput_sentinel as sentinel
from atomic_state import atomic_write_text

WEEK_S = 7 * 86400
KEEP_S = 14 * 86400
MIN_SAMPLES = 20
MAX_COMPARES_PER_PASS = 20
BACKLOG_PAGES = 5
# Proposed targets (the CI and quota work should drive the lag down to them): plain release is ~22 min, so p50 30
# and p95 90 minutes. The lead sets the final numbers.
TARGETS = {"p50Min": 30, "p95Min": 90}


def pct(values: list[float], fraction: float) -> float | None:
    ordered = sorted(values)
    if not ordered:
        return None
    position = (len(ordered) - 1) * fraction
    low = math.floor(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def pairs(runs: list[dict]) -> list[tuple[dict, dict]]:
    """(previous success, success) for every success that directly followed a success, oldest first."""
    real = sorted((r for r in runs if r.get("conclusion") == "success" or r.get("conclusion") in ("failure", "timed_out", "startup_failure")),
                  key=lambda r: str(r.get("created_at")))
    out = []
    for before, after in zip(real, real[1:]):
        if before.get("conclusion") == "success" and after.get("conclusion") == "success" and before.get("head_sha") and after.get("head_sha"):
            out.append((before, after))
    return out


def load(state_dir: Path, label: str) -> dict:
    try:
        data = json.loads((Path(state_dir) / f"deploy-lag-{label}.json").read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save(state_dir: Path, label: str, store: dict) -> None:
    try:
        atomic_write_text(Path(state_dir) / f"deploy-lag-{label}.json", json.dumps(store, sort_keys=True))
    except OSError:
        pass


def collect(store: dict, repo: str, runs: list[dict], now: float, gh) -> dict:
    """Add a sample per unseen deploy pair (newest first, at most MAX_COMPARES_PER_PASS compares)."""
    samples = [s for s in store.get("samples") or [] if now - s.get("at", 0) <= KEEP_S]
    seen = {s["id"] for s in samples}
    rid = lambda row: row.get("id") or row.get("created_at")  # noqa: E731
    todo = [(b, a) for b, a in reversed(pairs(runs)) if rid(a) not in seen
            and (sentinel._iso_epoch(a.get("updated_at") or a.get("created_at")) or 0) >= now - WEEK_S]
    for before, after in todo[:MAX_COMPARES_PER_PASS]:
        compare = gh(f"repos/{repo}/compare/{before['head_sha']}...{after['head_sha']}")
        commits = compare.get("commits") or []
        finished = sentinel._iso_epoch(after.get("updated_at") or after.get("created_at"))
        oldest = sentinel._iso_epoch(((commits[0] if commits else {}).get("commit") or {}).get("committer", {}).get("date"))
        if finished is None or oldest is None or not isinstance(compare.get("ahead_by"), int):
            samples.append({"id": rid(after), "at": finished or now, "commits": None, "ageS": None})
            continue
        samples.append({"id": rid(after), "at": finished, "commits": compare["ahead_by"], "ageS": max(0, int(finished - oldest))})
    store["samples"] = samples
    store["backlog"] = max(0, len(todo) - MAX_COMPARES_PER_PASS)
    return store


def window(store: dict, now: float) -> list[dict]:
    return [s for s in store.get("samples") or [] if now - s.get("at", 0) <= WEEK_S and isinstance(s.get("ageS"), int)]


def update_limits(store: dict, now: float) -> dict:
    """Recompute the alarm limits from the trailing 7 days once a week (and when none exist yet)."""
    current = store.get("limits")
    if current and current.get("complete") and now - current.get("computedAt", 0) < WEEK_S:
        return store
    rows = window(store, now)
    # Never freeze a week of limits from a partial backfill (the first live pass held only the newest 20 deploys).
    if len(rows) >= MIN_SAMPLES and not store.get("backlog"):
        store["limits"] = {"commits": math.ceil(pct([r["commits"] for r in rows], 0.95)),
                           "ageS": math.ceil(pct([r["ageS"] for r in rows], 0.95)), "computedAt": now, "n": len(rows), "complete": True}
    return store


def limits_or_seed(store: dict, seed_commits: int, seed_age_s: int) -> dict:
    limits = store.get("limits")
    if limits and limits.get("complete"):
        return {**limits, "source": "measured-7d"}
    return {"commits": seed_commits, "ageS": seed_age_s, "computedAt": None, "n": 0, "source": "seed"}


def record_release(store: dict, row: dict, now: float) -> dict:
    """Append one observed release (build-info SHA change) with its merge->production lead time; dedupe by SHA."""
    releases = [r for r in store.get("releases") or [] if now - r.get("at", 0) <= KEEP_S and r.get("id") != row["id"]]
    store["releases"] = [*releases, row]
    return store


def release_lead_times(store: dict, now: float) -> dict:
    """Per-release merge->production lead time (newest commit, and oldest commit in the batch) over 7 days."""
    rows = [r for r in store.get("releases") or [] if now - r.get("at", 0) <= WEEK_S and isinstance(r.get("leadTimeS"), int)]
    lead = [r["leadTimeS"] / 60 for r in rows]
    oldest = [r["oldestLeadTimeS"] / 60 for r in rows if isinstance(r.get("oldestLeadTimeS"), int)]
    rnd = lambda v: None if v is None else round(v)  # noqa: E731
    return {"n": len(rows), "p50Min": rnd(pct(lead, 0.5)), "p95Min": rnd(pct(lead, 0.95)),
            "oldestP50Min": rnd(pct(oldest, 0.5)), "oldestP95Min": rnd(pct(oldest, 0.95)),
            "last": rows[-1] if rows else None}


def lag_summary(store: dict, now: float) -> dict:
    rows = window(store, now)
    ages = [r["ageS"] / 60 for r in rows]
    p50, p95 = pct(ages, 0.5), pct(ages, 0.95)
    return {"p50Min": None if p50 is None else round(p50), "p95Min": None if p95 is None else round(p95), "n": len(rows),
            "targetP50Min": TARGETS["p50Min"], "targetP95Min": TARGETS["p95Min"],
            "releaseLeadTime": release_lead_times(store, now)}
