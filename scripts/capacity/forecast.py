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
--remediate, only on the resource's own host. No secrets are read or printed (Doppler: names only).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(os.environ.get("CAPACITY_REPO") or Path(__file__).resolve().parents[2])
REGISTRY = REPO / "ops/registry/capacity-resources.json"
SPEND = REPO / "ops/registry/spend.json"
WINDOW_S = 7 * 86400
MIN_SPAN_S = 6 * 3600
HEADROOM_WARN = 0.85
INF = float("inf")


def iso(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s: str) -> float:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()


def state_dir() -> Path:
    return Path(os.environ.get("CAPACITY_STATE") or Path.home() / ".local/state/capacity")


def alarm_feed() -> Path:
    return Path(os.environ.get("LANES_STATE") or Path.home() / ".local/state/jovie-lanes") / "host-alarms.jsonl"


def run(cmd: list[str], timeout: int = 25) -> str | None:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return out.stdout if out.returncode == 0 else None


# ---- collectors: each returns {"value", "limit", "burnPerHour"?, "observedAt"?} or None ----

def c_disk(spec: dict, now: float) -> dict | None:
    path = os.path.expanduser(spec.get("path", "/"))
    if not os.path.exists(path):
        return None
    u = shutil.disk_usage(path)
    return {"value": u.used, "limit": u.total * spec.get("limitFrac", 0.9)}


def c_inodes(spec: dict, now: float) -> dict | None:
    path = os.path.expanduser(spec.get("path", "/"))
    if not os.path.exists(path):
        return None
    s = os.statvfs(path)
    if not s.f_files:
        return None
    return {"value": s.f_files - s.f_ffree, "limit": s.f_files * spec.get("limitFrac", 0.9)}


def c_gh_rate(spec: dict, now: float) -> dict | None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    try:
        from apiclient.gh import run_gh
        result = run_gh(["api", "rate_limit", "--jq", f".resources.{spec.get('bucket', 'core')}"], priority="report")
    except (ImportError, OSError):
        return None
    raw = result["stdout"] if result.get("code") == 0 else None
    try:
        row = json.loads(raw or "")
    except ValueError:
        return None
    return {"value": row["used"], "limit": row["limit"]}


def c_doppler(spec: dict, now: float) -> dict | None:
    raw = run(["doppler", "secrets", "-p", spec["project"], "-c", spec["config"], "--only-names", "--json"])
    try:
        return {"value": len(json.loads(raw or "")), "limit": spec["cap"]}
    except (ValueError, TypeError):
        return None


def c_spend(spec: dict, now: float) -> dict | None:
    """Prepaid balance projected forward from the registry snapshot and its observed burn."""
    try:
        provider = next(p for p in json.loads(SPEND.read_text())["providers"] if p["id"] == spec["providerId"])
        snap = provider["snapshot"]
        burn = provider["burnPerDayUsd"]["value"]
        observed = parse_iso(snap["observedAt"])
        balance = snap["balanceUsd"]
    except (OSError, ValueError, KeyError, StopIteration, TypeError):
        return None
    age_d = max(0.0, (now - observed) / 86400)
    projected = balance - burn * age_d
    start = spec.get("fundedUsd", balance)
    return {"value": start - projected, "limit": start - spec.get("floorUsd", 0),
            "burnPerHour": burn / 24, "observedAt": iso(observed)}


def _http_json(url: str, token: str, method: str = "GET") -> dict | None:
    import urllib.request
    try:
        req = urllib.request.Request(url, method=method, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except (OSError, ValueError):
        return None


def neon_token() -> str | None:
    """NEON_API_KEY, else the neonctl OAuth token on this host (read in memory, never printed)."""
    if os.environ.get("NEON_API_KEY"):
        return os.environ["NEON_API_KEY"]
    try:
        return json.loads((Path.home() / ".config/neonctl/credentials.json").read_text())["access_token"]
    except (OSError, ValueError, KeyError):
        return None


def c_neon(spec: dict, now: float) -> dict | None:
    """Month-to-date Neon usage against the plan's included allowance (Launch plan limits live in the registry).

    metric: compute-hours | egress-gb | branches | spend-usd. Alarms at warnFrac of the allowance, before
    Neon's own 80% / spend-notification email.
    """
    token = neon_token()
    if not token:
        return None
    base = "https://console.neon.tech/api/v2"
    org = spec["orgId"]
    if spec["metric"] == "branches":
        proj = _http_json(f"{base}/projects/{spec['projectId']}/branches?limit=500", token)
        return {"value": len(proj["branches"]), "limit": spec["limit"]} if proj else None
    start = datetime.fromtimestamp(now, timezone.utc).replace(day=1, hour=0, minute=0, second=0)
    stamp = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
    url = (f"{base}/consumption_history/v2/projects?org_id={org}&granularity=daily&from={stamp(start)}"
           f"&to={iso(now)}&limit=100&metrics=compute_unit_seconds,public_network_transfer_bytes,extra_branches_month")
    data = _http_json(url, token)
    if not data:
        return None
    totals: dict[str, float] = {}
    for proj in data.get("projects", []):
        for period in proj.get("periods", []):
            for row in period.get("consumption", []):
                for m in row.get("metrics", []):
                    totals[m["metric_name"]] = totals.get(m["metric_name"], 0) + m["value"]
    cu_h = totals.get("compute_unit_seconds", 0) / 3600
    gb = totals.get("public_network_transfer_bytes", 0) / 1e9
    branch_h = totals.get("extra_branches_month", 0)
    m = spec["metric"]
    if m == "compute-hours":
        return {"value": cu_h, "limit": spec["limit"]}
    if m == "egress-gb":
        return {"value": gb, "limit": spec["limit"]}
    if m == "spend-usd":  # overage estimate at published Launch rates; the real notification is the org spend alert
        rates = spec["rates"]
        usd = (max(0.0, cu_h - rates["includedCuHours"]) * rates["cuHourUsd"]
               + max(0.0, gb - rates["includedEgressGb"]) * rates["egressGbUsd"]
               + branch_h * rates["extraBranchHourUsd"])
        return {"value": usd, "limit": spec["limit"]}
    return None


def c_resend(spec: dict, now: float) -> dict | None:
    """Emails sent today (UTC) or this month vs the plan quota. Needs a full-access key: the production
    key is send-only (401 on list), so this reads RESEND_READ_KEY and is a GAP until Tim mints one."""
    token = os.environ.get("RESEND_READ_KEY") or run(
        ["doppler", "secrets", "get", "RESEND_READ_KEY", "-p", "agent-mesh", "-c", "prd", "--plain"])
    if not token:
        return None
    day = datetime.fromtimestamp(now, timezone.utc)
    floor = day.replace(hour=0, minute=0, second=0).strftime("%Y-%m-%d") if spec["window"] == "day" \
        else day.strftime("%Y-%m-01")
    count, after = 0, ""
    for _ in range(100):
        page = _http_json(f"https://api.resend.com/emails?limit=100{after}", token.strip())
        rows = (page or {}).get("data")
        if not rows:
            break
        count += sum(1 for r in rows if r["created_at"][:10] >= floor)
        if rows[-1]["created_at"][:10] < floor or not page.get("has_more"):
            break
        after = f"&after={rows[-1]['id']}"
    return {"value": count, "limit": spec["limit"]}


def c_manual(spec: dict, now: float) -> dict | None:
    if "value" not in spec:
        return None
    return {"value": spec["value"], "limit": spec["limit"], "observedAt": spec.get("observedAt")}


COLLECTORS = {"disk": c_disk, "inodes": c_inodes, "gh-rate": c_gh_rate, "doppler": c_doppler,
              "spend": c_spend, "manual": c_manual, "neon": c_neon, "resend": c_resend}


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


def evaluate(res: dict, reading: dict | None, history: list[tuple[float, float]], now: float) -> dict:
    row = {"id": res["id"], "group": res["group"], "label": res["label"], "unit": res.get("unit", ""),
           "leadTimeHours": res["leadTimeHours"], "atLimit": res["atLimit"]["effect"]}
    if reading is None:
        return {**row, "status": "GAP", "why": "no collector reading" if res["collector"]["type"] != "none"
                else res["collector"].get("note", "collector not wired")}
    value, limit = reading["value"], reading["limit"]
    burn = reading.get("burnPerHour")
    if burn is None and res.get("mode", "trend") == "trend":
        burn = slope_per_hour(history + [(now, value)])
    ttl = INF if not burn or burn <= 0 else max(0.0, (limit - value) / burn)
    frac = value / limit if limit else 0.0
    row.update(value=value, limit=limit, frac=round(frac, 3), burnPerHour=burn, ttlHours=ttl, observedAt=reading.get("observedAt"))
    max_age = res.get("maxAgeDays")
    stale = bool(reading.get("observedAt") and max_age and (now - parse_iso(reading["observedAt"])) > max_age * 86400)
    if frac >= 1:
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


def card(res: dict, row: dict, now: float) -> dict:
    esc = res.get("fix", {}).get("escalate") or {}
    ttl = row.get("ttlHours", INF)
    when = "is at the limit" if row["status"] == "AT-LIMIT" else (
        f"hits the limit in {ttl / 24:.1f} days at this rate" if ttl != INF else row["why"])
    opts = "; ".join(f"{o['label']} ({o['cost']}, lead {o['lead']})" for o in esc.get("options", [])) or "no purchase option; fix in config"
    return {"kind": "capacity-escalation", "id": res["id"], "at": iso(now),
            "title": f"{res['label']}: {when}",
            "body": f"{row['why']}. At the limit: {res['atLimit']['effect']} ({res['atLimit']['note']}). Options: {opts}.",
            "default": esc.get("default", "auto-remediate and re-check"),
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
        bad = row["status"] in ("ALARM", "AT-LIMIT")
        current[row["id"]] = row["status"]
        if bad and prior.get(row["id"]) != row["status"]:
            cards.append(card(by_id[row["id"]], row, now))
    state.mkdir(parents=True, exist_ok=True)
    if cards:
        feed.parent.mkdir(parents=True, exist_ok=True)
        with open(feed, "a") as f, open(state / "escalations.jsonl", "a") as e:
            for c in cards:
                f.write(json.dumps({"kind": "capacity-forecast", **c}) + "\n")
                e.write(json.dumps(c) + "\n")
    prior_path.write_text(json.dumps(current))
    return cards


def fmt(res_unit: str, v: float) -> str:
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
    ap.add_argument("cmd", choices=["collect", "report"])
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
                fresh.append({"t": now, "id": res["id"], "host": local, "value": reading["value"], "limit": reading["limit"]})
        elif not own and hist:
            last = next(r for r in reversed(merged) if r.get("id") == res["id"])
            reading, hist = {"value": last["value"], "limit": last["limit"]}, hist[:-1]
        row = evaluate(res, reading, hist, now)
        if reading is None and not own and kind != "none":
            row["why"] = f"no samples from {res['host']} (install collector, then --remote {res['host']})"
        rows.append(row)
    if args.cmd == "collect":
        with open(samples_path, "a") as f:
            for s in fresh:
                f.write(json.dumps(s) + "\n")
        publish(rows, registry, now, state, alarm_feed())
        if local == cloud_owner and os.environ.get("WASTE_LOOP") != "off":
            try:  # unit-metric waste detectors ride the same pass (ops/registry/waste.json)
                import waste
                waste.run_pass()
            except Exception as error:  # a waste-loop fault never blocks capacity alarms
                print(f"waste-loop: {type(error).__name__}: {error}", file=sys.stderr)
        if args.remediate:
            by_id = {r["id"]: r for r in registry["resources"]}
            for row in rows:
                for cmd in by_id[row["id"]].get("fix", {}).get("auto", []) if row["status"] in ("ALARM", "AT-LIMIT") else []:
                    subprocess.run(os.path.expandvars(os.path.expanduser(cmd)), shell=True, timeout=1800, check=False)
    (state / "forecast.json").write_text(json.dumps({"at": iso(now), "host": local, "rows": [
        {k: (None if v == INF else v) for k, v in r.items()} for r in rows]}, indent=1))
    print(json.dumps(rows, default=lambda x: None) if args.json else table(rows))
    return 2 if any(r["status"] in ("ALARM", "AT-LIMIT") for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
