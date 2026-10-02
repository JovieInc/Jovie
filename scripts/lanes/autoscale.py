#!/usr/bin/env python3
"""Adaptive per-lane slot counts for the existing minute dispatch tick.

Default mode is apply. ``SYMPHONY_AUTOSCALE=0`` (or ``off`` / ``false``) is the
kill switch and leaves ``Host.slots()`` on the configured base. This module
does no I/O at import and ``decide()`` is pure: dispatch reads local files,
then writes one ``autoscale.json`` receipt. No new controller, timer, or API.
"""
from __future__ import annotations

import json
import math
import os
import re
import time
from pathlib import Path

SCHEMA = "symphony-lanes-autoscale/v1"
MIN_SLOTS = 1
STALE_S = 600
RATE_QUIET_S = 900
MULTIPLICATIVE_WINDOW_S = 300
HOST_COOLDOWN_S = 120
DEFAULT_INTERVAL_S = 1800
LANE_COOLDOWN_S = DEFAULT_INTERVAL_S
UP_STREAK_REQUIRED = DEFAULT_INTERVAL_S // 60
IDLE_STREAK_REQUIRED = UP_STREAK_REQUIRED
HISTORY_CAP = 50
GIB = 1024 ** 3
MEM_HEADROOM_BYTES = 8 * GIB
MEM_EMERGENCY_BYTES = 4 * GIB
GITHUB_INCREASE_MIN = 1500
GITHUB_DECREASE_BELOW = 600
LINEAR_INCREASE_RATIO = 0.25
LINEAR_DECREASE_RATIO = 0.10
LOAD_INCREASE_MAX = 0.75
LOAD_DECREASE_MIN = 1.0
PSI_CPU_OK = 20
PSI_MEM_OK = 2
PSI_IO_OK = 10
PSI_CPU_SEVERE = 40
PSI_MEM_SEVERE = 5
PSI_IO_SEVERE = 20
GATE_WAIT_INCREASE_MAX = 600
GATE_WAIT_DECREASE = 1200
PRODUCTIVE_MIN = 0.5
PRODUCTIVE_MIN_STARTS = 5
DISK_INCREASE_MIN = 15
DISK_SOFT = 10
DISK_HARD = 5

_OFF = frozenset({"0", "off", "false"})
_OBSERVE = frozenset({"observe", "shadow"})
_APPLY = frozenset({"1", "on", "true", "apply"})
_AVG10 = re.compile(r"avg10=([0-9.]+)")


def streak_ticks(interval_s: int) -> int:
    """Minute ticks in one cadence interval. 1800 s → 30 ticks."""
    return max(1, int(interval_s) // 60)


def idle_floor(base: int) -> int:
    if base <= 0:
        return 0
    return max(MIN_SLOTS, math.ceil(base / 2))


def _positive_int(value) -> int | None:
    try:
        number = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _as_int(value) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def _as_number(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _parse_mode(raw) -> str:
    value = str(raw).strip().lower()
    if value in _OFF:
        return "off"
    if value in _OBSERVE:
        return "observe"
    if value in _APPLY:
        return "apply"
    return "off"


def _parse_file(path: Path) -> dict:
    found = {}
    try:
        text = path.read_text()
    except OSError:
        return found
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key, sep, value = stripped.partition("=")
        if not sep:
            continue
        key = key.strip().removeprefix("export ").strip()
        if key == "SYMPHONY_AUTOSCALE" or key.startswith("SYMPHONY_AUTOSCALE_"):
            found[key] = value.strip().strip('"').strip("'")
    return found


def _merged(env, config: Path) -> dict:
    """Environment wins per key. An invalid env value does not fall through to the file."""
    file_vals = _parse_file(config)
    merged = dict(file_vals)
    for key, value in env.items():
        if key == "SYMPHONY_AUTOSCALE" or key.startswith("SYMPHONY_AUTOSCALE_"):
            merged[key] = value
            merged["__env__" + key] = True
    return merged


def _from_env_or_file(env, file_vals: dict, key: str):
    if key in env:
        return _positive_int(env.get(key))
    if key in file_vals:
        return _positive_int(file_vals.get(key))
    return None


def mode(env=None, config=None) -> str:
    """``off`` | ``observe`` | ``apply``. Unset, or a missing config line, is apply."""
    if env is None:
        env = os.environ
    if config is None:
        config = Path.home() / ".config" / "jovie-lanes" / "autoscale.env"
    if "SYMPHONY_AUTOSCALE" in env:
        return _parse_mode(env.get("SYMPHONY_AUTOSCALE"))
    file_vals = _parse_file(config)
    if "SYMPHONY_AUTOSCALE" not in file_vals:
        return "apply"
    return _parse_mode(file_vals.get("SYMPHONY_AUTOSCALE"))


def load_config(env=None, config=None) -> dict:
    """Mode plus optional ceilings and the cadence interval."""
    if env is None:
        env = os.environ
    if config is None:
        config = Path.home() / ".config" / "jovie-lanes" / "autoscale.env"
    file_vals = _parse_file(config)
    maxima = {}
    prefix = "SYMPHONY_AUTOSCALE_MAX_"
    keys = set(file_vals) | {key for key in env if key.startswith("SYMPHONY_AUTOSCALE")}
    for key in keys:
        if not key.startswith(prefix):
            continue
        provider = key[len(prefix):].strip().lower()
        if not provider:
            continue
        parsed = _from_env_or_file(env, file_vals, key)
        if parsed is not None:
            maxima[provider] = parsed
    interval = _from_env_or_file(env, file_vals, "SYMPHONY_AUTOSCALE_INTERVAL_S") or DEFAULT_INTERVAL_S
    return {
        "mode": mode(env, config),
        "max": maxima,
        "hostMax": _from_env_or_file(env, file_vals, "SYMPHONY_AUTOSCALE_HOST_MAX"),
        "intervalS": interval,
    }


def sample_host(proc_root=Path("/proc")) -> dict:
    """Local CPU, load, MemAvailable and PSI. Memory and PSI are None when absent (macOS)."""
    cpu = os.cpu_count() or 1
    try:
        load1 = os.getloadavg()[0]
    except OSError:
        load1 = None
    mem = None
    meminfo = Path(proc_root) / "meminfo"
    try:
        for line in meminfo.read_text().splitlines():
            if line.startswith("MemAvailable:"):
                mem = int(line.split()[1]) * 1024
                break
    except (OSError, ValueError, IndexError):
        mem = None
    pressure = Path(proc_root) / "pressure"
    psi = None
    if pressure.is_dir():
        psi = {
            "cpuSomeAvg10": _pressure_avg(pressure / "cpu", "some"),
            "memoryFullAvg10": _pressure_avg(pressure / "memory", "full"),
            "ioFullAvg10": _pressure_avg(pressure / "io", "full"),
        }
    return {"cpuCount": cpu, "load1": load1, "memAvailableBytes": mem, "psi": psi}


def _pressure_avg(path: Path, label: str) -> float | None:
    try:
        for line in path.read_text().splitlines():
            if line.startswith(label):
                found = _AVG10.search(line)
                return float(found.group(1)) if found else None
    except (OSError, ValueError):
        return None
    return None


def _read_json(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def _valid_state(state) -> bool:
    return isinstance(state, dict) and state.get("schema") == SCHEMA and isinstance(state.get("lanes"), dict)


def collect(state_dir: Path, tick: dict, now: float) -> dict:
    """Gather the signals ``decide`` needs. Local files only: no GitHub or Linear calls."""
    root = Path(state_dir)
    doctor = _read_json(root / "doctor.json")
    observed = {}
    alerts: list[str] = []
    fresh = False
    throughput = {}
    if isinstance(doctor, dict):
        if isinstance(doctor.get("observed"), dict):
            observed = doctor["observed"]
        stamp = _as_number(observed.get("now"))
        fresh = stamp is not None and 0 <= now - stamp <= STALE_S
        if isinstance(doctor.get("alerts"), dict):
            alerts = [key for key in doctor["alerts"] if isinstance(key, str)]
        feed = doctor.get("statusFeed")
        if isinstance(feed, dict):
            throughput = ((feed.get("throughput") or {}).get("providers") or {})
    if not throughput:
        status = _read_json(root / "lanes-status.json")
        if isinstance(status, dict):
            throughput = ((status.get("throughput") or {}).get("providers") or {})
    if not isinstance(throughput, dict):
        throughput = {}
    api = _read_json(root / "api-budget.json")
    if not isinstance(api, dict):
        api = {}
    cooling = []
    cooldown_at = {}
    cool_dir = root / "cooldown"
    if cool_dir.is_dir():
        for path in sorted(cool_dir.iterdir()):
            try:
                cooldown_at[path.name] = path.stat().st_mtime
                if float(path.read_text()) > now:
                    cooling.append(path.name)
            except (OSError, ValueError):
                continue
    latest_bank = None
    accounts = _read_json(root / "codex-accounts.json")
    if isinstance(accounts, dict):
        for entry in accounts.values():
            if not isinstance(entry, dict) or entry.get("lastKind") not in ("rate", "limit", "usage"):
                continue
            stamp = _as_number(entry.get("lastRunAt"))
            if stamp is not None:
                latest_bank = stamp if latest_bank is None else max(latest_bank, stamp)
    running = {}
    capacity = observed.get("capacityByProvider") if isinstance(observed.get("capacityByProvider"), dict) else {}
    for name, row in capacity.items():
        if isinstance(row, dict):
            seats = _as_int(row.get("running"))
            if seats is not None:
                running[name] = seats
    tick_obs = observed.get("tick") if isinstance(observed.get("tick"), dict) else {}
    unhealthy = [item for item in (tick_obs.get("unhealthy") or []) if isinstance(item, str)]
    productive = {}
    starts = {}
    for name, metric in throughput.items():
        if isinstance(metric, dict):
            productive[name] = metric.get("productiveRunRate")
            starts[name] = metric.get("workerStarts")
    disk = tick.get("disk") if isinstance(tick, dict) and isinstance(tick.get("disk"), dict) else {}
    attribution = observed.get("codexAttribution") if isinstance(observed.get("codexAttribution"), dict) else {}
    unleased = _as_int(attribution.get("unleasedAvailable"))
    maintenance = observed.get("maintenanceQueueByProvider")
    if not isinstance(maintenance, dict):
        maintenance = {}
    return {
        "doctorFresh": fresh,
        "eligiblePoolByProvider": observed.get("eligiblePoolByProvider") if isinstance(observed.get("eligiblePoolByProvider"), dict) else {},
        "newIssueBudgetByProvider": observed.get("newIssueBudgetByProvider") if isinstance(observed.get("newIssueBudgetByProvider"), dict) else {},
        "maintenanceQueueByProvider": maintenance,
        "runningByProvider": running,
        "unhealthy": unhealthy,
        "cooling": cooling,
        "cooldownAt": cooldown_at,
        "rateBankAt": {"codex": latest_bank} if latest_bank is not None else {},
        "codexUnleasedAvailable": unleased,
        "productiveRunRate": productive,
        "starts": starts,
        "alerts": alerts,
        "gateWaitMedianS24h": observed.get("gateWaitMedianS24h"),
        "githubRemaining": _as_int(observed.get("githubRemaining")),
        "linearRemaining": _as_int(api.get("linearRemaining")),
        "linearLimit": _as_int(api.get("linearLimit")),
        "linearRateLimitedAt": _as_number(api.get("linearRateLimitedAt")),
        "disk": {"admitted": disk.get("admitted"), "freePct": disk.get("freePct")},
    }


def _load_ratio(sample: dict) -> float | None:
    load = _as_number(sample.get("load1"))
    cpu = _as_int(sample.get("cpuCount"))
    if load is None or cpu is None or cpu <= 0:
        return None
    return load / cpu


def _psi_known(psi) -> bool:
    return isinstance(psi, dict) and all(_as_number(psi.get(key)) is not None
                                        for key in ("cpuSomeAvg10", "memoryFullAvg10", "ioFullAvg10"))


def _psi_severe(psi: dict) -> bool:
    return (psi["cpuSomeAvg10"] >= PSI_CPU_SEVERE or psi["memoryFullAvg10"] >= PSI_MEM_SEVERE
            or psi["ioFullAvg10"] >= PSI_IO_SEVERE)


def _lane_ceiling(name: str, base: int, running, obs: dict, config: dict) -> int:
    if base <= 0:
        return 0
    named = (config.get("max") or {}).get(name)
    cap = named if isinstance(named, int) and named > 0 else 2 * base
    if name == "codex":
        unleased = obs.get("codexUnleasedAvailable")
        if unleased is None or running is None:
            cap = min(cap, base)
        else:
            cap = min(cap, max(0, running) + max(0, unleased))
    return max(MIN_SLOTS, cap)


def _demand(name: str, obs: dict) -> int | None:
    budget = (obs.get("newIssueBudgetByProvider") or {}).get(name) or {}
    if not isinstance(budget, dict):
        return None
    reason = budget.get("reason")
    maint = (obs.get("maintenanceQueueByProvider") or {}).get(name, 0)
    if not isinstance(maint, int) or isinstance(maint, bool) or maint < 0:
        return None
    if reason == "within-budget":
        eligible = (obs.get("eligiblePoolByProvider") or {}).get(name, 0)
        if not isinstance(eligible, int) or isinstance(eligible, bool) or eligible < 0:
            return None
        return eligible + maint
    if reason in ("over-budget", "terminal-pr-backlog", "provider-disabled", "pr-inventory-unavailable"):
        return maint
    return None


def _budget_unknown(obs: dict) -> str | None:
    if _as_int(obs.get("githubRemaining")) is None:
        return "github-unknown"
    remaining, limit = _as_int(obs.get("linearRemaining")), _as_int(obs.get("linearLimit"))
    if remaining is None or limit is None or limit <= 0:
        return "linear-unknown"
    return None


def _multi_reason(name: str, obs: dict, sample: dict, now: float) -> str | None:
    bank = _as_number((obs.get("rateBankAt") or {}).get(name))
    if bank is not None and now - bank <= MULTIPLICATIVE_WINDOW_S:
        return "rate-limited"
    written = _as_number((obs.get("cooldownAt") or {}).get(name))
    if written is not None and now - written <= MULTIPLICATIVE_WINDOW_S:
        return "rate-limited"
    github = _as_int(obs.get("githubRemaining"))
    if github is not None and github < GITHUB_DECREASE_BELOW:
        return "github-budget-low"
    limited = _as_number(obs.get("linearRateLimitedAt"))
    if limited is not None and now - limited <= RATE_QUIET_S:
        return "linear-ratelimited"
    remaining, limit = _as_int(obs.get("linearRemaining")), _as_int(obs.get("linearLimit"))
    if remaining is not None and limit is not None and limit > 0 and remaining / limit < LINEAR_DECREASE_RATIO:
        return "linear-ratelimited"
    disk = obs.get("disk") or {}
    free = _as_number(disk.get("freePct"))
    if disk.get("admitted") is False or (free is not None and free <= DISK_HARD):
        return "host-pressure"
    mem = _as_number(sample.get("memAvailableBytes"))
    if mem is not None and mem < MEM_EMERGENCY_BYTES:
        return "host-pressure"
    psi = sample.get("psi")
    if _psi_known(psi) and _psi_severe(psi):
        return "host-pressure"
    return None


def _additive_reason(obs: dict, sample: dict) -> str | None:
    load = _load_ratio(sample)
    if load is not None and load >= LOAD_DECREASE_MIN:
        return "host-pressure"
    mem = _as_number(sample.get("memAvailableBytes"))
    if mem is not None and mem < MEM_HEADROOM_BYTES:
        return "host-pressure"
    free = _as_number((obs.get("disk") or {}).get("freePct"))
    if free is not None and free < DISK_SOFT:
        return "host-pressure"
    alerts = set(obs.get("alerts") or [])
    if "failed-runs" in alerts or "gate-timeouts" in alerts:
        return "gate-pressure"
    gate = _as_number(obs.get("gateWaitMedianS24h"))
    if gate is not None and gate > GATE_WAIT_DECREASE:
        return "gate-pressure"
    return None


def _increase_blockers(name: str, obs: dict, sample: dict, now: float, running, demand) -> list[str]:
    blockers = []
    budget = (obs.get("newIssueBudgetByProvider") or {}).get(name) or {}
    reason = budget.get("reason") if isinstance(budget, dict) else None
    if reason == "over-budget":
        blockers.append("over-budget")
    elif reason == "terminal-pr-backlog":
        blockers.append("terminal-pr-backlog")
    if demand is None:
        blockers.append("unknown-demand")
    elif demand <= 0:
        blockers.append("zero-demand")
    if name in set(obs.get("unhealthy") or []):
        blockers.append("unhealthy")
    if name in set(obs.get("cooling") or []):
        blockers.append("cooling")
    bank = _as_number((obs.get("rateBankAt") or {}).get(name))
    if bank is not None and now - bank <= RATE_QUIET_S:
        blockers.append("rate-bank")
    if name == "codex" and (obs.get("codexUnleasedAvailable") is None or obs.get("codexUnleasedAvailable") < 1):
        blockers.append("codex-unleased")
    if running is None or running < 0:
        blockers.append("unknown-running")
    starts = (obs.get("starts") or {}).get(name)
    rate = (obs.get("productiveRunRate") or {}).get(name)
    start_count = _as_int(starts)
    if start_count is None or start_count < PRODUCTIVE_MIN_STARTS:
        pass
    elif _as_number(rate) is None or rate < PRODUCTIVE_MIN:
        blockers.append("low-productive-rate")
    alerts = set(obs.get("alerts") or [])
    if "failed-runs" in alerts or "gate-timeouts" in alerts:
        blockers.append("gate-pressure")
    gate = obs.get("gateWaitMedianS24h")
    if gate is not None and (_as_number(gate) is None or gate >= GATE_WAIT_INCREASE_MAX):
        blockers.append("gate-wait")
    load = _load_ratio(sample)
    if load is None or load >= LOAD_INCREASE_MAX:
        blockers.append("high-load")
    mem = sample.get("memAvailableBytes")
    if mem is not None and (_as_number(mem) is None or mem < MEM_HEADROOM_BYTES):
        blockers.append("low-mem")
    psi = sample.get("psi")
    if psi is not None:
        if not _psi_known(psi) or psi["cpuSomeAvg10"] > PSI_CPU_OK or psi["memoryFullAvg10"] > PSI_MEM_OK \
                or psi["ioFullAvg10"] > PSI_IO_OK:
            blockers.append("psi-high")
    disk = obs.get("disk") or {}
    free = _as_number(disk.get("freePct"))
    if disk.get("admitted") is not True or free is None or free <= DISK_INCREASE_MIN:
        blockers.append("disk-low")
    github = _as_int(obs.get("githubRemaining"))
    if github is None:
        blockers.append("github-unknown")
    elif github < GITHUB_INCREASE_MIN:
        blockers.append("github-budget")
    remaining, limit = _as_int(obs.get("linearRemaining")), _as_int(obs.get("linearLimit"))
    if remaining is None or limit is None or limit <= 0:
        blockers.append("linear-unknown")
    elif remaining / limit < LINEAR_INCREASE_RATIO:
        blockers.append("linear-budget")
    return blockers


def _blank_lane(base: int, running, changed, reason: str, blockers: list[str], ceiling: int | None = None) -> dict:
    floor = MIN_SLOTS if base > 0 else 0
    return {
        "base": base, "effective": base, "floor": floor,
        "ceiling": base if ceiling is None else ceiling, "running": running,
        "upStreak": 0, "idleStreak": 0, "lastChangeAt": changed,
        "lastReason": reason, "blockers": blockers,
    }


def decide(previous: dict | None, obs: dict, host_sample: dict, bases: dict, config: dict, now: float) -> dict:
    """Pure AIMD step. Returns the next ``symphony-lanes-autoscale/v1`` receipt."""
    previous = previous if isinstance(previous, dict) else {}
    prev_lanes = previous.get("lanes") if isinstance(previous.get("lanes"), dict) else {}
    prev_host = previous.get("host") if isinstance(previous.get("host"), dict) else {}
    history = [row for row in (previous.get("history") or []) if isinstance(row, dict)]
    interval = _positive_int((config or {}).get("intervalS")) or DEFAULT_INTERVAL_S
    up_need = streak_ticks(interval)
    idle_need = up_need
    host_last = _as_number(prev_host.get("lastChangeAt"))
    cpu = _as_int((host_sample or {}).get("cpuCount")) or 1
    if cpu <= 0:
        cpu = 1
    enabled_bases = {name: base for name, base in bases.items() if _as_int(base) is not None and base > 0}
    base_sum = sum(enabled_bases.values())
    host_max = (config or {}).get("hostMax")
    host_ceiling = min(host_max if isinstance(host_max, int) and host_max > 0 else 2 * base_sum, cpu)
    host_cap = max(host_ceiling, base_sum)
    fresh = bool(obs.get("doctorFresh"))
    unknown_budget = _budget_unknown(obs) if fresh else None
    rows = {}
    pending = []
    for order, (name, raw_base) in enumerate(bases.items()):
        base = _as_int(raw_base) or 0
        prev = prev_lanes.get(name) if isinstance(prev_lanes.get(name), dict) else {}
        changed = _as_number(prev.get("lastChangeAt"))
        running = _as_int((obs.get("runningByProvider") or {}).get(name))
        if base <= 0:
            rows[name] = _blank_lane(0, running, changed, "hold:disabled", ["disabled"], ceiling=0)
            continue
        ceiling = _lane_ceiling(name, base, running, obs, config or {})
        if not fresh:
            rows[name] = _blank_lane(base, running, changed, "hold:stale-doctor", ["stale-doctor"], ceiling=ceiling)
            continue
        current = _as_int(prev.get("effective"))
        if current is None or current < MIN_SLOTS:
            current = base
        up = _as_int(prev.get("upStreak")) or 0
        idle = _as_int(prev.get("idleStreak")) or 0
        demand = _demand(name, obs)
        multi = _multi_reason(name, obs, host_sample or {}, now)
        additive = _additive_reason(obs, host_sample or {})
        effective = current
        reason = "hold:steady"
        blockers: list[str] = []
        want = False
        if multi:
            effective = max(MIN_SLOTS, math.ceil(current / 2))
            reason, blockers, up, idle = multi, [multi], 0, 0
        elif additive:
            host_ready = host_last is None or now - host_last >= HOST_COOLDOWN_S
            if host_ready and current > MIN_SLOTS:
                effective = current - 1
                reason, blockers = additive, [additive]
            else:
                reason, blockers = "hold:host-cooldown", [additive, "host-cooldown"]
            up, idle = 0, 0
        else:
            idle_signal = (demand == 0 and running is not None and running <= current - 2)
            idle = min(idle_need, idle + 1) if idle_signal else 0
            lane_ready = changed is None or now - changed >= interval
            floor = idle_floor(base)
            if idle_signal and current <= floor:
                up = 0
                reason, blockers = "hold:idle-floor", ["idle-floor"]
            elif idle_signal and idle >= idle_need and current > floor:
                up = 0
                if lane_ready:
                    effective = current - 1
                    reason, blockers, idle = "idle-decay", [], 0
                else:
                    reason, blockers = "hold:lane-cooldown", ["lane-cooldown"]
            elif idle_signal:
                # Streak is still accumulating. Zero demand must not scale the lane up.
                up = 0
                reason, blockers = "hold:zero-demand", ["zero-demand"]
            else:
                blockers = _increase_blockers(name, obs, host_sample or {}, now, running, demand)
                if running is not None and running < current and "unknown-running" not in blockers:
                    blockers = ["not-saturated", *blockers]
                if blockers:
                    up = 0
                    reason = "hold:" + blockers[0]
                else:
                    up = min(up_need, up + 1)
                    host_ready = host_last is None or now - host_last >= HOST_COOLDOWN_S
                    if not lane_ready:
                        reason, blockers = "hold:lane-cooldown", ["lane-cooldown"]
                    elif not host_ready:
                        reason, blockers = "hold:host-cooldown", ["host-cooldown"]
                    elif current + 1 > ceiling:
                        reason, blockers = "hold:lane-ceiling", ["lane-ceiling"]
                    elif up < up_need:
                        reason, blockers = "hold:up-streak", ["up-streak"]
                    else:
                        want = True
                        reason, blockers = "hold:one-lane", ["one-lane"]
        if current > ceiling and effective > ceiling:
            effective = max(MIN_SLOTS, ceiling)
            reason, blockers = "hold:lane-ceiling", ["lane-ceiling"]
        rows[name] = {
            "base": base, "effective": effective, "floor": MIN_SLOTS, "ceiling": ceiling,
            "running": running, "upStreak": up, "idleStreak": idle, "lastChangeAt": changed,
            "lastReason": reason, "blockers": blockers,
        }
        if want:
            pending.append((demand or 0, order, name, current))
    if pending:
        ranked = sorted(pending, key=lambda item: (item[0] / max(1, item[3]), -item[1]), reverse=True)
        used = sum(row["effective"] for row in rows.values())
        for _demand_value, _order, chosen, current in ranked:
            row = rows[chosen]
            if used + 1 <= host_cap and current + 1 <= row["ceiling"]:
                row["effective"] = current + 1
                row["lastReason"] = "sustained-demand"
                row["blockers"] = []
                row["upStreak"] = 0
                break
            row["lastReason"] = "hold:host-ceiling"
            row["blockers"] = ["host-ceiling"]
    for name, row in rows.items():
        base = row["base"]
        if base > 0 and fresh and unknown_budget and row["effective"] > base:
            row["effective"] = base
            row["lastReason"] = "hold:" + unknown_budget
            row["blockers"] = [unknown_budget]
            row["upStreak"] = 0
        prev = prev_lanes.get(name) if isinstance(prev_lanes.get(name), dict) else {}
        before = _as_int(prev.get("effective"))
        if before is None:
            before = base
        if row["effective"] != before:
            row["lastChangeAt"] = now
            history.append({"at": now, "lane": name, "from": before, "to": row["effective"],
                            "reason": row["lastReason"]})
            host_last = now
    any_change = host_last is not None and host_last == now and any(
        row.get("lastChangeAt") == now for row in rows.values())
    return {
        "schema": SCHEMA,
        "mode": (config or {}).get("mode") or "apply",
        "observedAt": now,
        "host": {"lastChangeAt": host_last, "ceiling": host_cap, "cpuCount": cpu},
        "lanes": rows,
        "hostSample": host_sample,
        "apiBudget": {
            "githubRemaining": _as_int(obs.get("githubRemaining")),
            "linearRemaining": _as_int(obs.get("linearRemaining")),
            "linearLimit": _as_int(obs.get("linearLimit")),
            "linearRateLimitedAt": _as_number(obs.get("linearRateLimitedAt")),
        },
        "history": history[-HISTORY_CAP:],
        "_changed": any_change,
    }


def write_state(state_dir, state: dict) -> None:
    """Atomic replace, mode 0644. ``_changed`` is internal and not persisted."""
    path = Path(state_dir) / "autoscale.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {key: value for key, value in state.items() if key != "_changed"}
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(payload, indent=1, sort_keys=True))
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def effective_slots(state_dir: Path, name: str, base: int, now: float | None = None) -> int:
    """Apply-mode slot count, or ``base`` on every fail-safe. ``base <= 0`` stays ``base``."""
    if base <= 0 or mode() != "apply":
        return base
    now = time.time() if now is None else now
    state = _read_json(Path(state_dir) / "autoscale.json")
    if not _valid_state(state):
        return base
    observed = _as_number(state.get("observedAt"))
    if observed is None or now - observed > STALE_S or now < observed:
        return base
    row = state["lanes"].get(name)
    if not isinstance(row, dict):
        return base
    effective = _as_int(row.get("effective"))
    if effective is None:
        return base
    floor = _as_int(row.get("floor"))
    if floor is None:
        floor = MIN_SLOTS
    ceiling = _as_int(row.get("ceiling"))
    if ceiling is None:
        ceiling = effective
    return max(floor, min(ceiling, effective))


def apply_tick(state_dir, tick: dict, bases: dict, now: float | None = None,
               host_sample: dict | None = None, config: dict | None = None) -> dict:
    """Read local signals, decide, and write the receipt. Returns the tick summary."""
    now = time.time() if now is None else now
    config = config or load_config()
    obs = collect(state_dir, tick, now)
    previous = _read_json(Path(state_dir) / "autoscale.json")
    sample = host_sample if host_sample is not None else sample_host()
    state = decide(previous if _valid_state(previous) else None, obs, sample, bases, config, now)
    write_state(state_dir, state)
    return {
        "mode": config["mode"],
        "lanes": {name: {"base": row["base"], "effective": row["effective"], "reason": row["lastReason"]}
                  for name, row in state["lanes"].items()},
    }


def public_block(state_dir) -> dict:
    """Doctor / status-feed view: mode, per-lane base/effective/reason/blockers, last 10 history rows."""
    state = _read_json(Path(state_dir) / "autoscale.json")
    if not _valid_state(state):
        return {"mode": mode(), "lanes": {}, "history": []}
    lanes = {}
    for name, row in state["lanes"].items():
        if isinstance(row, dict):
            lanes[name] = {
                "base": row.get("base"), "effective": row.get("effective"),
                "reason": row.get("lastReason"), "blockers": list(row.get("blockers") or []),
            }
    history = state.get("history") if isinstance(state.get("history"), list) else []
    return {"mode": state.get("mode") or mode(), "lanes": lanes, "history": history[-10:]}


def record_linear_budget(state_dir, headers, status: int, raw: bytes) -> None:
    """Best-effort Linear rate-limit capture. Callers swallow errors from this function."""
    root = Path(state_dir)
    path = root / "api-budget.json"
    current = _read_json(path)
    if not isinstance(current, dict):
        current = {}
    updated = False
    if headers is not None and hasattr(headers, "get"):
        for header, key in (
            ("X-RateLimit-Requests-Remaining", "linearRemaining"),
            ("X-RateLimit-Requests-Limit", "linearLimit"),
            ("X-RateLimit-Requests-Reset", "linearReset"),
        ):
            raw_value = headers.get(header)
            if raw_value is None or raw_value == "":
                continue
            if key == "linearReset":
                current[key] = str(raw_value)
            else:
                parsed = _positive_int(raw_value)
                if parsed is None:
                    try:
                        parsed = int(str(raw_value).strip())
                    except (TypeError, ValueError):
                        parsed = None
                if parsed is not None and parsed >= 0:
                    current[key] = parsed
            updated = True
    if status == 400 and raw:
        try:
            payload = json.loads(raw.decode())
        except (UnicodeDecodeError, ValueError):
            payload = None
        errors = payload.get("errors") if isinstance(payload, dict) else None
        if isinstance(errors, list) and any(
                isinstance(item, dict) and (item.get("extensions") or {}).get("code") == "RATELIMITED"
                for item in errors):
            current["linearRateLimitedAt"] = time.time()
            updated = True
    if not updated:
        return
    current["observedAt"] = time.time()
    root.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(current, indent=1, sort_keys=True))
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)
