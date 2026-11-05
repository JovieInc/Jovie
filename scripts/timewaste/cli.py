"""python3 -m timewaste <collect|check|propose|evaluate|surface> (run from scripts/, or PYTHONPATH=scripts).

collect   gather Tim events + agent waste for the last N days, write the private store and a snapshot
check     print thresholds crossed (daily; exit 0 always, Summer reads the output)
propose   rank automation proposals from the latest snapshot (--json for Summer to file in Linear)
evaluate  compare shipped proposals' metrics with their baselines and print reopen verdicts
surface   emit the public-safe time-leverage/v1 aggregate and the brief lines (--post sends it to Ovie)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from . import agent_waste, collect_tim, proposals, store, taxonomy

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "time-leverage/v1"


def _iso_week(ts: float) -> str:
    y, w, _ = datetime.fromtimestamp(ts, timezone.utc).isocalendar()
    return f"{y}-W{w:02d}"


def build_snapshot(now: float, days: int, state_dir: Path | None, slo_path: Path | None, tim_only: bool = False,
                   agent_only: bool = False, base: Path | None = None) -> dict:
    since = now - days * 86400
    base = base or store.root()
    sources, events, wake = {}, [], {"notifications": 0, "noOpWakes": 0}
    if not agent_only:
        for name, fn in (("claude-session", lambda: collect_tim.collect_transcripts(since)),
                         ("imessage-summer", lambda: collect_tim.collect_imessage(since)),
                         ("github", lambda: collect_tim.collect_github(since)),
                         ("linear", lambda: collect_tim.collect_linear(since)),
                         ("ovie-card", lambda: collect_tim.collect_cards(since))):
            try:
                got = fn()
            except Exception as error:  # one broken source never blanks the others
                got = ([], {"available": False, "reason": type(error).__name__})
            ev, meta = got
            if name == "claude-session":
                ev, wake = ev, meta
                meta = {"available": True, **wake}
            sources[name] = meta
            store.replace_events(name, ev, base)
            events += ev
    else:
        events = store.load_events(base, since)
    events = taxonomy.trim_overlap(events)
    tim = taxonomy.summarize(events)
    tim["calibration"] = taxonomy.calibration(events)
    prev = store.read_json(base / "snapshots" / "latest.json", {})
    agent = prev.get("agent") if tim_only and prev else agent_waste.collect(since, state_dir, wake, slo_path)
    return {"schema": "timewaste-snapshot/v1", "observedAt": now, "windowDays": days, "week": _iso_week(now),
            "tim": tim, "agent": agent or {}, "sources": sources}


def save(snap: dict, base: Path | None = None) -> None:
    base = base or store.root()
    (base / "snapshots").mkdir(exist_ok=True, mode=0o700)
    store.write_json(base / "snapshots" / "latest.json", snap)
    store.write_json(base / "snapshots" / f"{snap['week']}.json", snap)


def surface(snap: dict, ranked: list[dict]) -> dict:
    """Public-safe aggregate: categories, minutes, counts, proposal titles. No message content, no ids of people."""
    tim = snap["tim"]
    return {"schema": SCHEMA, "observedAt": datetime.fromtimestamp(snap["observedAt"], timezone.utc).isoformat().replace("+00:00", "Z"),
            "windowDays": snap["windowDays"],
            "tim": {"totalMinutes": tim["totalMinutes"], "humanOnlyMinutes": tim["humanOnlyMinutes"],
                    "humanOnlyPct": tim["humanOnlyPct"],
                    "categories": [{"id": c["id"], "label": c["label"], "class": c["class"], "minutes": c["minutes"]}
                                   for c in tim["categories"][:8]]},
            "agent": {"wastedAgentHours": snap["agent"].get("wastedAgentHours"),
                      "ciReworkRounds": (snap["agent"].get("ci") or {}).get("reworkRounds"),
                      "noOpWakes": (snap["agent"].get("wakes") or {}).get("noOpWakes")},
            "proposals": [{"id": p["id"], "title": p["title"], "estimate": p["estimate"], "owner": p["owner"],
                           "score": p["score"]} for p in ranked[:3]]}


def brief_lines(agg: dict) -> list[str]:
    t, pct = agg["tim"], agg["tim"]["humanOnlyPct"]
    leak = next((c for c in t["categories"] if c["class"] == "automatable"), None)
    lines = [f"Tim time ({agg['windowDays']}d): {t['totalMinutes'] / 60:.1f}h tracked, "
             f"{'n/a' if pct is None else f'{pct:.0f}%'} human-only high-value."]
    if leak:
        lines.append(f"Biggest leak: {leak['label'].lower()}, {leak['minutes']:.0f} min.")
    if agg["agent"].get("wastedAgentHours") is not None:
        lines.append(f"Agent waste: {agg['agent']['wastedAgentHours']:.0f} agent-hours.")
    for i, p in enumerate(agg["proposals"], 1):
        lines.append(f"{i}. {p['title']} (saves {p['estimate']}, {p['owner']})")
    return lines


def _load(base: Path | None = None) -> dict:
    snap = store.read_json((base or store.root()) / "snapshots" / "latest.json")
    if not snap:
        raise SystemExit("no snapshot yet: run `collect` first")
    return snap


def post_ovie(agg: dict) -> str:
    url, secret = os.environ.get("OVIE_TIMELEVERAGE_URL"), os.environ.get("CRON_SECRET")
    if not (url and secret):
        return "skipped: OVIE_TIMELEVERAGE_URL / CRON_SECRET not set"
    req = urllib.request.Request(url, data=json.dumps(agg).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {secret}"})
    with urllib.request.urlopen(req, timeout=15) as res:
        return f"posted: {res.status}"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="timewaste")
    ap.add_argument("cmd", choices=["collect", "check", "propose", "evaluate", "surface"])
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--state-dir", type=Path, default=None, help="lanes state dir (Gem: ~/.local/state/jovie-lanes)")
    ap.add_argument("--slo", type=Path, default=REPO_ROOT / "docs/metrics/shipping-slo-latest.json")
    ap.add_argument("--tim-only", action="store_true")
    ap.add_argument("--agent-only", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--top", type=int, default=5)
    ap.add_argument("--post", action="store_true")
    args = ap.parse_args(argv)
    now = time.time()
    if args.cmd == "collect":
        snap = build_snapshot(now, args.days, args.state_dir, args.slo, args.tim_only, args.agent_only)
        save(snap)
        agg = surface(snap, proposals.rank(snap))
        print(json.dumps(agg, indent=1) if args.json else "\n".join(brief_lines(agg)))
        return 0
    snap = _load()
    if args.cmd == "check":
        hits = proposals.crossed(snap)
        print(json.dumps(hits) if args.json else "\n".join(f"{h['id']}: {h['why']} ({h['value']})" for h in hits) or "no thresholds crossed")
    elif args.cmd == "propose":
        ranked = proposals.rank(snap, args.top)
        print(json.dumps(ranked, indent=1) if args.json else "\n".join(
            f"{i}. [{p['score']}] {p['title']} | {p['evidence']} | saves {p['estimate']} | conf {p['confidence']} | cost {p['buildCostHours']}h | {p['owner']}"
            for i, p in enumerate(ranked, 1)))
    elif args.cmd == "evaluate":
        state = store.read_json(store.root() / "proposals-state.json", {})
        print(json.dumps(proposals.evaluate(state, snap, now), indent=1))
    else:
        agg = surface(snap, proposals.rank(snap))
        print(json.dumps(agg, indent=1) if args.json else "\n".join(brief_lines(agg)))
        if args.post:
            print(post_ovie(agg))
    return 0
