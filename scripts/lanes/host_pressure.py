#!/usr/bin/env python3
"""Host memory-pressure sentinel: catch an OOM storm before the kernel kills runners.

Reads /proc/pressure/memory (PSI) and /proc/meminfo, publishes `host-pressure.json` and appends a
change-only event to `host-alarms.jsonl` (same sentinel feed as disk headroom). Each alarm carries
the top memory holders (pid, rss, cgroup, command) so the culprit is named at the time, not
reconstructed from the kernel log afterwards (2026-10-24: a dozen `tsc --noEmit` at 3-4.5 GB each).

Also keeps a 7-day free-space history (`disk-forecast.json`) and raises a `host-disk-forecast` alarm
when the linear trend reaches the 5% critical floor within 7 days, before the threshold itself trips.

Also raises a change-only `host-load-storm` alarm when the 1-minute load average stays above
LOAD_MULT x cores (default 4x) for LOAD_SUSTAIN_S (default 120 s), naming the most numerous process
families and the defunct count (2026-11-01: a recursing preflight put Gem at load 1,661 with 194 copies
and 1,293 defunct processes, and nothing alerted at load 457 or 1,661). Override for drills with
JOVIE_LOAD_ALARM_MULT / JOVIE_LOAD_ALARM_SECS.

Levels: warn when PSI some avg10 >= 10 or MemAvailable < 8 GiB; crit when PSI some avg10 >= 25,
full avg10 >= 15, or MemAvailable < 4 GiB. Run from a timer every minute; it never kills anything.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
import pathlib as _pl, sys as _sys  # noqa: E402
_sys.path[:0] = [p for p in [str(_pl.Path(__file__).resolve().parent)] if p not in _sys.path]  # sibling module of the release
from atomic_state import atomic_write_text  # noqa: E402

GIB = 1 << 30
WARN_SOME, CRIT_SOME, CRIT_FULL = 10.0, 25.0, 15.0
WARN_AVAIL, CRIT_AVAIL = 8 * GIB, 4 * GIB


def parse_psi(text: str) -> dict:
    out = {}
    for line in text.splitlines():
        kind, *fields = line.split()
        out[kind] = {k: float(v) for k, v in (f.split("=") for f in fields) if k.startswith("avg")}
    return out


def mem_available(meminfo: str) -> int | None:
    for line in meminfo.splitlines():
        if line.startswith("MemAvailable:"):
            return int(line.split()[1]) * 1024
    return None


def level(psi: dict, avail: int | None) -> str:
    some, full = psi.get("some", {}).get("avg10", 0.0), psi.get("full", {}).get("avg10", 0.0)
    if some >= CRIT_SOME or full >= CRIT_FULL or (avail is not None and avail < CRIT_AVAIL):
        return "crit"
    if some >= WARN_SOME or (avail is not None and avail < WARN_AVAIL):
        return "warn"
    return "ok"


def top_holders(proc: Path = Path("/proc"), limit: int = 5) -> list[dict]:
    rows = []
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            rss = int((entry / "statm").read_text().split()[1]) * os.sysconf("SC_PAGE_SIZE")
            cmd = (entry / "cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace").strip()[:120]
            cgroup = (entry / "cgroup").read_text().strip().rsplit(":", 1)[-1]
        except (OSError, ValueError, IndexError):
            continue
        rows.append({"pid": int(entry.name), "rssMiB": rss >> 20, "cgroup": cgroup, "cmd": cmd})
    return sorted(rows, key=lambda r: -r["rssMiB"])[:limit]


def publish(state: Path, psi: dict, avail: int | None, now: float, holders=top_holders) -> dict:
    lvl = level(psi, avail)
    path = state / "host-pressure.json"
    try:
        before = json.loads(path.read_text()).get("level", "ok")
    except (OSError, ValueError, AttributeError):
        before = "ok"
    at = datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    row = {"at": at, "level": lvl, "psi": psi, "memAvailableGiB": None if avail is None else round(avail / GIB, 1)}
    state.mkdir(parents=True, exist_ok=True)
    atomic_write_text(path, json.dumps(row, indent=1))
    if lvl != before:
        event = {"kind": "host-memory-pressure", **row}
        if lvl != "ok":
            event["topHolders"] = holders()
        with open(state / "host-alarms.jsonl", "a") as handle:
            handle.write(json.dumps(event) + "\n")
    return row


# ---- disk forecast (2026-10-30: gem hit 5.5% free and stalled dispatch; the threshold alone is too late) ----
FORECAST_WINDOW_S = 7 * 86400
FORECAST_SAMPLE_S = 3600
FORECAST_MIN_SPAN_S = 6 * 3600
FORECAST_CRIT_FREE_PCT = 5.0  # disk_guard.CRITICAL_PCT: dispatch admission is refused at or below this
FORECAST_ALARM_DAYS = 7.0


def forecast_days(samples: list[list[float]], total: int, crit_pct: float = FORECAST_CRIT_FREE_PCT) -> float | None:
    """Days until free space reaches crit_pct by least-squares slope over (epoch, freeBytes); None when not shrinking."""
    if len(samples) < 3 or samples[-1][0] - samples[0][0] < FORECAST_MIN_SPAN_S:
        return None
    n = len(samples)
    mx = sum(x for x, _ in samples) / n
    my = sum(y for _, y in samples) / n
    var = sum((x - mx) ** 2 for x, _ in samples)
    if var == 0:
        return None
    slope = sum((x - mx) * (y - my) for x, y in samples) / var  # bytes per second
    if slope >= 0:
        return None
    remaining = samples[-1][1] - total * crit_pct / 100
    return 0.0 if remaining <= 0 else remaining / -slope / 86400


def publish_disk_forecast(state: Path, now: float, usage=shutil.disk_usage, path: str = "/") -> dict:
    """Keep a 7-day hourly free-space history and alarm (change-only) when the trend hits critical within 7 days."""
    total, _used, free = usage(path)
    history = state / "disk-forecast.json"
    try:
        samples = json.loads(history.read_text()).get("samples", [])
    except (OSError, ValueError, AttributeError):
        samples = []
    samples = [s for s in samples if isinstance(s, list) and len(s) == 2 and now - s[0] <= FORECAST_WINDOW_S]
    if not samples or now - samples[-1][0] >= FORECAST_SAMPLE_S:
        samples.append([now, free])
    days = forecast_days(samples + ([] if samples[-1][0] == now else [[now, free]]), total)
    alarm = days is not None and days < FORECAST_ALARM_DAYS
    try:
        before = json.loads(history.read_text()).get("alarm", False)
    except (OSError, ValueError, AttributeError):
        before = False
    at = datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    row = {"at": at, "freePct": round(free * 100 / total, 1), "daysToCritical": None if days is None else round(days, 1),
           "alarm": alarm, "samples": samples}
    state.mkdir(parents=True, exist_ok=True)
    atomic_write_text(history, json.dumps(row))
    if alarm != before:
        event = {"kind": "host-disk-forecast", "at": at, "freePct": row["freePct"],
                 "daysToCritical": row["daysToCritical"], "alarm": alarm}
        with open(state / "host-alarms.jsonl", "a") as handle:
            handle.write(json.dumps(event) + "\n")
    return {k: v for k, v in row.items() if k != "samples"}


# ---- load storm (2026-11-01: fork storm took Gem to load 1,661 on 16 cores; no alarm existed) ----
LOAD_MULT = 4.0
LOAD_SUSTAIN_S = 120.0


def load_config(env=os.environ) -> tuple[float, float]:
    try:
        return float(env.get("JOVIE_LOAD_ALARM_MULT", LOAD_MULT)), float(env.get("JOVIE_LOAD_ALARM_SECS", LOAD_SUSTAIN_S))
    except ValueError:
        return LOAD_MULT, LOAD_SUSTAIN_S


def process_census(proc: Path = Path("/proc"), limit: int = 5) -> dict:
    """Most numerous process names and the defunct (zombie) count: the signature of a fork storm."""
    names: dict[str, int] = {}
    zombies = total = 0
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            stat = (entry / "stat").read_text()
        except OSError:
            continue
        comm, _, rest = stat.rpartition(")")
        total += 1
        if rest.split()[:1] == ["Z"]:
            zombies += 1
        name = comm.split("(", 1)[-1]
        names[name] = names.get(name, 0) + 1
    top = sorted(names.items(), key=lambda kv: -kv[1])[:limit]
    return {"processes": total, "defunct": zombies, "top": [{"comm": k, "count": v} for k, v in top]}


def publish_load(state: Path, load1: float, cores: int, now: float, mult: float = LOAD_MULT,
                 sustain_s: float = LOAD_SUSTAIN_S, census=process_census) -> dict:
    """Track how long load1 has exceeded mult x cores; alarm (change-only) once it is sustained."""
    path = state / "host-load.json"
    try:
        prior = json.loads(path.read_text())
    except (OSError, ValueError, AttributeError):
        prior = {}
    threshold = mult * cores
    over = load1 > threshold
    since = (prior.get("overSince") or now) if over else None
    alarm = over and now - since >= sustain_s
    at = datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    row = {"at": at, "load1": load1, "cores": cores, "threshold": threshold, "overSince": since, "alarm": alarm}
    state.mkdir(parents=True, exist_ok=True)
    atomic_write_text(path, json.dumps(row))
    if alarm != bool(prior.get("alarm", False)):
        event = {"kind": "host-load-storm", "at": at, "alarm": alarm, "load1": load1, "cores": cores,
                 "threshold": threshold, "sustainedS": sustain_s}
        if alarm:
            event["census"] = census()
        with open(state / "host-alarms.jsonl", "a") as handle:
            handle.write(json.dumps(event) + "\n")
    return row


def main() -> int:
    state = Path(os.environ.get("LANES_STATE") or Path.home() / ".local/state/jovie-lanes")
    try:
        psi = parse_psi(Path("/proc/pressure/memory").read_text())
        avail = mem_available(Path("/proc/meminfo").read_text())
    except OSError as error:
        print(f"host-pressure: unreadable: {error}", file=sys.stderr)
        return 0
    now = time.time()
    print(json.dumps(publish(state, psi, avail, now)))
    try:
        mult, secs = load_config()
        print(json.dumps(publish_load(state, float(Path("/proc/loadavg").read_text().split()[0]), os.cpu_count() or 1, now, mult, secs)))
    except (OSError, ValueError) as error:
        print(f"host-pressure: load check unavailable: {error}", file=sys.stderr)
    try:
        print(json.dumps(publish_disk_forecast(state, now)))
    except OSError as error:
        print(f"host-pressure: disk forecast unavailable: {error}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
