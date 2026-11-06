#!/usr/bin/env python3
"""Predictive capacity loop: collect, forecast time-to-limit, alarm before the limit.

Reads ops/registry/capacity-resources.json (every resource that can stop shipping: metric, hard
limit, what happens at the limit, lead time to fix). Subcommands:

  collect   sample this host's resources (disk, inodes) and service APIs (gh rate, Doppler cap,
            spend registry) into samples.jsonl, then evaluate and alarm. Cheap; run from a timer.
  report    print the forecast table (today, limit, days to limit, lead time, status).
  --remote  also read another host's samples over ssh (read-only), e.g. --remote gem.

Time-to-limit comes from a least-squares fit of the last 7 days of samples. An alarm fires when
time-to-limit is shorter than the resource's lead time to fix (minutes for a cleanup, days for
hardware, hours for cloud containers, same day for a budget). Alarms are change-only events on the
host-alarms feed plus an escalation card (recommendation, default, deadline). Nothing is bought:
cards are decisions for Tim. Auto-remediation runs only allowlisted registry commands, only with
--remediate, only on the resource's own host. No secrets are printed (Doppler: names only, plus
named token lookups read in memory, never logged).
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

from collectors import (COLLECTOR_ERRORS, COLLECTORS, REPO, _resend_count, _resend_reset_at,
                        _seconds, access_signature, c_access_gaps, c_deadline, c_stuck_procs,
                        iso, parse_iso, run, state_dir)

REGISTRY = REPO / "ops/registry/capacity-resources.json"
WINDOW_S = 7 * 86400
BAD = ("ALARM", "AT-LIMIT", "BLIND", "STALE")
MIN_SPAN_S = 6 * 3600
HEADROOM_WARN = 0.85
INF = float("inf")


def alarm_feed() -> Path:
    return Path(os.environ.get("LANES_STATE") or Path.home() / ".local/state/jovie-lanes") / "host-alarms.jsonl"


# ---- store and forecast ----

def load_samples(path: Path, since: float) -> list[dict]:
    rows = []
    try:
        for line in path.read_text().splitlines():
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if row.get("t", 0) >= since:
                rows.append(row)
    except OSError:
        pass
    return rows


def slope_per_hour(points: list[tuple[float, float]]) -> float | None:
    """Least-squares growth of `value` per hour; None until the span is long enough to trust."""
    if len(points) < 3 or points[-1][0] - points[0][0] < MIN_SPAN_S:
        return None
    n = len(points)
    mt = sum(t for t, _ in points) / n
    mv = sum(v for _, v in points) / n
    den = sum((t - mt) ** 2 for t, _ in points)
    return (sum((t - mt) * (v - mv) for t, v in points) / den) * 3600 if den else None


def evaluate(res: dict, reading: dict | None, history: list[tuple[float, float]], now: float,
             blind: bool = False) -> dict:
    """`blind`: this host owns a wired collector and it returned nothing. That is an alarm (BLIND), not a
    quiet GAP: a broken collector hid the 100/100 secret cap and stale spend for days (2026-10-31)."""
    row = {"id": res["id"], "group": res["group"], "label": res["label"], "unit": res.get("unit", ""),
           "leadTimeHours": res["leadTimeHours"], "atLimit": res["atLimit"]["effect"]}
    if reading is not None and res["collector"]["type"] == "resend":
        if not _resend_count(reading.get("value")) or not _resend_count(reading.get("limit")) \
                or reading["limit"] == 0 or reading["limit"] != res["collector"].get("limit") \
                or _resend_reset_at(reading.get("resetsAt"), now) is None:
            reading = None
    if reading is None and blind:
        return {**row, "status": "BLIND", "why": f"{res['collector']['type']} collector returned no reading"}
    if reading is None:
        return {**row, "status": "GAP", "why": "no collector reading" if res["collector"]["type"] != "none"
                else res["collector"].get("note", "collector not wired")}
    if reading.get("detail"):
        row["detail"] = reading["detail"]
    if res["collector"]["type"] == "access-gaps" and "activeGapKeys" in reading:
        row["activeGapKeys"] = reading["activeGapKeys"]
    value, limit = reading["value"], reading["limit"]
    burn = reading.get("burnPerHour")
    if burn is None and res.get("mode", "trend") == "trend":
        burn = slope_per_hour(history + [(now, value)])
    ttl = INF if not burn or burn <= 0 else max(0.0, (limit - value) / burn)
    frac = value / limit if limit else 0.0
    row.update(value=value, limit=limit, frac=round(frac, 3), burnPerHour=burn, ttlHours=ttl, observedAt=reading.get("observedAt"))
    if res["collector"]["type"] == "resend":
        row["resetsAt"] = reading["resetsAt"]
    max_age = res.get("maxAgeDays")
    stale = bool(reading.get("observedAt") and max_age and (now - parse_iso(reading["observedAt"])) > max_age * 86400)
    projected = reading.get("burnPerHour") is not None and reading.get("observedAt")
    if stale and projected:
        # A limit "reached" by projecting an old snapshot is a refresh task for an agent, never a spend ask:
        # the 10-25 Gateway snapshot projected AT-LIMIT and asked Tim to top up (2026-10-31).
        row.update(status="STALE", why=f"projection from a reading older than {max_age}d says {frac:.0%} of limit; "
                                         "refresh the reading before acting")
    elif frac >= 1:
        row.update(status="AT-LIMIT", why="limit reached")
    elif ttl < res["leadTimeHours"]:
        row.update(status="ALARM", why=f"{ttl / 24:.1f}d to limit < {res['leadTimeHours'] / 24:.1f}d lead time")
    elif frac >= res.get("warnFrac", HEADROOM_WARN):
        row.update(status="ALARM", why=f"{frac:.0%} of limit (headroom floor {res.get('warnFrac', HEADROOM_WARN):.0%})")
    elif stale:
        row.update(status="STALE", why=f"reading older than {max_age}d")
    else:
        row.update(status="OK", why="" if burn is not None else "no trend yet")
    return row


def apply_collector_error(row: dict, res: dict) -> dict:
    """Surface a recorded collector failure reason into a GAP row's why (no-op when it read fine)."""
    if "value" not in row:
        reason = COLLECTOR_ERRORS.get(f"{res['collector']['type']}:{res['collector'].get('metric', '')}")
        if reason:
            row["why"] = reason
    return row


def card(res: dict, row: dict, now: float) -> dict:
    esc = res.get("fix", {}).get("escalate") or {}
    ttl = row.get("ttlHours", INF)
    when = "is at the limit" if row["status"] == "AT-LIMIT" else (
        f"hits the limit in {ttl / 24:.1f} days at this rate" if ttl != INF else row["why"])
    opts = "; ".join(f"{o['label']} ({o['cost']}, lead {o['lead']})" for o in esc.get("options", [])) or "no purchase option; fix in config"
    default = esc.get("default", "auto-remediate and re-check")
    if row["status"] == "BLIND":
        when, opts, default = "collector is blind", "none: repair the collector (credential, CLI or API path)", \
            "owning agent repairs the collector; no spend"
    elif row["status"] == "STALE":
        when, opts, default = "reading is stale", "none: refresh the snapshot", "owning agent refreshes the reading; no spend"
    detail = f" Detail: {row['detail']}." if row.get("detail") else ""
    return {"kind": "capacity-escalation", "id": res["id"], "at": iso(now), "status": row["status"],
            "title": f"{res['label']}: {when}",
            "body": f"{row['why']}. At the limit: {res['atLimit']['effect']} ({res['atLimit']['note']}). Options: {opts}.{detail}",
            "default": default,
            "deadlineAt": iso(now + esc.get("deadlineHours", 24) * 3600),
            "channels": ["summer", "ovie-card", "imessage", "email"], "neverBuy": True}


def publish(rows: list[dict], registry: dict, now: float, state: Path, feed: Path) -> list[dict]:
    """Change-only alarms to the host-alarms feed and escalation cards; returns new cards."""
    prior_path = state / "alarm-status.json"
    try:
        prior = json.loads(prior_path.read_text())
    except (OSError, ValueError):
        prior = {}
    by_id = {r["id"]: r for r in registry["resources"]}
    cards, current = [], {}
    for row in rows:
        bad = row["status"] in BAD
        current[row["id"]] = row["status"]
        if bad and prior.get(row["id"]) != row["status"]:
            cards.append(card(by_id.get(row["id"]) or row["res"], row, now))
        elif row["status"] == "OK" and prior.get(row["id"]) in BAD:
            cards.append({"kind": "capacity-clear", "id": row["id"], "at": iso(now), "clear": True})
    # Dynamic denial rows can disappear instead of becoming OK. Only a successful,
    # complete parent scan proves recovery; BLIND/missing/legacy evidence and the
    # maxCards display cap must preserve the outstanding alarm for a later scan.
    parents = {r["id"]: r for r in rows}
    for res in registry["resources"]:
        if res["collector"]["type"] != "access-gaps":
            continue
        parent = parents.get(res["id"], {})
        active = parent.get("activeGapKeys")
        complete = (parent.get("status") in ("OK", "ALARM", "AT-LIMIT")
                    and isinstance(active, list) and all(isinstance(key, str) for key in active))
        prefix = res["id"] + ":"
        for ident, status in prior.items():
            if not ident.startswith(prefix) or ident in current or status not in BAD:
                continue
            if complete and ident[len(prefix):] not in active:
                cards.append({"kind": "capacity-clear", "id": ident, "at": iso(now), "clear": True})
            else:
                current[ident] = status
    state.mkdir(parents=True, exist_ok=True)
    if cards:
        feed.parent.mkdir(parents=True, exist_ok=True)
        with open(feed, "a") as f, open(state / "escalations.jsonl", "a") as e:
            for c in cards:
                f.write(json.dumps({"kind": "capacity-forecast", **c}) + "\n")
                e.write(json.dumps(c) + "\n")
    prior_path.write_text(json.dumps(current))
    return cards


# ---- delivery: a card nobody receives is not an alarm ----
# Until 2026-10-31 cards only went to escalations.jsonl and host-alarms.jsonl, which nothing read: the
# Doppler/GitHub 100/100 cap, both disks and the Gateway balance alarmed for days and no one was told.
# Every card now becomes a Linear Triage issue through the lanes doctor tracker on Gem (deduped by key;
# Summer owns Triage under its 15-minute dwell dead-man). Other hosts hand cards to Gem over ssh. A card
# stays in pending-delivery.jsonl until delivered, so a failed transport retries every tick.

def card_text(c: dict) -> str:
    return (f"{c['title']}\n\n{c['body']}\n\nDefault: {c['default']} (deadline {c['deadlineAt']}).\n"
            f"Source: scripts/capacity/forecast.py on {c.get('host', '?')}; resource `{c['id']}`, "
            f"status {c.get('status', '?')}. Spend options are Tim's call; everything else is the owner's.")


def tracker_transport(cards: list[dict]) -> list[tuple[str | None, str | None]]:
    """Open (or reuse) one Linear Triage issue per card key via the lanes doctor tracker on this host."""
    lanes = Path(os.environ.get("LANES_STATE") or Path.home() / ".local/state/jovie-lanes") / "current"
    sys.path.insert(0, str(lanes))
    try:
        import doctor, lane_runner  # noqa: E401  (installed lanes release, Gem only)
        tracker = doctor.Tracker(lane_runner.Linear(lane_runner.Host().linear_env), lane_runner.HOST)
    except Exception as e:  # noqa: BLE001
        return [(None, f"tracker-unavailable:{type(e).__name__}")] * len(cards)
    out = []
    for c in cards:
        try:
            if c.get("clear"):  # the condition cleared: close its issue so Triage reflects reality
                tracker.existing_error = None
                found = tracker.existing(f"capacity:{c['id']}")
                if tracker.existing_error:
                    out.append((None, "tracker-lookup-failed"))
                    continue
                ok = tracker.close(found, f"capacity:{c['id']}") if found else True
                out.append((found or "none-open", None) if ok else (None, "tracker-close-failed"))
                continue
            issue = tracker.open(f"capacity:{c['id']}", card_text(c))
            out.append((issue, None if issue else f"tracker-open:{tracker.last_error}"))
        except Exception as e:  # noqa: BLE001
            out.append((None, f"tracker-open:{type(e).__name__}"))
    return out


def ssh_transport(cards: list[dict], host: str) -> list[tuple[str | None, str | None]]:
    """Hand cards to the delivery host's `forecast.py deliver` (stdin JSON lines, stdout results)."""
    try:
        out = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host,
                              "python3 ~/.local/share/capacity/scripts/capacity/forecast.py deliver"],
                             input="".join(json.dumps(c) + "\n" for c in cards), capture_output=True, text=True,
                             timeout=120)
        results = [json.loads(line) for line in out.stdout.splitlines() if line.startswith("{")]
    except (OSError, subprocess.TimeoutExpired, ValueError) as e:
        return [(None, f"ssh:{type(e).__name__}")] * len(cards)
    if len(results) != len(cards):
        return [(None, f"ssh-exit-{out.returncode}")] * len(cards)
    return [(r.get("issue"), r.get("error")) for r in results]


def deliver(cards: list[dict], state: Path, local: str, now: float, transport=None) -> dict:
    """Deliver new cards plus any still pending; returns the delivery block for forecast.json."""
    pending_path, log_path = state / "pending-delivery.jsonl", state / "deliveries.jsonl"
    pending = load_samples(pending_path, 0) if pending_path.exists() else []
    # New observations supersede undelivered actions for the same resource. In
    # particular, a successful clear must never leave an older open queued behind it.
    queue = {c["id"]: c for c in pending + [dict(c, host=c.get("host", local), t=now) for c in cards]}
    todo = list(queue.values())
    if transport is None:
        target = os.environ.get("CAPACITY_DELIVERY_HOST", "gem")
        transport = tracker_transport if local == target else (lambda cs: ssh_transport(cs, target))
    results = transport(todo) if todo else []
    left, last_error, delivered = [], None, 0
    with open(log_path, "a") as log:
        for c, (issue, error) in zip(todo, results):
            if issue:
                delivered += 1
                log.write(json.dumps({"at": iso(now), "id": c["id"], "cardAt": c["at"], "issue": issue}) + "\n")
            else:
                left.append(c)
                last_error = error
    pending_path.write_text("".join(json.dumps(c) + "\n" for c in left))
    return {"delivered": delivered, "pending": len(left), "lastError": last_error,
            "oldestPendingAt": min((c["at"] for c in left), default=None)}


def fmt(res_unit: str, v: float) -> str:
    if res_unit == "hours":  # deadlines: hours since the epoch
        return iso(v * 3600)[:13] + "Z"
    if res_unit == "bytes":
        return f"{v / 2**30:.0f}GiB"
    if res_unit == "usd":
        return f"${v:,.0f}"
    return f"{v:,.0f}"


def table(rows: list[dict]) -> str:
    out = [f"{'resource':<34}{'today':>13}{'limit':>13}{'days_to_limit':>14}{'lead_d':>8}  {'status':<9}note"]
    for r in sorted(rows, key=lambda r: (r["status"] not in ("AT-LIMIT", "ALARM"), r["status"] == "OK", r["group"], r["id"])):
        if "value" in r:
            ttl = r["ttlHours"]
            days = "-" if ttl == INF else f"{ttl / 24:.1f}"
            today, lim = fmt(r["unit"], r["value"]), fmt(r["unit"], r["limit"])
        else:
            days = today = lim = "?"
        out.append(f"{r['id']:<34}{today:>13}{lim:>13}{days:>14}{r['leadTimeHours'] / 24:>8.1f}  {r['status']:<9}{r.get('why', '')}")
    return "\n".join(out)


def remote_samples(host: str) -> list[dict]:
    raw = run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host, "cat ~/.local/state/capacity/samples.jsonl"], 20)
    rows = []
    for line in (raw or "").splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            pass
    return rows


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("cmd", choices=["collect", "report", "deliver"])
    ap.add_argument("--host", default=os.environ.get("CAPACITY_HOST") or socket.gethostname().split(".")[0].lower())
    ap.add_argument("--remote", action="append", default=[], help="ssh alias whose samples to merge (report)")
    ap.add_argument("--remediate", action="store_true", help="run allowlisted auto actions for alarmed local resources")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    registry = json.loads(REGISTRY.read_text())
    host_aliases = {h: set(v) for h, v in registry["hostAliases"].items()}
    local = next((h for h, names in host_aliases.items() if args.host in names), args.host)
    now, state = time.time(), state_dir()
    state.mkdir(parents=True, exist_ok=True)
    if args.cmd == "deliver":  # cards handed over by another host's collector (ssh_transport)
        cards = [json.loads(line) for line in sys.stdin if line.strip()]
        for issue, error in tracker_transport(cards):
            print(json.dumps({"issue": issue, "error": error}))
        return 0
    samples_path = state / "samples.jsonl"
    merged = load_samples(samples_path, now - WINDOW_S)
    for remote in args.remote:
        merged += [dict(r, host=r.get("host", remote)) for r in remote_samples(remote)]
    rows, fresh = [], []
    cloud_owner = registry["cloudCollector"]
    for res in registry["resources"]:
        kind = res["collector"]["type"]
        own = res["host"] == local or (res["host"] in ("cloud", "any") and (local == cloud_owner or args.cmd == "report"))
        if args.cmd == "collect" and not own:
            continue
        hist = sorted((r["t"], r["value"]) for r in merged if r.get("id") == res["id"])
        reading = None
        if own and kind in COLLECTORS:
            reading = COLLECTORS[kind](res["collector"], now)
            if reading and args.cmd == "collect" and kind != "manual":
                sample = {"t": now, "id": res["id"], "host": local, "value": reading["value"], "limit": reading["limit"]}
                if kind == "resend":
                    sample["resetsAt"] = reading["resetsAt"]
                fresh.append(sample)
        elif not own and hist:
            last = next(r for r in reversed(merged) if r.get("id") == res["id"])
            reading, hist = {"value": last["value"], "limit": last["limit"]}, hist[:-1]
            if "resetsAt" in last:
                reading["resetsAt"] = last["resetsAt"]
        if kind == "resend" and reading:
            reset = _resend_reset_at(reading.get("resetsAt"), now)
            same_window = {(r["t"], r["value"]) for r in merged if r.get("id") == res["id"]
                           and reset is not None and _resend_reset_at(r.get("resetsAt"), now) == reset}
            hist = [point for point in hist if point in same_window]
        row = evaluate(res, reading, hist, now, blind=own and kind in COLLECTORS and args.cmd == "collect")
        row = apply_collector_error(row, res)
        if reading is None and not own and kind != "none":
            row["why"] = f"no samples from {res['host']} (install collector, then --remote {res['host']})"
        rows.append(row)
        rows += access_gap_rows(res, reading, now)
    delivery = None
    if args.cmd == "collect":
        with open(samples_path, "a") as f:
            for s in fresh:
                f.write(json.dumps(s) + "\n")
        cards = publish(rows, registry, now, state, alarm_feed())
        delivery = deliver(cards, state, local, now)
        if local == cloud_owner and os.environ.get("WASTE_LOOP") != "off":
            try:  # unit-metric waste detectors ride the same pass (ops/registry/waste.json)
                import waste
                waste.run_pass()
            except Exception as error:  # a waste-loop fault never blocks capacity alarms
                print(f"waste-loop: {type(error).__name__}: {error}", file=sys.stderr)
        if args.remediate:
            by_id = {r["id"]: r for r in registry["resources"]}
            for row in rows:
                auto = by_id.get(row["id"], {}).get("fix", {}).get("auto", [])
                for cmd in auto if row["status"] in ("ALARM", "AT-LIMIT") else []:
                    subprocess.run(os.path.expandvars(os.path.expanduser(cmd)), shell=True, timeout=1800, check=False)
    try:
        installed_from = (REPO / "INSTALLED_FROM").read_text().strip()
    except OSError:
        installed_from = "source-checkout"
    (state / "forecast.json").write_text(json.dumps({"at": iso(now), "host": local, "installedFrom": installed_from,
                                                     "delivery": delivery, "rows": [
        {k: (None if v == INF else v) for k, v in r.items() if k != "res"} for r in rows]}, indent=1))
    print(json.dumps([{k: v for k, v in r.items() if k != "res"} for r in rows], default=lambda x: None)
          if args.json else table(rows))
    return 2 if any(r["status"] in BAD for r in rows) else 0


def access_gap_rows(res: dict, reading: dict | None, now: float) -> list[dict]:
    """One row (and so one deduped card and issue) per repeated denial, so each gap gets its own owner."""
    rows = []
    for gap in (reading or {}).get("gaps", []):
        sub = dict(res, id=f"{res['id']}:{gap['key']}", label=f"Access gap: {gap['sig']}")
        row = evaluate(sub, {"value": gap["count"], "limit": res["collector"].get("minRepeats", 2),
                             "detail": f"seen {gap['count']}x in {gap['sources']} sessions"}, [], now)
        rows.append(dict(row, res=sub))
    return rows


if __name__ == "__main__":
    sys.exit(main())
