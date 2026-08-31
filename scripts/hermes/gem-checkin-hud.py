#!/usr/bin/env python3
"""Gem tty1 Buildkite-list HUD. Night-dj: blue / hot pink / purple. Dark only."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

BLUE, PINK, PURPLE = (75, 145, 255), (255, 72, 210), (168, 85, 247)
DIM, FG = (138, 138, 148), (236, 236, 240)
BG = (10, 10, 10)
LIVE_SLUG = "symphony-ui-pilot-96d6b9c5b2d5"
DEFAULT_SYMPHONY = os.environ.get("SYMPHONY_STATE_URL", "http://127.0.0.1:4043/api/v1/state")
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


def _text(record: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, (int, float)) and value == value:
            return str(int(value)) if float(value).is_integer() else str(value)
    return None


def elapsed_label(started: Any, *, now: datetime | None = None) -> str:
    stamp = _iso(started) if not isinstance(started, datetime) else started
    if stamp is None:
        return "-"
    seconds = max(0, int(((now or _now()) - stamp).total_seconds()))
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    return f"{seconds // 3600}h"


def dash(value: Any) -> str:
    if value is None or value == "":
        return "-"
    return str(value)


def fetch_symphony(url: str, *, timeout: float = 1.5) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError):
        return {"ok": False, "count": None, "cap": None, "rows": []}
    if not isinstance(payload, dict):
        return {"ok": False, "count": None, "cap": None, "rows": []}
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    raw = payload.get("jobs") or payload.get("running") or payload.get("items") or []
    if isinstance(raw, dict):
        raw = list(raw.values())
    rows: list[dict[str, Any]] = []
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            issue = item.get("issue") if isinstance(item.get("issue"), dict) else {}
            running = item.get("running") if isinstance(item.get("running"), dict) else {}
            status = str(item.get("status") or item.get("state") or "").lower()
            if status in {"queued", "blocked", "done", "canceled", "cancelled"}:
                continue
            ident = _text(item, ("identifier", "id")) or _text(issue, ("identifier", "id"))
            title = _text(item, ("title", "name")) or _text(issue, ("title", "name"))
            started = item.get("started_at") or item.get("startedAt") or running.get("started_at") or running.get("startedAt")
            owner = _text(item, ("owner", "agent", "account")) or _text(running, ("owner", "agent"))
            if ident or title:
                rows.append({"id": ident, "title": title, "started": started, "owner": owner})
    run, retry = counts.get("running"), counts.get("retrying")
    if isinstance(run, int) or isinstance(retry, int):
        count = (run if isinstance(run, int) else 0) + (retry if isinstance(retry, int) else 0)
    else:
        count = len(rows) if rows else None
    cap = counts.get("max_concurrent") or counts.get("capacity") or payload.get("max_concurrent_agents")
    cap = cap if isinstance(cap, int) and cap > 0 else None
    return {"ok": True, "count": count, "cap": cap, "rows": rows}


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
        title = _text(pr, ("title",))
        rows.append({"number": number if isinstance(number, int) else None, "title": title, "enqueued": node.get("enqueuedAt"), "position": node.get("position")})
    return {"ok": True, "count": len(rows), "rows": rows}


def fetch_review(*, timeout: float = 8.0) -> int | None:
    key = os.environ.get("LINEAR_API_KEY")
    if not key:
        return None
    request = urllib.request.Request(
        LINEAR_API,
        data=json.dumps({"query": LINEAR_QUERY, "variables": {"id": LIVE_SLUG}}).encode(),
        headers={"Authorization": key, "Content-Type": "application/json", "User-Agent": "gem-checkin-hud/2"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
        count = (((payload.get("data") or {}).get("project") or {}).get("issues") or {}).get("totalCount")
        return count if isinstance(count, int) else None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError):
        return None


def _gutter(glyph: str, elapsed: str, color: tuple[int, int, int]) -> tuple[str, str]:
    return _rgb(color, glyph), _rgb(color, f"{elapsed:<3}")


def _row(glyph: str, elapsed: str, color: tuple[int, int, int], title: str, meta: str) -> list[str]:
    g1, g2 = _gutter(glyph, elapsed, color)
    return [f"{g1}  {_rgb(FG, title, bold=True)}", f"{g2}  {_rgb(DIM, meta)}"]


def _pills() -> str:
    running = _rgb(BLUE, "● Running", bold=True)
    review = _rgb(PINK, "○ Review")
    mq = _rgb(PURPLE, "○ MQ")
    return f"{running}   {review}   {mq}"


def _bar(running: int | None, cap: int | None, mq: int | None) -> str:
    parts = [_rgb(BLUE, "JOVIE", bold=True), _rgb(PINK, "main")]
    if running != 0:
        parts.append(_rgb(BLUE, f"RUN {dash(running)}/{dash(cap)}"))
    if mq is None:
        parts.append(_rgb(PURPLE, "MQ -"))
    elif mq > 0:
        parts.append(_rgb(PURPLE, f"MQ {mq}"))
    return f" {_rgb(DIM, '|')} ".join(parts)


def render(
    *,
    symphony: dict[str, Any],
    mq: dict[str, Any],
    review: int | None,
    now: datetime | None = None,
) -> str:
    clock = now or _now()
    running_rows = symphony.get("rows") or []
    mq_rows = mq.get("rows") or []
    cap = symphony.get("cap") if symphony.get("ok") else None
    running_n = symphony.get("count") if symphony.get("ok") else None
    mq_n = mq.get("count") if mq.get("ok") else None
    lines = [_bar(running_n, cap, mq_n), "", _pills(), _rgb(DIM, "─" * 56)]
    for index, row in enumerate(running_rows):
        ident = dash(row.get("id"))
        title = dash(row.get("title"))
        progress = f"{index + 1}/{cap}" if isinstance(cap, int) and cap > 0 else "-"
        meta = " · ".join(("symphony", progress, dash(row.get("owner"))))
        lines.extend(_row("●", elapsed_label(row.get("started"), now=clock), BLUE, f"{ident} {title}", meta))
        lines.append(_rgb(DIM, "─" * 56))
    for row in mq_rows:
        number = row.get("number")
        ident = f"#{number}" if isinstance(number, int) else "-"
        title = dash(row.get("title"))
        pos = dash(row.get("position"))
        meta = " · ".join(("github", "main", f"pos {pos}"))
        lines.extend(_row("○", elapsed_label(row.get("enqueued"), now=clock), PURPLE, f"MQ {ident} {title}", meta))
        lines.append(_rgb(DIM, "─" * 56))
    if review is None:
        lines.append(f"{_rgb(PINK, 'v')}  {_rgb(PINK, 'Review -')}")
    elif review > 0:
        lines.append(f"{_rgb(PINK, 'v')}  {_rgb(PINK, f'Review {review}')}")
    lines.extend(["", _bar(running_n, cap, mq_n)])
    return f"\033[48;2;{BG[0]};{BG[1]};{BG[2]}m" + "\n".join(lines) + "\033[0m\n"


def frame(*, symphony_url: str) -> str:
    return render(symphony=fetch_symphony(symphony_url), mq=fetch_mq(), review=fetch_review())


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Gem tty1 Buildkite-list HUD")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--symphony-url", default=DEFAULT_SYMPHONY)
    parser.add_argument("--interval", type=float, default=5.0)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.once:
        sys.stdout.write(frame(symphony_url=args.symphony_url))
        return 0
    while True:
        sys.stdout.write("\033[2J\033[H")
        sys.stdout.write(frame(symphony_url=args.symphony_url))
        sys.stdout.flush()
        time.sleep(max(0.5, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
