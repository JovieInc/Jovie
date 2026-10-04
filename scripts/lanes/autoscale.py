#!/usr/bin/env python3
"""Adaptive per-lane slots on the minute dispatch tick. Default mode is apply. Kill switch: SYMPHONY_AUTOSCALE=0. decide() is pure and does no I/O at import."""
from __future__ import annotations
import json; import math; import os; import re; import time; from datetime import datetime, timezone; from pathlib import Path; SCHEMA = "symphony-lanes-autoscale/v1"
MIN_SLOTS, STALE_S, RATE_QUIET_S = 1, 600, 900; MULTIPLICATIVE_WINDOW_S, HOST_COOLDOWN_S = 300, 120; DEFAULT_INTERVAL_S = LANE_COOLDOWN_S = 1800
UP_STREAK_REQUIRED = IDLE_STREAK_REQUIRED = DEFAULT_INTERVAL_S // 60; HISTORY_CAP, GIB = 50, 1024 ** 3
MEM_HEADROOM_BYTES, MEM_EMERGENCY_BYTES = 8 * GIB, 4 * GIB; GITHUB_INCREASE_MIN, GITHUB_DECREASE_BELOW = 1500, 600
LINEAR_INCREASE_RATIO, LINEAR_DECREASE_RATIO = 0.25, 0.10; LOAD_INCREASE_MAX, LOAD_DECREASE_MIN = 0.75, 1.0
PSI_CPU_OK, PSI_MEM_OK, PSI_IO_OK, PSI_CPU_SEVERE, PSI_MEM_SEVERE, PSI_IO_SEVERE = 20, 2, 10, 40, 5, 20
GATE_WAIT_INCREASE_MAX, GATE_WAIT_DECREASE, PRODUCTIVE_MIN, PRODUCTIVE_MIN_STARTS = 600, 1200, 0.5, 5; DISK_INCREASE_MIN, DISK_SOFT, DISK_HARD = 15, 10, 5
_OFF, _OBSERVE, _APPLY = frozenset({"0", "off", "false"}), frozenset({"observe", "shadow"}), frozenset({"1", "on", "true", "apply"})
_AVG10, _PSI = re.compile(r"avg10=([0-9.]+)"), ("cpuSomeAvg10", "memoryFullAvg10", "ioFullAvg10")
_HARD_REASONS = ("over-budget", "terminal-pr-backlog", "provider-disabled", "pr-inventory-unavailable")
def streak_ticks(interval_s: int) -> int:
    """Minute ticks in one cadence interval. 1800 s → 30 ticks."""
    return max(1, int(interval_s) // 60)
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
    if isinstance(value, (int, float)): return float(value)
    try: return datetime.strptime(str(value), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    except (TypeError, ValueError): return None
def _iso(when: float) -> str:
    return datetime.fromtimestamp(when, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
def _num(value) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None
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
    return {"mode": mode(env, config), "max": maxima, "hostMax": _from_env_or_file(env, file_vals, "SYMPHONY_AUTOSCALE_HOST_MAX"),
            "intervalS": _from_env_or_file(env, file_vals, "SYMPHONY_AUTOSCALE_INTERVAL_S") or DEFAULT_INTERVAL_S}
def _pressure_avg(path: Path, label: str) -> float | None:
    try:
        for line in path.read_text().splitlines():
            if line.startswith(label):
                found = _AVG10.search(line); return float(found.group(1)) if found else None
    except (OSError, ValueError):
        return None
    return None
def sample_host(proc_root=Path("/proc")) -> dict:
    """Local CPU, load, MemAvailable and PSI. Memory and PSI are None when absent."""
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
def _read_json(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None
def _valid_state(state) -> bool:
    return isinstance(state, dict) and state.get("schema") == SCHEMA and isinstance(state.get("lanes"), dict)
def collect(state_dir: Path, tick: dict, now: float) -> dict:
    """Local files only: no GitHub or Linear calls."""
    root, doctor = Path(state_dir), _obj(_read_json(Path(state_dir) / "doctor.json")); observed, stamp, feed = _obj(doctor.get("observed")), None, None
    stamp, feed = _num(observed.get("now")), doctor.get("statusFeed")
    throughput = _obj(_obj(feed).get("throughput")).get("providers") if isinstance(feed, dict) else None
    if not isinstance(throughput, dict):
        throughput = _obj(_obj(_obj(_read_json(root / "lanes-status.json")).get("throughput")).get("providers"))
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
    running, productive, starts = {}, {}, {}
    for name, row in _obj(observed.get("capacityByProvider")).items():
        seats = _int(_obj(row).get("running"))
        if seats is not None:
            running[name] = seats
    for name, metric in throughput.items():
        if isinstance(metric, dict):
            productive[name], starts[name] = metric.get("productiveRunRate"), metric.get("workerStarts")
    disk, attribution = _obj(_obj(tick).get("disk")), _obj(observed.get("codexAttribution")); maintenance = observed.get("maintenanceQueueByProvider")
    return {"doctorFresh": stamp is not None and 0 <= now - stamp <= STALE_S,
            "eligiblePoolByProvider": _obj(observed.get("eligiblePoolByProvider")),
            "newIssueBudgetByProvider": _obj(observed.get("newIssueBudgetByProvider")),
            "maintenanceQueueByProvider": maintenance if isinstance(maintenance, dict) else {},
            "runningByProvider": running,
            "unhealthy": [item for item in (_obj(observed.get("tick")).get("unhealthy") or []) if isinstance(item, str)],
            "cooling": cooling, "cooldownAt": cooldown_at,
            "rateBankAt": {"codex": latest} if latest is not None else {},
            "codexUnleasedAvailable": _int(attribution.get("unleasedAvailable")),
            "productiveRunRate": productive, "starts": starts,
            "alerts": [key for key in _obj(doctor.get("alerts")) if isinstance(key, str)],
            "gateWaitMedianS24h": observed.get("gateWaitMedianS24h"),
            "githubRemaining": _int(observed.get("githubRemaining")),
            "linearRemaining": _budget_int(api["remaining"] if "remaining" in api else api.get("linearRemaining")), "linearLimit": _budget_int(api["limit"] if "limit" in api else api.get("linearLimit")),
            "linearRateLimitedAt": _epoch(api["rateLimitedAt"] if "rateLimitedAt" in api else api.get("linearRateLimitedAt")),
            "disk": {"admitted": disk.get("admitted"), "freePct": disk.get("freePct")}}
def _load_ratio(sample: dict) -> float | None:
    load, cpu = _num(sample.get("load1")), _int(sample.get("cpuCount")); return None if load is None or cpu is None or cpu <= 0 else load / cpu
def _psi_known(psi) -> bool:
    return isinstance(psi, dict) and all(_num(psi.get(key)) is not None for key in _PSI)
def _lane_ceiling(name: str, base: int, running, obs: dict, config: dict) -> int:
    if base <= 0:
        return 0
    named = _obj(config.get("max")).get(name); cap = named if isinstance(named, int) and named > 0 else 2 * base
    if name == "codex":
        unleased = obs.get("codexUnleasedAvailable")
        cap = min(cap, base) if unleased is None or running is None else min(cap, max(0, running) + max(0, unleased))
    return max(MIN_SLOTS, cap)
def _demand(name: str, obs: dict) -> int | None:
    budget = _obj(_obj(obs.get("newIssueBudgetByProvider")).get(name)); maint = _count(_obj(obs.get("maintenanceQueueByProvider")).get(name, 0))
    if not budget or maint is None:
        return None
    if budget.get("reason") == "within-budget":
        eligible = _count(_obj(obs.get("eligiblePoolByProvider")).get(name, 0)); return None if eligible is None else eligible + maint
    return maint if budget.get("reason") in _HARD_REASONS else None
def _budget_unknown(obs: dict) -> str | None:
    if _int(obs.get("githubRemaining")) is None:
        return "github-unknown"
    remaining, limit = _int(obs.get("linearRemaining")), _int(obs.get("linearLimit"))
    return "linear-unknown" if remaining is None or limit is None or limit <= 0 else None
def _multi_reason(name: str, obs: dict, sample: dict, now: float) -> str | None:
    bank, written = _num(_obj(obs.get("rateBankAt")).get(name)), _num(_obj(obs.get("cooldownAt")).get(name))
    if (bank is not None and now - bank <= MULTIPLICATIVE_WINDOW_S) or (written is not None and now - written <= MULTIPLICATIVE_WINDOW_S):
        return "rate-limited"
    github, limited = _int(obs.get("githubRemaining")), _num(obs.get("linearRateLimitedAt"))
    remaining, limit = _int(obs.get("linearRemaining")), _int(obs.get("linearLimit"))
    if github is not None and github < GITHUB_DECREASE_BELOW:
        return "github-budget-low"
    if (limited is not None and now - limited <= RATE_QUIET_S) or (
            remaining is not None and limit is not None and limit > 0 and remaining / limit < LINEAR_DECREASE_RATIO):
        return "linear-ratelimited"
    disk, free, mem, psi = _obj(obs.get("disk")), _num(_obj(obs.get("disk")).get("freePct")), _num(sample.get("memAvailableBytes")), sample.get("psi")
    severe = _psi_known(psi) and (psi["cpuSomeAvg10"] >= PSI_CPU_SEVERE or psi["memoryFullAvg10"] >= PSI_MEM_SEVERE or psi["ioFullAvg10"] >= PSI_IO_SEVERE)
    if disk.get("admitted") is False or (free is not None and free <= DISK_HARD) or (mem is not None and mem < MEM_EMERGENCY_BYTES) or severe:
        return "host-pressure"
    return None
def _additive_reason(obs: dict, sample: dict) -> str | None:
    load, mem, free = _load_ratio(sample), _num(sample.get("memAvailableBytes")), _num(_obj(obs.get("disk")).get("freePct"))
    if (load is not None and load >= LOAD_DECREASE_MIN) or (mem is not None and mem < MEM_HEADROOM_BYTES) or (free is not None and free < DISK_SOFT):
        return "host-pressure"
    alerts, gate = set(obs.get("alerts") or []), _num(obs.get("gateWaitMedianS24h"))
    if "failed-runs" in alerts or "gate-timeouts" in alerts or (gate is not None and gate > GATE_WAIT_DECREASE):
        return "gate-pressure"
    return None
def _increase_blockers(name, obs, sample, now, running, demand) -> list[str]:
    reason = _obj(_obj(obs.get("newIssueBudgetByProvider")).get(name)).get("reason")
    github, gate = _int(obs.get("githubRemaining")), obs.get("gateWaitMedianS24h")
    remaining, limit = _int(obs.get("linearRemaining")), _int(obs.get("linearLimit"))
    load, mem, psi = _load_ratio(sample), sample.get("memAvailableBytes"), sample.get("psi")
    alerts, bank = set(obs.get("alerts") or []), _num(_obj(obs.get("rateBankAt")).get(name))
    disk, free = _obj(obs.get("disk")), _num(_obj(obs.get("disk")).get("freePct"))
    starts, rate = _int(_obj(obs.get("starts")).get(name)), _obj(obs.get("productiveRunRate")).get(name)
    pairs = (
        (reason in ("over-budget", "terminal-pr-backlog"), reason),
        (demand is None or demand <= 0, "unknown-demand" if demand is None else "zero-demand"),
        (name in set(obs.get("unhealthy") or []), "unhealthy"),
        (name in set(obs.get("cooling") or []), "cooling"),
        (bank is not None and now - bank <= RATE_QUIET_S, "rate-bank"),
        (name == "codex" and (obs.get("codexUnleasedAvailable") is None or obs.get("codexUnleasedAvailable") < 1), "codex-unleased"),
        (running is None or running < 0, "unknown-running"),
        (starts is not None and starts >= PRODUCTIVE_MIN_STARTS and (_num(rate) is None or rate < PRODUCTIVE_MIN), "low-productive-rate"),
        ("failed-runs" in alerts or "gate-timeouts" in alerts, "gate-pressure"),
        (gate is not None and (_num(gate) is None or gate >= GATE_WAIT_INCREASE_MAX), "gate-wait"),
        (load is None or load >= LOAD_INCREASE_MAX, "high-load"),
        (mem is not None and (_num(mem) is None or mem < MEM_HEADROOM_BYTES), "low-mem"),
        (psi is not None and (not _psi_known(psi) or any(psi[key] > limit for key, limit in zip(_PSI, (PSI_CPU_OK, PSI_MEM_OK, PSI_IO_OK)))), "psi-high"),
        (disk.get("admitted") is not True or free is None or free <= DISK_INCREASE_MIN, "disk-low"),
        (github is None or github < GITHUB_INCREASE_MIN, "github-unknown" if github is None else "github-budget"),
        (remaining is None or limit is None or limit <= 0, "linear-unknown"),
        (remaining is not None and limit not in (None, 0) and limit > 0 and remaining / limit < LINEAR_INCREASE_RATIO, "linear-budget"),
    )
    return [token for cond, token in pairs if cond]
def _row(base, effective, running, changed, reason, blockers, ceiling, up=0, idle=0, floor=None) -> dict:
    return {"base": base, "effective": effective, "floor": (MIN_SLOTS if base > 0 else 0) if floor is None else floor,
            "ceiling": ceiling, "running": running, "upStreak": up, "idleStreak": idle,
            "lastChangeAt": changed, "lastReason": reason, "blockers": blockers}
def decide(previous: dict | None, obs: dict, host_sample: dict, bases: dict, config: dict, now: float) -> dict:
    """Pure AIMD step. Returns the next ``symphony-lanes-autoscale/v1`` receipt."""
    previous, config, sample = _obj(previous), config or {}, host_sample or {}; prev_lanes, prev_host = _obj(previous.get("lanes")), _obj(previous.get("host"))
    history = [row for row in (previous.get("history") or []) if isinstance(row, dict)]
    interval, need = _pint(config.get("intervalS")) or DEFAULT_INTERVAL_S, 0; need, host_last = streak_ticks(interval), _num(prev_host.get("lastChangeAt"))
    cpu = _int(sample.get("cpuCount")) or 1; cpu = cpu if cpu > 0 else 1; enabled = [base for base in bases.values() if _int(base) is not None and base > 0]
    base_sum, host_max = sum(enabled), config.get("hostMax")
    host_cap = max(min(host_max if isinstance(host_max, int) and host_max > 0 else 2 * base_sum, cpu), base_sum); fresh = bool(obs.get("doctorFresh"))
    unknown = _budget_unknown(obs) if fresh else None; rows, pending = {}, []
    for order, (name, raw_base) in enumerate(bases.items()):
        base, prev = _int(raw_base) or 0, _obj(prev_lanes.get(name)); changed = _num(prev.get("lastChangeAt"))
        running = _int(_obj(obs.get("runningByProvider")).get(name))
        if base <= 0:
            rows[name] = _row(0, 0, running, changed, "hold:disabled", ["disabled"], 0); continue
        ceiling = _lane_ceiling(name, base, running, obs, config)
        if not fresh:
            rows[name] = _row(base, base, running, changed, "hold:stale-doctor", ["stale-doctor"], ceiling); continue
        current = _int(prev.get("effective")); current = base if current is None or current < MIN_SLOTS else current
        up, idle, demand = _int(prev.get("upStreak")) or 0, _int(prev.get("idleStreak")) or 0, _demand(name, obs)
        multi, additive = _multi_reason(name, obs, sample, now), _additive_reason(obs, sample)
        effective, reason, blockers, want = current, "hold:steady", [], False; lane_ready = changed is None or now - changed >= interval
        host_ready = host_last is None or now - host_last >= HOST_COOLDOWN_S
        # JOV-7587: scale-up above the configured base is held until the merge-queue brake lands. Signals: merged/hour vs opened/hour, queue p50 wait, entries per merge.
        if multi:
            effective, reason, blockers, up, idle = max(MIN_SLOTS, math.ceil(current / 2)), multi, [multi], 0, 0
        elif additive:
            up = idle = 0
            if host_ready and current > MIN_SLOTS:
                effective, reason, blockers = current - 1, additive, [additive]
            else:
                reason, blockers = "hold:host-cooldown", [additive, "host-cooldown"]
        else:
            floor = idle_floor(base); idle_signal = demand == 0 and running is not None and running <= current - 2
            idle = min(need, idle + 1) if idle_signal else 0
            if idle_signal and current <= floor:
                up, reason, blockers = 0, "hold:idle-floor", ["idle-floor"]
            elif idle_signal and idle >= need and current > floor:
                up = 0
                if lane_ready:
                    effective, reason, blockers, idle = current - 1, "idle-decay", [], 0
                else:
                    reason, blockers = "hold:lane-cooldown", ["lane-cooldown"]
            elif idle_signal:
                up, reason, blockers = 0, "hold:zero-demand", ["zero-demand"]
            else:
                blockers = _increase_blockers(name, obs, sample, now, running, demand)
                if running is not None and running < current and "unknown-running" not in blockers:
                    blockers = ["not-saturated", *blockers]
                if blockers:
                    up, reason = 0, "hold:" + blockers[0]
                else:
                    up = min(need, up + 1)
                    hold = ("lane-cooldown" if not lane_ready else "host-cooldown" if not host_ready
                            else "lane-ceiling" if current + 1 > ceiling else "up-streak" if up < need else None)
                    if hold:
                        reason, blockers = "hold:" + hold, [hold]
                    else:
                        want, reason, blockers = True, "hold:one-lane", ["one-lane"]
        if current > ceiling and effective > ceiling:
            effective, reason, blockers = max(MIN_SLOTS, ceiling), "hold:lane-ceiling", ["lane-ceiling"]
        rows[name] = _row(base, effective, running, changed, reason, blockers, ceiling, up, idle, MIN_SLOTS)
        if want:
            pending.append((demand or 0, order, name, current))
    if pending:
        used = sum(row["effective"] for row in rows.values())
        for _demand_value, _order, chosen, current in sorted(pending, key=lambda item: (item[0] / max(1, item[3]), -item[1]), reverse=True):
            row = rows[chosen]
            if used + 1 <= host_cap and current + 1 <= row["ceiling"]:
                row.update(effective=current + 1, lastReason="sustained-demand", blockers=[], upStreak=0); break
            row.update(lastReason="hold:host-ceiling", blockers=["host-ceiling"])
    for name, row in rows.items():
        base = row["base"]
        if base > 0 and row["effective"] > base:
            token = unknown if fresh and unknown else "scale-up-held"
            row.update(effective=base, lastReason="hold:" + token, blockers=[token], upStreak=0)
        before = _int(_obj(prev_lanes.get(name)).get("effective")); before = base if before is None else before
        if row["effective"] != before:
            row["lastChangeAt"], host_last = now, now
            history.append({"at": now, "lane": name, "from": before, "to": row["effective"], "reason": row["lastReason"]})
    changed = host_last == now and any(row.get("lastChangeAt") == now for row in rows.values())
    return {"schema": SCHEMA, "mode": config.get("mode") or "apply", "observedAt": now,
            "host": {"lastChangeAt": host_last, "ceiling": host_cap, "cpuCount": cpu}, "lanes": rows, "hostSample": host_sample,
            "apiBudget": {"githubRemaining": _int(obs.get("githubRemaining")), "linearRemaining": _int(obs.get("linearRemaining")),
                          "linearLimit": _int(obs.get("linearLimit")), "linearRateLimitedAt": _num(obs.get("linearRateLimitedAt"))},
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
    if not _valid_state(state) or observed is None or now - observed > STALE_S or now < observed:
        return base
    row = state["lanes"].get(name); effective, floor, ceiling = _int(_obj(row).get("effective")), _int(_obj(row).get("floor")), _int(_obj(row).get("ceiling"))
    if not isinstance(row, dict) or effective is None:
        return base
    return max(MIN_SLOTS if floor is None else floor, min(effective if ceiling is None else ceiling, effective))
def apply_tick(state_dir, tick: dict, bases: dict, now: float | None = None, host_sample: dict | None = None, config: dict | None = None) -> dict:
    now, config = time.time() if now is None else now, config or load_config(); previous = _read_json(Path(state_dir) / "autoscale.json")
    state = decide(previous if _valid_state(previous) else None, collect(state_dir, tick, now),
                   sample_host() if host_sample is None else host_sample, bases, config, now)
    write_state(state_dir, state)
    return {"mode": config["mode"], "lanes": {name: {"base": row["base"], "effective": row["effective"], "reason": row["lastReason"]}
                                               for name, row in state["lanes"].items()}}
def public_block(state_dir) -> dict:
    state = _read_json(Path(state_dir) / "autoscale.json")
    if not _valid_state(state):
        return {"mode": mode(), "lanes": {}, "history": []}
    lanes = {name: {"base": row.get("base"), "effective": row.get("effective"), "reason": row.get("lastReason"),
                    "blockers": list(row.get("blockers") or [])} for name, row in state["lanes"].items() if isinstance(row, dict)}
    history = state.get("history") if isinstance(state.get("history"), list) else []
    return {"mode": state.get("mode") or mode(), "lanes": lanes, "history": history[-10:]}
