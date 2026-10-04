#!/usr/bin/env python3
"""Adaptive per-lane slot counts for the existing minute dispatch tick.

Default mode is apply. ``SYMPHONY_AUTOSCALE=0`` (or ``off`` / ``false``) is the
kill switch and leaves ``Host.slots()`` on the configured base. ``decide()``
is pure: dispatch reads local files, then writes one ``autoscale.json`` receipt.
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


def _nonneg_int(value) -> int | None:
    parsed = _positive_int(value)
    if parsed is None:
        try:
            parsed = int(str(value).strip())
        except (TypeError, ValueError):
            parsed = None
    return parsed if parsed is not None and parsed >= 0 else None


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
        key, sep, value = stripped.partition("=")
        if not sep or not stripped or stripped.startswith("#"):
            continue
        key = key.strip().removeprefix("export ").strip()
        if key == "SYMPHONY_AUTOSCALE" or key.startswith("SYMPHONY_AUTOSCALE_"):
            found[key] = value.strip().strip('"').strip("'")
    return found


def _merged(env, config: Path) -> dict:
    """Environment wins per key. An invalid env value does not fall through to the file."""
    merged = _parse_file(config)
    for key, value in env.items():
        if key == "SYMPHONY_AUTOSCALE" or key.startswith("SYMPHONY_AUTOSCALE_"):
            merged[key], merged["__env__" + key] = value, True
    return merged


def _from_env_or_file(env, file_vals: dict, key: str):
    if key in env:
        return _positive_int(env.get(key))
    if key in file_vals:
        return _positive_int(file_vals.get(key))
    return None


def _config_path(config) -> Path:
    return config if config is not None else Path.home() / ".config" / "jovie-lanes" / "autoscale.env"


def mode(env=None, config=None) -> str:
    """``off`` | ``observe`` | ``apply``. Unset, or a missing config line, is apply."""
    env = os.environ if env is None else env
    config = _config_path(config)
    if "SYMPHONY_AUTOSCALE" in env:
        return _parse_mode(env.get("SYMPHONY_AUTOSCALE"))
    file_vals = _parse_file(config)
    return _parse_mode(file_vals.get("SYMPHONY_AUTOSCALE")) if "SYMPHONY_AUTOSCALE" in file_vals else "apply"


def load_config(env=None, config=None) -> dict:
    """Mode plus optional ceilings and the cadence interval."""
    env = os.environ if env is None else env
    file_vals = _parse_file(_config_path(config))
    prefix = "SYMPHONY_AUTOSCALE_MAX_"
    keys = set(file_vals) | {key for key in env if key.startswith("SYMPHONY_AUTOSCALE")}
    maxima = {key[len(prefix):].strip().lower(): parsed
              for key in keys if key.startswith(prefix) and key[len(prefix):].strip()
              for parsed in (_from_env_or_file(env, file_vals, key),) if parsed is not None}
    interval = _from_env_or_file(env, file_vals, "SYMPHONY_AUTOSCALE_INTERVAL_S") or DEFAULT_INTERVAL_S
    return {"mode": mode(env, config), "max": maxima, "intervalS": interval,
            "hostMax": _from_env_or_file(env, file_vals, "SYMPHONY_AUTOSCALE_HOST_MAX")}


def sample_host(proc_root=Path("/proc")) -> dict:
    """Local CPU, load, MemAvailable and PSI. Memory and PSI are None when absent (macOS)."""
    try:
        load1 = os.getloadavg()[0]
    except OSError:
        load1 = None
    try:
        mem = next((int(line.split()[1]) * 1024
                    for line in (Path(proc_root) / "meminfo").read_text().splitlines()
                    if line.startswith("MemAvailable:")), None)
    except (OSError, ValueError, IndexError):
        mem = None
    pressure = Path(proc_root) / "pressure"
    psi = None
    if pressure.is_dir():
        psi = {key: _pressure_avg(pressure / name, label)
               for key, name, label in (("cpuSomeAvg10", "cpu", "some"),
                                        ("memoryFullAvg10", "memory", "full"),
                                        ("ioFullAvg10", "io", "full"))}
    return {"cpuCount": os.cpu_count() or 1, "load1": load1, "memAvailableBytes": mem, "psi": psi}


def _pressure_avg(path: Path, label: str) -> float | None:
    try:
        for line in path.read_text().splitlines():
            if line.startswith(label):
                found = _AVG10.search(line)
                return float(found.group(1)) if found else None
    except (OSError, ValueError):
        pass
    return None


def _read_json(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def _valid_state(state) -> bool:
    return isinstance(state, dict) and state.get("schema") == SCHEMA and isinstance(state.get("lanes"), dict)


def _section(source, key: str) -> dict:
    value = source.get(key) if isinstance(source, dict) else None
    return value if isinstance(value, dict) else {}


def collect(state_dir: Path, tick: dict, now: float) -> dict:
    """Gather the signals ``decide`` needs. Local files only: no GitHub or Linear calls."""
    root = Path(state_dir)
    doctor = _read_json(root / "doctor.json")
    observed, alerts, fresh, throughput = {}, [], False, {}
    if isinstance(doctor, dict):
        observed = _section(doctor, "observed")
        stamp = _as_number(observed.get("now"))
        fresh = stamp is not None and 0 <= now - stamp <= STALE_S
        alerts = [key for key in _section(doctor, "alerts") if isinstance(key, str)]
        throughput = _section(_section(doctor, "statusFeed").get("throughput"), "providers")
    if not throughput:
        throughput = _section(_section(_read_json(root / "lanes-status.json"), "throughput"), "providers")
    api = _read_json(root / "api-budget.json")
    api = api if isinstance(api, dict) else {}
    cooling, cooldown_at = [], {}
    cool_dir = root / "cooldown"
    if cool_dir.is_dir():
        for path in sorted(cool_dir.iterdir()):
            try:
                cooldown_at[path.name] = path.stat().st_mtime
                if float(path.read_text()) > now:
                    cooling.append(path.name)
            except (OSError, ValueError):
                continue
    accounts = _read_json(root / "codex-accounts.json")
    latest_bank = None
    for entry in (accounts if isinstance(accounts, dict) else {}).values():
        stamp = _as_number(entry.get("lastRunAt")) if isinstance(entry, dict) else None
        if stamp is not None and entry.get("lastKind") in ("rate", "limit", "usage"):
            latest_bank = stamp if latest_bank is None else max(latest_bank, stamp)
    running = {name: seats for name, row in _section(observed, "capacityByProvider").items()
               if isinstance(row, dict)
               for seats in (_as_int(row.get("running")),) if seats is not None}
    unhealthy = [item for item in (_section(observed, "tick").get("unhealthy") or [])
                 if isinstance(item, str)]
    metrics = {name: m for name, m in throughput.items() if isinstance(m, dict)}
    productive = {name: m.get("productiveRunRate") for name, m in metrics.items()}
    starts = {name: m.get("workerStarts") for name, m in metrics.items()}
    disk = _section(tick if isinstance(tick, dict) else {}, "disk")
    unleased = _as_int(_section(observed, "codexAttribution").get("unleasedAvailable"))
    return {
        "doctorFresh": fresh, "runningByProvider": running, "unhealthy": unhealthy,
        "eligiblePoolByProvider": _section(observed, "eligiblePoolByProvider"),
        "newIssueBudgetByProvider": _section(observed, "newIssueBudgetByProvider"),
        "maintenanceQueueByProvider": _section(observed, "maintenanceQueueByProvider"),
        "cooling": cooling, "cooldownAt": cooldown_at, "codexUnleasedAvailable": unleased,
        "rateBankAt": {"codex": latest_bank} if latest_bank is not None else {},
        "productiveRunRate": productive, "starts": starts, "alerts": alerts,
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
        cap = min(cap, base if unleased is None or running is None
                  else max(0, running) + max(0, unleased))
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
    return maint if reason in ("over-budget", "terminal-pr-backlog", "provider-disabled",
                               "pr-inventory-unavailable") else None


def _budget_unknown(obs: dict) -> str | None:
    if _as_int(obs.get("githubRemaining")) is None:
        return "github-unknown"
    remaining, limit = _as_int(obs.get("linearRemaining")), _as_int(obs.get("linearLimit"))
    return "linear-unknown" if remaining is None or limit is None or limit <= 0 else None


def _multi_reason(name: str, obs: dict, sample: dict, now: float) -> str | None:
    bank = _as_number((obs.get("rateBankAt") or {}).get(name))
    written = _as_number((obs.get("cooldownAt") or {}).get(name))
    recent = lambda stamp: stamp is not None and now - stamp <= MULTIPLICATIVE_WINDOW_S
    if recent(bank) or recent(written):
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
    mem = _as_number(sample.get("memAvailableBytes"))
    free = _as_number((obs.get("disk") or {}).get("freePct"))
    if (load is not None and load >= LOAD_DECREASE_MIN) or (mem is not None and mem < MEM_HEADROOM_BYTES) \
            or (free is not None and free < DISK_SOFT):
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
    if reason in ("over-budget", "terminal-pr-backlog"):
        blockers.append(reason)
    if demand is None:
        blockers.append("unknown-demand")
    elif demand <= 0:
        blockers.append("zero-demand")
    if name in set(obs.get("unhealthy") or []): blockers.append("unhealthy")
    if name in set(obs.get("cooling") or []): blockers.append("cooling")
    bank = _as_number((obs.get("rateBankAt") or {}).get(name))
    if bank is not None and now - bank <= RATE_QUIET_S: blockers.append("rate-bank")
    if name == "codex" and (obs.get("codexUnleasedAvailable") is None
                            or obs.get("codexUnleasedAvailable") < 1):
        blockers.append("codex-unleased")
    if running is None or running < 0: blockers.append("unknown-running")
    start_count = _as_int((obs.get("starts") or {}).get(name))
    rate = (obs.get("productiveRunRate") or {}).get(name)
    if start_count is not None and start_count >= PRODUCTIVE_MIN_STARTS and (
            _as_number(rate) is None or rate < PRODUCTIVE_MIN):
        blockers.append("low-productive-rate")
    alerts = set(obs.get("alerts") or [])
    if "failed-runs" in alerts or "gate-timeouts" in alerts:
        blockers.append("gate-pressure")
    gate = obs.get("gateWaitMedianS24h")
    if gate is not None and (_as_number(gate) is None or gate >= GATE_WAIT_INCREASE_MAX):
        blockers.append("gate-wait")
    load = _load_ratio(sample)
    if load is None or load >= LOAD_INCREASE_MAX: blockers.append("high-load")
    mem = sample.get("memAvailableBytes")
    if mem is not None and (_as_number(mem) is None or mem < MEM_HEADROOM_BYTES):
        blockers.append("low-mem")
    psi = sample.get("psi")
    if psi is not None and (not _psi_known(psi) or psi["cpuSomeAvg10"] > PSI_CPU_OK
                            or psi["memoryFullAvg10"] > PSI_MEM_OK or psi["ioFullAvg10"] > PSI_IO_OK):
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


def _hold(tag: str):
    return "hold:" + tag, [tag]


def _blank_lane(base: int, running, changed, reason: str, blockers: list[str], ceiling: int | None = None) -> dict:
    return {"base": base, "effective": base, "floor": MIN_SLOTS if base > 0 else 0,
            "ceiling": base if ceiling is None else ceiling, "running": running,
            "upStreak": 0, "idleStreak": 0, "lastChangeAt": changed,
            "lastReason": reason, "blockers": blockers}


def decide(previous: dict | None, obs: dict, host_sample: dict, bases: dict, config: dict, now: float) -> dict:
    """Pure AIMD step. Returns the next ``symphony-lanes-autoscale/v1`` receipt."""
    previous = previous if isinstance(previous, dict) else {}
    prev_lanes = _section(previous, "lanes")
    host_last = _as_number(_section(previous, "host").get("lastChangeAt"))
    history = [row for row in (previous.get("history") or []) if isinstance(row, dict)]
    interval = _positive_int((config or {}).get("intervalS")) or DEFAULT_INTERVAL_S
    up_need = idle_need = streak_ticks(interval)
    cpu = _as_int((host_sample or {}).get("cpuCount")) or 1
    if cpu <= 0:
        cpu = 1
    base_sum = sum(base for base in bases.values() if _as_int(base) is not None and base > 0)
    host_max = (config or {}).get("hostMax")
    host_cap = max(min(host_max if isinstance(host_max, int) and host_max > 0 else 2 * base_sum, cpu),
                   base_sum)
    fresh = bool(obs.get("doctorFresh"))
    unknown_budget = _budget_unknown(obs) if fresh else None
    rows, pending = {}, []
    for order, (name, raw_base) in enumerate(bases.items()):
        base = _as_int(raw_base) or 0
        prev = _section(prev_lanes, name)
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
        current = base if current is None or current < MIN_SLOTS else current
        up = _as_int(prev.get("upStreak")) or 0
        idle = _as_int(prev.get("idleStreak")) or 0
        demand = _demand(name, obs)
        multi = _multi_reason(name, obs, host_sample or {}, now)
        additive = _additive_reason(obs, host_sample or {})
        effective, reason, want = current, "hold:steady", False
        effective, reason, want = current, "hold:steady", False
        blockers: list[str] = []
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
            idle_signal = demand == 0 and running is not None and running <= current - 2
            idle = min(idle_need, idle + 1) if idle_signal else 0
            lane_ready = changed is None or now - changed >= interval
            floor = idle_floor(base)
            if idle_signal and current <= floor:
                up = 0
                reason, blockers = _hold("idle-floor")
            elif idle_signal and idle >= idle_need and current > floor:
                up = 0
                if lane_ready:
                    effective = current - 1
                    reason, blockers, idle = "idle-decay", [], 0
                else:
                    reason, blockers = _hold("lane-cooldown")
            elif idle_signal:
                # Streak is still accumulating. Zero demand must not scale the lane up.
                up = 0
                reason, blockers = _hold("zero-demand")
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
                    tag = ("lane-cooldown" if not lane_ready else
                           "host-cooldown" if not host_ready else
                           "lane-ceiling" if current + 1 > ceiling else
                           "up-streak" if up < up_need else "one-lane")
                    want = tag == "one-lane"
                    reason, blockers = _hold(tag)
        if current > ceiling and effective > ceiling:
            effective = max(MIN_SLOTS, ceiling)
            reason, blockers = _hold("lane-ceiling")
        rows[name] = {"base": base, "effective": effective, "floor": MIN_SLOTS, "ceiling": ceiling,
                      "running": running, "upStreak": up, "idleStreak": idle, "lastChangeAt": changed,
                      "lastReason": reason, "blockers": blockers}
        if want:
            pending.append((demand or 0, order, name, current))
    if pending:
        ranked = sorted(pending, key=lambda item: (item[0] / max(1, item[3]), -item[1]), reverse=True)
        used = sum(row["effective"] for row in rows.values())
        for _demand_value, _order, chosen, current in ranked:
            row = rows[chosen]
            if used + 1 <= host_cap and current + 1 <= row["ceiling"]:
                row.update(effective=current + 1, lastReason="sustained-demand",
                           blockers=[], upStreak=0)
                break
            row.update(lastReason="hold:host-ceiling", blockers=["host-ceiling"])
    for name, row in rows.items():
        base = row["base"]
        if base > 0 and fresh and unknown_budget and row["effective"] > base:
            row.update(effective=base, lastReason="hold:" + unknown_budget,
                       blockers=[unknown_budget], upStreak=0)
        before = _as_int(_section(prev_lanes, name).get("effective"))
        if before is None:
            before = base
        if row["effective"] != before:
            row["lastChangeAt"] = now
            history.append({"at": now, "lane": name, "from": before, "to": row["effective"],
                            "reason": row["lastReason"]})
            host_last = now
    any_change = host_last == now and any(row.get("lastChangeAt") == now for row in rows.values())
    return {
        "schema": SCHEMA, "mode": (config or {}).get("mode") or "apply", "observedAt": now,
        "host": {"lastChangeAt": host_last, "ceiling": host_cap, "cpuCount": cpu},
        "lanes": rows, "hostSample": host_sample, "history": history[-HISTORY_CAP:],
        "apiBudget": {"githubRemaining": _as_int(obs.get("githubRemaining")),
                      "linearRemaining": _as_int(obs.get("linearRemaining")),
                      "linearLimit": _as_int(obs.get("linearLimit")),
                      "linearRateLimitedAt": _as_number(obs.get("linearRateLimitedAt"))},
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
    observed = _as_number(state.get("observedAt")) if _valid_state(state) else None
    row = state["lanes"].get(name) if observed is not None and 0 <= now - observed <= STALE_S else None
    if not isinstance(row, dict):
        return base
    effective = _as_int(row.get("effective"))
    if effective is None:
        return base
    floor = _as_int(row.get("floor"))
    ceiling = _as_int(row.get("ceiling"))
    return max(floor if floor is not None else MIN_SLOTS,
               min(ceiling if ceiling is not None else effective, effective))


def apply_tick(state_dir, tick: dict, bases: dict, now: float | None = None, host_sample: dict | None = None, config: dict | None = None) -> dict:
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
    lanes = {name: {"base": row.get("base"), "effective": row.get("effective"),
                    "reason": row.get("lastReason"), "blockers": list(row.get("blockers") or [])}
             for name, row in state["lanes"].items() if isinstance(row, dict)}
    history = state.get("history") if isinstance(state.get("history"), list) else []
    return {"mode": state.get("mode") or mode(), "lanes": lanes, "history": history[-10:]}


def record_linear_budget(state_dir, headers, status: int, raw: bytes) -> None:
    """Best-effort Linear rate-limit capture. Callers swallow errors from this function."""
    root = Path(state_dir)
    path = root / "api-budget.json"
    current = _read_json(path)
    current = current if isinstance(current, dict) else {}
    updated = False
    if headers is not None and hasattr(headers, "get"):
        for header, key in (("X-RateLimit-Requests-Remaining", "linearRemaining"),
                            ("X-RateLimit-Requests-Limit", "linearLimit"),
                            ("X-RateLimit-Requests-Reset", "linearReset")):
            raw_value = headers.get(header)
            if raw_value is None or raw_value == "":
                continue
            if key == "linearReset":
                current[key] = str(raw_value)
            else:
                parsed = _nonneg_int(raw_value)
                if parsed is not None:
                    current[key] = parsed
            updated = True
    if status == 400 and raw:
        try:
            payload = json.loads(raw.decode())
        except (UnicodeDecodeError, ValueError):
            payload = None
        errors = payload.get("errors") if isinstance(payload, dict) else None
        if isinstance(errors, list) and any(
                _section(item, "extensions").get("code") == "RATELIMITED" for item in errors):
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
