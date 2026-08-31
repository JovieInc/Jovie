#!/usr/bin/env python3
"""Gem tty1 ultrawide HUD. Official SYMPHONY STATUS + ship-path p95 + check-in tiles."""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

BLUE, PINK, PURPLE = (75, 145, 255), (255, 72, 210), (168, 85, 247)
DIM, FG = (138, 138, 148), (236, 236, 240)
BG = (10, 10, 10)
BARS = "▁▂▃▄▅▆▇█"
UNKNOWN = "UNKNOWN"
UNMEASURED = "unmeasured"
PROD_SHA_RE = re.compile(r"^[0-9a-f]{7,40}$", re.I)
CAP_RE = re.compile(r"^\s*max_concurrent_agents:\s*([0-9]+)\s*$", re.M)
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
LIVE_SLUG = "symphony-ui-pilot-96d6b9c5b2d5"
LIVE_PROJECT_ID = "440ea404-041f-461e-ae45-dd6a2e98e4a1"
DEFAULT_MEASURED = Path.home() / ".local/state/gem-checkin-hud/measured.json"
DEFAULT_TPS_STATE = Path.home() / ".local/state/gem-checkin-hud/symphony-tps.json"
DEFAULT_PRESSURE_STATE = Path.home() / ".local/state/gem-checkin-hud/system-pressure.json"
DEFAULT_GITHUB_STATE = Path.home() / ".local/state/gem-checkin-hud/github-projection.json"
DEFAULT_SYMPHONY = os.environ.get("SYMPHONY_STATE_URL", "http://127.0.0.1:4041/api/v1/state")
DEFAULT_WORKFLOW = Path(
    os.environ.get("SYMPHONY_WORKFLOW_PATH", str(Path.home() / ".config/symphony/WORKFLOW.md"))
)
REPO_WORKFLOW = Path(__file__).resolve().parents[1] / "symphony" / "WORKFLOW.md"
LINEAR_API = os.environ.get("LINEAR_API_URL", "https://api.linear.app/graphql")
MQ_QUERY = (
    "query { repository(owner: \"JovieInc\", name: \"Jovie\") { "
    "mergeQueue(branch: \"main\") { entries(first: 20) { nodes { position enqueuedAt "
    "pullRequest { number title } } } } } }"
)
LINEAR_QUERY = (
    "query($id: String!) { project(id: $id) { issues(filter: { state: { name: { eq: \"In Review\" } } }) "
    "{ totalCount } } }"
)
LINEAR_STAGES_QUERY = (
    "query($id: String!) { project(id: $id) { issues(first: 100, filter: { "
    "state: { name: { in: [\"Todo\", \"In Progress\", \"In Review\"] } } }) "
    "{ nodes { createdAt startedAt completedAt state { name } } } } }"
)
SHIP_STAGES = (
    ("todo", "Todo/pickup"),
    ("running", "agent running"),
    ("pr_open", "PR open"),
    ("ci_fast", "ci-fast"),
    ("pr_ready", "PR Ready"),
    ("mq", "merge queue"),
    ("merge_group", "merge_group CI"),
    ("merged", "merged"),
)
CI_FAST_NAMES = frozenset({"ci-fast"})
PR_READY_NAMES = frozenset({"PR Ready"})
CHECK_PENDING = frozenset({"queued", "in_progress", "pending", "waiting", "requested"})
CHECK_FAILURE = frozenset({"failure", "failed", "error", "cancelled", "timed_out", "action_required"})
CHECK_SUCCESS = frozenset({"success", "successful", "neutral", "skipped"})
MIN_WIDTH = 120
TARGET_WIDTH = 430
MIN_HEIGHT = 32
TARGET_HEIGHT = 90
PRODUCT_DESCRIPTION = "Autonomous work from Todo to merged."
SHIPPING_DISPLAY_IA = {
    "capacity": {"label": "AGENTS", "representation": "active-over-limit"},
    "throughput": {"label": "THROUGHPUT", "representation": "token-rate"},
    "failures": {"label": "FAILURES", "representation": "count-and-list"},
    "tokens": {"label": "TOKENS", "representation": "total-and-per-work-item"},
    "queue": {"label": "QUEUE", "representation": "count"},
    "pr_flow": {"label": "PR FLOW", "representation": "open-and-rolling-24h"},
    "system_pressure": {"label": "SYSTEM PRESSURE", "representation": "thresholded-host-projection"},
    "ci_matrix": {"label": "CI MATRIX", "representation": "bounded-server-aggregate"},
    "shipping_path": {"label": "SHIP", "representation": "segmented-stage-bar"},
    "current_work": {"label": "CURRENT WORK", "representation": "receipt-table"},
    "freshness": {"label": "Updated", "representation": "relative-local-time"},
}
_GITHUB_REFRESH_THREAD: threading.Thread | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _rgb(rgb: tuple[int, int, int], text: str, *, bold: bool = False, bg: bool = False) -> str:
    code = 48 if bg else 38
    prefix = "\033[1m" if bold else ""
    return f"{prefix}\033[{code};2;{rgb[0]};{rgb[1]};{rgb[2]}m{text}\033[0m"


def _iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)) and value == value:
        return float(value)
    return None


def _int(value: Any) -> int | None:
    number = _num(value)
    if number is None:
        return None
    return int(number)


def _text(record: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, (int, float)) and value == value:
            return str(int(value)) if float(value).is_integer() else str(value)
    return None


def dash(value: Any) -> str:
    if value is None or value == "":
        return "-"
    return str(value)


def visible_len(text: str) -> int:
    return len(ANSI_RE.sub("", text))


def clip(text: str, width: int, *, tail: bool = False) -> str:
    if width <= 0:
        return ""
    plain = ANSI_RE.sub("", text)
    if len(plain) <= width:
        return plain + (" " * (width - len(plain)))
    if width <= 1:
        return plain[-width:] if tail else plain[:width]
    if tail:
        return "…" + plain[-(width - 1) :]
    return plain[: width - 1] + "…"


def pad_visible(text: str, width: int) -> str:
    extra = width - visible_len(text)
    return text if extra <= 0 else text + (" " * extra)


def terminal_size(
    width: int | None = None,
    height: int | None = None,
) -> tuple[int, int]:
    size = shutil.get_terminal_size((TARGET_WIDTH, TARGET_HEIGHT))
    cols = width if isinstance(width, int) and width > 0 else int(size.columns or TARGET_WIDTH)
    rows = height if isinstance(height, int) and height > 0 else int(size.lines or TARGET_HEIGHT)
    return max(MIN_WIDTH, cols), max(MIN_HEIGHT, rows)


def terminal_width(override: int | None = None) -> int:
    """Compatibility wrapper for callers that only need the terminal width."""
    return terminal_size(width=override)[0]


def natural_time(value: Any, *, now: datetime | None = None) -> str:
    """Human freshness label without exposing UTC or machine timestamp syntax."""
    stamp = _iso(value) if not isinstance(value, datetime) else value
    if stamp is None:
        return "freshness unknown"
    seconds = int(((now or _now()) - stamp).total_seconds())
    if seconds < -10:
        return f"updates in {_duration(seconds)}"
    seconds = max(0, seconds)
    if seconds < 10:
        return "just now"
    if seconds < 60:
        return f"{seconds} seconds ago"
    minutes = seconds // 60
    if minutes == 1:
        return "1 minute ago"
    if minutes < 60:
        return f"{minutes} minutes ago"
    hours = minutes // 60
    if hours == 1:
        return "1 hour ago"
    if hours < 24:
        return f"{hours} hours ago"
    days = hours // 24
    return "yesterday" if days == 1 else f"{days} days ago"


def _duration(seconds: int) -> str:
    value = abs(seconds)
    if value < 60:
        return f"{value}s"
    if value < 3600:
        return f"{value // 60}m"
    return f"{value // 3600}h"


def runtime_label(seconds: Any) -> str:
    value = _int(seconds)
    if value is None:
        return "-"
    value = max(0, value)
    hours, rem = divmod(value, 3600)
    mins, secs = divmod(rem, 60)
    parts: list[str] = []
    if hours:
        parts.append(f"{hours}h")
    if mins or hours:
        parts.append(f"{mins}m")
    if secs or not parts:
        parts.append(f"{secs}s")
    return " ".join(parts)


def comma_int(value: Any) -> str:
    number = _int(value)
    return "-" if number is None else f"{number:,}"


def p95_seconds(values: list[float] | None) -> float | None:
    if not values:
        return None
    ordered = sorted(value for value in values if value == value and value > 0)
    if not ordered:
        return None
    index = max(0, min(len(ordered) - 1, math.ceil(0.95 * len(ordered)) - 1))
    return ordered[index]


def elapsed_label(started: Any, *, now: datetime | None = None, seconds: Any = None) -> str:
    direct = _int(seconds)
    if direct is not None:
        return _duration(max(0, direct))
    stamp = _iso(started) if not isinstance(started, datetime) else started
    if stamp is None:
        return "-"
    return _duration(max(0, int(((now or _now()) - stamp).total_seconds())))


def due_label(due: Any, *, now: datetime | None = None) -> str:
    stamp = _iso(due) if not isinstance(due, datetime) else due
    if stamp is None:
        return "-"
    delta = int((stamp - (now or _now())).total_seconds())
    if delta <= 0:
        return "now"
    return f"in {_duration(delta)}"


def compact_tokens(total: Any, incoming: Any = None, outgoing: Any = None) -> str:
    count = _int(total)
    if count is None:
        inn, out = _int(incoming), _int(outgoing)
        if inn is None and out is None:
            return "-"
        count = (inn or 0) + (out or 0)
    if count < 1000:
        return str(count)
    if count < 999_950:
        value, suffix = count / 1000, "K"
    elif count < 999_950_000:
        value, suffix = count / 1_000_000, "M"
    else:
        value, suffix = count / 1_000_000_000, "B"
    rendered = f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{rendered}{suffix}"


def short_path(value: Any) -> str:
    text = dash(value)
    if text == "-":
        return text
    return text.replace(str(Path.home()), "~")[-28:]


def load_json_dict(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def load_measured(path: Path) -> dict[str, Any]:
    return load_json_dict(path)


def read_workflow_cap(path: Path | None = None) -> int | None:
    candidates = [path, DEFAULT_WORKFLOW, REPO_WORKFLOW]
    for candidate in candidates:
        if candidate is None or not candidate.is_file():
            continue
        try:
            text = candidate.read_text(encoding="utf-8")
        except OSError:
            continue
        match = CAP_RE.search(text)
        if match:
            value = int(match.group(1))
            return value if value > 0 else None
    return None


def compute_alive(alive: Any) -> dict[str, Any]:
    source = alive if isinstance(alive, dict) else {}
    cash = _num(source.get("cashUsd"))
    burn = _num(source.get("weeklyBurnUsd"))
    revenue = _num(source.get("weeklyRevenueUsd"))
    growth = _num(source.get("weeklyRevenueGrowthRate"))
    profit = None if burn is None or revenue is None else revenue - burn
    if cash is None or burn is None or revenue is None:
        status = UNKNOWN
    elif revenue == 0 and burn > 0:
        status = "DEAD"
    elif burn - revenue <= 0:
        status = "ALIVE"
    else:
        net = burn - revenue
        weeks_cash = cash / net if cash > 0 else 0.0
        profit_weeks = (
            math.log(burn / revenue) / math.log(1 + growth)
            if revenue > 0 and growth is not None and growth > 0
            else None
        )
        status = "ALIVE" if profit_weeks is not None and weeks_cash > 0 and profit_weeks <= weeks_cash else "DEAD"
    return {
        "status": status,
        "cashUsd": cash,
        "weeklyBurnUsd": burn,
        "weeklyRevenueUsd": revenue,
        "profitBeforeZeroUsd": profit,
    }


def compute_wow(wow: Any) -> dict[str, Any]:
    source = wow if isinstance(wow, dict) else {}
    this_rev = _num(source.get("thisWeekRevenueUsd"))
    last_rev = _num(source.get("lastWeekRevenueUsd"))
    this_users = _num(source.get("thisWeekActiveUsers"))
    last_users = _num(source.get("lastWeekActiveUsers"))
    if this_rev is not None and last_rev is not None and (this_rev > 0 or last_rev > 0):
        rate = 0.0 if last_rev == 0 else (this_rev - last_rev) / last_rev
        return {"rate": rate, "basis": "revenue", "thisWeekRevenueUsd": this_rev, "lastWeekRevenueUsd": last_rev}
    if this_users is not None and last_users is not None:
        rate = 0.0 if last_users == 0 else (this_users - last_users) / last_users
        return {"rate": rate, "basis": "active-users", "thisWeekRevenueUsd": this_rev, "lastWeekRevenueUsd": last_rev}
    return {"rate": None, "basis": UNKNOWN, "thisWeekRevenueUsd": this_rev, "lastWeekRevenueUsd": last_rev}


def _receipt(item: Any) -> dict[str, str] | None:
    if not isinstance(item, dict):
        return None
    linear = _text(item, ("linearIssueId", "linearIssue", "issueNumber", "issue"))
    symphony = _text(item, ("symphonyRef", "symphony"))
    queue = _text(item, ("mergeQueueRef", "mergeQueue", "mergeQueueEntry"))
    sha = _text(item, ("prodSha", "prodSHA"))
    receipt = _text(item, ("receiptAt", "receiptedAt"))
    if not (linear and symphony and queue and sha and receipt and PROD_SHA_RE.match(sha) and _iso(receipt)):
        return None
    return {"receiptAt": receipt}


def count_ships_this_week(ships: Any, *, now: datetime | None = None) -> dict[str, int | None]:
    receipts = ships.get("receipts") if isinstance(ships, dict) else None
    if not isinstance(receipts, list):
        return {"thisWeek": None}
    clock = now or _now()
    week_ago = clock - timedelta(days=7)
    counted = 0
    for item in receipts:
        parsed = _receipt(item)
        if parsed is None:
            continue
        stamped = _iso(parsed["receiptAt"])
        if stamped is not None and week_ago <= stamped <= clock:
            counted += 1
    return {"thisWeek": counted}


def sparkline(values: list[float]) -> str:
    lo, hi = min(values), max(values)
    if hi <= lo:
        return BARS[0] * len(values)
    last = len(BARS) - 1
    return "".join(BARS[max(0, min(last, int(round((value - lo) / (hi - lo) * last))))] for value in values)


def series_values(measured: dict[str, Any], key: str) -> list[float] | None:
    series = measured.get("series")
    raw = series.get(key) if isinstance(series, dict) else None
    if not isinstance(raw, list) or not raw:
        return None
    values: list[float] = []
    for item in raw:
        number = _num(item.get("value") if isinstance(item, dict) else item)
        if number is None:
            return None
        values.append(number)
    return values or None


def write_json(path: Path, payload: Any) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        return


def load_tps_snapshots(path: Path) -> list[dict[str, Any]]:
    payload = load_json_dict(path)
    raw = payload.get("snapshots")
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]


def persist_tps_snapshot(path: Path, totals: Any, *, now: datetime | None = None) -> None:
    if not isinstance(totals, dict):
        return
    tokens, seconds = _int(totals.get("total_tokens")), _int(totals.get("seconds_running"))
    if tokens is None and seconds is None:
        return
    clock = now or _now()
    cutoff = clock - timedelta(seconds=90)
    kept = [item for item in load_tps_snapshots(path) if (stamp := _iso(item.get("at"))) is not None and stamp >= cutoff]
    kept.append({"at": clock.isoformat(), "total_tokens": tokens, "seconds_running": seconds})
    write_json(path, {"snapshots": kept[-20:]})


def compute_throughput(totals: Any, snapshots: list[dict[str, Any]] | None, *, now: datetime | None = None) -> float | None:
    if not isinstance(totals, dict):
        return None
    tokens, seconds, clock = _int(totals.get("total_tokens")), _int(totals.get("seconds_running")), now or _now()
    window_hit = fallback_hit = None
    for item in snapshots or []:
        stamp, prev_tokens = _iso(item.get("at")), _int(item.get("total_tokens"))
        if stamp is None or prev_tokens is None:
            continue
        age = (clock - stamp).total_seconds()
        hit = (stamp, prev_tokens, _int(item.get("seconds_running")))
        if 4.0 <= age <= 8.0:
            window_hit = hit
        elif 0.4 < age <= 15.0 and fallback_hit is None:
            fallback_hit = hit
    chosen = window_hit or fallback_hit
    if chosen is not None and tokens is not None:
        stamp, prev_tokens, prev_seconds = chosen
        running_delta = None if seconds is None or prev_seconds is None else seconds - prev_seconds
        denom = running_delta if running_delta is not None and running_delta > 0 else (clock - stamp).total_seconds()
        if denom > 0:
            return max(0.0, (tokens - prev_tokens) / denom)
    if tokens is not None and seconds is not None and seconds > 0:
        return tokens / seconds
    return None


def _psi(path: Path) -> dict[str, float | None]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return {"some": None, "full": None}
    result: dict[str, float | None] = {"some": None, "full": None}
    for line in text.splitlines():
        parts = line.split()
        if not parts:
            continue
        for token in parts[1:]:
            if token.startswith("avg10="):
                try:
                    result[parts[0]] = float(token.split("=", 1)[1])
                except ValueError:
                    pass
    return result


def _pressure_status(value: float | None, warning: float, failure: float) -> str:
    if value is None:
        return "unknown"
    if value >= failure:
        return "failure"
    if value >= warning:
        return "warning"
    return "healthy"


def _net_sample() -> dict[str, Any] | None:
    try:
        lines = Path("/proc/net/dev").read_text(encoding="utf-8").splitlines()[2:]
    except OSError:
        return None
    interfaces = []
    for line in lines:
        if ":" not in line:
            continue
        name, raw = line.split(":", 1)
        name = name.strip()
        if name == "lo":
            continue
        sysfs = Path("/sys/class/net") / name
        try:
            if (sysfs / "operstate").read_text(encoding="utf-8").strip() != "up":
                continue
            speed = _int((sysfs / "speed").read_text(encoding="utf-8").strip())
        except OSError:
            speed = None
        values = raw.split()
        if len(values) < 9:
            continue
        interfaces.append({"name": name, "rx": int(values[0]), "tx": int(values[8]), "speed_mbps": speed})
    if not interfaces:
        return None
    return {
        "rx": sum(item["rx"] for item in interfaces),
        "tx": sum(item["tx"] for item in interfaces),
        "speed_mbps": max((item["speed_mbps"] for item in interfaces if item["speed_mbps"]), default=None),
    }


def fetch_system_pressure(
    symphony: dict[str, Any],
    *,
    state_path: Path = DEFAULT_PRESSURE_STATE,
    now: datetime | None = None,
) -> dict[str, Any]:
    clock = now or _now()
    cpu_count = os.cpu_count() or None
    try:
        load1 = float(os.getloadavg()[0])
    except (OSError, AttributeError):
        load1 = None
    cpu_psi = _psi(Path("/proc/pressure/cpu"))
    memory_psi = _psi(Path("/proc/pressure/memory"))
    io_psi = _psi(Path("/proc/pressure/io"))
    disk_used_pct = disk_available_pct = None
    try:
        disk = shutil.disk_usage("/")
        disk_used_pct = None if disk.total <= 0 else (disk.used / disk.total) * 100
        disk_available_pct = None if disk.total <= 0 else (disk.free / disk.total) * 100
    except OSError:
        pass
    memory_total = memory_available = None
    try:
        memory = {}
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            key, _, raw = line.partition(":")
            if key in {"MemTotal", "MemAvailable"}:
                memory[key] = int(raw.strip().split()[0]) * 1024
        memory_total, memory_available = memory.get("MemTotal"), memory.get("MemAvailable")
    except (OSError, ValueError, IndexError):
        pass
    available_pct = None if not memory_total or memory_available is None else (memory_available / memory_total) * 100
    load_pct = None if load1 is None or cpu_count is None else (load1 / cpu_count) * 100
    cpu_signal = max(value for value in (load_pct, cpu_psi.get("some")) if value is not None) if any(value is not None for value in (load_pct, cpu_psi.get("some"))) else None
    memory_signal = max(value for value in (memory_psi.get("some"), None if available_pct is None else 100 - available_pct) if value is not None) if any(value is not None for value in (memory_psi.get("some"), available_pct)) else None
    io_signal = max(value for value in (io_psi.get("some"), io_psi.get("full")) if value is not None) if any(value is not None for value in (io_psi.get("some"), io_psi.get("full"))) else None
    current_net = _net_sample()
    prior = load_json_dict(state_path)
    prior_at = _iso(prior.get("at"))
    network_pct = network_mbps = None
    if current_net is not None and prior_at is not None:
        seconds = (clock - prior_at).total_seconds()
        if 0.5 <= seconds <= 120:
            rx_bps = max(0.0, (current_net["rx"] - (_int(prior.get("rx")) or 0)) * 8 / seconds)
            tx_bps = max(0.0, (current_net["tx"] - (_int(prior.get("tx")) or 0)) * 8 / seconds)
            network_mbps = max(rx_bps, tx_bps) / 1_000_000
            speed = _int(current_net.get("speed_mbps"))
            network_pct = None if not speed else (network_mbps / speed) * 100
    if current_net is not None:
        write_json(state_path, {"at": clock.isoformat(), **current_net})
    running, cap = _int(symphony.get("running")), _int(symphony.get("cap"))
    slots_pct = None if running is None or not cap else (running / cap) * 100
    return {
        "ok": any(value is not None for value in (cpu_signal, memory_signal, io_signal, network_pct, slots_pct)),
        "generated_at": clock.isoformat(),
        "cpu": {"status": _pressure_status(cpu_signal, 75, 125), "signal_pct": cpu_signal, "load1": load1, "cores": cpu_count, "psi": cpu_psi.get("some")},
        "memory": {"status": "failure" if available_pct is not None and available_pct < 10 else "warning" if available_pct is not None and available_pct < 20 else _pressure_status(memory_psi.get("some"), 10, 30), "available_pct": available_pct, "psi": memory_psi.get("some")},
        "io": {
            "status": "failure" if disk_available_pct is not None and disk_available_pct < 5 else "warning" if disk_available_pct is not None and disk_available_pct < 15 else _pressure_status(io_signal, 10, 30),
            "used_pct": disk_used_pct,
            "available_pct": disk_available_pct,
            "psi": io_psi.get("some"),
            "full": io_psi.get("full"),
        },
        "network": {"status": _pressure_status(network_pct, 60, 85), "util_pct": network_pct, "mbps": network_mbps, "speed_mbps": None if current_net is None else current_net.get("speed_mbps")},
        "slots": {"status": _pressure_status(slots_pct, 75, 95), "util_pct": slots_pct, "running": running, "cap": cap},
    }


def format_rate_window(window: Any) -> str:
    if not isinstance(window, dict):
        return "-"
    remaining, limit = _int(window.get("remaining")), _int(window.get("limit"))
    if remaining is None or limit is None:
        return "-"
    text = f"{remaining:,}/{limit:,}"
    reset = _int(window.get("reset_in_seconds"))
    if reset is not None:
        text += f" reset {reset}s"
    return text


def format_rate_limits(rate_limits: Any) -> str:
    if not isinstance(rate_limits, dict) or not rate_limits:
        return "-"
    parts: list[str] = []
    limit_id = rate_limits.get("limit_id")
    if isinstance(limit_id, str) and limit_id.strip():
        parts.append(limit_id.strip())
    if rate_limits.get("primary") is not None:
        parts.append(f"primary {format_rate_window(rate_limits.get('primary'))}")
    if "secondary" in rate_limits:
        secondary = rate_limits.get("secondary")
        parts.append("secondary n/a" if secondary is None else f"secondary {format_rate_window(secondary)}")
    credits = rate_limits.get("credits")
    if isinstance(credits, dict):
        if credits.get("unlimited") is True:
            parts.append("credits unlimited")
        elif credits.get("balance") is not None:
            parts.append(f"credits {credits['balance']}")
        else:
            parts.append("credits yes" if credits.get("has_credits") is True else "credits -")
    return " | ".join(parts) if parts else "-"


def check_duration_seconds(record: dict[str, Any]) -> float | None:
    timing = record.get("timing") if isinstance(record.get("timing"), dict) else {}
    millis = _int(record.get("run_duration_ms") or timing.get("run_duration_ms"))
    if millis is not None and millis > 0:
        return millis / 1000.0
    started = _iso(record.get("startedAt") or record.get("started_at") or record.get("run_started_at"))
    completed = _iso(record.get("completedAt") or record.get("completed_at") or record.get("updated_at"))
    if started is None or completed is None:
        return None
    delta = (completed - started).total_seconds()
    return delta if delta > 0 else None


def empty_stage(stage_id: str, label: str) -> dict[str, Any]:
    return {"id": stage_id, "label": label, "count": None, "p95": None, "queued": False, "queue_reason": None, "series": None}


def empty_ship_path() -> dict[str, Any]:
    return {"ok": False, "stages": [empty_stage(stage_id, label) for stage_id, label in SHIP_STAGES], "bottleneck": None}


def _check_name(item: Any) -> str:
    if not isinstance(item, dict):
        return ""
    return str(item.get("name") or item.get("context") or "").strip()


def _check_status(item: Any) -> str:
    if not isinstance(item, dict):
        return ""
    status = str(item.get("status") or "").strip().lower()
    if status:
        return status
    state = str(item.get("state") or "").strip().lower()
    return state


def named_checks(rollups: Any, names: frozenset[str]) -> list[dict[str, Any]]:
    if not isinstance(rollups, list):
        return []
    return [item for item in rollups if isinstance(item, dict) and _check_name(item) in names]


def aggregate_check_status(rollups: Any, *, names: frozenset[str] | None = None, contains: tuple[str, ...] = ()) -> str:
    if not isinstance(rollups, list):
        return "unknown"
    selected = []
    for item in rollups:
        if not isinstance(item, dict):
            continue
        name = _check_name(item)
        if names is not None and name not in names:
            continue
        if contains and not any(fragment in name.lower() for fragment in contains):
            continue
        selected.append(item)
    if not selected:
        return "unknown"
    outcomes: list[str] = []
    for item in selected:
        conclusion = str(item.get("conclusion") or "").strip().lower()
        status = _check_status(item)
        outcomes.append(conclusion or status)
    if any(value in CHECK_FAILURE for value in outcomes):
        return "failure"
    if any(value in CHECK_PENDING or value in {"", "completed"} for value in outcomes):
        return "pending" if any(value in CHECK_PENDING for value in outcomes) else "unknown"
    if all(value in CHECK_SUCCESS for value in outcomes):
        return "success"
    return "unknown"


def stage_from_source(
    stage_id: str,
    label: str,
    *,
    ok: bool,
    count: int | None,
    durations: list[float] | None,
    queued: bool = False,
    queue_reason: str | None = None,
    series: list[float] | None = None,
) -> dict[str, Any]:
    if not ok:
        return empty_stage(stage_id, label)
    return {
        "id": stage_id,
        "label": label,
        "count": count,
        "p95": p95_seconds(durations),
        "queued": bool(queued),
        "queue_reason": queue_reason,
        "series": series if series else None,
    }


def ship_bottleneck(stages: list[dict[str, Any]]) -> dict[str, Any] | None:
    queued = next((s for s in stages if s.get("queued") and s.get("queue_reason")), None)
    if queued:
        return {"id": queued["id"], "label": queued["label"], "reason": queued["queue_reason"]}
    measured = [s for s in stages if s.get("p95") is not None]
    if not measured:
        return None
    worst = max(measured, key=lambda stage: float(stage["p95"]))
    return {"id": worst["id"], "label": worst["label"], "reason": f"{worst['label']} p95 {runtime_label(worst['p95'])}"}


def build_ship_path(
    *,
    symphony: dict[str, Any],
    mq: dict[str, Any],
    linear: dict[str, Any] | None,
    github: dict[str, Any] | None,
    measured: dict[str, Any] | None = None,
) -> dict[str, Any]:
    linear = linear if isinstance(linear, dict) else {}
    github = github if isinstance(github, dict) else {}
    series_root = measured.get("series") if isinstance(measured, dict) else None
    series_map = series_root if isinstance(series_root, dict) else {}

    def series_for(key: str) -> list[float] | None:
        return series_values(measured if isinstance(measured, dict) else {}, key) or series_values(
            {"series": series_map.get("ci") if isinstance(series_map.get("ci"), dict) else series_map},
            key,
        )

    retrying = symphony.get("retrying") if symphony.get("ok") else None
    retry_q = isinstance(retrying, int) and retrying > 0
    mq_ok = bool(mq.get("ok"))
    mq_count = mq.get("count") if mq_ok else None
    mq_awaiting = mq_ok and isinstance(mq_count, int) and mq_count > 0
    gh_ok = bool(github.get("ok"))
    merge_in = github.get("merge_group_in") if gh_ok else None
    merge_wait = isinstance(merge_in, int) and merge_in > 0
    specs = (
        ("todo", "Todo/pickup", bool(linear.get("ok")), linear.get("todo"), linear.get("pickup_durations"), False, None),
        ("running", "agent running", bool(symphony.get("ok")), symphony.get("running") if symphony.get("ok") else None, None, retry_q, f"retrying agents {retrying}" if retry_q else None),
        ("pr_open", "PR open", gh_ok, github.get("pr_open"), github.get("pr_open_durations"), False, None),
        ("ci_fast", "ci-fast", gh_ok, github.get("ci_fast"), github.get("ci_fast_durations"), bool(github.get("ci_fast_queued")), "ci-fast awaiting checks" if github.get("ci_fast_queued") else None),
        ("pr_ready", "PR Ready", gh_ok, github.get("pr_ready"), github.get("pr_ready_durations"), bool(github.get("pr_ready_queued")), "PR Ready awaiting checks" if github.get("pr_ready_queued") else None),
        ("mq", "merge queue", mq_ok, mq_count, github.get("mq_durations") if gh_ok else None, mq_awaiting and not merge_wait, "MQ awaiting checks" if mq_awaiting and not merge_wait else None),
        ("merge_group", "merge_group CI", gh_ok, merge_in, github.get("merge_group_durations"), merge_wait, "merge_group CI running" if merge_wait else None),
        ("merged", "merged", gh_ok, github.get("merged"), github.get("merged_durations"), False, None),
    )
    stages = [
        stage_from_source(sid, label, ok=ok, count=count, durations=durs, queued=queued, queue_reason=reason, series=series_for(sid))
        for sid, label, ok, count, durs, queued, reason in specs
    ]
    return {"ok": True, "stages": stages, "bottleneck": ship_bottleneck(stages)}


def bottleneck(alive: dict[str, Any], wow: dict[str, Any], ships: dict[str, int | None], symphony: dict[str, Any]) -> str:
    if alive["status"] == "DEAD":
        return "cash or profit-before-zero is dead"
    if alive["status"] == UNKNOWN:
        return "ALIVE unmeasured — do not invent P&L"
    if wow["rate"] is None:
        return "WOW unmeasured — revenue first, else active users"
    if wow["rate"] < 0.05:
        return "WOW below 5–7%/wk YC bar"
    if ships["thisWeek"] is None:
        return "SHIPS unmeasured — receipts unavailable"
    if ships["thisWeek"] == 0:
        return "no receipted ships this week"
    retrying = symphony.get("retrying")
    if symphony.get("ok") and isinstance(retrying, int) and retrying > 0:
        return f"Symphony retrying {retrying}"
    if not symphony.get("ok"):
        return "official Symphony :4041 unreachable"
    return "keep shipping receipted work"


def _money(value: float | None) -> str:
    if value is None:
        return UNMEASURED
    if value == 0:
        return "0"
    sign = "-" if value < 0 else ""
    return f"{sign}${abs(value):,.0f}"


def _pct(value: float | None) -> str:
    return UNMEASURED if value is None else f"{value * 100:.1f}%"


def _tokens_from(record: dict[str, Any]) -> tuple[int | None, int | None, int | None]:
    tokens = record.get("tokens") if isinstance(record.get("tokens"), dict) else {}
    incoming = _int(record.get("tokens_in") or record.get("input_tokens") or tokens.get("input_tokens"))
    outgoing = _int(record.get("tokens_out") or record.get("output_tokens") or tokens.get("output_tokens"))
    total = _int(record.get("tokens_total") or record.get("total_tokens") or tokens.get("total_tokens"))
    return incoming, outgoing, total


def _workspace(record: dict[str, Any]) -> str | None:
    workspace = record.get("workspace") if isinstance(record.get("workspace"), dict) else {}
    return _text(record, ("workspace_path", "workspace", "cwd")) or _text(workspace, ("path", "cwd"))


def _issue_fields(item: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    issue = item.get("issue") if isinstance(item.get("issue"), dict) else {}
    running = item.get("running") if isinstance(item.get("running"), dict) else {}
    ident = (
        _text(item, ("issue_identifier", "identifier", "id"))
        or _text(issue, ("identifier", "id"))
        or _text(running, ("issue_identifier", "identifier"))
    )
    title = _text(item, ("title", "name")) or _text(issue, ("title", "name"))
    url = _text(item, ("url", "html_url")) or _text(issue, ("url", "html_url"))
    return ident, title, url


def _normalize_row(item: dict[str, Any], kind: str) -> dict[str, Any]:
    issue = item.get("issue") if isinstance(item.get("issue"), dict) else {}
    running = item.get("running") if isinstance(item.get("running"), dict) else {}
    retry = item.get("retry") if isinstance(item.get("retry"), dict) else {}
    ident, title, url = _issue_fields(item)
    incoming, outgoing, total = _tokens_from(item)
    if incoming is None and outgoing is None and total is None:
        incoming, outgoing, total = _tokens_from(running)
    error = _text(item, ("error", "last_error")) or _text(retry, ("error", "last_error"))
    if error:
        error = error.splitlines()[0].strip()
        for marker in ("}, [{", " [{SymphonyElixir", "[file:"):
            error = error.split(marker, 1)[0].rstrip()
    return {
        "kind": kind, "id": ident, "title": title, "url": url,
        "attempt": _int(item.get("attempt") or running.get("attempt") or retry.get("attempt")),
        "turn": _int(item.get("turn_count") or running.get("turn_count")),
        "tokens_in": incoming, "tokens_out": outgoing, "tokens_total": total,
        "started": item.get("started_at") or item.get("startedAt") or running.get("started_at") or running.get("startedAt"),
        "seconds": _int(item.get("seconds") or item.get("elapsed") or running.get("seconds")),
        "due_at": item.get("due_at") or item.get("dueAt") or retry.get("due_at"),
        "workspace": _workspace(item) or _workspace(running) or _workspace(issue),
        "last_message": _text(item, ("last_message",)) or _text(running, ("last_message",)),
        "last_event": _text(item, ("last_event",)) or _text(running, ("last_event",)),
        "error": error,
        "owner": _text(item, ("owner", "agent", "account")) or _text(running, ("owner", "agent")),
    }


def _as_list(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        value = list(value.values())
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def fetch_symphony(url: str, *, timeout: float = 3.0, cap: int | None = None) -> dict[str, Any]:
    empty = {
        "ok": False, "running": None, "retrying": None, "blocked": None, "cap": cap,
        "rows": [], "totals": None, "seconds_running": None, "rate_limits": None,
        "hook_failed": None, "last_event": None, "generated_at": None, "up": False,
    }
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError):
        return empty
    if not isinstance(payload, dict):
        return empty
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    running_items = _as_list(payload.get("running"))
    retrying_items = _as_list(payload.get("retrying"))
    blocked_items = _as_list(payload.get("blocked"))
    jobs = _as_list(payload.get("jobs") or payload.get("items"))
    if not running_items and not retrying_items and jobs:
        for item in jobs:
            status = str(item.get("status") or item.get("state") or "").lower()
            if status in {"retrying", "retry"}:
                retrying_items.append(item)
            elif status in {"blocked", "failed", "fail"}:
                blocked_items.append(item)
            elif status not in {"queued", "done", "canceled", "cancelled"}:
                running_items.append(item)
    rows = (
        [_normalize_row(item, "retrying") for item in retrying_items]
        + [_normalize_row(item, "blocked") for item in blocked_items]
        + [_normalize_row(item, "running") for item in running_items]
    )
    def _count(key: str, items: list[dict[str, Any]]) -> int | None:
        value = counts.get(key)
        return value if isinstance(value, int) else (len(items) if items or payload.get(key) is not None else None)

    totals = payload.get("codex_totals") if isinstance(payload.get("codex_totals"), dict) else None
    hook = payload.get("hook_failed")
    if hook is None and isinstance(counts.get("hook_failed"), (str, int, bool)):
        hook = counts.get("hook_failed")
    last_event = _text(payload, ("last_event", "generated_at"))
    last_event = next((row["last_event"] for row in rows if row.get("last_event")), last_event)
    return {
        "ok": True, "running": _count("running", running_items), "retrying": _count("retrying", retrying_items),
        "blocked": _count("blocked", blocked_items), "cap": cap, "rows": rows, "totals": totals,
        "seconds_running": _int(totals.get("seconds_running")) if totals else None,
        "rate_limits": payload.get("rate_limits") if isinstance(payload.get("rate_limits"), dict) else None,
        "hook_failed": hook, "last_event": last_event, "generated_at": payload.get("generated_at"), "up": True,
    }


def fetch_mq(*, timeout: float = 8.0) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            ["gh", "api", "graphql", "-f", f"query={MQ_QUERY}"],
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "GH_PAGER": "cat", "PAGER": "cat"},
        )
        payload = json.loads(completed.stdout)
        nodes = (
            (((payload.get("data") or {}).get("repository") or {}).get("mergeQueue") or {}).get("entries") or {}
        ).get("nodes") or []
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError, TypeError, AttributeError):
        return {"ok": False, "count": None, "rows": []}
    rows = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        pr = node.get("pullRequest") if isinstance(node.get("pullRequest"), dict) else {}
        number = pr.get("number")
        rows.append({"kind": "mq", "number": number if isinstance(number, int) else None, "title": _text(pr, ("title",)), "enqueued": node.get("enqueuedAt"), "position": node.get("position")})
    return {"ok": True, "count": len(rows), "rows": rows}


def _linear_request(query: str, *, timeout: float) -> dict[str, Any] | None:
    key = os.environ.get("LINEAR_API_KEY")
    if not key:
        return None
    request = urllib.request.Request(
        LINEAR_API,
        data=json.dumps({"query": query, "variables": {"id": LIVE_PROJECT_ID}}).encode(),
        headers={"Authorization": key, "Content-Type": "application/json", "User-Agent": "gem-checkin-hud/3"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError):
        return None
    return payload if isinstance(payload, dict) else None


def fetch_review(*, timeout: float = 8.0) -> int | None:
    payload = _linear_request(LINEAR_QUERY, timeout=timeout)
    if payload is None:
        return None
    count = (((payload.get("data") or {}).get("project") or {}).get("issues") or {}).get("totalCount")
    return count if isinstance(count, int) else None


def fetch_linear_project(*, timeout: float = 8.0) -> dict[str, Any]:
    payload = _linear_request(LINEAR_STAGES_QUERY, timeout=timeout)
    project = (payload.get("data") or {}).get("project") if payload else None
    if not isinstance(project, dict):
        review = fetch_review(timeout=timeout)
        return {"ok": review is not None, "review": review, "todo": None, "pickup_durations": None}
    todo = review = 0
    pickup: list[float] = []
    for node in (project.get("issues") or {}).get("nodes") or []:
        if not isinstance(node, dict):
            continue
        state = ((node.get("state") or {}).get("name") if isinstance(node.get("state"), dict) else None) or ""
        todo += state == "Todo"
        review += state == "In Review"
        created, started = _iso(node.get("createdAt")), _iso(node.get("startedAt"))
        if created is not None and started is not None and (started - created).total_seconds() > 0:
            pickup.append((started - created).total_seconds())
    return {"ok": True, "review": review, "todo": todo, "pickup_durations": pickup or None}


def _gh_json(args: list[str], *, timeout: float) -> Any | None:
    try:
        completed = subprocess.run(
            ["gh", *args],
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "GH_PAGER": "cat", "PAGER": "cat"},
        )
        return json.loads(completed.stdout)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError, TypeError, ValueError):
        return None


def _pr_list(state: str, fields: str, limit: str, *, timeout: float) -> Any:
    return _gh_json(
        ["pr", "list", "--repo", "JovieInc/Jovie", "--state", state, "--limit", limit, "--json", fields],
        timeout=timeout,
    )


def _check_durs(rollups: Any, names: frozenset[str]) -> list[float]:
    return [d for item in named_checks(rollups, names) if (d := check_duration_seconds(item)) is not None]


def _github_flow_counts(window_started_at: datetime, *, timeout: float) -> dict[str, int] | None:
    window = window_started_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    query = (
        "query { repository(owner: \"JovieInc\", name: \"Jovie\") { "
        "pullRequests(states: OPEN) { totalCount } } "
        f"opened: search(query: \"repo:JovieInc/Jovie is:pr created:>={window}\", type: ISSUE) {{ issueCount }} "
        f"merged: search(query: \"repo:JovieInc/Jovie is:pr merged:>={window}\", type: ISSUE) {{ issueCount }} }}"
    )
    payload = _gh_json(["api", "graphql", "-f", f"query={query}"], timeout=timeout)
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return None
    open_count = ((((data.get("repository") or {}).get("pullRequests") or {}).get("totalCount")))
    opened = ((data.get("opened") or {}).get("issueCount"))
    merged = ((data.get("merged") or {}).get("issueCount"))
    if not all(isinstance(value, int) for value in (open_count, opened, merged)):
        return None
    return {"open_count": open_count, "opened_24h": opened, "merged_24h": merged}


def fetch_github_ship(
    *,
    timeout: float = 12.0,
    cache_path: Path | None = DEFAULT_GITHUB_STATE,
    max_age_seconds: float = 60.0,
    allow_background: bool = True,
) -> dict[str, Any]:
    global _GITHUB_REFRESH_THREAD
    clock = _now()
    cached = load_json_dict(cache_path) if cache_path is not None else {}
    cached_at = _iso(cached.get("generated_at"))
    cache_age = None if cached_at is None else max(0.0, (clock - cached_at).total_seconds())
    if cached.get("ok") is True and cache_age is not None and cache_age <= max_age_seconds:
        return {**cached, "cache_hit": True, "cache_age_seconds": cache_age}
    if allow_background:
        if _GITHUB_REFRESH_THREAD is None or not _GITHUB_REFRESH_THREAD.is_alive():
            _GITHUB_REFRESH_THREAD = threading.Thread(
                target=fetch_github_ship,
                kwargs={
                    "timeout": timeout,
                    "cache_path": cache_path,
                    "max_age_seconds": -1.0,
                    "allow_background": False,
                },
                name="hud-github-projection-refresh",
                daemon=True,
            )
            _GITHUB_REFRESH_THREAD.start()
        if cached.get("ok") is True and cache_age is not None and cache_age <= 300:
            return {**cached, "cache_hit": True, "cache_age_seconds": cache_age, "stale": True, "refreshing": True}
        return {"ok": False, "refreshing": True, "generated_at": None, "query_ms": None, "ci_matrix": []}
    query_started = time.perf_counter()
    open_prs = _pr_list("open", "number,title,createdAt,isDraft,statusCheckRollup,mergeStateStatus", "10", timeout=timeout)
    merged_prs = _pr_list("merged", "number,title,createdAt,mergedAt,statusCheckRollup", "10", timeout=timeout)
    merge_group = _gh_json(["api", "repos/JovieInc/Jovie/actions/runs?event=merge_group&per_page=20"], timeout=timeout)
    if not isinstance(open_prs, list) or not isinstance(merged_prs, list):
        if cached.get("ok") is True and cache_age is not None and cache_age <= 300:
            return {**cached, "cache_hit": True, "cache_age_seconds": cache_age, "stale": True}
        return {"ok": False}
    mq_numbers = {
        row.get("number")
        for row in (fetch_mq(timeout=min(8.0, timeout)).get("rows") or [])
        if isinstance(row, dict) and isinstance(row.get("number"), int)
    }
    pr_open = ci_fast = pr_ready = 0
    ci_matrix: list[dict[str, Any]] = []
    ci_fast_queued = pr_ready_queued = False
    pr_open_durations: list[float] = []
    ci_fast_durations: list[float] = []
    pr_ready_durations: list[float] = []
    for pr in open_prs:
        if not isinstance(pr, dict):
            continue
        rollups = pr.get("statusCheckRollup")
        fast, ready = named_checks(rollups, CI_FAST_NAMES), named_checks(rollups, PR_READY_NAMES)
        fast_pending = any(_check_status(item) in CHECK_PENDING for item in fast)
        ready_pending = any(_check_status(item) in CHECK_PENDING for item in ready)
        in_mq = isinstance(pr.get("number"), int) and pr.get("number") in mq_numbers
        if len(ci_matrix) < 10:
            ci_matrix.append(
                {
                    "number": pr.get("number") if isinstance(pr.get("number"), int) else None,
                    "title": _text(pr, ("title",)),
                    "fast": aggregate_check_status(rollups, names=CI_FAST_NAMES),
                    "ready": aggregate_check_status(rollups, names=PR_READY_NAMES),
                    "security": aggregate_check_status(rollups, contains=("secret", "security", "gitleaks", "truffle")),
                    "visual": aggregate_check_status(rollups, contains=("visual", "playwright", "golden path")),
                    "all": aggregate_check_status(rollups),
                }
            )
        if fast_pending:
            ci_fast += 1
            ci_fast_queued = True
        elif ready_pending:
            pr_ready += 1
            pr_ready_queued = True
        elif not in_mq:
            pr_open += 1
        created = _iso(pr.get("createdAt"))
        started_ats = [_iso(item.get("startedAt") or item.get("started_at")) for item in fast]
        first_fast = min((stamp for stamp in started_ats if stamp is not None), default=None)
        if created is not None and first_fast is not None and (first_fast - created).total_seconds() > 0:
            pr_open_durations.append((first_fast - created).total_seconds())
        ci_fast_durations.extend(_check_durs(rollups, CI_FAST_NAMES))
        pr_ready_durations.extend(_check_durs(rollups, PR_READY_NAMES))
    queried_at = _now()
    window_started_at = queried_at - timedelta(hours=24)
    flow_counts = _github_flow_counts(window_started_at, timeout=timeout)
    open_count = None if flow_counts is None else flow_counts["open_count"]
    opened_24h = None if flow_counts is None else flow_counts["opened_24h"]
    merged_count = None if flow_counts is None else flow_counts["merged_24h"]
    merged_durations: list[float] = []
    for pr in merged_prs:
        if not isinstance(pr, dict):
            continue
        merged_at, created = _iso(pr.get("mergedAt")), _iso(pr.get("createdAt"))
        if created is not None and merged_at is not None and (merged_at - created).total_seconds() > 0:
            merged_durations.append((merged_at - created).total_seconds())
        ci_fast_durations.extend(_check_durs(pr.get("statusCheckRollup"), CI_FAST_NAMES))
        pr_ready_durations.extend(_check_durs(pr.get("statusCheckRollup"), PR_READY_NAMES))
    merge_group_in = None
    merge_group_durations: list[float] = []
    runs = merge_group.get("workflow_runs") if isinstance(merge_group, dict) else None
    if isinstance(runs, list):
        merge_group_in = 0
        for run in runs:
            if not isinstance(run, dict):
                continue
            status = str(run.get("status") or "").lower()
            if status in CHECK_PENDING:
                merge_group_in += 1
            if status == "completed":
                duration = check_duration_seconds(
                    {
                        "startedAt": run.get("run_started_at") or run.get("created_at"),
                        "completedAt": run.get("updated_at"),
                        "timing": run.get("timing") if isinstance(run.get("timing"), dict) else {},
                        "run_duration_ms": run.get("run_duration_ms"),
                    }
                )
                if duration is not None:
                    merge_group_durations.append(duration)
    result = {
        "ok": True,
        "open_count": open_count,
        "opened_24h": opened_24h,
        "merged_24h": merged_count,
        "window_started_at": window_started_at.isoformat(),
        "generated_at": queried_at.isoformat(),
        "query_ms": round((time.perf_counter() - query_started) * 1000),
        "ci_matrix": ci_matrix,
        "pr_open": pr_open,
        "pr_open_durations": pr_open_durations or None,
        "ci_fast": ci_fast,
        "ci_fast_queued": ci_fast_queued,
        "ci_fast_durations": ci_fast_durations or None,
        "pr_ready": pr_ready,
        "pr_ready_queued": pr_ready_queued,
        "pr_ready_durations": pr_ready_durations or None,
        "merge_group_in": merge_group_in,
        "merge_group_durations": merge_group_durations or None,
        "merged": merged_count,
        "merged_durations": merged_durations or None,
        "mq_durations": None,
    }
    if cache_path is not None:
        write_json(cache_path, result)
    return result


def fetch_sha() -> str | None:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=2.0,
        )
        sha = completed.stdout.strip()
        return sha or None
    except (OSError, subprocess.SubprocessError):
        return None


def _header(
    *,
    sha: str | None,
    freshness: str,
    width: int,
) -> str:
    parts = [_rgb(FG, "● JOVIE", bold=True), _rgb(DIM, "shipping cockpit"), _rgb(FG, "main")]
    if sha:
        parts.append(_rgb(DIM, sha))
    left = f" {_rgb(DIM, '·')} ".join(parts)
    right = _rgb(DIM, f"Updated {freshness}")
    gap = max(2, width - visible_len(left) - visible_len(right))
    return pad_visible(left + (" " * gap) + right, width)


def _tile(title: str, headline: str, detail: str, spark: str, color: tuple[int, int, int], width: int) -> list[str]:
    inner = max(8, width)
    return [
        pad_visible(_rgb(DIM, clip(title, inner), bold=True), width),
        pad_visible(_rgb(FG, clip(headline, inner), bold=True), width),
        pad_visible(_rgb(DIM, clip(detail, inner)), width),
        pad_visible(_rgb(color, clip(spark, inner)), width),
    ]


def _tiles_row(tiles: list[list[str]], width: int) -> list[str]:
    gap = 2
    usable = max(MIN_WIDTH, width)
    col = (usable - gap * 3) // 4
    leftover = usable - (col * 4 + gap * 3)
    widths = [col, col, col, col + leftover]
    padded = []
    height = max(len(tile) for tile in tiles)
    for tile, col_width in zip(tiles, widths):
        extra = height - len(tile)
        body = list(tile)
        if extra:
            filler = pad_visible(_rgb(DIM, "│"), col_width)
            body = [*body[:-1], *([filler] * extra), body[-1]]
        padded.append([pad_visible(line, col_width) for line in body])
    spacer = " " * gap
    return [spacer.join(column[index] for column in padded) for index in range(height)]


def _cell(value: Any, width: int, *, right: bool = False, tail: bool = False) -> str:
    rendered = clip(dash(value), width, tail=tail).rstrip()
    return rendered.rjust(width) if right else rendered.ljust(width)


def _table_header(widths: dict[str, int]) -> str:
    columns = (
        ("ST", "st", False),
        ("POS", "pos", True),
        ("ID", "id", False),
        ("TITLE", "title", False),
        ("TRY/TURN", "run", True),
        ("TOKENS", "tokens", True),
        ("ELAPSED", "elapsed", True),
        ("WORKSPACE / PR", "ws", False),
    )
    return _rgb(DIM, "  ".join(_cell(name, widths[key], right=right) for name, key, right in columns))


def _col_widths(width: int) -> dict[str, int]:
    st, pos, ident, run, tokens, elapsed, ws = 2, 4, 12, 9, 10, 8, 24
    remaining = width - (st + pos + ident + run + tokens + elapsed + ws + 14)
    return {
        "st": st,
        "pos": pos,
        "id": ident,
        "title": min(180, max(20, remaining)),
        "run": run,
        "tokens": tokens,
        "elapsed": elapsed,
        "ws": ws,
    }


def _cells(
    color: tuple[int, int, int],
    widths: dict[str, int],
    glyph: str,
    position: str,
    ident: str,
    title: str,
    attempt: str,
    turn: str,
    tokens: str,
    elapsed: str,
    ws: str,
) -> str:
    run = "-" if attempt == "-" and turn == "-" else f"{attempt}/{turn}"
    return "  ".join(
        [
            _rgb(color, _cell(glyph, widths["st"])),
            _rgb(DIM, _cell(position, widths["pos"], right=True)),
            _rgb(FG, _cell(ident, widths["id"]), bold=True),
            _rgb(FG, _cell(title, widths["title"])),
            _rgb(DIM, _cell(run, widths["run"], right=True)),
            _rgb(DIM, _cell(tokens, widths["tokens"], right=True)),
            _rgb(color, _cell(elapsed, widths["elapsed"], right=True)),
            _rgb(DIM, _cell(ws, widths["ws"], tail=True)),
        ]
    )


def _job_row(row: dict[str, Any], widths: dict[str, int], *, now: datetime) -> str:
    kind = row.get("kind")
    if kind == "mq":
        ident = f"#{row['number']}" if isinstance(row.get("number"), int) else "-"
        return _cells(PURPLE, widths, "○", dash(row.get("position")), ident, dash(row.get("title")), "-", "-", "-", elapsed_label(row.get("enqueued"), now=now), "-")
    if kind == "retrying":
        return _cells(PINK, widths, "↻", "-", dash(row.get("id")), dash(row.get("error") or row.get("title")), dash(row.get("attempt")), dash(row.get("turn")), compact_tokens(row.get("tokens_total"), row.get("tokens_in"), row.get("tokens_out")), due_label(row.get("due_at"), now=now), short_path(row.get("workspace")))
    if kind == "blocked":
        return _cells(PINK, widths, "✕", "-", dash(row.get("id")), dash(row.get("error") or row.get("title")), dash(row.get("attempt")), dash(row.get("turn")), compact_tokens(row.get("tokens_total"), row.get("tokens_in"), row.get("tokens_out")), elapsed_label(row.get("started"), now=now, seconds=row.get("seconds")), short_path(row.get("workspace")))
    return _cells(BLUE, widths, "●", "-", dash(row.get("id")), dash(row.get("title") or row.get("last_message")), dash(row.get("attempt")), dash(row.get("turn")), compact_tokens(row.get("tokens_total"), row.get("tokens_in"), row.get("tokens_out")), elapsed_label(row.get("started"), now=now, seconds=row.get("seconds")), short_path(row.get("workspace") or row.get("url")))


def _hero_metrics(
    symphony: dict[str, Any],
    tps: float | None,
    mq: int | None,
    review: int | None,
    width: int,
) -> list[str]:
    running = symphony.get("running") if symphony.get("ok") else None
    cap = symphony.get("cap") if symphony.get("ok") else symphony.get("cap")
    totals = symphony.get("totals") if isinstance(symphony.get("totals"), dict) else {}
    incoming = compact_tokens(totals.get("input_tokens") if totals else None)
    outgoing = compact_tokens(totals.get("output_tokens") if totals else None)
    total = compact_tokens(totals.get("total_tokens") if totals else None)
    seconds = symphony.get("seconds_running")
    if seconds is None and totals:
        seconds = totals.get("seconds_running")
    throughput = "-" if tps is None else f"{compact_tokens(tps)} tps"
    agents = f"{dash(running)}/{dash(cap)}"
    retrying = _int(symphony.get("retrying"))
    blocked = _int(symphony.get("blocked"))
    failures = None if not symphony.get("ok") or retrying is None or blocked is None else retrying + blocked
    limits = format_rate_limits(symphony.get("rate_limits"))
    metrics = [
        (SHIPPING_DISPLAY_IA["capacity"]["label"], agents, f"{dash(None if running is None or cap is None else max(0, cap - running))} slots open", BLUE if running else DIM),
        (SHIPPING_DISPLAY_IA["throughput"]["label"], throughput, "live token rate", FG),
        (SHIPPING_DISPLAY_IA["failures"]["label"], dash(failures), f"{dash(retrying)} retrying · {dash(blocked)} blocked", PINK if failures else DIM),
        (SHIPPING_DISPLAY_IA["tokens"]["label"], total, f"{incoming} in · {outgoing} out", FG),
        (SHIPPING_DISPLAY_IA["queue"]["label"], dash(mq), f"{dash(review)} awaiting review", PURPLE if mq else DIM),
    ]
    gap = 3
    col = max(12, (width - gap * (len(metrics) - 1)) // len(metrics))
    leftover = width - (col * len(metrics) + gap * (len(metrics) - 1))
    widths = [col] * (len(metrics) - 1) + [col + leftover]
    labels, values, details = [], [], []
    for (label, value, detail, color), col_width in zip(metrics, widths):
        labels.append(pad_visible(_rgb(DIM, clip(label, col_width), bold=True), col_width))
        values.append(pad_visible(_rgb(color, clip(value, col_width), bold=True), col_width))
        details.append(pad_visible(_rgb(DIM, clip(detail, col_width)), col_width))
    spacer = " " * gap
    context = f"Runtime {runtime_label(seconds)}  ·  Rate limits {limits}"
    return [spacer.join(labels), spacer.join(values), spacer.join(details), _rgb(DIM, clip(context, width))]


def _stage_bar(stage: dict[str, Any], max_p95: float | None, width: int) -> str:
    series = stage.get("series")
    if isinstance(series, list) and series:
        return sparkline(series)[: max(1, width)]
    p95 = stage.get("p95")
    if p95 is None or max_p95 is None or max_p95 <= 0:
        return "-"
    last = len(BARS) - 1
    height = max(0, min(last, int(round((float(p95) / max_p95) * last))))
    return BARS[height] * max(1, min(8, width))


def _pr_flow_lines(flow: dict[str, Any] | None, width: int, *, now: datetime) -> list[str]:
    payload = flow if isinstance(flow, dict) else {}
    known = payload.get("ok") is True
    opened = _int(payload.get("opened_24h")) if known else None
    merged = _int(payload.get("merged_24h")) if known else None
    net = opened - merged if opened is not None and merged is not None else None
    net_text = "-" if net is None else f"{net:+d}"
    freshness = natural_time(payload.get("generated_at"), now=now) if known else "source unavailable"
    if payload.get("stale") is True:
        freshness = f"STALE · {freshness}"
    heading = (
        _rgb(FG, SHIPPING_DISPLAY_IA["pr_flow"]["label"], bold=True)
        + _rgb(DIM, f"  ·  rolling prior 24h  ·  GitHub  ·  Updated {freshness}")
    )
    cells = [
        ("OPEN NOW", dash(_int(payload.get("open_count")) if known else None), FG),
        ("OPENED 24H", dash(opened), BLUE if opened else DIM),
        ("MERGED 24H", dash(merged), BLUE if merged else DIM),
        ("NET FLOW", net_text, PINK if net is not None and net > 0 else BLUE if net is not None and net < 0 else DIM),
    ]
    gap = 4
    col = max(12, (width - gap * (len(cells) - 1)) // len(cells))
    leftover = width - (col * len(cells) + gap * (len(cells) - 1))
    widths = [col] * (len(cells) - 1) + [col + leftover]
    spacer = " " * gap
    label_line = spacer.join(
        pad_visible(_rgb(DIM, clip(label, cell_width), bold=True), cell_width)
        for (label, _, _), cell_width in zip(cells, widths)
    )
    value_line = spacer.join(
        pad_visible(_rgb(color, clip(value, cell_width), bold=True), cell_width)
        for (_, value, color), cell_width in zip(cells, widths)
    )
    return [pad_visible(heading, width), label_line, value_line]


def _semantic_color(status: str) -> tuple[int, int, int]:
    return BLUE if status in {"healthy", "success"} else PURPLE if status in {"warning", "pending"} else PINK if status == "failure" else DIM


def _pct0(value: Any) -> str:
    number = _num(value)
    return "-" if number is None else f"{number:.0f}%"


def _system_pressure_lines(pressure: dict[str, Any] | None, width: int, *, now: datetime) -> list[str]:
    payload = pressure if isinstance(pressure, dict) else {}
    known = payload.get("ok") is True
    freshness = natural_time(payload.get("generated_at"), now=now) if known else "source unavailable"
    if payload.get("stale") is True:
        freshness = f"STALE · {freshness}"
    cpu = payload.get("cpu") if isinstance(payload.get("cpu"), dict) else {}
    memory = payload.get("memory") if isinstance(payload.get("memory"), dict) else {}
    io = payload.get("io") if isinstance(payload.get("io"), dict) else {}
    network = payload.get("network") if isinstance(payload.get("network"), dict) else {}
    slots = payload.get("slots") if isinstance(payload.get("slots"), dict) else {}
    net_mbps = _num(network.get("mbps"))
    net_speed = _int(network.get("speed_mbps"))
    load1 = _num(cpu.get("load1"))
    load_text = "-" if load1 is None else f"{load1:.1f}"
    cells = [
        ("CPU / LOAD", _pct0(cpu.get("signal_pct")), f"load {load_text}/{dash(cpu.get('cores'))} · PSI {_pct0(cpu.get('psi'))}", str(cpu.get("status") or "unknown")),
        ("MEMORY", f"{_pct0(memory.get('available_pct'))} available", f"PSI {_pct0(memory.get('psi'))}", str(memory.get("status") or "unknown")),
        ("DISK / I/O", f"{_pct0(io.get('available_pct'))} available", f"{_pct0(io.get('used_pct'))} used · PSI {_pct0(io.get('psi'))}", str(io.get("status") or "unknown")),
        ("NETWORK", "-" if net_mbps is None else f"{net_mbps:.1f} Mbps", "rate window pending" if net_mbps is None else f"{dash(net_speed)} Mbps link · {_pct0(network.get('util_pct'))}", str(network.get("status") or "unknown")),
        ("WORKER SLOTS", f"{dash(slots.get('running'))}/{dash(slots.get('cap'))}", f"{_pct0(slots.get('util_pct'))} used", str(slots.get("status") or "unknown")),
    ]
    gap = 3
    col = max(12, (width - gap * (len(cells) - 1)) // len(cells))
    leftover = width - (col * len(cells) + gap * (len(cells) - 1))
    widths = [col] * (len(cells) - 1) + [col + leftover]
    spacer = " " * gap
    heading = _rgb(FG, SHIPPING_DISPLAY_IA["system_pressure"]["label"], bold=True) + _rgb(DIM, f"  ·  host projection  ·  Updated {freshness}")
    labels = spacer.join(pad_visible(_rgb(DIM, clip(label, cell_width), bold=True), cell_width) for (label, _, _, _), cell_width in zip(cells, widths))
    values = spacer.join(pad_visible(_rgb(_semantic_color(status), clip(value, cell_width), bold=True), cell_width) for (_, value, _, status), cell_width in zip(cells, widths))
    details = spacer.join(pad_visible(_rgb(DIM, clip(detail, cell_width)), cell_width) for (_, _, detail, _), cell_width in zip(cells, widths))
    return [pad_visible(heading, width), labels, values, details]


def _matrix_status(status: Any, width: int) -> str:
    normalized = str(status or "unknown")
    text = {"success": "✓ PASS", "pending": "… RUN", "failure": "× FAIL", "unknown": "? UNKNOWN"}.get(normalized, "? UNKNOWN")
    return _rgb(_semantic_color(normalized), _cell(text, width), bold=normalized == "failure")


def _ci_matrix_lines(flow: dict[str, Any] | None, width: int, *, now: datetime) -> list[str]:
    payload = flow if isinstance(flow, dict) else {}
    rows = payload.get("ci_matrix") if isinstance(payload.get("ci_matrix"), list) else []
    rows = [row for row in rows if isinstance(row, dict)][:8]
    known = payload.get("ok") is True
    freshness = natural_time(payload.get("generated_at"), now=now) if known else "source unavailable"
    if payload.get("stale") is True:
        freshness = f"STALE · {freshness}"
    query_ms = _int(payload.get("query_ms")) if known else None
    total = _int(payload.get("open_count")) if known else None
    heading = (
        _rgb(FG, SHIPPING_DISPLAY_IA["ci_matrix"]["label"], bold=True)
        + _rgb(DIM, f"  ·  cached GitHub rollup  ·  {len(rows)}/{dash(total)} rows  ·  {dash(query_ms)}ms  ·  Updated {freshness}")
    )
    status_width = 10
    gap = 2
    item_width = max(30, width - (status_width * 5 + gap * 5))
    header = "  ".join(
        [
            _cell("PR / WORK ITEM", item_width),
            *(_cell(label, status_width) for label in ("FAST", "READY", "SECURITY", "VISUAL", "ALL")),
        ]
    )
    result = [pad_visible(heading, width), _rgb(DIM, header), _rgb(DIM, "─" * width)]
    if not known:
        return [*result, _rgb(DIM, clip("? CI projection unavailable", width))]
    if not rows:
        return [*result, _rgb(DIM, clip("No open PR rows in cached projection", width))]
    for row in rows:
        number = f"#{row['number']} " if isinstance(row.get("number"), int) else ""
        item = _cell(number + dash(row.get("title")), item_width)
        result.append(
            "  ".join(
                [
                    _rgb(FG, item),
                    _matrix_status(row.get("fast"), status_width),
                    _matrix_status(row.get("ready"), status_width),
                    _matrix_status(row.get("security"), status_width),
                    _matrix_status(row.get("visual"), status_width),
                    _matrix_status(row.get("all"), status_width),
                ]
            )
        )
    return result


def _ship_path_lines(ship_path: dict[str, Any] | None, width: int) -> list[str]:
    payload = ship_path if isinstance(ship_path, dict) and isinstance(ship_path.get("stages"), list) else empty_ship_path()
    stages = payload.get("stages") or empty_ship_path()["stages"]
    count = max(1, len(SHIP_STAGES))
    col = max(12, (max(MIN_WIDTH, width) - 2 * (count - 1)) // count)
    leftover = max(MIN_WIDTH, width) - (col * count + 2 * (count - 1))
    widths = [col] * (count - 1) + [col + leftover]
    max_p95 = max((float(stage["p95"]) for stage in stages if stage.get("p95") is not None), default=None)
    bottleneck = payload.get("bottleneck") if isinstance(payload.get("bottleneck"), dict) else None
    labels, stats, bars = [], [], []
    for stage, col_width in zip(stages, widths):
        color = PINK if (bottleneck and bottleneck.get("id") == stage.get("id")) or stage.get("queued") else BLUE if stage.get("p95") is not None else DIM
        p95_text = "-" if stage.get("p95") is None else runtime_label(stage.get("p95"))
        labels.append(pad_visible(_rgb(color, clip(str(stage.get("label") or "-"), col_width), bold=True), col_width))
        stats.append(pad_visible(_rgb(DIM, clip(f"n={dash(stage.get('count'))} p95 {p95_text}", col_width)), col_width))
        bars.append(pad_visible(_rgb(color, clip(_stage_bar(stage, max_p95, col_width), col_width)), col_width))
    spacer = "  "
    named = f"#1 {bottleneck['reason']}" if bottleneck and bottleneck.get("reason") else "-"
    heading = pad_visible(
        _rgb(FG, clip(SHIPPING_DISPLAY_IA["shipping_path"]["label"], 4), bold=True)
        + _rgb(DIM, clip("  Todo/pickup → agent running → PR open → ci-fast → PR Ready → merge queue → merge_group CI → merged", max(0, width - 4))),
        width,
    )
    return [heading, spacer.join(labels), spacer.join(stats), spacer.join(bars), pad_visible(_rgb(PINK if named != "-" else DIM, clip(named, width)), width)]


def named_number_one(
    alive: dict[str, Any],
    wow: dict[str, Any],
    ships: dict[str, int],
    symphony: dict[str, Any],
    ship_path: dict[str, Any] | None,
) -> str:
    bottleneck_row = ship_path.get("bottleneck") if isinstance(ship_path, dict) else None
    if isinstance(bottleneck_row, dict) and bottleneck_row.get("reason"):
        return str(bottleneck_row["reason"])
    return bottleneck(alive, wow, ships, symphony)


def _footer(symphony: dict[str, Any], width: int, *, now: datetime) -> str:
    up = "up" if symphony.get("up") else "down"
    hook = symphony.get("hook_failed")
    if hook is True:
        hook_text = "yes"
    elif hook in {None, False, ""}:
        hook_text = "-"
    else:
        hook_text = str(hook).splitlines()[0][:40]
    totals = symphony.get("totals") if isinstance(symphony.get("totals"), dict) else {}
    incoming = compact_tokens(totals.get("input_tokens") if totals else None)
    outgoing = compact_tokens(totals.get("output_tokens") if totals else None)
    last_event = symphony.get("last_event")
    event_text = natural_time(last_event, now=now) if _iso(last_event) else dash(last_event)
    parts = [
        f"Symphony :4041 {up}",
        f"hook_failed {hook_text}",
        f"last event {event_text}",
        f"totals in {incoming} out {outgoing}",
    ]
    return pad_visible(_rgb(DIM, " | ".join(parts)), width)


def render(
    *,
    symphony: dict[str, Any],
    mq: dict[str, Any],
    review: int | None,
    measured: dict[str, Any] | None = None,
    now: datetime | None = None,
    width: int | None = None,
    height: int | None = None,
    sha: str | None = None,
    ship_path: dict[str, Any] | None = None,
    tps: float | None = None,
    pr_flow: dict[str, Any] | None = None,
    system_pressure: dict[str, Any] | None = None,
) -> str:
    clock = now or _now()
    cols, rows = terminal_size(width=width, height=height)
    measured = measured if isinstance(measured, dict) else {}
    alive = compute_alive(measured.get("alive"))
    wow = compute_wow(measured.get("wow"))
    ships = count_ships_this_week(measured.get("ships"), now=clock)
    path = ship_path if isinstance(ship_path, dict) else empty_ship_path()
    named = named_number_one(alive, wow, ships, symphony, path)
    alive_spark = series_values(measured, "alive")
    wow_spark = series_values(measured, "wow")
    ships_spark = series_values(measured, "ships")
    alive_detail = UNMEASURED if alive["status"] == UNKNOWN else f"cash {_money(alive['cashUsd'])}  burn {_money(alive['weeklyBurnUsd'])}  rev {_money(alive['weeklyRevenueUsd'])}"
    wow_detail = UNMEASURED if wow["rate"] is None else f"{wow['basis']}  this {_money(wow['thisWeekRevenueUsd'])} / last {_money(wow['lastWeekRevenueUsd'])}"
    gap = 2
    col = (cols - gap * 3) // 4
    leftover = cols - (col * 4 + gap * 3)
    tile_widths = [col, col, col, col + leftover]
    alive_color = DIM if alive["status"] == UNKNOWN else BLUE if alive["status"] == "DEFAULT ALIVE" else PINK
    wow_color = DIM if wow["rate"] is None else BLUE if wow["rate"] >= 0 else PINK
    ships_color = BLUE if isinstance(ships["thisWeek"], int) and ships["thisWeek"] > 0 else DIM
    ships_headline = UNKNOWN if ships["thisWeek"] is None else str(ships["thisWeek"])
    ships_detail = UNMEASURED if ships["thisWeek"] is None else "receipted this week"
    tiles = _tiles_row(
        [
            _tile("ALIVE", alive["status"], alive_detail, sparkline(alive_spark) if alive_spark else "-", alive_color, tile_widths[0]),
            _tile("WOW", UNKNOWN if wow["rate"] is None else _pct(wow["rate"]), wow_detail, sparkline(wow_spark) if wow_spark else "-", wow_color, tile_widths[1]),
            _tile("SHIPS", ships_headline, ships_detail, sparkline(ships_spark) if ships_spark else "-", ships_color, tile_widths[2]),
            _tile("#1", named, f"symphony run {dash(symphony.get('running'))} retry {dash(symphony.get('retrying'))}", "-", PINK if named != "-" else DIM, tile_widths[3]),
        ],
        cols,
    )
    mq_n = mq.get("count") if mq.get("ok") else None
    header = _header(
        sha=sha,
        freshness=natural_time(symphony.get("generated_at"), now=clock),
        width=cols,
    )
    widths = _col_widths(cols)
    tps_value = tps if tps is not None else compute_throughput(symphony.get("totals"), [], now=clock)
    lines = [
        header,
        _rgb(DIM, PRODUCT_DESCRIPTION),
        "",
        *_hero_metrics(symphony, tps_value, mq_n, review, cols),
        "",
        *_system_pressure_lines(system_pressure, cols, now=clock),
        "",
        *_pr_flow_lines(pr_flow, cols, now=clock),
        "",
        *_ship_path_lines(path, cols),
        "",
        *_ci_matrix_lines(pr_flow, cols, now=clock),
        "",
        *tiles,
        "",
        _rgb(FG, SHIPPING_DISPLAY_IA["current_work"]["label"], bold=True),
        _table_header(widths),
        _rgb(DIM, "─" * cols),
    ]
    work_rows = [_job_row(row, widths, now=clock) for row in (symphony.get("rows") or [])]
    work_rows.extend(_job_row(row, widths, now=clock) for row in (mq.get("rows") or []))
    if review is None:
        work_rows.append(_rgb(PINK, clip("v  Review -", cols)))
    elif review > 0:
        work_rows.append(_rgb(PINK, clip(f"v  Review {review}", cols)))
    footer = ["", _footer(symphony, cols, now=clock)]
    available = max(1, rows - len(lines) - len(footer))
    if len(work_rows) > available:
        hidden = len(work_rows) - available + 1
        work_rows = [*work_rows[: max(0, available - 1)], _rgb(DIM, clip(f"… {hidden} more active receipts", cols))]
    lines.extend(work_rows)
    lines.extend([""] * max(0, available - len(work_rows)))
    lines.extend(footer)
    lines = lines[:rows]
    return f"\033[48;2;{BG[0]};{BG[1]};{BG[2]}m" + "\n".join(lines) + "\033[0m\n"


def frame(
    *,
    measured_path: Path,
    symphony_url: str,
    width: int | None = None,
    height: int | None = None,
) -> str:
    cap = read_workflow_cap()
    symphony = fetch_symphony(symphony_url, cap=cap)
    mq = fetch_mq()
    linear = fetch_linear_project()
    github_path = Path(os.environ.get("HUD_GITHUB_PATH", str(DEFAULT_GITHUB_STATE)))
    github = fetch_github_ship(
        cache_path=github_path,
        allow_background=os.environ.get("HUD_GITHUB_BLOCKING") != "1",
    )
    measured = load_measured(measured_path)
    tps_path = Path(os.environ.get("HUD_TPS_PATH", str(DEFAULT_TPS_STATE)))
    snapshots = load_tps_snapshots(tps_path)
    tps = compute_throughput(symphony.get("totals"), snapshots)
    persist_tps_snapshot(tps_path, symphony.get("totals"))
    pressure_path = Path(os.environ.get("HUD_PRESSURE_PATH", str(DEFAULT_PRESSURE_STATE)))
    pressure = fetch_system_pressure(symphony, state_path=pressure_path)
    return render(
        symphony=symphony,
        mq=mq,
        review=linear.get("review") if linear.get("ok") else fetch_review(),
        measured=measured,
        width=width,
        height=height,
        sha=fetch_sha(),
        ship_path=build_ship_path(symphony=symphony, mq=mq, linear=linear, github=github, measured=measured),
        tps=tps,
        pr_flow=github,
        system_pressure=pressure,
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Gem tty1 ultrawide HUD")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--measured", default=os.environ.get("HUD_MEASURED_PATH", str(DEFAULT_MEASURED)))
    parser.add_argument("--symphony-url", default=DEFAULT_SYMPHONY)
    parser.add_argument("--interval", type=float, default=5.0)
    parser.add_argument("--width", type=int, default=None)
    parser.add_argument("--height", type=int, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    path = Path(args.measured)
    if args.once:
        sys.stdout.write(frame(measured_path=path, symphony_url=args.symphony_url, width=args.width, height=args.height))
        return 0
    while True:
        sys.stdout.write("\033[2J\033[H")
        sys.stdout.write(frame(measured_path=path, symphony_url=args.symphony_url, width=args.width, height=args.height))
        sys.stdout.flush()
        time.sleep(max(0.5, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
