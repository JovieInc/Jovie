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
DEFAULT_SHIP_CACHE = Path.home() / ".local/state/gem-checkin-hud/ship-path.json"
DEFAULT_SYMPHONY = os.environ.get("SYMPHONY_STATE_URL", "http://127.0.0.1:4043/api/v1/state")
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
SHIP_CACHE_TTL = 45
TPS_WINDOW_SECONDS = 5.0
MIN_WIDTH = 120
TARGET_WIDTH = 430


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


def terminal_width(override: int | None = None) -> int:
    if isinstance(override, int) and override > 0:
        return max(MIN_WIDTH, override)
    size = shutil.get_terminal_size((TARGET_WIDTH, 40))
    return max(MIN_WIDTH, int(size.columns or TARGET_WIDTH))


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
    if count < 1_000_000:
        return f"{count / 1000:.1f}k"
    return f"{count / 1_000_000:.1f}m"


def short_path(value: Any) -> str:
    text = dash(value)
    if text == "-":
        return text
    return text.replace(str(Path.home()), "~")[-28:]


def load_measured(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


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


def count_ships_this_week(ships: Any, *, now: datetime | None = None) -> dict[str, int]:
    receipts = ships.get("receipts") if isinstance(ships, dict) else None
    if not isinstance(receipts, list):
        receipts = []
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


def load_json_dict(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


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
    tokens = _int(totals.get("total_tokens"))
    seconds = _int(totals.get("seconds_running"))
    if tokens is None and seconds is None:
        return
    clock = now or _now()
    snapshots = [
        item
        for item in load_tps_snapshots(path)
        if _iso(item.get("at")) is not None
    ]
    snapshots.append(
        {
            "at": clock.isoformat(),
            "total_tokens": tokens,
            "seconds_running": seconds,
        }
    )
    cutoff = clock - timedelta(seconds=90)
    kept = [item for item in snapshots if (stamp := _iso(item.get("at"))) is not None and stamp >= cutoff]
    write_json(path, {"snapshots": kept[-20:]})


def compute_throughput(totals: Any, snapshots: list[dict[str, Any]] | None, *, now: datetime | None = None) -> float | None:
    if not isinstance(totals, dict):
        return None
    tokens = _int(totals.get("total_tokens"))
    seconds = _int(totals.get("seconds_running"))
    clock = now or _now()
    history = []
    for item in snapshots or []:
        stamp = _iso(item.get("at"))
        prev_tokens = _int(item.get("total_tokens"))
        if stamp is None or prev_tokens is None:
            continue
        history.append((stamp, prev_tokens, _int(item.get("seconds_running"))))
    window_hit: tuple[datetime, int, int | None] | None = None
    fallback_hit: tuple[datetime, int, int | None] | None = None
    for stamp, prev_tokens, prev_seconds in history:
        age = (clock - stamp).total_seconds()
        if 4.0 <= age <= 8.0:
            window_hit = (stamp, prev_tokens, prev_seconds)
        elif 0.4 < age <= 15.0 and fallback_hit is None:
            fallback_hit = (stamp, prev_tokens, prev_seconds)
    chosen = window_hit or fallback_hit
    if chosen is not None and tokens is not None:
        stamp, prev_tokens, prev_seconds = chosen
        wall = (clock - stamp).total_seconds()
        running_delta = None if seconds is None or prev_seconds is None else seconds - prev_seconds
        denom = running_delta if running_delta is not None and running_delta > 0 else wall
        if denom > 0:
            return max(0.0, (tokens - prev_tokens) / denom)
    if tokens is not None and seconds is not None and seconds > 0:
        return tokens / seconds
    return None


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
    primary = rate_limits.get("primary")
    if primary is not None:
        parts.append(f"primary {format_rate_window(primary)}")
    secondary = rate_limits.get("secondary")
    if "secondary" in rate_limits:
        parts.append("secondary n/a" if secondary is None else f"secondary {format_rate_window(secondary)}")
    credits = rate_limits.get("credits")
    if isinstance(credits, dict):
        if credits.get("unlimited") is True:
            parts.append("credits unlimited")
        elif credits.get("balance") is not None:
            parts.append(f"credits {credits['balance']}")
        elif credits.get("has_credits") is True:
            parts.append("credits yes")
        else:
            parts.append("credits -")
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
    return {
        "id": stage_id,
        "label": label,
        "count": None,
        "p95": None,
        "queued": False,
        "queue_reason": None,
        "series": None,
    }


def empty_ship_path() -> dict[str, Any]:
    return {
        "ok": False,
        "stages": [empty_stage(stage_id, label) for stage_id, label in SHIP_STAGES],
        "bottleneck": None,
    }


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
    for stage in stages:
        if stage.get("queued") and stage.get("queue_reason"):
            return {
                "id": stage["id"],
                "label": stage["label"],
                "reason": stage["queue_reason"],
            }
    measured = [stage for stage in stages if stage.get("p95") is not None]
    if not measured:
        return None
    worst = max(measured, key=lambda stage: float(stage["p95"]))
    return {
        "id": worst["id"],
        "label": worst["label"],
        "reason": f"{worst['label']} p95 {runtime_label(worst['p95'])}",
    }


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
    running_count = symphony.get("running") if symphony.get("ok") else None
    mq_ok = bool(mq.get("ok"))
    mq_count = mq.get("count") if mq_ok else None
    mq_awaiting = mq_ok and isinstance(mq_count, int) and mq_count > 0
    merge_group_in = github.get("merge_group_in") if github.get("ok") else None
    merge_group_waiting = isinstance(merge_group_in, int) and merge_group_in > 0
    stages = [
        stage_from_source(
            "todo",
            "Todo/pickup",
            ok=bool(linear.get("ok")),
            count=linear.get("todo"),
            durations=linear.get("pickup_durations"),
            series=series_for("todo"),
        ),
        stage_from_source(
            "running",
            "agent running",
            ok=bool(symphony.get("ok")),
            count=running_count,
            durations=None,
            queued=isinstance(retrying, int) and retrying > 0,
            queue_reason=f"retrying agents {retrying}" if isinstance(retrying, int) and retrying > 0 else None,
            series=series_for("running"),
        ),
        stage_from_source(
            "pr_open",
            "PR open",
            ok=bool(github.get("ok")),
            count=github.get("pr_open"),
            durations=github.get("pr_open_durations"),
            series=series_for("pr_open"),
        ),
        stage_from_source(
            "ci_fast",
            "ci-fast",
            ok=bool(github.get("ok")),
            count=github.get("ci_fast"),
            durations=github.get("ci_fast_durations"),
            queued=bool(github.get("ci_fast_queued")),
            queue_reason="ci-fast awaiting checks" if github.get("ci_fast_queued") else None,
            series=series_for("ci_fast"),
        ),
        stage_from_source(
            "pr_ready",
            "PR Ready",
            ok=bool(github.get("ok")),
            count=github.get("pr_ready"),
            durations=github.get("pr_ready_durations"),
            queued=bool(github.get("pr_ready_queued")),
            queue_reason="PR Ready awaiting checks" if github.get("pr_ready_queued") else None,
            series=series_for("pr_ready"),
        ),
        stage_from_source(
            "mq",
            "merge queue",
            ok=mq_ok,
            count=mq_count,
            durations=github.get("mq_durations") if github.get("ok") else None,
            queued=mq_awaiting and not merge_group_waiting,
            queue_reason="MQ awaiting checks" if mq_awaiting and not merge_group_waiting else None,
            series=series_for("mq"),
        ),
        stage_from_source(
            "merge_group",
            "merge_group CI",
            ok=bool(github.get("ok")),
            count=merge_group_in,
            durations=github.get("merge_group_durations"),
            queued=merge_group_waiting,
            queue_reason="merge_group CI running" if merge_group_waiting else None,
            series=series_for("merge_group"),
        ),
        stage_from_source(
            "merged",
            "merged",
            ok=bool(github.get("ok")),
            count=github.get("merged"),
            durations=github.get("merged_durations"),
            series=series_for("merged"),
        ),
    ]
    return {"ok": True, "stages": stages, "bottleneck": ship_bottleneck(stages)}


def bottleneck(alive: dict[str, Any], wow: dict[str, Any], ships: dict[str, int], symphony: dict[str, Any]) -> str:
    if alive["status"] == "DEAD":
        return "cash or profit-before-zero is dead"
    if alive["status"] == UNKNOWN:
        return "ALIVE unmeasured — do not invent P&L"
    if wow["rate"] is None:
        return "WOW unmeasured — revenue first, else active users"
    if wow["rate"] < 0.05:
        return "WOW below 5–7%/wk YC bar"
    if ships["thisWeek"] == 0:
        return "no receipted ships this week"
    retrying = symphony.get("retrying")
    if symphony.get("ok") and isinstance(retrying, int) and retrying > 0:
        return f"Symphony retrying {retrying}"
    if not symphony.get("ok"):
        return "official Symphony :4043 unreachable"
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
    return {
        "kind": kind,
        "id": ident,
        "title": title,
        "url": url,
        "attempt": _int(item.get("attempt") or running.get("attempt") or retry.get("attempt")),
        "turn": _int(item.get("turn_count") or running.get("turn_count")),
        "tokens_in": incoming,
        "tokens_out": outgoing,
        "tokens_total": total,
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


def fetch_symphony(url: str, *, timeout: float = 1.5, cap: int | None = None) -> dict[str, Any]:
    empty = {
        "ok": False,
        "running": None,
        "retrying": None,
        "blocked": None,
        "cap": cap,
        "rows": [],
        "totals": None,
        "seconds_running": None,
        "rate_limits": None,
        "hook_failed": None,
        "last_event": None,
        "up": False,
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
    running_n = counts.get("running")
    retrying_n = counts.get("retrying")
    blocked_n = counts.get("blocked")
    if not isinstance(running_n, int):
        running_n = len(running_items) if running_items or payload.get("running") is not None else None
    if not isinstance(retrying_n, int):
        retrying_n = len(retrying_items) if retrying_items or payload.get("retrying") is not None else None
    if not isinstance(blocked_n, int):
        blocked_n = len(blocked_items) if blocked_items or payload.get("blocked") is not None else None
    totals = payload.get("codex_totals") if isinstance(payload.get("codex_totals"), dict) else None
    seconds_running = _int(totals.get("seconds_running")) if totals else None
    raw_limits = payload.get("rate_limits")
    rate_limits = raw_limits if isinstance(raw_limits, dict) else None
    hook = payload.get("hook_failed")
    if hook is None and isinstance(counts.get("hook_failed"), (str, int, bool)):
        hook = counts.get("hook_failed")
    last_event = _text(payload, ("last_event", "generated_at"))
    for row in rows:
        if row.get("last_event"):
            last_event = row["last_event"]
            break
    return {
        "ok": True,
        "running": running_n,
        "retrying": retrying_n,
        "blocked": blocked_n,
        "cap": cap,
        "rows": rows,
        "totals": totals,
        "seconds_running": seconds_running,
        "rate_limits": rate_limits,
        "hook_failed": hook,
        "last_event": last_event,
        "up": True,
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
        rows.append(
            {
                "kind": "mq",
                "number": number if isinstance(number, int) else None,
                "title": _text(pr, ("title",)),
                "enqueued": node.get("enqueuedAt"),
                "position": node.get("position"),
            }
        )
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
    if payload is None:
        review = fetch_review(timeout=timeout)
        return {"ok": review is not None, "review": review, "todo": None, "pickup_durations": None}
    project = (payload.get("data") or {}).get("project")
    if not isinstance(project, dict):
        review = fetch_review(timeout=timeout)
        return {"ok": review is not None, "review": review, "todo": None, "pickup_durations": None}
    nodes = (project.get("issues") or {}).get("nodes") or []
    todo = 0
    review = 0
    pickup: list[float] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        state = ((node.get("state") or {}).get("name") if isinstance(node.get("state"), dict) else None) or ""
        if state == "Todo":
            todo += 1
        elif state == "In Review":
            review += 1
        created, started = _iso(node.get("createdAt")), _iso(node.get("startedAt"))
        if created is not None and started is not None:
            delta = (started - created).total_seconds()
            if delta > 0:
                pickup.append(delta)
    return {
        "ok": True,
        "review": review,
        "todo": todo,
        "pickup_durations": pickup or None,
    }


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


def fetch_github_ship(*, timeout: float = 12.0) -> dict[str, Any]:
    open_prs = _gh_json(
        [
            "pr",
            "list",
            "--repo",
            "JovieInc/Jovie",
            "--state",
            "open",
            "--limit",
            "40",
            "--json",
            "number,title,createdAt,isDraft,statusCheckRollup,mergeStateStatus",
        ],
        timeout=timeout,
    )
    merged_prs = _gh_json(
        [
            "pr",
            "list",
            "--repo",
            "JovieInc/Jovie",
            "--state",
            "merged",
            "--limit",
            "30",
            "--json",
            "number,title,createdAt,mergedAt,statusCheckRollup",
        ],
        timeout=timeout,
    )
    merge_group = _gh_json(
        ["api", "repos/JovieInc/Jovie/actions/runs?event=merge_group&per_page=20"],
        timeout=timeout,
    )
    if not isinstance(open_prs, list) or not isinstance(merged_prs, list):
        return {"ok": False}
    mq_payload = fetch_mq(timeout=min(8.0, timeout))
    mq_numbers = {
        row.get("number")
        for row in (mq_payload.get("rows") or [])
        if isinstance(row, dict) and isinstance(row.get("number"), int)
    }
    pr_open = 0
    pr_open_durations: list[float] = []
    ci_fast = 0
    ci_fast_queued = False
    ci_fast_durations: list[float] = []
    pr_ready = 0
    pr_ready_queued = False
    pr_ready_durations: list[float] = []
    for pr in open_prs:
        if not isinstance(pr, dict):
            continue
        number = pr.get("number")
        rollups = pr.get("statusCheckRollup")
        fast = named_checks(rollups, CI_FAST_NAMES)
        ready = named_checks(rollups, PR_READY_NAMES)
        fast_pending = any(_check_status(item) in CHECK_PENDING for item in fast)
        ready_pending = any(_check_status(item) in CHECK_PENDING for item in ready)
        in_mq = isinstance(number, int) and number in mq_numbers
        if fast_pending:
            ci_fast += 1
            ci_fast_queued = True
        elif ready_pending:
            pr_ready += 1
            pr_ready_queued = True
        elif not in_mq:
            pr_open += 1
        created = _iso(pr.get("createdAt"))
        first_fast = None
        for item in fast:
            started = _iso(item.get("startedAt") or item.get("started_at"))
            if started is not None and (first_fast is None or started < first_fast):
                first_fast = started
        if created is not None and first_fast is not None:
            delta = (first_fast - created).total_seconds()
            if delta > 0:
                pr_open_durations.append(delta)
        for item in fast:
            duration = check_duration_seconds(item)
            if duration is not None:
                ci_fast_durations.append(duration)
        for item in ready:
            duration = check_duration_seconds(item)
            if duration is not None:
                pr_ready_durations.append(duration)
    merged_count = 0
    merged_durations: list[float] = []
    week_ago = _now() - timedelta(days=1)
    for pr in merged_prs:
        if not isinstance(pr, dict):
            continue
        merged_at = _iso(pr.get("mergedAt"))
        created = _iso(pr.get("createdAt"))
        if merged_at is not None and merged_at >= week_ago:
            merged_count += 1
        if created is not None and merged_at is not None:
            delta = (merged_at - created).total_seconds()
            if delta > 0:
                merged_durations.append(delta)
        rollups = pr.get("statusCheckRollup")
        for item in named_checks(rollups, CI_FAST_NAMES):
            duration = check_duration_seconds(item)
            if duration is not None:
                ci_fast_durations.append(duration)
        for item in named_checks(rollups, PR_READY_NAMES):
            duration = check_duration_seconds(item)
            if duration is not None:
                pr_ready_durations.append(duration)
    merge_group_in = None
    merge_group_durations: list[float] = []
    if isinstance(merge_group, dict):
        runs = merge_group.get("workflow_runs")
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
    return {
        "ok": True,
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


def _bucket(label: str, value: int | None, color: tuple[int, int, int]) -> str | None:
    if value == 0:
        return None
    return _rgb(color, f"{label} {dash(value)}")


def _header(
    *,
    running: int | None,
    cap: int | None,
    retrying: int | None,
    mq: int | None,
    review: int | None,
    sha: str | None,
    width: int,
) -> str:
    parts = [_rgb(BLUE, "JOVIE", bold=True), _rgb(PINK, "main")]
    if sha:
        parts.append(_rgb(DIM, sha))
    run = None if running == 0 else f"RUN {dash(running)}/{dash(cap)}"
    if run:
        parts.append(_rgb(BLUE, run, bold=True))
    for label, value, color in (("RETRY", retrying, PINK), ("MQ", mq, PURPLE), ("Review", review, PINK)):
        pill = _bucket(label, value, color)
        if pill:
            parts.append(pill)
    line = f" {_rgb(DIM, '|')} ".join(parts)
    return pad_visible(line, width)


def _tile(title: str, headline: str, detail: str, spark: str, color: tuple[int, int, int], width: int) -> list[str]:
    inner = max(8, width - 2)
    top = _rgb(color, f"┌ {clip(title, inner - 2)}", bold=True)
    body = [
        _rgb(FG, clip(headline, inner), bold=True),
        _rgb(DIM, clip(detail, inner)),
        _rgb(color, clip(spark, inner)),
    ]
    bottom = _rgb(DIM, "└" + ("─" * (inner - 1)))
    return [pad_visible(top, width), *[pad_visible(f"│ {line}", width) for line in body], pad_visible(bottom, width)]


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


def _table_header(widths: dict[str, int]) -> str:
    cells = [
        clip("ST", widths["st"]),
        clip("ID", widths["id"]),
        clip("TITLE", widths["title"]),
        clip("ATTEMPT", widths["attempt"]),
        clip("TURN", widths["turn"]),
        clip("TOKENS", widths["tokens"]),
        clip("ELAPSED", widths["elapsed"]),
        clip("WS/PR", widths["ws"]),
    ]
    return _rgb(DIM, "  ".join(cells))


def _col_widths(width: int) -> dict[str, int]:
    st, ident, attempt, turn, tokens, elapsed, ws = 2, 12, 7, 4, 10, 7, 16
    fixed = st + ident + attempt + turn + tokens + elapsed + ws + (7 * 2)
    title = max(16, width - fixed)
    return {
        "st": st,
        "id": ident,
        "title": title,
        "attempt": attempt,
        "turn": turn,
        "tokens": tokens,
        "elapsed": elapsed,
        "ws": ws,
    }


def _job_row(row: dict[str, Any], widths: dict[str, int], *, now: datetime) -> str:
    kind = row.get("kind")
    if kind == "retrying":
        glyph, color = "↻", PINK
        elapsed = due_label(row.get("due_at"), now=now)
        ws = short_path(row.get("workspace"))
        title = dash(row.get("error") or row.get("title"))
    elif kind == "blocked":
        glyph, color = "✕", PINK
        elapsed = elapsed_label(row.get("started"), now=now, seconds=row.get("seconds"))
        ws = short_path(row.get("workspace"))
        title = dash(row.get("error") or row.get("title"))
    elif kind == "mq":
        glyph, color = "○", PURPLE
        elapsed = elapsed_label(row.get("enqueued"), now=now)
        ws = f"#{row['number']}" if isinstance(row.get("number"), int) else dash(row.get("position"))
        title = dash(row.get("title"))
        ident = f"#{row['number']}" if isinstance(row.get("number"), int) else "-"
        cells = [
            _rgb(color, clip(glyph, widths["st"])),
            _rgb(FG, clip(ident, widths["id"]), bold=True),
            _rgb(FG, clip(title, widths["title"])),
            _rgb(DIM, clip("-", widths["attempt"])),
            _rgb(DIM, clip("-", widths["turn"])),
            _rgb(DIM, clip("-", widths["tokens"])),
            _rgb(color, clip(elapsed, widths["elapsed"])),
            _rgb(DIM, clip(ws if ws.startswith("#") else f"pos {dash(row.get('position'))}", widths["ws"])),
        ]
        return "  ".join(cells)
    else:
        glyph, color = "●", BLUE
        elapsed = elapsed_label(row.get("started"), now=now, seconds=row.get("seconds"))
        ws = short_path(row.get("workspace") or row.get("url"))
        title = dash(row.get("title") or row.get("last_message"))
    ident = dash(row.get("id"))
    cells = [
        _rgb(color, clip(glyph, widths["st"])),
        _rgb(FG, clip(ident, widths["id"]), bold=True),
        _rgb(FG, clip(title, widths["title"])),
        _rgb(DIM, clip(dash(row.get("attempt")), widths["attempt"])),
        _rgb(DIM, clip(dash(row.get("turn")), widths["turn"])),
        _rgb(DIM, clip(compact_tokens(row.get("tokens_total"), row.get("tokens_in"), row.get("tokens_out")), widths["tokens"])),
        _rgb(color, clip(elapsed, widths["elapsed"])),
        _rgb(DIM, clip(ws, widths["ws"], tail=True)),
    ]
    return "  ".join(cells)


def _status_strip(symphony: dict[str, Any], tps: float | None, width: int) -> str:
    running = symphony.get("running") if symphony.get("ok") else None
    cap = symphony.get("cap") if symphony.get("ok") else symphony.get("cap")
    totals = symphony.get("totals") if isinstance(symphony.get("totals"), dict) else {}
    incoming = comma_int(totals.get("input_tokens") if totals else None)
    outgoing = comma_int(totals.get("output_tokens") if totals else None)
    total = comma_int(totals.get("total_tokens") if totals else None)
    seconds = symphony.get("seconds_running")
    if seconds is None and totals:
        seconds = totals.get("seconds_running")
    throughput = "-" if tps is None else f"{tps:,.0f} tps"
    agents = f"{dash(running)}/{dash(cap)}"
    limits = format_rate_limits(symphony.get("rate_limits"))
    title = _rgb(BLUE, "SYMPHONY STATUS", bold=True)
    fields = [
        _rgb(BLUE, f"Agents {agents}"),
        _rgb(PINK, f"Throughput {throughput}"),
        _rgb(PURPLE, f"Runtime {runtime_label(seconds)}"),
        _rgb(FG, f"Tokens in {incoming} | out {outgoing} | total {total}"),
        _rgb(DIM, f"Rate Limits {limits}"),
    ]
    line = f"{_rgb(BLUE, '╭')} {title}  " + f"  {_rgb(DIM, '│')}  ".join(fields)
    if visible_len(line) > width:
        line = line  # keep measured fields; terminal wraps rather than dropping official values
    return pad_visible(line, width) if visible_len(line) <= width else line


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


def _ship_path_lines(ship_path: dict[str, Any] | None, width: int) -> list[str]:
    payload = ship_path if isinstance(ship_path, dict) and isinstance(ship_path.get("stages"), list) else empty_ship_path()
    stages = payload.get("stages") or empty_ship_path()["stages"]
    gap = 2
    count = max(1, len(SHIP_STAGES))
    usable = max(MIN_WIDTH, width)
    col = max(12, (usable - gap * (count - 1)) // count)
    leftover = usable - (col * count + gap * (count - 1))
    widths = [col] * (count - 1) + [col + leftover]
    measured_p95 = [float(stage["p95"]) for stage in stages if stage.get("p95") is not None]
    max_p95 = max(measured_p95) if measured_p95 else None
    bottleneck = payload.get("bottleneck") if isinstance(payload.get("bottleneck"), dict) else None
    labels: list[str] = []
    stats: list[str] = []
    bars: list[str] = []
    for stage, col_width in zip(stages, widths):
        color = PINK if bottleneck and bottleneck.get("id") == stage.get("id") else BLUE if stage.get("p95") is not None else DIM
        if stage.get("queued"):
            color = PINK
        count_text = dash(stage.get("count"))
        p95_text = "-" if stage.get("p95") is None else runtime_label(stage.get("p95"))
        labels.append(pad_visible(_rgb(color, clip(str(stage.get("label") or "-"), col_width), bold=True), col_width))
        stats.append(pad_visible(_rgb(DIM, clip(f"n={count_text} p95 {p95_text}", col_width)), col_width))
        bars.append(pad_visible(_rgb(color, clip(_stage_bar(stage, max_p95, col_width), col_width)), col_width))
    spacer = " " * gap
    heading = pad_visible(
        _rgb(PURPLE, clip("SHIP", 4), bold=True)
        + _rgb(DIM, clip("  Todo/pickup → agent running → PR open → ci-fast → PR Ready → merge queue → merge_group CI → merged", max(0, width - 4))),
        width,
    )
    named = "-"
    if bottleneck and bottleneck.get("reason"):
        named = f"#1 {bottleneck['reason']}"
    return [
        heading,
        spacer.join(labels),
        spacer.join(stats),
        spacer.join(bars),
        pad_visible(_rgb(PINK if named != "-" else DIM, clip(named, width)), width),
    ]


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


def _footer(symphony: dict[str, Any], width: int) -> str:
    up = "up" if symphony.get("up") else "down"
    hook = symphony.get("hook_failed")
    if hook is True:
        hook_text = "yes"
    elif hook in {None, False, ""}:
        hook_text = "-"
    else:
        hook_text = str(hook).splitlines()[0][:40]
    totals = symphony.get("totals") if isinstance(symphony.get("totals"), dict) else {}
    incoming = dash(_int(totals.get("input_tokens")) if totals else None)
    outgoing = dash(_int(totals.get("output_tokens")) if totals else None)
    parts = [
        f"burrito :4043 {up}",
        f"hook_failed {hook_text}",
        f"last event {dash(symphony.get('last_event'))}",
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
    sha: str | None = None,
    ship_path: dict[str, Any] | None = None,
    tps: float | None = None,
) -> str:
    clock = now or _now()
    cols = terminal_width(width)
    measured = measured if isinstance(measured, dict) else {}
    alive = compute_alive(measured.get("alive"))
    wow = compute_wow(measured.get("wow"))
    ships = count_ships_this_week(measured.get("ships"), now=clock)
    path = ship_path if isinstance(ship_path, dict) else empty_ship_path()
    named = named_number_one(alive, wow, ships, symphony, path)
    alive_spark = series_values(measured, "alive")
    wow_spark = series_values(measured, "wow")
    ships_spark = series_values(measured, "ships")
    alive_detail = (
        UNMEASURED
        if alive["status"] == UNKNOWN
        else f"cash {_money(alive['cashUsd'])}  burn {_money(alive['weeklyBurnUsd'])}  rev {_money(alive['weeklyRevenueUsd'])}"
    )
    wow_detail = (
        UNMEASURED
        if wow["rate"] is None
        else f"{wow['basis']}  this {_money(wow['thisWeekRevenueUsd'])} / last {_money(wow['lastWeekRevenueUsd'])}"
    )
    gap = 2
    col = (cols - gap * 3) // 4
    leftover = cols - (col * 4 + gap * 3)
    tile_widths = [col, col, col, col + leftover]
    tiles = _tiles_row(
        [
            _tile("ALIVE", alive["status"], alive_detail, sparkline(alive_spark) if alive_spark else "-", BLUE, tile_widths[0]),
            _tile(
                "WOW",
                UNKNOWN if wow["rate"] is None else _pct(wow["rate"]),
                wow_detail,
                sparkline(wow_spark) if wow_spark else "-",
                PINK,
                tile_widths[1],
            ),
            _tile("SHIPS", str(ships["thisWeek"]), "receipted this week", sparkline(ships_spark) if ships_spark else "-", PURPLE, tile_widths[2]),
            _tile("#1", named, f"symphony run {dash(symphony.get('running'))} retry {dash(symphony.get('retrying'))}", "-", BLUE, tile_widths[3]),
        ],
        cols,
    )
    running_n = symphony.get("running") if symphony.get("ok") else None
    retrying_n = symphony.get("retrying") if symphony.get("ok") else None
    cap = symphony.get("cap") if symphony.get("ok") else symphony.get("cap")
    mq_n = mq.get("count") if mq.get("ok") else None
    header = _header(running=running_n, cap=cap, retrying=retrying_n, mq=mq_n, review=review, sha=sha, width=cols)
    widths = _col_widths(cols)
    tps_value = tps if tps is not None else compute_throughput(symphony.get("totals"), [], now=clock)
    lines = [
        header,
        "",
        _status_strip(symphony, tps_value, cols),
        "",
        *_ship_path_lines(path, cols),
        "",
        *tiles,
        "",
        _table_header(widths),
        _rgb(DIM, "─" * cols),
    ]
    for row in symphony.get("rows") or []:
        lines.append(_job_row(row, widths, now=clock))
    for row in mq.get("rows") or []:
        lines.append(_job_row(row, widths, now=clock))
    if review is None:
        lines.append(_rgb(PINK, clip("v  Review -", cols)))
    elif review > 0:
        lines.append(_rgb(PINK, clip(f"v  Review {review}", cols)))
    lines.extend(["", _footer(symphony, cols)])
    return f"\033[48;2;{BG[0]};{BG[1]};{BG[2]}m" + "\n".join(lines) + "\033[0m\n"


def frame(*, measured_path: Path, symphony_url: str, width: int | None = None) -> str:
    cap = read_workflow_cap()
    symphony = fetch_symphony(symphony_url, cap=cap)
    mq = fetch_mq()
    linear = fetch_linear_project()
    github = fetch_github_ship()
    measured = load_measured(measured_path)
    tps_path = Path(os.environ.get("HUD_TPS_PATH", str(DEFAULT_TPS_STATE)))
    snapshots = load_tps_snapshots(tps_path)
    tps = compute_throughput(symphony.get("totals"), snapshots)
    persist_tps_snapshot(tps_path, symphony.get("totals"))
    return render(
        symphony=symphony,
        mq=mq,
        review=linear.get("review") if linear.get("ok") else fetch_review(),
        measured=measured,
        width=width,
        sha=fetch_sha(),
        ship_path=build_ship_path(symphony=symphony, mq=mq, linear=linear, github=github, measured=measured),
        tps=tps,
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Gem tty1 ultrawide HUD")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--measured", default=os.environ.get("HUD_MEASURED_PATH", str(DEFAULT_MEASURED)))
    parser.add_argument("--symphony-url", default=DEFAULT_SYMPHONY)
    parser.add_argument("--interval", type=float, default=5.0)
    parser.add_argument("--width", type=int, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    path = Path(args.measured)
    if args.once:
        sys.stdout.write(frame(measured_path=path, symphony_url=args.symphony_url, width=args.width))
        return 0
    while True:
        sys.stdout.write("\033[2J\033[H")
        sys.stdout.write(frame(measured_path=path, symphony_url=args.symphony_url, width=args.width))
        sys.stdout.flush()
        time.sleep(max(0.5, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
