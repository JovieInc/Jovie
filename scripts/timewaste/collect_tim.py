"""Collectors for Tim's own time. Every event: {ts, source, category, minutes, measured, heuristic, ref}.

No message text leaves this module: bodies are classified in memory and dropped.
"""
from __future__ import annotations

# api-budget: github-user-core 16/hr - weekly collect at <=1/hr; user lookup plus three event pages, four client attempts each
# api-budget: linear-requests 8/hr - weekly collect at <=1/hr; one query with four client attempts and one auth refresh

import glob
import json
import os
import re
import sqlite3
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from .taxonomy import classify, heuristic_minutes, minutes_for

SCRIPTS = str(Path(__file__).resolve().parents[1])
# Entries that are harness plumbing, not Tim typing.
NOT_TIM = re.compile(r"^\s*<(task-notification|system-reminder|command-|local-command|bash-|user-prompt-submit-hook)|^\s*\[request interrupted|^\s*caveat:", re.I)


def _ts(value) -> float | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _text(message) -> str:
    content = (message or {}).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text")
    return ""


def _event(ts, source, category, chars=0, gap=None, ref=None) -> dict:
    minutes, measured = minutes_for(category, chars, gap)
    return {"ts": ts, "source": source, "category": category, "minutes": minutes, "measured": measured,
            "heuristic": heuristic_minutes(category, chars), "ref": ref}


def collect_transcripts(since: float, projects_dir: Path | None = None) -> tuple[list[dict], dict]:
    """Tim's typed prompts from Claude Code transcripts (entrypoint cli, not meta/sidechain/plumbing).

    Also counts coordinator wake-ups: task notifications the session received, and how many were
    answered with a text-only reply under 200 chars and no tool use (a no-op wake)."""
    projects_dir = projects_dir or Path.home() / ".claude/projects"
    events, wake = [], {"notifications": 0, "noOpWakes": 0}
    for path in glob.glob(str(projects_dir / "*" / "*.jsonl")):
        try:
            if os.path.getmtime(path) < since:
                continue
        except OSError:
            continue
        prev_ts, pending_wake = None, False
        try:
            lines = Path(path).read_text(errors="ignore").splitlines()
        except OSError:
            continue
        for line in lines:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            ts, kind = _ts(d.get("timestamp")), d.get("type")
            if ts is None:
                continue
            if kind == "user" and not d.get("isSidechain"):
                text = _text(d.get("message")).strip()
                if text and re.match(r"^\s*<task-notification", text) and ts >= since:
                    wake["notifications"] += 1
                    pending_wake = True
                    prev_ts = ts
                    continue
                is_tool_result = isinstance(d.get("message", {}).get("content"), list) and any(
                    isinstance(p, dict) and p.get("type") == "tool_result" for p in d["message"]["content"])
                if is_tool_result:
                    prev_ts = ts
                    continue
                if (ts >= since and text and not d.get("isMeta") and d.get("entrypoint") == "cli"
                        and not NOT_TIM.match(text)):
                    gap = (ts - prev_ts) / 60 if prev_ts else None
                    events.append(_event(ts, "claude-session", classify(text), len(text), gap))
                prev_ts = ts
            elif kind == "assistant":
                content = (d.get("message") or {}).get("content")
                if pending_wake and ts >= since:
                    uses_tool = isinstance(content, list) and any(
                        isinstance(p, dict) and p.get("type") == "tool_use" for p in content)
                    if not uses_tool and len(_text(d.get("message"))) < 200:
                        wake["noOpWakes"] += 1
                    pending_wake = False
                prev_ts = ts
    return events, wake


def _attributed_text(blob) -> str:
    """Best-effort text from a message.attributedBody blob (macOS stores it there when text is NULL)."""
    if not blob:
        return ""
    data = bytes(blob)
    i = data.find(b"NSString")
    if i < 0:
        return ""
    chunk = data[i + 8:i + 8 + 4096]
    m = re.search(rb"\x01\+(.)", chunk, re.S)
    if not m:
        return ""
    length, start = chunk[m.start() + 2], m.end()
    if length == 0x81:
        length, start = int.from_bytes(chunk[start:start + 2], "little"), start + 2
    return chunk[start:start + length].decode("utf-8", "ignore")


def detect_summer_chats(con, since: float) -> list[int]:
    """Chats where >= 15% of the week's messages (min 25) mention Summer. Content is inspected in memory only;
    the chosen chat ids are kept in the private store config so detection runs once."""
    apple_since = int((since - 978307200) * 1e9)
    found = []
    candidates = [r[0] for r in con.execute(
        "select j.chat_id from chat_message_join j join message m on m.ROWID=j.message_id where m.date >= ? "
        "group by j.chat_id having count(*) >= 25", (apple_since,))]
    for cid in candidates:
        rows = con.execute("select m.text, m.attributedBody from message m join chat_message_join j on "
                           "j.message_id=m.ROWID where j.chat_id=? and m.date >= ?", (cid, apple_since)).fetchall()
        hits = sum(1 for t, blob in rows if re.search("summer", t or _attributed_text(blob), re.I))
        if rows and hits / len(rows) >= 0.15:
            found.append(cid)
    return found


def collect_imessage(since: float, chats: list[int] | None = None, db: Path | None = None) -> tuple[list[dict], dict]:
    """Tim's replies in the Summer threads: counts and categories only.

    Summer's asks (messages from Summer containing '?') and Tim's replies are counted; reply latency is the
    measured gap from Summer's last message. Needs Full Disk Access; unavailable is reported, never zero."""
    db = db or Path.home() / "Library/Messages/chat.db"
    stats = {"available": False, "asks": 0, "replies": 0, "corrections": 0, "unansweredAsks": 0}
    try:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        chats = chats or detect_summer_chats(con, since)
        if not chats:
            return [], {**stats, "reason": "no-matching-chat"}
        marks = ",".join("?" * len(chats))
        apple_since = int((since - 978307200) * 1e9)
        rows = con.execute(
            f"select j.chat_id, m.date, m.is_from_me, m.text, m.attributedBody from message m join chat_message_join j "
            f"on j.message_id=m.ROWID where j.chat_id in ({marks}) and m.date >= ? order by j.chat_id, m.date",
            (*chats, apple_since - 36 * 3600 * int(1e9))).fetchall()
    except (sqlite3.Error, OSError) as error:
        return [], {**stats, "reason": f"{type(error).__name__}"}
    stats["available"] = True
    # Which side is Tim? Summer's briefs are long and structured, Tim's replies short. Per chat, Tim is the side
    # with the lower median length, only when the other side is at least 1.5x longer and Tim's median <= 800
    # chars; otherwise the chat is ambiguous (agent-to-agent or both sides machine-written) and is skipped.
    by_chat: dict[int, list] = {}
    for row in rows:
        by_chat.setdefault(row[0], []).append(row)
    events, tim_chats, ambiguous = [], 0, 0
    for chat_id, msgs in by_chat.items():
        bodies = [(date / 1e9 + 978307200, int(mine), text or _attributed_text(blob)) for _, date, mine, text, blob in msgs]
        med = {side: statistics.median([len(b) for _, m, b in bodies if m == side] or [0]) for side in (0, 1)}
        tim_side = 1 if med[1] < med[0] else 0
        if not (med[1 - tim_side] >= 1.5 * max(med[tim_side], 1) and med[tim_side] <= 800):
            ambiguous += 1
            continue
        tim_chats += 1
        last_ask = None
        for ts, side, body in bodies:
            if side != tim_side:
                if "?" in body:
                    if ts >= since:
                        stats["asks"] += 1
                    last_ask = ts
                continue
            if ts < since:
                continue
            category = classify(body) if body else "unclassified"
            gap = (ts - last_ask) / 60 if last_ask else None
            if last_ask is not None:
                stats["replies"] += 1
            if category == "correction":
                stats["corrections"] += 1
            events.append(_event(ts, "imessage-summer", category, len(body), gap))
            last_ask = None
        if last_ask is not None and last_ask >= since:
            stats["unansweredAsks"] += 1
    stats["chats"], stats["ambiguousChats"] = tim_chats, ambiguous
    return events, stats


def _gh(args: list[str]) -> dict | list | None:
    if SCRIPTS not in sys.path:
        sys.path.insert(0, SCRIPTS)
    from apiclient.gh import run_gh
    done = run_gh(list(args), priority="report")
    if done["code"] != 0:
        return None
    try:
        return json.loads(done["stdout"])
    except ValueError:
        return None


AUTOMATION_GAP_S = 10  # events closer than this to the previous one are token-driven bursts, not Tim


def collect_github(since: float, login: str | None = None, fetch=_gh) -> tuple[list[dict], dict]:
    """Reviews, merges, label changes and comments under Tim's token, via the public events feed.

    Agents can act under the same token, so events within AUTOMATION_GAP_S of the previous one are dropped as
    bursts. Comment bodies are classified in memory and dropped."""
    login = login or (fetch(["api", "user"]) or {}).get("login")
    if not login:
        return [], {"available": False, "reason": "no-login"}
    pages = []
    for page in (1, 2, 3):
        rows = fetch(["api", f"users/{login}/events?per_page=100&page={page}"])
        if not isinstance(rows, list):
            break
        pages.extend(rows)
        if len(rows) < 100:
            break
    pages.sort(key=lambda e: e.get("created_at", ""))
    events, dropped, prev = [], 0, None
    for e in pages:
        ts = _ts(e.get("created_at"))
        if ts is None:
            continue
        gap = (ts - prev) if prev else None
        prev = ts
        if ts < since:
            continue
        if gap is not None and gap < AUTOMATION_GAP_S:
            dropped += 1
            continue
        p, kind = e.get("payload") or {}, e.get("type")
        ref = (e.get("repo") or {}).get("name")
        if kind == "PullRequestReviewEvent":
            events.append(_event(ts, "github", "github_review", ref=ref))
        elif kind == "PullRequestEvent" and (p.get("pull_request") or {}).get("merged"):
            events.append(_event(ts, "github", "github_merge", ref=ref))
        elif kind in ("PullRequestEvent", "IssuesEvent") and p.get("action") in ("labeled", "unlabeled"):
            events.append(_event(ts, "github", "github_label", ref=ref))
        elif kind in ("IssueCommentEvent", "PullRequestReviewCommentEvent"):
            body = (p.get("comment") or {}).get("body") or ""
            events.append(_event(ts, "github", classify(body), len(body), ref=ref))
    return events, {"available": True, "login": login, "feedEvents": len(pages), "burstsDropped": dropped}


ISOLATED_S = 600
LINEAR_QUERY = """query($since: DateTimeOrDuration!) { viewer { id
  createdIssues(first: 100, filter: {updatedAt: {gte: $since}}) { nodes { createdAt } }
  assignedIssues(first: 100, filter: {updatedAt: {gte: $since}}) { nodes { completedAt } } } }"""


def collect_linear(since: float, graphql=None) -> tuple[list[dict], dict]:
    """Issues Tim created (new direction) and completed (triage). Needs LINEAR_API_KEY; unavailable is not zero."""
    if graphql is None:
        key = os.environ.get("LINEAR_API_KEY")
        if not key:
            return [], {"available": False, "reason": "no-credential"}
        if SCRIPTS not in sys.path:
            sys.path.insert(0, SCRIPTS)
        from apiclient.linear import LinearClient
        graphql = LinearClient(key, lambda rejected=None: key).graphql
    try:
        iso = datetime.fromtimestamp(since, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        data = graphql(LINEAR_QUERY, {"since": iso})
    except Exception as error:  # an outage is a source gap, never a zero
        return [], {"available": False, "reason": type(error).__name__}
    viewer = (data.get("viewer") if isinstance(data, dict) else None) or {}
    events = []
    # Agents create issues under Tim's token in batches (2026-10-29: ~250 in 7 days, 3-6 per minute). Only an
    # isolated creation (no other creation within ISOLATED_S either side) is treated as Tim typing it.
    created = sorted(t for n in (viewer.get("createdIssues") or {}).get("nodes", [])
                     if (t := _ts(n.get("createdAt"))) and t >= since)
    for i, ts in enumerate(created):
        near = ((i > 0 and ts - created[i - 1] < ISOLATED_S) or (i + 1 < len(created) and created[i + 1] - ts < ISOLATED_S))
        if not near:
            events.append(_event(ts, "linear", "new_direction", 200))
    for n in (viewer.get("assignedIssues") or {}).get("nodes", []):
        ts = _ts(n.get("completedAt"))
        if ts and ts >= since:
            events.append(_event(ts, "linear", "linear_triage"))
    return events, {"available": True}


def collect_cards(since: float, cards: list[dict] | None = None) -> tuple[list[dict], dict]:
    """Ovie decision cards Tim resolved. `cards` is Summer's GET /api/internal/ovie/summer-cards payload (or a
    file at OVIE_CARDS_EXPORT). Time-to-decide is measured; default-on-expiry resolutions cost Tim nothing."""
    if cards is None:
        path = os.environ.get("OVIE_CARDS_EXPORT")
        if not path:
            return [], {"available": False, "reason": "no-export"}
        try:
            raw = json.loads(Path(path).read_text())
            cards = raw.get("cards", raw) if isinstance(raw, dict) else raw
        except (OSError, ValueError):
            return [], {"available": False, "reason": "unreadable-export"}
    kind_map = {"taste": "taste_call", "outbound": "outbound", "spend": "spend_legal", "decision": "new_direction"}
    events, ttd, defaulted = [], [], 0
    for c in cards:
        decided, created = _ts(c.get("decidedAt")), _ts(c.get("createdAt"))
        if not decided or decided < since or c.get("status") == "pending":
            continue
        if c.get("resolution") == "default":
            defaulted += 1
            continue
        if created:
            ttd.append((decided - created) / 3600)
        events.append(_event(decided, "ovie-card", kind_map.get(c.get("kind"), "approval"), 150))
    return events, {"available": True, "resolvedByTim": len(events), "defaulted": defaulted,
                    "timeToDecideHoursP50": round(statistics.median(ttd), 1) if ttd else None}
