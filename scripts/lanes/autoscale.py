#!/usr/bin/env python3
"""Adaptive per-lane slots on the minute dispatch tick. Default mode is apply. Kill switch: SYMPHONY_AUTOSCALE=0. decide() is pure and does no I/O at import."""
from __future__ import annotations
import json; import math; import os; import stat; import re; import time; from datetime import datetime, timezone; from pathlib import Path; SCHEMA = "symphony-lanes-autoscale/v1"
# Tim 2026-10-12: no arbitrary timers. Seats follow proven demand every tick; only measured limits
# (host load/memory/PSI/disk, provider credits and leases, GitHub quota, current failure rate on
# this release) hold or shrink them. HOST_SETTLE_S is the measurement lag of the signal itself:
# load1 is a one-minute average and PSI avg10 trails new workers, so a host step waits for the
# previous step to show up in the sample before taking the next one.
MIN_SLOTS, STALE_S, RATE_QUIET_S = 1, 600, 900; MULTIPLICATIVE_WINDOW_S, HOST_SETTLE_S = 300, 120; HOST_COOLDOWN_S = HOST_SETTLE_S
HISTORY_CAP, GIB = 50, 1024 ** 3
MEM_HEADROOM_BYTES, MEM_EMERGENCY_BYTES = 8 * GIB, 4 * GIB; GITHUB_INCREASE_MIN, GITHUB_DECREASE_BELOW = 1500, 600
LINEAR_INCREASE_RATIO, LINEAR_DECREASE_RATIO = 0.25, 0.10; LOAD_INCREASE_MAX, LOAD_DECREASE_MIN = 0.75, 1.0
PSI_CPU_OK, PSI_MEM_OK, PSI_IO_OK, PSI_CPU_SEVERE, PSI_MEM_SEVERE, PSI_IO_SEVERE = 20, 2, 10, 40, 5, 20
DISK_INCREASE_MIN, DISK_SOFT, DISK_HARD = 15, 10, 5
MERGE_QUEUE_WAIT_BRAKE_MIN = 30
# A census is stamped with its source rows' age (up to 3 x 60 s cache TTLs), read on the next minute tick.
MAINTENANCE_DEMAND_STALE_S = 240
# A saturated lane keeps its last positive census this long (one lane agent timeout, 5400 s).
BUSY_DEMAND_STALE_S = 5400
# Run failures pressure capacity only while current (Tim 2026-10-11). The doctor's failed-runs
# alert is a 24 h trailing diagnostic: failures from bugs fixed hours earlier froze every lane.
# Only runs on the installed release count, as a rate over the latest completed runs, so a fix
# (new release) or successful runs clear it at once and real current failures still back off.
FAILURE_RATE_RUNS, FAILURE_RATE_MIN, FAILURE_RATE_MIN_COUNT, LEDGER_TAIL_BYTES = 8, 0.5, 2, 1024 * 1024
_OFF, _OBSERVE, _APPLY = frozenset({"0", "off", "false"}), frozenset({"observe", "shadow"}), frozenset({"1", "on", "true", "apply"})
_AVG10, _PSI = re.compile(r"avg10=([0-9.]+)"), ("cpuSomeAvg10", "memoryFullAvg10", "ioFullAvg10")
def idle_floor(base: int) -> int:
    return 0 if base <= 0 else max(MIN_SLOTS, math.ceil(base / 2))
def _pint(value) -> int | None:
    try: number = int(str(value).strip())
    except (TypeError, ValueError): return None
    return number if number > 0 else None
def _int(value) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None
def _budget_int(value) -> int | None:
    if isinstance(value, bool): return None
    try:
        number = float(value if isinstance(value, (int, float)) else str(value).strip()); whole = int(number)
    except (TypeError, ValueError, OverflowError): return None
    return whole if number == whole and whole >= 0 else None
def _epoch(value) -> float | None:
    if isinstance(value, bool): return None
    if isinstance(value, (int, float)): return _num(value)
    try: return datetime.strptime(str(value), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    except (TypeError, ValueError): return None
def _iso(when: float) -> str:
    return datetime.fromtimestamp(when, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
def _num(value) -> float | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except OverflowError:
        return None
    return number if math.isfinite(number) else None
def _count(value) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None
def _obj(value) -> dict:
    return value if isinstance(value, dict) else {}
def _mode_of(raw) -> str:
    value = str(raw).strip().lower(); return "off" if value in _OFF else "observe" if value in _OBSERVE else "apply" if value in _APPLY else "off"
def _read_env_file(path: Path) -> dict:
    found = {}
    try:
        lines = path.read_text().splitlines()
    except OSError:
        return found
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1); key = key.strip().removeprefix("export ").strip()
        if key == "SYMPHONY_AUTOSCALE" or key.startswith("SYMPHONY_AUTOSCALE_"):
            found[key] = value.strip().strip('"').strip("'")
    return found
def _config_path(config):
    return Path.home() / ".config" / "jovie-lanes" / "autoscale.env" if config is None else config
def _from_env_or_file(env, file_vals: dict, key: str):
    """An invalid env value does not fall through to the file."""
    if key in env:
        return _pint(env.get(key))
    return _pint(file_vals.get(key)) if key in file_vals else None
def mode(env=None, config=None) -> str:
    """``off`` | ``observe`` | ``apply``. Unset, or a missing config line, is apply."""
    env = os.environ if env is None else env
    if "SYMPHONY_AUTOSCALE" in env:
        return _mode_of(env.get("SYMPHONY_AUTOSCALE"))
    file_vals = _read_env_file(_config_path(config)); return "apply" if "SYMPHONY_AUTOSCALE" not in file_vals else _mode_of(file_vals.get("SYMPHONY_AUTOSCALE"))
def load_config(env=None, config=None) -> dict:
    env = os.environ if env is None else env; file_vals, maxima, prefix = _read_env_file(_config_path(config)), {}, "SYMPHONY_AUTOSCALE_MAX_"
    for key in set(file_vals) | {key for key in env if str(key).startswith("SYMPHONY_AUTOSCALE")}:
        if not str(key).startswith(prefix):
            continue
        provider, parsed = str(key)[len(prefix):].strip().lower(), _from_env_or_file(env, file_vals, key)
        if provider and parsed is not None:
            maxima[provider] = parsed
    return {"mode": mode(env, config), "max": maxima, "hostMax": _from_env_or_file(env, file_vals, "SYMPHONY_AUTOSCALE_HOST_MAX")}
def _pressure_avg(path: Path, label: str) -> float | None:
    try:
        for line in path.read_text().splitlines():
            if line.startswith(label):
                found = _AVG10.search(line); return float(found.group(1)) if found else None
    except (OSError, ValueError):
        return None
    return None
def sample_host(proc_root=None) -> dict:
    """Local CPU, load, MemAvailable and PSI. Memory and PSI are None when absent.

    The release self-test samples a calm host without /proc: a dispatch fixture must not read
    Gem's live load and PSI, which made slot counts differ between a laptop and Gem."""
    if proc_root is None:
        if os.environ.get("LANES_SELFTEST") == "1":
            return {"cpuCount": os.cpu_count() or 1, "load1": 0.0, "memAvailableBytes": None, "psi": None}
        proc_root = Path("/proc")
    try:
        load1 = os.getloadavg()[0]
    except OSError:
        load1 = None
    mem = None
    try:
        for line in (Path(proc_root) / "meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                mem = int(line.split()[1]) * 1024; break
    except (OSError, ValueError, IndexError):
        mem = None
    pressure = Path(proc_root) / "pressure"
    psi = None if not pressure.is_dir() else {
        "cpuSomeAvg10": _pressure_avg(pressure / "cpu", "some"),
        "memoryFullAvg10": _pressure_avg(pressure / "memory", "full"),
        "ioFullAvg10": _pressure_avg(pressure / "io", "full")}
    return {"cpuCount": os.cpu_count() or 1, "load1": load1, "memAvailableBytes": mem, "psi": psi}
def _read_json(path: Path, *, max_bytes=None):
    try:
        if max_bytes is None:
            return json.loads(path.read_text())
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_size > max_bytes:
                return None
            with os.fdopen(fd, "rb", closefd=False) as handle:
                raw = handle.read(max_bytes + 1)
            return json.loads(raw) if len(raw) <= max_bytes else None
        finally:
            os.close(fd)
    except (OSError, ValueError):
        return None
def _valid_state(state) -> bool:
    return isinstance(state, dict) and state.get("schema") == SCHEMA and isinstance(state.get("lanes"), dict)
def _linear_budget_observation(api: dict, now: float) -> dict:
    observed = _epoch(api.get("observedAt"))
    raw_limited = api["rateLimitedAt"] if "rateLimitedAt" in api else api.get("linearRateLimitedAt")
    limited = _epoch(raw_limited)
    return {"linearRemaining": _budget_int(api["remaining"] if "remaining" in api else api.get("linearRemaining")),
            "linearLimit": _budget_int(api["limit"] if "limit" in api else api.get("linearLimit")),
            "linearRateLimitedAt": limited if raw_limited is None or limited is not None else "unknown",
            "linearDimensions": {name: {"remaining": _budget_int(_obj(row).get("remaining")),
                                        "limit": _budget_int(_obj(row).get("limit")),
                                        "observedAt": _epoch(_obj(row).get("observedAt"))}
                                 for name, row in _obj(api.get("dimensions")).items() if name in ("requests", "complexity")},
            "linearBudgetObservedAt": observed,
            "linearBudgetFresh": observed is not None and 0 <= now - observed <= STALE_S}


def release_installed_at(state_dir: Path) -> float | None:
    """When the running release generation was activated: the `current` symlink's own mtime."""
    try:
        return os.lstat(Path(state_dir) / "current").st_mtime
    except OSError:
        return None
def current_run_failures(state_dir: Path) -> dict | None:
    """Failed / completed among the latest runs that started on the installed release; None when
    the ledger is unreadable."""
    since = release_installed_at(state_dir) or 0.0
    try:
        with open(Path(state_dir) / "runs" / "ledger.jsonl", "rb") as handle:
            handle.seek(0, os.SEEK_END); size = handle.tell(); handle.seek(max(0, size - LEDGER_TAIL_BYTES))
            lines = handle.read().decode(errors="replace").splitlines()[1 if size > LEDGER_TAIL_BYTES else 0:]
    except FileNotFoundError:
        lines = []
    except OSError:
        return None
    runs = []
    for line in lines:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if not isinstance(row, dict) or not isinstance(row.get("verdict"), str):
            continue
        began = _epoch(row.get("startedAt")) or _epoch(row.get("endedAt"))
        if began is not None and began >= since:
            # A provider-error no longer cools a lane unless the provider measured a limit, so a
            # crashing provider shows up here, in the current failure rate, instead.
            runs.append((_epoch(row.get("endedAt")) or began, row["verdict"] in ("failed", "provider-error")))
    latest = [failed for _, failed in sorted(runs)[-FAILURE_RATE_RUNS:]]
    return {"failed": sum(latest), "runs": len(latest), "releaseInstalledAt": since or None}
def _failures_current(obs: dict) -> bool:
    row = _obj(obs.get("currentRunFailures"))
    failed, runs = _count(row.get("failed")), _count(row.get("runs"))
    return bool(runs) and failed is not None and failed >= FAILURE_RATE_MIN_COUNT and failed / runs >= FAILURE_RATE_MIN
def collect(state_dir: Path, tick: dict, now: float) -> dict:
    """Local files only: no GitHub or Linear calls."""
    root, doctor = Path(state_dir), _obj(_read_json(Path(state_dir) / "doctor.json")); observed = _obj(doctor.get("observed"))
    stamp = _num(observed.get("now"))
    api, cooling, cooldown_at, latest = _obj(_read_json(root / "api-budget.json")), [], {}, None; cool_dir = root / "cooldown"
    if cool_dir.is_dir():
        for path in sorted(cool_dir.iterdir()):
            try:
                cooldown_at[path.name] = path.stat().st_mtime
                if float(path.read_text()) > now:
                    cooling.append(path.name)
            except (OSError, ValueError):
                continue
    for entry in _obj(_read_json(root / "codex-accounts.json")).values():
        if isinstance(entry, dict) and entry.get("lastKind") in ("rate", "limit", "usage"):
            banked = _num(entry.get("lastRunAt"))
            if banked is not None and (latest is None or banked > latest):
                latest = banked
    running = {}
    for name, row in _obj(observed.get("capacityByProvider")).items():
        seats = _int(_obj(row).get("running"))
        if seats is not None:
            running[name] = seats
    disk, attribution = _obj(_obj(tick).get("disk")), _obj(observed.get("codexAttribution")); maintenance = observed.get("maintenanceQueueByProvider")
    # Workers publish from their existing claim scan; collecting adds no API reads.
    census = _obj(_read_json(root / "maintenance-demand.json", max_bytes=65536))
    recent = {}
    if census.get("schema") == "symphony-lanes-maintenance-demand/v1":
        recent = {name: pending for name, row in _obj(census.get("lanes")).items()
                  if (pending := _count(_obj(row).get("pending"))) and (at := _num(_obj(row).get("observedAt"))) is not None
                  and 0 <= now - at <= BUSY_DEMAND_STALE_S}
        maintenance = {name: _count(_obj(row).get("pending")) for name, row in _obj(census.get("lanes")).items()
                       if (at := _num(_obj(row).get("observedAt"))) is not None and 0 <= now - at <= MAINTENANCE_DEMAND_STALE_S}
    merge = _obj(observed.get("mergeThroughput")); merge_at = _num(merge.get("observedAt"))
    return {"doctorFresh": stamp is not None and 0 <= now - stamp <= STALE_S,
            "eligiblePoolByProvider": _obj(observed.get("eligiblePoolByProvider")),
            "newIssueBudgetByProvider": _obj(observed.get("newIssueBudgetByProvider")),
            "maintenanceQueueByProvider": maintenance if isinstance(maintenance, dict) else {},
            "recentPositiveDemandByProvider": recent,
            "runningByProvider": running,
            "unhealthy": [item for item in (_obj(observed.get("tick")).get("unhealthy") or []) if isinstance(item, str)],
            "cooling": cooling, "cooldownAt": cooldown_at,
            "rateBankAt": {"codex": latest} if latest is not None else {},
            "codexUnleasedAvailable": _int(attribution.get("unleasedAvailable")),
            "codexAttribution": {key: attribution.get(key) for key in ("state", "leased", "unleasedAvailable", "quotaBanked",
                                                                       "rateCooldown", "authCooldown", "earliestCooldownS", "loginSlots")
                                 if key in attribution},
            "currentRunFailures": current_run_failures(root),
            "githubRemaining": _int(observed.get("githubRemaining")),
            **_linear_budget_observation(api, now),
            "mergeThroughputFresh": merge_at is not None and 0 <= now - merge_at <= STALE_S,
            "mergeThroughput": {key: merge.get(key) for key in ("queueDepth", "queueWaitP50Minutes", "mergedPerHour", "openedPerHour", "ejectionRate")},
            "disk": {"admitted": disk.get("admitted"), "freePct": disk.get("freePct")}}
def _load_ratio(sample: dict) -> float | None:
    load, cpu = _num(sample.get("load1")), _int(sample.get("cpuCount")); return None if load is None or cpu is None or cpu <= 0 else load / cpu
def _psi_known(psi) -> bool:
    return isinstance(psi, dict) and all(_num(psi.get(key)) is not None for key in _PSI)
def _lane_ceiling(name: str, base: int, running, obs: dict, config: dict, host_cap: int) -> int:
    # Tim 2026-10-11: lanes are capped by compute and credits only. A lane may grow to the host's
    # compute cap; credit limits (codex leases, provider cooldowns) and host pressure still apply.
    if base <= 0:
        return 0
    named = _int(_obj(config.get("max")).get(name)); cap = named if named is not None and named > 0 else host_cap
    if name == "codex":
        unleased = _count(obs.get("codexUnleasedAvailable"))
        cap = min(cap, base) if unleased is None or running is None else min(cap, max(0, running) + max(0, unleased))
    return max(0, cap)
def _demand(name: str, obs: dict, now: float | None = None) -> int | None:
    """Pending work this lane could start now: routable Todo issues plus repair demand.

    Intake reads the local Linear mirror (#21304) and claims through the local ledger, so
    Linear quota is not an intake limit, and open-PR counts are not a ceiling on new work."""
    budget = _obj(_obj(obs.get("newIssueBudgetByProvider")).get(name))
    maint = _count(_obj(obs.get("maintenanceQueueByProvider")).get(name))
    if budget.get("reason") == "provider-disabled":
        return maint
    eligible = _count(_obj(obs.get("eligiblePoolByProvider")).get(name))
    if eligible is not None and maint is not None:
        return eligible + maint
    # Positive observed demand is useful even when the other pool is unknown.
    return eligible if eligible else maint if maint else None
def _budget_unknown(obs: dict) -> str | None:
    if _int(obs.get("githubRemaining")) is None:
        return "github-unknown"
    return None
def _multi_reason(name: str, obs: dict, sample: dict, now: float) -> str | None:
    bank, written = _num(_obj(obs.get("rateBankAt")).get(name)), _num(_obj(obs.get("cooldownAt")).get(name))
    if (bank is not None and now - bank <= MULTIPLICATIVE_WINDOW_S) or (written is not None and now - written <= MULTIPLICATIVE_WINDOW_S):
        return "rate-limited"
    github = _int(obs.get("githubRemaining"))
    if github is not None and github < GITHUB_DECREASE_BELOW:
        return "github-budget-low"
    disk, free, mem, psi = _obj(obs.get("disk")), _num(_obj(obs.get("disk")).get("freePct")), _num(sample.get("memAvailableBytes")), sample.get("psi")
    severe = _psi_known(psi) and (psi["cpuSomeAvg10"] >= PSI_CPU_SEVERE or psi["memoryFullAvg10"] >= PSI_MEM_SEVERE or psi["ioFullAvg10"] >= PSI_IO_SEVERE)
    if disk.get("admitted") is False or (free is not None and free <= DISK_HARD) or (mem is not None and mem < MEM_EMERGENCY_BYTES) or severe:
        return "host-pressure"
    return None
def _additive_reason(obs: dict, sample: dict) -> str | None:
    """Measured host pressure, or failures on the installed release (a trailing 24 h alert or
    gate-wait median is history, not a current limit: Tim 2026-10-11)."""
    load, mem, free = _load_ratio(sample), _num(sample.get("memAvailableBytes")), _num(_obj(obs.get("disk")).get("freePct"))
    if (load is not None and load >= LOAD_DECREASE_MIN) or (mem is not None and mem < MEM_HEADROOM_BYTES) or (free is not None and free < DISK_SOFT):
        return "host-pressure"
    if _failures_current(obs):
        return "gate-pressure"
    return None
def _throughput_brake(previous: dict, obs: dict, now: float) -> dict:
    """Legacy doctor receipt: observe queue trouble; never use it for slot admission."""
    signal = _obj(obs.get("mergeThroughput")); depth = _count(signal.get("queueDepth")); wait = _num(signal.get("queueWaitP50Minutes"))
    merged, opened, ejections = _num(signal.get("mergedPerHour")), _num(signal.get("openedPerHour")), _num(signal.get("ejectionRate"))
    known = bool(obs.get("mergeThroughputFresh")) and depth is not None and merged is not None and opened is not None and (depth == 0 or wait is not None)
    reasons = []
    if known and merged < opened:
        reasons.append("merge-deficit")
    if known and wait is not None and wait >= MERGE_QUEUE_WAIT_BRAKE_MIN:
        reasons.append("queue-wait")
    prior = _obj(previous.get("throughputBrake")); active = bool(reasons); prior_since = _num(prior.get("since"))
    since = (prior_since if active and prior.get("active") and prior_since is not None else now if active else None)
    return {"known": known, "active": active, "reasons": reasons, "since": since,
            "heldForS": max(0, now - since) if since is not None else 0,
            "signal": {"queueDepth": depth, "queueWaitP50Minutes": wait, "mergedPerHour": merged,
                       "openedPerHour": opened, "ejectionRate": ejections}}
def _increase_blockers(name, obs, sample, now, running, demand) -> list[str]:
    """Only measured limits and unknown measurements. No streaks, budgets or trailing averages."""
    reason = _obj(_obj(obs.get("newIssueBudgetByProvider")).get(name)).get("reason")
    github = _int(obs.get("githubRemaining"))
    load, mem, psi = _load_ratio(sample), sample.get("memAvailableBytes"), sample.get("psi")
    bank = _num(_obj(obs.get("rateBankAt")).get(name))
    disk, free = _obj(obs.get("disk")), _num(_obj(obs.get("disk")).get("freePct"))
    unleased = _count(obs.get("codexUnleasedAvailable"))
    pairs = (
        (reason == "provider-disabled", reason),
        (demand is None or demand <= 0, "unknown-demand" if demand is None else "zero-demand"),
        (name in set(obs.get("unhealthy") or []), "unhealthy"),
        (name in set(obs.get("cooling") or []), "cooling"),
        (bank is not None and now - bank <= RATE_QUIET_S, "rate-bank"),
        (name == "codex" and (unleased is None or unleased < 1), "codex-unleased"),
        (running is None or running < 0, "unknown-running"),
        (_failures_current(obs), "gate-pressure"),
        (load is None or load >= LOAD_INCREASE_MAX, "high-load"),
        (mem is None or _num(mem) is None or mem < MEM_HEADROOM_BYTES, "low-mem"),
        (psi is not None and (not _psi_known(psi) or any(psi[key] > limit for key, limit in zip(_PSI, (PSI_CPU_OK, PSI_MEM_OK, PSI_IO_OK)))), "psi-high"),
        (disk.get("admitted") is not True or free is None or free <= DISK_INCREASE_MIN, "disk-low"),
        (github is None or github < GITHUB_INCREASE_MIN, "github-unknown" if github is None else "github-budget"),
    )
    return [token for cond, token in pairs if cond]
_CEILING_HOLDS = ("hold:lane-ceiling", "hold:host-ceiling")
def _aimd_level(prev: dict, base: int) -> int:
    """The level a lane evolves from. Credit and host ceilings clamp only the published
    ``effective``: on 2026-10-11 one codex lease dip set its ceiling to 0 for a tick and the
    clamp became the next tick's level, so codex sat at 0 seats after its credits returned.
    Receipts before ``target`` existed fall back to the configured base when their last value
    was only a ceiling clamp."""
    target = _int(prev.get("target"))
    if target is None or target < 0:
        target = _int(prev.get("effective"))
        if target is None or target < 0:
            return base
        if prev.get("lastReason") in _CEILING_HOLDS:
            target = max(target, base)
    # No step goes below the floor; only a ceiling publishes 0. A lane whose level reads 0
    # could never run the worker whose scan proves its demand.
    return max(MIN_SLOTS, target) if base > 0 else target
def _row(base, effective, running, changed, reason, blockers, ceiling, floor=None, demand=None) -> dict:
    return {"base": base, "effective": effective, "floor": (MIN_SLOTS if base > 0 else 0) if floor is None else floor,
            "ceiling": ceiling, "running": running, "demand": demand,
            "lastChangeAt": changed, "lastReason": reason, "blockers": blockers}
def _limit_host(all_rows: dict, cap: int, exclude: set | frozenset = frozenset()) -> None:
    """Proportional bounded allocation; a real host ceiling may require zero seats.
    Excluded (unhealthy) lanes spawn no workers and take no host share."""
    rows = {name: row for name, row in all_rows.items() if name not in exclude}
    total = sum(row["effective"] for row in rows.values())
    if total <= cap:
        return
    shares = {name: row["effective"] * cap // total for name, row in rows.items()}
    extra = cap - sum(shares.values())
    ranked = sorted(rows, key=lambda name: rows[name]["effective"] * cap % total, reverse=True)
    for name in ranked[:extra]:
        shares[name] += 1
    for name, row in rows.items():
        if row["effective"] != shares[name]:
            row.update(effective=shares[name], floor=0, lastReason="hold:host-ceiling",
                       blockers=list(dict.fromkeys([*row["blockers"], "host-ceiling"])))


def decide(previous: dict | None, obs: dict, host_sample: dict, bases: dict, config: dict, now: float) -> dict:
    """Pure step. Returns the next ``symphony-lanes-autoscale/v1`` receipt.

    Every tick a saturated lane with pending demand grows toward running + pending (at most
    doubling per host settle), bounded by its credit ceiling and the host's compute; a lane
    with no demand releases its unused seats at once so it holds no host share. Measured
    pressure halves (severe) or steps down (soft)."""
    previous, config, sample = _obj(previous), config or {}, host_sample or {}; prev_lanes, prev_host = _obj(previous.get("lanes")), _obj(previous.get("host"))
    if config.get("mode") == "apply" and previous.get("mode") != "apply":
        # Only an apply receipt records live capacity. Start other modes at the
        # configured base, then evaluate the same real safety limits below.
        prev_lanes, prev_host = {}, {}
    history = [row for row in (previous.get("history") or []) if isinstance(row, dict)]
    host_last = _num(prev_host.get("lastChangeAt"))
    cpu = max(0, _int(sample.get("cpuCount")) or 0)
    host_max = _int(config.get("hostMax"))
    host_cap = min(host_max if host_max is not None and host_max > 0 else cpu, cpu); fresh = obs.get("doctorFresh") is True
    unknown = _budget_unknown(obs) if fresh else None; brake = _throughput_brake(previous, obs, now)
    host_ready = host_last is None or now - host_last >= HOST_SETTLE_S
    rows, pending = {}, []
    for order, (name, raw_base) in enumerate(bases.items()):
        base, prev = _int(raw_base) or 0, _obj(prev_lanes.get(name)); changed = _num(prev.get("lastChangeAt"))
        running = _int(_obj(obs.get("runningByProvider")).get(name))
        if base <= 0:
            rows[name] = _row(0, 0, running, changed, "hold:disabled", ["disabled"], 0); continue
        ceiling = _lane_ceiling(name, base, running, obs, config, host_cap)
        current = _aimd_level(prev, base)
        if not fresh:
            fallback = min(base, current, ceiling)
            rows[name] = _row(base, fallback, running, changed, "hold:stale-doctor", ["stale-doctor"], ceiling, floor=0 if fallback == 0 else MIN_SLOTS)
            rows[name]["target"] = current; continue
        demand = _demand(name, obs, now)
        if demand is None and running is not None and running >= current:
            # Only a worker's claim scan publishes demand. A lane whose every seat is in a long
            # run never rescans, so its fresh demand reads unknown exactly when it should grow
            # (Gem 21:11Z: devin 1 seat busy, census 6 at 21:06:57). A recent positive census
            # stands as the lower bound while the lane stays saturated.
            demand = _count(_obj(obs.get("recentPositiveDemandByProvider")).get(name)) or None
        multi, additive = _multi_reason(name, obs, sample, now), _additive_reason(obs, sample)
        effective, reason, blockers, step_to = current, "hold:steady", [], None
        if multi:
            effective, reason, blockers = max(0 if current == 0 else MIN_SLOTS, math.ceil(current / 2)), multi, [multi]
        elif additive:
            if host_ready and current > MIN_SLOTS:
                effective, reason, blockers = current - 1, additive, [additive]
            else:
                reason, blockers = "hold:" + additive, [additive] + (["host-settle"] if current > MIN_SLOTS else [])
        elif demand == 0 and running is not None:
            # Known idle: release unused seats now so this lane holds no host share another
            # lane with demand could use. Never below the running count or the floor.
            keep = max(idle_floor(base), running)
            if current > keep:
                effective, reason, blockers = keep, "idle-release", []
            else:
                reason, blockers = "hold:zero-demand", ["zero-demand"]
        else:
            blockers = _increase_blockers(name, obs, sample, now, running, demand)
            if running is not None and running < current and "unknown-running" not in blockers:
                blockers = ["not-saturated", *blockers]
            wanted = None if demand is None or running is None else max(0, running) + demand
            want = None if wanted is None else min(ceiling, wanted)
            if not blockers and wanted is not None and wanted <= current:
                reason = "hold:steady"
            elif not blockers and current + 1 > ceiling:
                blockers = ["lane-ceiling"]
            elif not blockers and not host_ready:
                blockers = ["host-settle"]
            elif not blockers:
                step_to = min(want, max(current + 1, 2 * current))
                reason, blockers = "hold:host-ceiling", ["host-ceiling"]
            if blockers:
                reason = "hold:" + blockers[0]
        target = effective
        if effective > ceiling:
            effective, reason, blockers = ceiling, "hold:lane-ceiling", ["lane-ceiling"]
        rows[name] = _row(base, effective, running, changed, reason, blockers, ceiling, 0 if effective == 0 else MIN_SLOTS, demand)
        rows[name]["target"] = target
        if step_to is not None:
            pending.append((demand or 0, order, name, current, step_to))
    unhealthy = set(obs.get("unhealthy") or [])
    _limit_host(rows, host_cap, exclude=unhealthy)
    if pending:
        used = sum(row["effective"] for name, row in rows.items() if name not in unhealthy)
        # Every lane with demand may grow in the same tick while host headroom lasts.
        for _demand_value, _order, chosen, current, step_to in sorted(pending, key=lambda item: (item[0] / max(1, item[3]), -item[1]), reverse=True):
            row = rows[chosen]
            grow = min(step_to - current, host_cap - used)
            if row["effective"] == current and grow >= 1:
                row.update(effective=current + grow, target=current + grow, lastReason="sustained-demand", blockers=[])
                used += grow
    for name, row in rows.items():
        base = row["base"]
        if base > 0 and row["effective"] > base and unknown:
            # API-budget uncertainty stays fail-safe; queue metrics are only diagnostic.
            row.update(effective=base, target=min(base, row.get("target", base)), lastReason="hold:" + unknown, blockers=[unknown])
        intake_blockers = []
        if base <= 0 or _obj(_obj(obs.get("newIssueBudgetByProvider")).get(name)).get("reason") == "provider-disabled":
            intake_blockers.append("disabled")
        if name in unhealthy:
            intake_blockers.append("unhealthy")
        if name in set(obs.get("cooling") or []):
            intake_blockers.append("cooling")
        row.update(intakeEffective=0 if intake_blockers else row["effective"], intakeBlockers=intake_blockers)
        before = _int(_obj(prev_lanes.get(name)).get("effective")); before = base if before is None else before
        if row["effective"] != before:
            row["lastChangeAt"], host_last = now, now
            history.append({"at": now, "lane": name, "from": before, "to": row["effective"], "reason": row["lastReason"]})
    changed = host_last == now and any(row.get("lastChangeAt") == now for row in rows.values())
    return {"schema": SCHEMA, "mode": config.get("mode") or "apply", "observedAt": now,
            "host": {"lastChangeAt": host_last, "ceiling": host_cap, "cpuCount": cpu}, "lanes": rows, "hostSample": host_sample,
            "throughputBrake": brake,
            "apiBudget": {"githubRemaining": _int(obs.get("githubRemaining")), "linearRemaining": _int(obs.get("linearRemaining")),
                          "linearLimit": _int(obs.get("linearLimit")), "linearRateLimitedAt": _num(obs.get("linearRateLimitedAt")),
                          "linearBudgetFresh": obs.get("linearBudgetFresh") is True,
                          "linearBudgetObservedAt": obs.get("linearBudgetObservedAt", now),
                          "linearDimensions": _obj(obs.get("linearDimensions"))},
            "history": history[-HISTORY_CAP:], "_changed": bool(changed)}
def _atomic_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True); tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(payload, indent=1, sort_keys=True)); os.chmod(tmp, 0o644); os.replace(tmp, path)
def write_state(state_dir, state: dict) -> None:
    """Atomic replace, mode 0644. ``_changed`` is internal and not persisted."""
    _atomic_json(Path(state_dir) / "autoscale.json", {key: value for key, value in state.items() if key != "_changed"})
def effective_slots(state_dir: Path, name: str, base: int, now: float | None = None) -> int:
    """Apply-mode slot count, or ``base`` on every fail-safe. ``base <= 0`` stays ``base``."""
    if base <= 0 or mode() != "apply":
        return base
    now, state = time.time() if now is None else now, _read_json(Path(state_dir) / "autoscale.json"); observed = _num(_obj(state).get("observedAt"))
    if not _valid_state(state) or state.get("mode") != "apply" or observed is None or now - observed > STALE_S or now < observed:
        return base
    row = state["lanes"].get(name); effective, floor, ceiling = _int(_obj(row).get("effective")), _int(_obj(row).get("floor")), _int(_obj(row).get("ceiling"))
    if not isinstance(row, dict) or effective is None or effective < 0 or (ceiling is not None and ceiling < 0) or (floor is not None and floor < 0):
        return base
    ceiling = effective if ceiling is None else ceiling
    return min(ceiling, max(MIN_SLOTS if floor is None else floor, min(ceiling, effective)))
def _fresh_apply_state(state_dir: Path, now: float):
    if mode() != "apply":
        return None
    state = _read_json(Path(state_dir) / "autoscale.json", max_bytes=1048576)
    observed = _num(_obj(state).get("observedAt"))
    return state if _valid_state(state) and state.get("mode") == "apply" and observed is not None and 0 <= now - observed <= STALE_S else None


def intake_slots(state_dir: Path, name: str, base: int, now: float | None = None) -> int:
    """Seats that may claim new issues within the same slot ledger. Intake reads the local
    Linear mirror and claims through the local ledger, so Linear quota does not gate it; only
    a disabled, unhealthy or cooling provider does. Fail-safe matches ``effective_slots``."""
    if base <= 0:
        return 0
    if mode() != "apply":
        return base
    state = _fresh_apply_state(state_dir, time.time() if now is None else now)
    if state is None:
        return base
    row = _obj(_obj(state).get("lanes")).get(name)
    intake, effective, ceiling = (_count(_obj(row).get(key)) for key in ("intakeEffective", "effective", "ceiling"))
    if intake is None or effective is None or ceiling is None:
        return 0
    return min(intake, effective, ceiling)


def host_ceiling(state_dir: Path, now: float | None = None) -> int | None:
    """Fresh apply ceiling for serial shared-ledger admission, otherwise unknown."""
    state = _fresh_apply_state(state_dir, time.time() if now is None else now)
    return _count(_obj(_obj(state).get("host")).get("ceiling"))


def apply_tick(state_dir, tick: dict, bases: dict, now: float | None = None, host_sample: dict | None = None, config: dict | None = None) -> dict:
    now, config = time.time() if now is None else now, config or load_config(); previous = _read_json(Path(state_dir) / "autoscale.json")
    state = decide(previous if _valid_state(previous) else None, collect(state_dir, tick, now),
                   sample_host() if host_sample is None else host_sample, bases, config, now)
    write_state(state_dir, state)
    return {"mode": config["mode"], "lanes": {name: {"base": row["base"], "effective": row["effective"], "intakeEffective": row["intakeEffective"], "reason": row["lastReason"]}
                                               for name, row in state["lanes"].items()}}
def public_block(state_dir) -> dict:
    state = _read_json(Path(state_dir) / "autoscale.json")
    if not _valid_state(state):
        return {"mode": mode(), "lanes": {}, "history": []}
    lanes = {name: {"base": row.get("base"), "effective": row.get("effective"), "reason": row.get("lastReason"),
                    "blockers": list(row.get("blockers") or []), "intakeEffective": row.get("intakeEffective"),
                    "intakeBlockers": list(row.get("intakeBlockers") or []), "demand": row.get("demand")}
             for name, row in state["lanes"].items() if isinstance(row, dict)}
    history = state.get("history") if isinstance(state.get("history"), list) else []
    return {"mode": state.get("mode") or mode(), "lanes": lanes, "history": history[-10:],
            "throughputBrake": _obj(state.get("throughputBrake"))}
