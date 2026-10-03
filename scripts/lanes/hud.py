#!/usr/bin/env python3
"""Symphony HUD: the lanes' own truth on the Gem console (tty1), 160x45 by default.

  hud.py                 # loop: render every 2s, refresh Linear/GitHub every 90s
  hud.py --once          # one frame to stdout (smoke test, screenshots)
  hud.py --json          # the model the frame is rendered from

Every cell is sourced: lane state files and run logs on this host, the ledger, Linear
(Todo pool, in-progress lane issues), GitHub (open lane PRs, checks, merge queue, recently
merged) and the OS. A source that fails renders its reason, never a blank or a zero.
The HUD rides the lanes release: when `current` moves, it re-execs the new hud.py.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import threading
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module  # dataclasses resolve annotations through sys.modules
    spec.loader.exec_module(module)
    return module


lane = _load("lane_runner")
codex = _load("codex_lane")

RUN_ID = re.compile(r"^(?P<stamp>\d{8}T\d{6}Z)-(?P<target>PR\d+|JOV-\d+)-(?P<provider>[a-z0-9]+)(?:-(?P<kind>adopt|fix))?-[0-9a-f]{6}$")
PHASES = [
    (re.compile(r"^\$ pnpm install"), "installing"),
    (re.compile(r"^\$ git (fetch|worktree|checkout)"), "worktree"),
    (re.compile(r"^\$ bash scripts/hooks/pre-push-gate\.sh"), "gate"),
    (re.compile(r"^\$ gh pr (ready|merge)"), "landing"),
    (re.compile(r"^\$ gh pr comment"), "reporting"),
    (re.compile(r"^codex-lane: account="), "agent (codex)"),
]
LANE_LABELS = ("agent-ready", "devin", "codex")
REFRESH_REMOTE_S = 90
# JOV-6836: promotion-loss metrics take ~25 s of GitHub reads; refresh them far less often.
PROMOTION_SCRIPT = HERE.parent / "promotion-loss-metrics.mjs"
PROMOTION_EVERY_S = 900
_promotion: dict = {"at": 0.0, "data": None}
GREEN, RED, ORANGE, PURPLE, BLUE = (52, 199, 89), (255, 69, 58), (255, 159, 10), (169, 130, 255), (17, 175, 255)
DIM, FG, WHITE = (138, 138, 148), (236, 236, 240), (255, 255, 255)
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


# ---------------------------------------------------------------- sources

def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_run_id(run_id: str) -> dict | None:
    found = RUN_ID.match(run_id)
    if not found:
        return None
    started = datetime.strptime(found.group("stamp"), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    return {"runId": run_id, "provider": found.group("provider"), "kind": found.group("kind") or "issue",
            "target": found.group("target"), "startedAt": started.isoformat()}


def phase_of(log_text: str, provider: str) -> str:
    """The last harness step the run log shows; the agent's own output means it is working."""
    phase = "starting"
    for line in log_text.splitlines():
        if line.startswith("$ ") or line.startswith("codex-lane: account="):
            phase = next((label for pattern, label in PHASES if pattern.match(line)), None) or \
                ("agent" if provider in line else phase)
        elif phase.startswith("agent") is False and phase in ("installing", "worktree") and line.strip():
            continue
        elif not line.startswith("$ ") and line.strip() and phase not in ("gate", "landing", "reporting", "installing", "worktree"):
            phase = phase if phase.startswith("agent") else "agent"
    return phase


def running_workers(state: Path) -> list[dict]:
    """Lane workers on this host and the run each holds open (Linux /proc; a Mac shows none)."""
    rows = []
    proc = Path("/proc")
    if not proc.exists():
        return rows
    for pid_dir in proc.iterdir():
        if not pid_dir.name.isdigit():
            continue
        try:
            cmdline = (pid_dir / "cmdline").read_bytes().split(b"\0")
        except OSError:
            continue
        if b"lane_runner.py" not in b" ".join(cmdline) or b"worker" not in cmdline:
            continue
        provider = cmdline[cmdline.index(b"--provider") + 1].decode() if b"--provider" in cmdline else "?"
        run = None
        try:
            for fd in (pid_dir / "fd").iterdir():
                target = os.readlink(fd)
                if "/runs/" in target and target.endswith(".log"):
                    run = Path(target)
                    break
        except OSError:
            pass
        row = {"pid": int(pid_dir.name), "provider": provider, "run": None}
        if run is not None and (info := parse_run_id(run.stem)):
            try:
                text = run.read_text(errors="replace")[-30000:]
            except OSError:
                text = ""
            info["phase"] = phase_of(text, provider)
            row["run"] = info
        rows.append(row)
    return sorted(rows, key=lambda r: (r["provider"], r["run"] is None, r["pid"]))


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def ledger_rows(state: Path) -> list[dict]:
    rows = []
    try:
        with open(state / "runs" / "ledger.jsonl") as handle:
            for line in handle:
                try:
                    receipt = json.loads(line)
                except ValueError:
                    continue
                rows.append(receipt)
    except OSError:
        pass
    return rows


def ledger_window(state: Path, hours: int = 24) -> list[dict]:
    since = (utcnow() - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return [row for row in ledger_rows(state) if (row.get("endedAt") or "") >= since]


def local_model(host) -> dict:
    state = host.state
    providers = lane.load_providers()
    enabled = {name: spec for name, spec in providers.items() if spec.get("enabled", True)}
    slots = {name: host.slots(name, spec.get("slots", 1)) for name, spec in enabled.items()}
    tree = read_text(state / "current" / ".tree")
    current = (state / "current").resolve()
    all_receipts = ledger_rows(state)
    since = (utcnow() - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
    receipts = [row for row in all_receipts if (row.get("endedAt") or "") >= since]
    # Display classification only: a receipt missing verdict metadata is "unclassified",
    # never inferred as success or failure. The raw receipt is preserved in receipts24h.
    verdicts = Counter(r["verdict"] if isinstance(r.get("verdict"), str) and r["verdict"].strip()
                       else "unclassified" for r in receipts)
    landed = sorted((r for r in receipts if r.get("verdict") in ("landing", "verified-not-queued")),
                    key=lambda r: r.get("endedAt") or "", reverse=True)
    cooldowns = {}
    for path in (state / "cooldown").glob("*"):
        try:
            until = float(path.read_text())
        except (OSError, ValueError):
            continue
        if until > time.time():
            cooldowns[path.name] = int(until - time.time())
    try:
        accounts = codex.status()
    except Exception as error:  # the HUD must render without the codex lane
        accounts = {"error": f"{type(error).__name__}: {error}"[:80], "accounts": {}, "available": []}
    return {
        "host": lane.HOST, "release": tree[:7] if tree else None,
        "releaseMatchesHud": current == HERE, "hudDir": str(HERE),
        "providers": enabled, "slots": slots, "workers": running_workers(state),
        "ledger24h": dict(verdicts), "runs24h": len(receipts),
        "receipts24h": receipts, "attributionReceipts": all_receipts,
        "lastLanding": landed[0].get("endedAt") if landed else None,
        "held": read_json(state / "held.json", {}), "failures": read_json(state / "failures.json", {}),
        "gateTimeouts": read_json(state / "gate-timeouts.json", {}), "requeue": read_json(state / "requeue.json", {}),
        "cooldowns": cooldowns, "codex": accounts, "doctor": read_json(state / "doctor.json", {}),
        "tick": read_json(state / "tick.json", {}),
        "gateSeats": host.gate_slots, "generatedAt": utcnow().isoformat(),
    }


def read_text(path: Path) -> str:
    try:
        return path.read_text().strip()
    except OSError:
        return ""


def linear_model(env_file: Path, in_flight: list[str] = ()) -> dict:
    """Pool counts, triage returns, and the titles of exactly the issues this host is working."""
    numbers = sorted({int(target.split("-")[1]) for target in in_flight if target.startswith("JOV-")})
    try:
        client = lane.Linear(env_file)
        data = client.gql(
            'query($labels:[String!]!' + (',$numbers:[Float!]!' if numbers else '') + '){'
            'pool: issues(first:100,filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"Todo"}},labels:{name:{in:$labels}}})'
            '{nodes{identifier priority labels{nodes{name}}}}'
            + ('active: issues(first:50,filter:{team:{key:{eq:"JOV"}},number:{in:$numbers}})'
               '{nodes{identifier title state{name}}}' if numbers else '')
            + 'triage: issues(first:100,filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"Triage"}},labels:{name:{in:$labels}}})'
            '{nodes{identifier}}}', {"labels": list(LANE_LABELS), **({"numbers": numbers} if numbers else {})})
    except Exception as error:
        return {"ok": False, "error": f"{type(error).__name__}: {error}"[:100]}
    pool = Counter()
    for node in data["pool"]["nodes"]:
        for label in node["labels"]["nodes"]:
            if label["name"] in LANE_LABELS:
                pool[label["name"]] += 1
    active = {n["identifier"]: n["title"] for n in (data.get("active") or {"nodes": []})["nodes"]}
    return {"ok": True, "pool": dict(pool), "poolTotal": len(data["pool"]["nodes"]), "active": active,
            "triage": len(data["triage"]["nodes"]), "fetchedAt": utcnow().isoformat()}


def gh_json(args: list[str], timeout: int = 40):
    result = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout).strip().splitlines()[-1][:100] if (result.stderr or result.stdout).strip() else f"gh exit {result.returncode}")
    return json.loads(result.stdout or "null")


def github_model() -> dict:
    lane.load_github_env()
    model: dict = {"ok": True, "errors": {}}
    try:
        prs = []
        for name, spec in lane.load_providers().items():
            if not spec.get("enabled", True):
                continue
            # One small page per lane: a single 100-PR page with check rollups times out (504).
            # No statusCheckRollup: with dozens of open lane PRs that field makes GitHub 504.
            prs += gh_json(["pr", "list", "--repo", lane.REPO_SLUG, "--state", "open", "--limit", "60",
                            "--search", f"head:{name}/", "--json",
                            "number,title,headRefName,isDraft,mergeStateStatus,updatedAt,url"])
        rows = []
        for pr in prs:
            found = lane.LANE_BRANCH.match(pr["headRefName"])
            if not found:
                continue
            rows.append({"number": pr["number"], "title": pr["title"], "lane": found.group("lane"),
                         "issue": found.group("issue").upper(), "draft": pr["isDraft"], "merge": pr["mergeStateStatus"],
                         "updatedAt": pr["updatedAt"]})
        model["open"] = sorted(rows, key=lambda r: r["updatedAt"], reverse=True)
    except Exception as error:
        model["errors"]["open"] = f"{type(error).__name__}: {error}"[:100]
    try:
        since = (utcnow() - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
        merged = gh_json(["pr", "list", "--repo", lane.REPO_SLUG, "--state", "merged", "--limit", "100",
                          "--search", f"merged:>={since}", "--json",
                          "number,title,headRefName,createdAt,mergedAt"])
        model["merged24h"] = [{"number": m["number"], "title": m["title"], "mergedAt": m["mergedAt"],
                               "createdAt": m["createdAt"], "headRefName": m["headRefName"],
                               "lane": (lambda found: found.group("lane") if found else None)(lane.LANE_BRANCH.match(m["headRefName"]))}
                              for m in sorted(merged, key=lambda m: m["mergedAt"], reverse=True)]
    except Exception as error:
        model["errors"]["merged"] = f"{type(error).__name__}: {error}"[:100]
    try:
        queue = gh_json(["api", "graphql", "-f", 'query={ repository(owner:"JovieInc", name:"Jovie"){ mergeQueue(branch:"main"){ '
                         'entries(first:20){ totalCount nodes { pullRequest { number } state enqueuedAt } } } } }'])
        entries = queue["data"]["repository"]["mergeQueue"]["entries"]
        model["queue"] = {"depth": entries["totalCount"],
                          "entries": [{"number": e["pullRequest"]["number"], "state": e["state"], "enqueuedAt": e["enqueuedAt"]}
                                      for e in entries["nodes"]]}
    except Exception as error:
        model["errors"]["queue"] = f"{type(error).__name__}: {error}"[:100]
    try:
        limits = gh_json(["api", "rate_limit"])
        budget = lane.graphql_budget()
        if budget is None:
            raise RuntimeError("GraphQL rateLimit unreadable")
        model["rate"] = {"core": limits["resources"]["core"]["remaining"], "graphql": budget[0], "resetAt": budget[1]}
    except Exception as error:
        model["errors"]["rate"] = f"{type(error).__name__}: {error}"[:100]
    model["promotion"] = promotion_model()
    model["ok"] = not model["errors"]
    model["fetchedAt"] = utcnow().isoformat()
    return model


def promotion_model(now: float | None = None, run=subprocess.run) -> dict:
    """Last 8 h of promotion-loss metrics (scripts/promotion-loss-metrics.mjs), cached."""
    now = time.time() if now is None else now
    if _promotion["data"] is None or now - _promotion["at"] >= PROMOTION_EVERY_S:
        _promotion["at"] = now
        try:
            result = run(["node", str(PROMOTION_SCRIPT), "--since", "8h", "--json"],
                         capture_output=True, text=True, timeout=180)
            if result.returncode != 0:
                raise RuntimeError((result.stderr or "exit %d" % result.returncode).strip()[-100:])
            _promotion["data"] = json.loads(result.stdout)
        except Exception as error:
            _promotion["data"] = {"error": f"{type(error).__name__}: {error}"[:100]}
    return _promotion["data"]


def promotion_line(metrics: dict) -> str:
    if not metrics or metrics.get("error"):
        return rgb(FG, "PROMOTION 8h  ", bold=True) + rgb(RED, (metrics or {}).get("error", "unread"))
    first = metrics["firstPass"]["rate"]
    back = metrics["reenqueueMinutes"]
    intake = metrics["intake"]
    occupancy = metrics["occupancy"]
    queue_per_merge = metrics.get("queueEntriesPerMerge")
    rate_color = GREEN if first is not None and first >= 0.9 else ORANGE
    return (rgb(FG, "PROMOTION 8h  ", bold=True)
            + rgb(rate_color, f"first-pass {'n/a' if first is None else f'{round(first * 100)}%'}")
            + rgb(DIM, f" · ejected→back p75 {back['p75'] if back['p75'] is not None else 'n/a'}m ({back['pending']} waiting)"
                       f" · open→enqueue p75 {metrics['openToFirstEnqueueMinutes']['p75']}m"
                       f" · opens/h {intake['opensPerHour']} vs merges/h {intake['mergesPerHour']}"
                       f" · CLEAN not queued {occupancy['cleanNotQueued']}"
                       f" · keys >1 PR {intake['keysWithMultipleOpenPrs']}"
                       f" · queue entries/merge {queue_per_merge if queue_per_merge is not None else 'n/a'}"))


def file_overlap_line(summary: dict) -> str:
    summary = summary or {}
    pairs = summary.get("pairs") or []
    metrics = summary.get("metrics") or {}
    text = (rgb(FG, "FILE OVERLAP  ", bold=True)
            + rgb(DIM, f"{summary.get('mode', 'enforce')} · active {len(pairs)}"
                       f" · prevented {metrics.get('conflicts_prevented', 0)}"
                       f" · flags {metrics.get('overlap_flags', 0)}"
                       f" · rebases {metrics.get('rebases_caused_by_overlap', 0)}"))
    if pairs:
        pair = pairs[0]
        files = ", ".join(pair.get("files") or [])
        text += rgb(ORANGE, f" · {pair.get('first')} → {pair.get('later')} {pair.get('actionTaken')} {files}"[:100])
    return text


def system_model() -> dict:
    try:
        load1 = round(os.getloadavg()[0], 1)
    except OSError:
        load1 = None
    disk = os.statvfs("/")
    free_pct = round(100 * disk.f_bavail / disk.f_blocks, 1)
    mem_pct = None
    try:
        info = dict(line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines())
        total, avail = int(info["MemTotal"].split()[0]), int(info["MemAvailable"].split()[0])
        mem_pct = round(100 * avail / total)
    except (OSError, KeyError, ValueError):
        pass
    return {"load1": load1, "cores": os.cpu_count() or 1, "diskFreePct": free_pct, "memAvailPct": mem_pct}


# ---------------------------------------------------------------- rendering

def rgb(color, text, bold=False):
    r, g, b = color
    return f"\x1b[{'1;' if bold else ''}38;2;{r};{g};{b}m{text}\x1b[0m"


def visible(text: str) -> int:
    return len(ANSI.sub("", text))


def clip(text: str, width: int) -> str:
    """Clip by visible width, keeping ANSI sequences balanced."""
    out, seen = [], 0
    for token in re.split(r"(\x1b\[[0-9;]*[A-Za-z])", text):
        if token.startswith("\x1b"):
            out.append(token)
            continue
        room = width - seen
        if room <= 0:
            continue
        if len(token) > room:
            out.append(token[: max(0, room - 1)] + "…")
            seen = width
        else:
            out.append(token)
            seen += len(token)
    return "".join(out) + "\x1b[0m"


def pad(text: str, width: int) -> str:
    return clip(text, width) + " " * max(0, width - visible(clip(text, width)))


def age(stamp: str | None, now: datetime) -> str:
    if not stamp:
        return "never"
    try:
        then = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return "?"
    seconds = int((now - then).total_seconds())
    if seconds < 0:
        return "in " + dur(-seconds)
    return dur(seconds) + " ago"


def dur(seconds: int) -> str:
    seconds = max(0, int(seconds))
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    if seconds < 86400:
        return f"{seconds // 3600}h{(seconds % 3600) // 60:02d}m"
    return f"{seconds // 86400}d{(seconds % 86400) // 3600}h"


def attribution_label(value: dict) -> str:
    category, origin_category = value.get("category"), value.get("originCategory")
    origin, final = value.get("originProvider"), value.get("finalProvider")
    if category == "autonomous-created":
        label = f"autonomous {origin}"
    elif category == "cross-provider-handoff":
        label = f"autonomous {origin}→{final} handoff"
    elif category == "cross-provider-finalizer":
        base = "manual Codex app" if origin_category == "manual-codex-app-created" else \
            "old codex/* landed later" if origin_category == "old-codex-branch-landed-later" else \
            f"autonomous {origin or '?'}"
        label = f"{base} · {final} finalizer"
    elif category == "manual-codex-app-created":
        label = "manual Codex app"
    elif category == "old-codex-branch-landed-later":
        label = "old codex/* landed later"
    else:
        label = category or "unattributed"
    reviews = sorted({role["provider"] for role in value.get("roles", []) if role["category"] == "review-only"})
    return label + (f" · {','.join(reviews)} review-only" if reviews else "")


def section(title: str, width: int, color=DIM) -> str:
    return rgb(color, f"┌─ {title} " + "─" * max(0, width - visible(title) - 5) + "┐", bold=True)


def closer(width: int) -> str:
    return rgb(DIM, "└" + "─" * (width - 2) + "┘")


def render(model: dict, width: int = 160, height: int = 45) -> list[str]:
    now = utcnow()
    local, linear, github, system = model["local"], model["linear"], model["github"], model["system"]
    lines: list[str] = []
    titles = {}
    for pr in github.get("open", []):
        titles[f"PR{pr['number']}"] = pr["title"]
    titles.update(linear.get("active", {}))

    # header
    gh_note = (f"GitHub {github['rate']['graphql']}/5000" if github.get("rate") else
               "GitHub " + rgb(RED, github.get("errors", {}).get("rate", "unread")))
    linear_note = "Linear ok" if linear.get("ok") else "Linear " + rgb(RED, linear.get("error", "unread"))
    stale_flags = []
    if github.get("fetchedAt") and (now - datetime.fromisoformat(github["fetchedAt"])).total_seconds() > 3 * REFRESH_REMOTE_S:
        stale_flags.append("github stale " + age(github["fetchedAt"], now))
    if linear.get("fetchedAt") and (now - datetime.fromisoformat(linear["fetchedAt"])).total_seconds() > 3 * REFRESH_REMOTE_S:
        stale_flags.append("linear stale " + age(linear["fetchedAt"], now))
    release = local.get("release") or "unknown-release"
    hud_state = rgb(GREEN, "hud=release") if local.get("releaseMatchesHud") else rgb(ORANGE, "hud≠release (restarting)")
    tick = local.get("tick") or {}
    tick_age = age(tick.get("at"), now)
    tick_note = rgb(RED, f"tick {tick_age} ✕ {tick['error'][:40]}") if tick.get("error") else \
        rgb(ORANGE if tick_age not in ("never",) and "m" in tick_age and int(tick_age.split("m")[0].split("h")[-1] or 0) >= 5 else DIM, f"tick {tick_age}")
    left = rgb(WHITE, "● JOVIE · SYMPHONY", bold=True) + rgb(DIM, f" · lanes {release} on {local['host']} · {hud_state} · ") + tick_note
    right = f"{gh_note} · {linear_note}" + ("" if not stale_flags else " · " + rgb(ORANGE, "; ".join(stale_flags))) + rgb(DIM, f" · {now:%H:%M:%S}Z")
    lines.append(pad(left + " " * max(1, width - visible(left) - visible(right)) + right, width))

    # active slots
    workers = local["workers"]
    busy = [w for w in workers if w["run"]]
    total_slots = sum(local["slots"].values())
    per = " · ".join(f"{name} {sum(1 for w in busy if w['provider'] == name)}/{count}" for name, count in local["slots"].items())
    lines.append(section(f"ACTIVE SLOTS · {len(busy)} running / {total_slots} ({per}) · gate seats {local['gateSeats']}", width))
    rows_budget = max(3, min(total_slots, height - 30))
    shown = 0
    for name, count in local["slots"].items():
        mine = [w for w in workers if w["provider"] == name]
        for index in range(count):
            if shown >= rows_budget:
                break
            worker = mine[index] if index < len(mine) else None
            if worker and worker["run"]:
                run = worker["run"]
                title = titles.get(run["target"]) or titles.get(run["target"].replace("PR", "PR")) or rgb(DIM, "title not in current GitHub/Linear read")
                kind = {"issue": "issue", "adopt": "gate", "fix": "fix-red"}[run["kind"]]
                phase = run.get("phase", "?")
                color = PURPLE if phase.startswith("agent") else BLUE if phase == "gate" else GREEN if phase == "landing" else FG
                shown_title = clip(title, 62)
                shown_title += " " * (62 - visible(shown_title))
                elapsed = age(run["startedAt"], now).replace(" ago", "")
                text = (rgb(GREEN, "● ") + rgb(FG, f"{name:<6} ", bold=True) + rgb(WHITE, f"{run['target']:<10}") + " " + shown_title
                        + rgb(DIM, f"  {kind:<7} ") + rgb(color, f"{phase:<14}") + rgb(DIM, f" {elapsed}"))
            elif worker:
                text = rgb(DIM, "○ ") + rgb(FG, f"{name:<6} ") + rgb(DIM, "worker polling · " + pool_hint(name, local))
            else:
                text = rgb(DIM, "○ ") + rgb(FG, f"{name:<6} ") + rgb(DIM, "vacant · " + vacancy_hint(name, local, linear))
            lines.append(pad("│ " + text, width - 1) + rgb(DIM, "│"))
            shown += 1
    lines.append(closer(width))

    # Perishable capacity: the exact receipt Ovi consumes, with no HUD-side forecast math.
    accounts = local["codex"]
    capacity = (local.get("doctor") or {}).get("capacity")
    if capacity and capacity.get("schema") == "jovie.capacity-horizon/v1":
        incidents = capacity.get("incidents") or []
        lines.append(pad(rgb(FG, "CAPACITY HORIZON  ", bold=True) +
                         rgb(RED if incidents else DIM,
                             f"{len(capacity.get('leases') or [])} leases · {len(incidents)} incident(s) · show-only"), width))
        for row in (capacity.get("leases") or [])[:4]:
            remaining = "?" if row.get("usableRemaining") is None else f"{row['usableRemaining']:g}%"
            banked = "?" if row.get("bankedCount") is None else str(row["bankedCount"])
            event = row.get("event") or {}
            deadline = "?" if event.get("countdownSeconds") is None else dur(event["countdownSeconds"])
            forecast = row.get("forecast") or {}
            unused = "?" if forecast.get("projectedUnused") is None else f"{forecast['projectedUnused']:g}%"
            drain = forecast.get("completionP50At") or "?"
            rate = "?" if forecast.get("sustainablePercentPerHour") is None else f"{forecast['sustainablePercentPerHour']:g}%/h"
            route = row.get("route") or {}
            job = route.get("selectedJob") or "no selected job"
            mode = str(row.get("mode") or "unknown").upper()
            freshness = row.get("freshness") or {}
            detail = (f"{row.get('alias', '?')} {remaining} · banked {banked} · {event.get('label', 'source gap')} "
                      f"{deadline} · drain {drain} @ {rate} · unused {unused} · coverage {len(forecast.get('qualifiedWork') or [])} · {mode} · {job} · {freshness.get('status', 'unknown')}")
            lines.append(pad("  " + rgb(RED if mode == "EMERGENCY" else ORANGE if mode == "FAST" else GREEN, detail), width))
        blocker = capacity.get("topBlocker") or "no material blocker"
        lines.append(pad("  " + rgb(RED if incidents else DIM, f"top blocker: {blocker}"), width))
    elif accounts.get("error"):
        lines.append(pad(rgb(FG, "CODEX ACCOUNTS  ", bold=True) + rgb(RED, accounts["error"]), width))
    else:
        parts = []
        for name, row in accounts.get("accounts", {}).items():
            remaining = "?" if row.get("remainingPercent") is None else f"{row['remainingPercent']}%"
            reset = "?" if row.get("naturalResetInS") is None else dur(row["naturalResetInS"])
            banked = "?" if row.get("bankedResetCount") is None else str(row["bankedResetCount"])
            detail = f"{name} {remaining} left · reset {reset} · banked {banked}"
            if row["leased"]:
                parts.append(rgb(PURPLE, f"● {detail} · leased"))
            elif row["available"]:
                parts.append(rgb(GREEN, f"✓ {detail}"))
            else:
                parts.append(rgb(RED, f"✕ {detail} · retry {dur(row['resetsInS'])}"))
        summary = f"{len(accounts.get('available', []))}/{accounts.get('count', 0)} available"
        lines.append(pad(rgb(FG, "CODEX ACCOUNTS  ", bold=True) + rgb(DIM, summary), width))
        for part in parts or [rgb(DIM, "no ChatGPT profiles found")]:
            lines.append(pad("  " + part, width))

    # pipeline
    open_prs = github.get("open", [])
    queue = github.get("queue", {})
    queued = {e["number"]: e for e in queue.get("entries", [])}
    head = f"PIPELINE · open lane PRs {len(open_prs)} · draft {sum(1 for p in open_prs if p['draft'])} · ready {sum(1 for p in open_prs if not p['draft'])} · merge queue {queue.get('depth', rgb(RED, github.get('errors', {}).get('queue', 'unread')))}"
    if "open" in github.get("errors", {}):
        head += " · " + rgb(RED, "PR list: " + github["errors"]["open"])
    lines.append(rgb(FG, head, bold=True))
    pipeline_budget = max(4, height - len(lines) - 15)
    merge_colors = {"CLEAN": GREEN, "UNSTABLE": ORANGE, "BLOCKED": ORANGE, "DIRTY": RED, "BEHIND": DIM, "HAS_HOOKS": DIM, "UNKNOWN": DIM}
    for pr in open_prs[:pipeline_budget]:
        merge = pr.get("merge") or "UNKNOWN"
        check_text = rgb(merge_colors.get(merge, DIM), f"{merge.lower():<8}")
        held = local["held"].get(str(pr["number"]))
        note = ""
        if pr["number"] in queued:
            note = rgb(GREEN, f"in queue {queued[pr['number']]['state'].lower()} {age(queued[pr['number']]['enqueuedAt'], now).replace(' ago', '')}")
        elif pr["merge"] == "DIRTY":
            note = rgb(RED, "merge conflict")
        elif held:
            evidence = (held.get("evidence") or ["gate"])[0].replace("bash scripts/hooks/", "")
            note = rgb(ORANGE, "held: " + evidence[:48])
        elif pr["draft"]:
            note = rgb(DIM, "draft · awaiting gate")
        elif pr["merge"] == "BLOCKED":
            note = rgb(ORANGE, "ready · blocked by checks")
        else:
            note = rgb(DIM, pr["merge"].lower())
        state = rgb(DIM, "DRAFT") if pr["draft"] else rgb(GREEN, "READY")
        number, lane_name, issue_id = rgb(WHITE, "#" + str(pr["number"])), rgb(DIM, f"{pr['lane']:<6}"), f"{pr['issue']:<9}"
        title = clip(pr["title"], 58)
        title += " " * (58 - visible(title))
        lines.append(pad(f" {number} {lane_name} {issue_id} {title} {state} {check_text}  {note}", width))
    if len(open_prs) > pipeline_budget:
        lines.append(rgb(DIM, f" … {len(open_prs) - pipeline_budget} more"))

    # recently merged
    merged = github.get("merged24h", [])
    attribution_receipts = local.get("attributionReceipts") or []
    attributions = {m["number"]: lane.pr_attribution(m, attribution_receipts) for m in merged}
    autonomous = sum(value.get("origin") == lane.AUTONOMOUS_ORIGIN for value in attributions.values())
    manual_codex = sum(value.get("originCategory") == "manual-codex-app-created" for value in attributions.values())
    old_codex = sum(value.get("originCategory") == "old-codex-branch-landed-later" for value in attributions.values())
    lines.append(rgb(FG, f"RECENTLY MERGED · autonomous {autonomous} · manual Codex app {manual_codex} · "
                     f"old codex/* {old_codex} · total {len(merged)} in 24h · last lane gate {age(local.get('lastLanding'), now)}", bold=True)
                 + ("" if "merged" not in github.get("errors", {}) else "  " + rgb(RED, github["errors"]["merged"])))
    for m in merged[:3]:
        label = attribution_label(attributions[m["number"]])
        lines.append(pad(f" {rgb(GREEN, '✓')} #{m['number']} {clip(m['title'], 90)} "
                         f"{rgb(DIM, label + ' · ' + age(m['mergedAt'], now))}", width))

    lines.append(promotion_line(github.get("promotion")))
    lines.append(file_overlap_line(local.get("doctor", {}).get("fileOverlap") or {}))

    # needs attention
    ledger = local["ledger24h"]
    attention = []
    for key, text in local.get("doctor", {}).get("alerts", {}).items():
        attention.append(rgb(RED, f"✕ {key}: {text}"))
    if local["cooldowns"]:
        attention.append(rgb(ORANGE, "cooldown " + ", ".join(f"{k} {dur(v)}" for k, v in local["cooldowns"].items())))
    if local["requeue"]:
        attention.append(rgb(ORANGE, f"requeue pending #{', #'.join(local['requeue'])}"))
    if ledger.get("failed"):
        attention.append(rgb(RED, f"failed runs 24h {ledger['failed']}"))
    if ledger.get("gate-timeout"):
        attention.append(rgb(ORANGE, f"gate timeouts 24h {ledger['gate-timeout']}"))
    escalation = local.get("doctor", {}).get("escalation") or {}
    if escalation.get("escalating") or escalation.get("ladder_exhausted") or escalation.get("surfaced"):
        attention.append(rgb(ORANGE, f"escalation {escalation.get('escalating', 0)} "
                                     f"exhausted {escalation.get('ladder_exhausted', 0)} "
                                     f"surfaced {len(escalation.get('surfaced') or [])}"))
    if not attention:
        attention.append(rgb(GREEN, "✓ nothing needs a human"))
    lines.append(rgb(FG, "NEEDS ATTENTION  ", bold=True) + rgb(DIM, f"held {len(local['held'])} · failures {len(local['failures'])} · ") + " · ".join(attention[:4]))
    throughput = lane.provider_throughput(local.get("receipts24h") or [], local.get("providers") or {}, merged,
                                          attribution_receipts=attribution_receipts)
    provider_parts = []
    for provider, metric in throughput["providers"].items():
        first_pass = metric["firstPassGreenRate"]
        provider_parts.append(f"{provider} offer {metric['eligibleWorkOffered']} start {metric['workerStarts']} "
                              f"productive {metric['productiveRuns']} PR {metric['prsCreated']} "
                              f"first-pass {'n/a' if first_pass is None else f'{round(first_pass * 100)}%'} "
                              f"repair {metric['remediationRuns']} landed {metric['landedOutput']}")
    counts = " · ".join(f"{k} {v}" for k, v in sorted(ledger.items(), key=lambda item: str(item[0]))) or "no runs"
    lines.append(rgb(DIM, f"  24h verdicts: {counts}"))
    lines.append(rgb(DIM, "  THROUGHPUT 24h · " + " | ".join(provider_parts)))

    # backlog
    for name in local["slots"]:
        lines.append(rgb(FG, f"NEW ISSUES {name}  ", bold=True) + rgb(DIM, pool_hint(name, local)))
    if linear.get("ok"):
        pool = linear["pool"]
        backlog = " · ".join(f"{label} {pool.get(label, 0)}" for label in LANE_LABELS)
        lines.append(rgb(FG, "BACKLOG  ", bold=True) + rgb(DIM, f"Todo candidates {linear['poolTotal']} ({backlog}) · in progress {len(linear['active'])} · triage returns {linear['triage']}"))
    else:
        lines.append(rgb(FG, "BACKLOG  ", bold=True) + rgb(RED, "Linear unavailable: " + linear.get("error", "?")))

    # system
    cores = system["cores"]
    load = system["load1"]
    disk_color = RED if system["diskFreePct"] < 10 else ORANGE if system["diskFreePct"] < 20 else GREEN
    lines.append(rgb(FG, "SYSTEM  ", bold=True) + rgb(DIM, f"load {load if load is not None else '?'} / {cores} cores · mem {system['memAvailPct']}% free · ")
                 + rgb(disk_color, f"disk {system['diskFreePct']}% free") + rgb(DIM, f" · runs 24h {local['runs24h']}"))
    lines.append(rgb(DIM, "Sources: lane state + run logs (this host) · runs/ledger · Linear · GitHub · /proc | ✓ ok  ✕ problem  ○ idle  ● running"))

    lines = [pad(line, width) for line in lines[:height]]
    while len(lines) < height:
        lines.append(" " * width)
    return lines


def pool_hint(name: str, local: dict) -> str:
    feed = local.get("doctor") or {}
    admission = feed.get("admission") or {}
    try:
        stamp = datetime.fromisoformat(feed["at"].replace("Z", "+00:00"))
        elapsed = (utcnow() - stamp).total_seconds()
        if elapsed < 0 or elapsed > 3 * REFRESH_REMOTE_S:
            return "new issues unknown (doctor stale)"
    except (KeyError, TypeError, ValueError):
        return "new issues unknown (doctor unread)"
    if admission.get("error"):
        return "new issues unknown (" + admission["error"] + ")"
    qualified = (admission.get("poolByProvider") or {}).get(name)
    candidates = (admission.get("candidatePoolByProvider") or {}).get(name)
    budget = (admission.get("newIssueBudgetByProvider") or {}).get(name)
    eligible = (admission.get("eligiblePoolByProvider") or {}).get(name)
    if not budget:
        return "new issues unknown (PR budget unread)"
    if budget.get("reason") == "pr-inventory-unavailable":
        return f"new issues unknown (PR inventory unread) · eligible {eligible}/{candidates}"
    if qualified is None or candidates is None or eligible is None:
        return "new issues unknown (admission unread)"
    reasons = (admission.get("rejectedByProvider") or {}).get(name) or {}
    distribution = ", ".join(f"{reason} {count}" for reason, count in sorted(reasons.items()))
    capacity = f"PRs {budget['used']}/{budget['cap']} {budget['reason']}"
    return f"new issues {qualified} · eligible {eligible}/{candidates} · {capacity}" + (" · " + distribution if distribution else "")


def vacancy_hint(name: str, local: dict, linear: dict) -> str:
    if name in local["cooldowns"]:
        return f"provider cooling {dur(local['cooldowns'][name])}"
    if name == "codex" and not local["codex"].get("available"):
        return "no codex account available"
    return "no worker (timer restarts idle lanes each minute) · " + pool_hint(name, local)


# ---------------------------------------------------------------- loop

class Remote(threading.Thread):
    def __init__(self, host):
        super().__init__(daemon=True)
        self.host, self.linear, self.github = host, {"ok": False, "error": "not read yet"}, {"ok": False, "errors": {"open": "not read yet"}}

    def run(self):
        while True:
            targets = [w["run"]["target"] for w in running_workers(self.host.state) if w["run"]]
            self.linear = linear_model(self.host.linear_env, targets)
            self.github = github_model()
            time.sleep(REFRESH_REMOTE_S)


def build_model(host, remote: Remote | None = None) -> dict:
    local = local_model(host)
    targets = [w["run"]["target"] for w in local["workers"] if w["run"]]
    return {"local": local,
            "linear": remote.linear if remote else linear_model(host.linear_env, targets),
            "github": remote.github if remote else github_model(),
            "system": system_model()}


def current_hud(host) -> Path | None:
    candidate = host.state / "current" / "hud.py"
    try:
        return candidate.resolve() if candidate.exists() else None
    except OSError:
        return None


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--width", type=int)
    parser.add_argument("--height", type=int)
    parser.add_argument("--interval", type=float, default=2.0)
    args = parser.parse_args(argv)
    host = lane.Host()
    lane.load_github_env()
    if args.json:
        print(json.dumps(build_model(host), indent=1, default=str))
        return 0
    size = os.get_terminal_size() if sys.stdout.isatty() else os.terminal_size((160, 45))
    width, height = args.width or size.columns, args.height or size.lines
    if args.once:
        sys.stdout.write("\n".join(render(build_model(host), width, height)) + "\n")
        return 0
    remote = Remote(host)
    remote.start()
    sys.stdout.write("\x1b[?25l\x1b[2J")
    try:
        while True:
            newer = current_hud(host)
            if newer and newer != Path(__file__).resolve():
                sys.stdout.write("\x1b[?25h")
                sys.stdout.flush()
                os.execv(sys.executable, [sys.executable, str(newer), *sys.argv[1:]])
            frame = render(build_model(host, remote), width, height)
            sys.stdout.write("\x1b[H" + "\n".join(line + "\x1b[K" for line in frame))
            sys.stdout.flush()
            try:
                (host.state / "hud.heartbeat").touch()  # the doctor raises hud-stale when this stops
            except OSError:
                pass
            time.sleep(args.interval)
    finally:
        sys.stdout.write("\x1b[?25h")


if __name__ == "__main__":
    sys.exit(main())
