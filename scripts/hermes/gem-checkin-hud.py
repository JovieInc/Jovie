#!/usr/bin/env python3
"""Gem tty1 check-in glass HUD. Fourth HUD — not the ops grid, not empty red bars."""
from __future__ import annotations
import argparse
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
BARS = "▁▂▃▄▅▆▇█"
UNKNOWN = "UNKNOWN"
UNMEASURED = "unmeasured"
PROD_SHA_RE = re.compile(r"^[0-9a-f]{7,40}$", re.I)
DEFAULT_MEASURED = Path.home() / ".local/state/gem-checkin-hud/measured.json"
DEFAULT_SYMPHONY = os.environ.get("SYMPHONY_STATE_URL", "http://127.0.0.1:4043/api/v1/state")
def _now() -> datetime:
    return datetime.now(timezone.utc)
def _num(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)) and value == value:
        return float(value)
    return None
def _iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)
def _text(record: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = record.get(key)
        if isinstance(value, (int, float)) and value == value and value > 0:
            return str(int(value))
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None
def load_measured(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}
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
def vertical_bars(values: list[float], *, height: int = 4) -> list[str]:
    lo, hi = min(values), max(values)
    rows: list[str] = []
    for level in range(height, 0, -1):
        cells = []
        for value in values:
            rank = 1 if hi <= lo else 1 + int(round((value - lo) / (hi - lo) * (height - 1)))
            cells.append("█" if rank >= level else " ")
        rows.append("".join(cells))
    return rows
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
def fetch_symphony(url: str, *, timeout: float = 1.5) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError):
        return {"ok": False, "running": None, "retrying": None, "hookFailed": False, "shipping": False}
    counts = payload.get("counts") if isinstance(payload, dict) and isinstance(payload.get("counts"), dict) else {}
    running, retrying = counts.get("running"), counts.get("retrying")
    blob = json.dumps(payload)
    return {
        "ok": True,
        "running": running if isinstance(running, int) else None,
        "retrying": retrying if isinstance(retrying, int) else None,
        "hookFailed": "workspace_hook_failed" in blob,
        "shipping": any(token in blob for token in ('"html_url"', '"pr_url"', "pull/")),
    }
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
    if symphony.get("ok") and symphony.get("hookFailed"):
        return "workspace_hook_failed — patch after_create (HTTPS only, no mix)"
    if symphony.get("ok") and symphony.get("retrying"):
        return f"Symphony retrying {symphony['retrying']}"
    if not symphony.get("ok"):
        return "official Symphony :4043 unreachable"
    return "keep shipping receipted work"
def _money(value: float | None) -> str:
    if value is None:
        return UNMEASURED
    sign = "-" if value < 0 else ""
    return f"{sign}${abs(value):,.0f}"
def _pct(value: float | None) -> str:
    return UNMEASURED if value is None else f"{value * 100:.1f}%"
def _count(value: int | None) -> str:
    return UNMEASURED if value is None else str(value)
def render_tile(title: str, headline: str, detail: str, values: list[float] | None) -> list[str]:
    spark = sparkline(values) if values is not None else UNMEASURED
    lines = [f"┌ {title}", f"│ {headline}", f"│ {detail}", f"│ {spark}"]
    if values is not None:
        lines.extend(f"│ {row}" for row in vertical_bars(values))
    else:
        lines.append("│")
    lines.append("└")
    return lines
def compose_tiles(tiles: list[list[str]]) -> list[str]:
    height = max(len(tile) for tile in tiles)
    padded: list[list[str]] = []
    for tile in tiles:
        extra = height - len(tile)
        if extra:
            padded.append([*tile[:-1], *["│"] * extra, tile[-1]])
        else:
            padded.append(tile)
    return ["  ".join(tile[index] for tile in padded) for index in range(height)]
def render(*, measured: dict[str, Any], symphony: dict[str, Any], now: datetime | None = None) -> str:
    alive = compute_alive(measured.get("alive"))
    wow = compute_wow(measured.get("wow"))
    ships = count_ships_this_week(measured.get("ships"), now=now)
    named = bottleneck(alive, wow, ships, symphony)
    tiles = compose_tiles(
        [
            render_tile(
                "ALIVE",
                alive["status"],
                f"cash {_money(alive['cashUsd'])}  burn {_money(alive['weeklyBurnUsd'])}  rev {_money(alive['weeklyRevenueUsd'])}  p0 {_money(alive['profitBeforeZeroUsd'])}",
                series_values(measured, "alive"),
            ),
            render_tile(
                "WOW",
                UNKNOWN if wow["rate"] is None else _pct(wow["rate"]),
                f"{wow['basis']}  this {_money(wow['thisWeekRevenueUsd'])} / last {_money(wow['lastWeekRevenueUsd'])}",
                series_values(measured, "wow"),
            ),
            render_tile("SHIPS", str(ships["thisWeek"]), "receipted this week", series_values(measured, "ships")),
            render_tile(
                "#1",
                named,
                f"symphony :4043  run {_count(symphony.get('running'))}  retry {_count(symphony.get('retrying'))}",
                None,
            ),
        ]
    )
    clock = (now or _now()).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return "\n".join(["GEM CHECK-IN", clock, "official burrito 127.0.0.1:4043", "", *tiles]) + "\n"
def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Gem check-in glass HUD")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--measured", default=os.environ.get("HUD_MEASURED_PATH", str(DEFAULT_MEASURED)))
    parser.add_argument("--symphony-url", default=DEFAULT_SYMPHONY)
    parser.add_argument("--interval", type=float, default=5.0)
    return parser.parse_args(argv)
def frame(*, measured_path: Path, symphony_url: str) -> str:
    return render(measured=load_measured(measured_path), symphony=fetch_symphony(symphony_url))
def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    path = Path(args.measured)
    if args.once:
        sys.stdout.write(frame(measured_path=path, symphony_url=args.symphony_url))
        return 0
    while True:
        sys.stdout.write("\033[2J\033[H")
        sys.stdout.write(frame(measured_path=path, symphony_url=args.symphony_url))
        sys.stdout.flush()
        time.sleep(max(0.5, args.interval))
if __name__ == "__main__":
    raise SystemExit(main())
