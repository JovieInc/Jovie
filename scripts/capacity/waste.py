#!/usr/bin/env python3
"""Continuous waste loop: unit-metric detectors over the existing collectors, ranked, filed as fixes.

Registry: ops/registry/waste.json (classes, unit metrics, detectors, seeds). Runs inside the
capacity collector pass (forecast.py collect calls run_pass); no daemon of its own.

  collect   read every metric, detect unit anomalies, write factory signals (factory_intake files
            them as compounding Linear issues), record wins when a flagged metric drops, publish
            the daily digest once per UTC day.
  report    print the ranking (top wastes by multiple over their threshold) and the digest.

Detectors: ceiling (value > max), wow (>pct growth vs ~7 days ago, above a floor),
zero-denominator (numerator >= min while the outcome denominator, e.g. active users, is 0).
A metric with no reading is a GAP and is reported, never silently skipped. No secrets are read
or printed; the Summer store token is only used as a bearer header.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = Path(os.environ.get("CAPACITY_REPO") or HERE.parents[1])
REGISTRY = REPO / "ops/registry/waste.json"
SPEND = REPO / "ops/registry/spend.json"
WEEK = 7 * 86400
GH_REPO = os.environ.get("WASTE_GH_REPO", "JovieInc/Jovie")


def iso(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def state_dir() -> Path:
    return Path(os.environ.get("CAPACITY_STATE") or Path.home() / ".local/state/capacity")


def lanes_state() -> Path:
    return Path(os.environ.get("LANES_STATE") or Path.home() / ".local/state/jovie-lanes")


def sh(cmd: list[str], timeout: int = 25, cwd: Path | None = None) -> str | None:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=cwd)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return out.stdout if out.returncode == 0 else None


def gh_json(args: list[str]):
    """Always through the ledgered gh client (external-apis rule); no client means no reading."""
    sys.path.insert(0, str(REPO / "scripts"))
    try:
        from apiclient.gh import run_gh
        res = run_gh(["api", *args], priority="report")
        raw = res["stdout"] if res.get("code") == 0 else None
    except (ImportError, OSError):
        raw = None
    try:
        return json.loads(raw or "")
    except ValueError:
        return None


# ---- collectors: name -> {key: number}; a missing key is a GAP ----

def col_github() -> dict:
    out = {}
    rate = gh_json(["rate_limit", "--jq", ".resources.core"])
    if rate and rate.get("limit"):
        out["coreUsedShare"] = rate["used"] / rate["limit"]
    day0 = iso(time.time() - WEEK)[:10]
    merged = gh_json(["search/issues?per_page=1&q=" + f"repo:{GH_REPO}+is:pr+is:merged+merged:>={day0}", "--jq", ".total_count"])
    closed = gh_json(["search/issues?per_page=1&q=" + f"repo:{GH_REPO}+is:pr+is:unmerged+is:closed+closed:>={day0}", "--jq", ".total_count"])
    if isinstance(merged, int) and merged:
        out["merged7d"] = merged
        if isinstance(closed, int):
            out["closedUnmergedShare"] = closed / merged
    return out


def col_ci(merged7d: float | None) -> dict:
    """Sample the latest 200 workflow runs: cancelled share, runner minutes, runs per merged PR.

    The runs API caps total_count at 2500 for filtered queries, so rates come from a sample's
    time span scaled to a week and divided by merged PRs (an estimate, labelled as one)."""
    runs = []
    for page in (1, 2):
        data = gh_json([f"repos/{GH_REPO}/actions/runs?per_page=100&page={page}", "--jq", "[.workflow_runs[]|{c:.conclusion,s:.run_started_at,u:.updated_at}]"])
        runs += data or []
    runs = [r for r in runs if r.get("s") and r.get("u")]
    if len(runs) < 20:
        return {}

    def ts(v):
        return datetime.strptime(v, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    done = [r for r in runs if r["c"]]
    span = max(3600.0, max(ts(r["s"]) for r in runs) - min(ts(r["s"]) for r in runs))
    mins = sum(max(0.0, ts(r["u"]) - ts(r["s"])) for r in runs) / 60
    out = {"cancelledShare": sum(r["c"] == "cancelled" for r in done) / max(1, len(done))}
    if merged7d:
        scale = WEEK / span
        out["runnerMinPerMergedPr"] = mins * scale / merged7d
        out["runsPerMergedPr"] = len(runs) * scale / merged7d
    return out


def col_money(inputs: dict, merged7d: float | None, gw: dict) -> dict:
    perday = sum(v["value"] for v in inputs.get("fixedMonthlyUsd", {}).values()) / 30
    try:
        for p in json.loads(SPEND.read_text())["providers"]:
            if (p.get("cap") or {}).get("enforcement") == "credit":
                continue  # grant-funded (founding credits): not cash waste
            b = p.get("burnPerDayUsd")
            perday += (b["value"] if isinstance(b, dict) else b) or 0
    except (OSError, ValueError, KeyError, TypeError):
        pass
    out = {"usdPerDay": perday}
    if gw.get("usdPerDay") is not None and merged7d:
        out["gatewayUsdPerMergedPr"] = gw["usdPerDay"] * 7 / merged7d
    return out


def col_gateway() -> dict:
    """Gateway report (#23892). Needs AI_GATEWAY_API_KEY in the env; absent means GAP, not zero."""
    if not os.environ.get("AI_GATEWAY_API_KEY"):
        return {}
    raw = sh(["node", "scripts/ai-gateway-report.mjs", "--json"], 60, REPO)
    try:
        rows = json.loads(raw or "")["api_key_name"]
    except (ValueError, KeyError, TypeError):
        return {}
    hits = [r["cacheHit"] for r in rows if r.get("cacheHit") is not None]
    out = {"usdPerDay": sum(r["usdPerDay"] for r in rows)}
    if hits:
        out["cacheMissShare"] = 1 - sum(hits) / len(hits)
    return out


def col_storage() -> dict:
    roots = [Path(p).expanduser() for p in os.environ.get("WASTE_CHECKOUT_ROOTS", "~/wt:~/.cache/jovie-wt").split(":")]
    cutoff, stale = time.time() - 14 * 86400, []
    for root in roots:
        try:
            stale += [d for d in root.iterdir() if d.is_dir() and not d.is_symlink() and d.stat().st_mtime < cutoff]
        except OSError:
            continue
    kib = 0
    for d in sorted(stale)[:40]:
        out = sh(["du", "-sk", str(d)], 20)
        kib += int(out.split()[0]) if out else 0
    return {"staleCheckouts": len(stale), "staleCheckoutGiB": kib / 2**20}


def col_debt() -> dict:
    files = sh(["git", "ls-files", "*.ts", "*.tsx", "*.mjs", "*.py"], 30, REPO)
    if files is None:
        return {}
    big = 0
    for f in files.splitlines():
        try:
            with open(REPO / f, "rb") as h:
                big += sum(1 for _ in h) > 1500
        except OSError:
            pass
    return {"oversizedFiles": big}


def read_feed(name: str, key: str) -> float | None:
    for base in (lanes_state(), state_dir()):
        try:
            v = json.loads((base / name).read_text()).get(key)
            return float(v) if v is not None else None
        except (OSError, ValueError, TypeError):
            continue
    return None


def read_capacity(res_id: str) -> float | None:
    try:
        rows = json.loads((state_dir() / "forecast.json").read_text())["rows"]
        return next(r["frac"] for r in rows if r["id"] == res_id and r.get("frac") is not None)
    except (OSError, ValueError, KeyError, StopIteration):
        return None


def collect_all(reg: dict) -> dict:
    gh = col_github()
    gw = col_gateway()
    inputs = reg.get("inputs", {})
    data = {"github": gh, "ci": col_ci(gh.get("merged7d")), "gateway": gw, "storage": col_storage(),
            "debt": col_debt(), "money": col_money(inputs, gh.get("merged7d"), gw),
            "inputs": {"activeUsers": inputs.get("activeUsers", {}).get("value")}}
    data["llm"] = {"gatewayUsdPerMergedPr": data["money"].get("gatewayUsdPerMergedPr")}
    return data


def reading(spec: dict, data: dict) -> float | None:
    src = spec["source"]
    if src.startswith("feed:"):
        _, name, key = src.split(":")
        return read_feed(name, key)
    if src.startswith("capacity:"):
        return read_capacity(src.split(":", 1)[1])
    group, key = src.split(".", 1)
    v = data.get(group, {}).get(key)
    return None if v is None else float(v)


# ---- detectors ----

def detect(spec: dict, value: float | None, den: float | None, week_ago: float | None) -> dict:
    """Return {status, excess, why}; excess is the multiple over the threshold (ranking key)."""
    if value is None:
        return {"status": "GAP", "excess": 0.0, "why": "no reading (collector not wired or source unavailable)"}
    d = spec["detector"]
    kind = d["kind"]
    if kind == "ceiling":
        ex = value / d["max"] if d["max"] else 0.0
        return {"status": "WASTE" if value > d["max"] else "OK", "excess": ex, "why": f"{value:.3g} vs ceiling {d['max']}"}
    if kind == "wow":
        if week_ago is None or week_ago <= 0:
            return {"status": "OK", "excess": 0.0, "why": "no 7-day history yet"}
        growth = value / week_ago - 1
        bad = growth > d["pct"] and value >= d.get("floor", 0)
        return {"status": "WASTE" if bad else "OK", "excess": (growth / d["pct"]) if bad else 0.0,
                "why": f"{growth:+.0%} vs 7 days ago ({week_ago:.3g} -> {value:.3g})"}
    if kind == "zero-denominator":
        bad = den == 0 and value >= d["minNumerator"]
        return {"status": "WASTE" if bad else "OK", "excess": value / d["minNumerator"] if bad else 0.0,
                "why": f"{value:.3g} {spec['unit']} with 0 active users"}
    return {"status": "GAP", "excess": 0.0, "why": f"unknown detector {kind}"}


def history(path: Path, now: float) -> dict[str, float]:
    """Metric id -> reading nearest 7 days ago (within +-2 days)."""
    best: dict[str, tuple[float, float]] = {}
    try:
        for line in path.read_text().splitlines():
            r = json.loads(line)
            age = abs((now - r["t"]) - WEEK)
            if age < 2 * 86400 and (r["id"] not in best or age < best[r["id"]][0]):
                best[r["id"]] = (age, r["v"])
    except (OSError, ValueError, KeyError):
        pass
    return {k: v for k, (_, v) in best.items()}


def evaluate(reg: dict, data: dict, hist: dict[str, float]) -> list[dict]:
    rows = []
    users = data["inputs"]["activeUsers"]
    for cls in reg["classes"]:
        for m in cls["metrics"]:
            v = reading(m, data)
            den = users if m.get("den") else None
            res = detect(m, v, den, hist.get(m["id"]))
            rows.append({"id": m["id"], "class": cls["id"], "owner": cls["owner"], "label": m["label"],
                         "unit": m["unit"], "value": v, **res})
    return rows


def ranking(rows: list[dict]) -> list[dict]:
    return sorted((r for r in rows if r["status"] == "WASTE"), key=lambda r: -r["excess"])


# ---- fix stream: signals, wins, store, digest ----

def signal(reg: dict, row: dict, spec: dict) -> dict:
    fs = reg["fixStream"]
    target = spec["detector"].get("max")
    target = target if target is not None else round((row["value"] or 0) * 0.7, 4)
    return {"schema": "jovie-factory-signal/v1", "fingerprint": "waste-" + row["id"].replace(".", "-").replace("_", "-"),
            "source": "waste-loop", "extraLabels": ["waste"],
            "title": f"waste: {row['label']} ({row['why']})",
            "problem": f"Waste class `{row['class']}`, metric `{row['id']}`: {row['why']}. Owner: {row['owner']}.",
            "acceptance": [f"Root cause fixed at the highest layer that removes it, not this one instance",
                           *[f"{x[0].upper()}{x[1:]}" for x in fs["everyFixMust"][1:3]],
                           "The unit metric is back under its threshold in the next waste.py report; the wins store records before and after"],
            "metric": {"name": row["id"], "baseline": row["value"], "target": target, "measuredBy": "python3 scripts/capacity/waste.py report"}}


def write_signals(reg: dict, rows: list[dict], specs: dict, lanes: Path) -> list[str]:
    out = lanes / "factory-signals"
    out.mkdir(parents=True, exist_ok=True)
    wrote = []
    for row in ranking(rows)[: reg["fixStream"]["maxOpen"]]:
        sig = signal(reg, row, specs[row["id"]])
        path = out / (sig["fingerprint"] + ".json")
        if not path.exists():
            path.write_text(json.dumps(sig, indent=1))
            wrote.append(sig["fingerprint"])
    return wrote


def store_put(rel: str, obj: dict, create: bool, env=os.environ, opener=urllib.request.urlopen) -> str:
    url, tok = env.get("SUMMER_STORE_URL"), env.get("SUMMER_STORE_TOKEN")
    if not url or not tok:
        return "store not configured"
    q = f"path={rel}" + ("&mode=create" if create else "")
    req = urllib.request.Request(f"{url.rstrip('/')}/v1/object?{q}", data=json.dumps(obj).encode(), method="PUT",
                                 headers={"authorization": f"Bearer {tok}"})
    try:
        opener(req, timeout=15)
        return "recorded"
    except urllib.error.HTTPError as e:
        return "already recorded" if e.code == 409 else f"store error {e.code}"
    except OSError:
        return "store unreachable"


def settle_wins(reg: dict, rows: list[dict], state: Path, now: float) -> list[dict]:
    """A flagged metric that drops 20%+ under its flagged baseline is a fix: record before/after."""
    path = state / "waste-open.json"
    try:
        openf = json.loads(path.read_text())
    except (OSError, ValueError):
        openf = {}
    wins = []
    by = {r["id"]: r for r in rows}
    for mid, base in list(openf.items()):
        r = by.get(mid)
        if r and r["value"] is not None and r["status"] == "OK" and r["value"] <= base["value"] * 0.8:
            day = iso(now)[:10]
            win = {"schema": "jovie.win/v1", "id": f"win-{day}-waste-{mid.replace('.', '-').replace('_', '-')}", "date": day,
                   "area": "waste", "theme": "waste-" + r["class"], "claim": f"{r['label']} fell back under its threshold.", "prs": [],
                   "metrics": [{"name": mid, "unit": r["unit"], "better": "lower", "before": base["value"], "after": r["value"],
                                "source": "scripts/capacity/waste.py", "query": "python3 scripts/capacity/waste.py report"}],
                   "story": "Detected by the continuous waste loop and fixed through the factory-signal stream.", "receipts": []}
            win["store"] = store_put(reg["fixStream"]["winsStorePrefix"] + win["id"] + ".json", win, True)
            with open(state / "waste-wins.jsonl", "a") as f:
                f.write(json.dumps(win) + "\n")
            wins.append(win)
            del openf[mid]
    for r in ranking(rows):
        openf.setdefault(r["id"], {"value": r["value"], "since": iso(now)})
    path.write_text(json.dumps(openf))
    return wins


def digest(reg: dict, rows: list[dict], state: Path, now: float) -> dict:
    top = ranking(rows)[:5]
    shipped = []
    try:
        shipped = [json.loads(l) for l in (state / "waste-wins.jsonl").read_text().splitlines()
                   if now - datetime.strptime(json.loads(l)["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() < WEEK]
    except (OSError, ValueError):
        pass
    trend = {"flagged": len(ranking(rows)), "gaps": sum(r["status"] == "GAP" for r in rows), "metrics": len(rows)}
    return {"schema": "jovie.waste-digest/v1", "at": iso(now),
            "top": [{k: r[k] for k in ("id", "class", "label", "value", "unit", "excess", "why", "owner")} for r in top],
            "fixesShippedThisWeek": [{"id": w["id"], "metric": w["metrics"][0]} for w in shipped],
            "trend": trend, "seeds": [{"id": s["id"], "status": s["status"], "outcome": s["outcome"]} for s in reg["seeds"]]}


def text(d: dict) -> str:
    out = [f"waste digest {d['at']}: {d['trend']['flagged']} flagged, {d['trend']['gaps']} gaps of {d['trend']['metrics']} metrics"]
    for i, r in enumerate(d["top"], 1):
        out.append(f"{i}. [{r['class']}] {r['label']}: {r['why']} ({r['excess']:.1f}x threshold, owner {r['owner']})")
    out.append(f"fixes shipped this week: {len(d['fixesShippedThisWeek'])}")
    return "\n".join(out)


def run_pass(publish: bool = True, now: float | None = None) -> dict:
    reg = json.loads(REGISTRY.read_text())
    now = now or time.time()
    state = state_dir()
    state.mkdir(parents=True, exist_ok=True)
    specs = {m["id"]: m for c in reg["classes"] for m in c["metrics"]}
    data = collect_all(reg)
    rows = evaluate(reg, data, history(state / "waste-samples.jsonl", now))
    result = {"rows": rows, "data": data}
    if publish:
        with open(state / "waste-samples.jsonl", "a") as f:
            for r in rows:
                if r["value"] is not None:
                    f.write(json.dumps({"t": now, "id": r["id"], "v": r["value"]}) + "\n")
        result["signals"] = write_signals(reg, rows, specs, lanes_state())
        result["wins"] = settle_wins(reg, rows, state, now)
        d = digest(reg, rows, state, now)
        stamp = state / "waste-digest-day"
        today = iso(now)[:10]
        if not stamp.exists() or stamp.read_text() != today:
            d["store"] = store_put(reg["fixStream"]["digestStorePrefix"] + f"digest-{today}.json", d, True)
            stamp.write_text(today)
        store_put(reg["fixStream"]["digestStorePrefix"] + "latest.json", d, False)
        (state / "waste-latest.json").write_text(json.dumps(d, indent=1))
        (lanes_state() / "waste-latest.json").parent.mkdir(parents=True, exist_ok=True)
        (lanes_state() / "waste-latest.json").write_text(json.dumps(d, indent=1))
    result["digest"] = digest(reg, rows, state, now)
    return result


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("cmd", choices=["collect", "report"])
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    res = run_pass(publish=a.cmd == "collect")
    if a.json:
        print(json.dumps(res, indent=1, default=str))
    else:
        print(text(res["digest"]))
        for r in res["rows"]:
            v = "-" if r["value"] is None else f"{r['value']:.4g}"
            print(f"  {r['status']:<6}{r['id']:<34}{v:>10}  {r['why']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
