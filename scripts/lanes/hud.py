#!/usr/bin/env python3
"""Symphony HUD: the lanes' own truth on the Gem console (tty1), 160x45 by default.

  hud.py                 # loop: redraw every 2s, Linear mirror + production every 90s, GitHub every 5m
  hud.py --once          # one frame to stdout (smoke test, screenshots)
  hud.py --json          # the model the frame is rendered from

Geometry (measured 2026-10-20): Gem drives the Samsung C34J79x (3440x1440, 21:9) at a
1280x720 CRTC mode; the 8x16 PSF console font makes tty1 160x45 cells.

Every cell is sourced: lane state files and run logs on this host, the ledger, the doctor's
lanes-status feed, Linear (Todo pool, in-progress lane issues), GitHub (open lane PRs, checks,
merge queue, recently merged), the served production build and the OS. A source that fails
renders its reason, never a blank or a zero. The HUD rides the lanes release: when `current`
moves, it re-execs the new hud.py.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import select
import subprocess
import sys
import threading
import termios
import tty
import time
import urllib.request
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
merge_evidence = _load("merge_evidence")

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
# The office display needs GitHub in minutes, not seconds: at 90 s the HUD alone spent ~245 gh
# calls an hour (one PR listing per lane, the merge window, the queue) on the lanes host's
# budget (2026-10-12 gh ledger). Linear reads the free local mirror and keeps the 90 s cadence.
REFRESH_GITHUB_S = 300
# JOV-6836: promotion-loss metrics take ~25 s of GitHub reads; refresh them far less often.
PROMOTION_SCRIPT = HERE.parent / "promotion-loss-metrics.mjs"
PROMOTION_EVERY_S = 900
_promotion: dict = {"at": 0.0, "data": None}
# The served production generation (scripts/lib/validation-sync.mjs reads the same endpoint)
# and its Production Verified marker artifacts, read at most once per new served build.
PROD_VERSION_URL = "https://jov.ie/api/version"
VERIFIED_MARKERS = ("production-generation-verified-{sha}", "production-generation-verified-recovery-{sha}")
SERVED_BUILDS = "hud-served-builds.json"
_markers: dict[str, dict] = {}
STATUS_SCHEMA = "symphony-lanes-status/v1"
STATUS_SCHEMA = "symphony-lanes-status/v1"
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


_FILES: dict[str, tuple] = {}


def read_json_cached(path: Path, default=None):
    """Parse a state file again only when it changed (lanes-status.json is ~280 KB)."""
    try:
        stat = path.stat()
    except OSError:
        _FILES.pop(str(path), None)
        return default
    key = (stat.st_mtime_ns, stat.st_size)
    cached = _FILES.get(str(path))
    if cached and cached[0] == key:
        return cached[1]
    value = read_json(path, default)
    _FILES[str(path)] = (key, value)
    return value


_LEDGERS: dict[str, dict] = {}


def ledger_rows(state: Path) -> list[dict]:
    """Every receipt, parsed once. The ledger is append-only, so a refresh reads only the bytes
    appended since the last one: reparsing the 42 MB ledger every 2 s held a core at 60%
    (Gem, 2026-10-20). A replaced or truncated file is read again from the start."""
    path = state / "runs" / "ledger.jsonl"
    try:
        handle = open(path, "rb")
    except OSError:
        _LEDGERS.pop(str(path), None)
        return []
    with handle:
        stat = os.fstat(handle.fileno())
        entry = _LEDGERS.get(str(path))
        if entry is None or entry["id"] != (stat.st_dev, stat.st_ino) or stat.st_size < entry["offset"]:
            entry = {"id": (stat.st_dev, stat.st_ino), "offset": 0, "rows": []}
            _LEDGERS[str(path)] = entry
        if stat.st_size > entry["offset"]:
            handle.seek(entry["offset"])
            chunk = handle.read(stat.st_size - entry["offset"])
            end = chunk.rfind(b"\n") + 1  # a half-written last line waits for its newline
            for line in chunk[:end].splitlines():
                try:
                    receipt = json.loads(line)
                except ValueError:
                    continue
                if isinstance(receipt, dict):
                    entry["rows"].append(receipt)
            entry["offset"] += end
    return entry["rows"]


def local_model(host) -> dict:
    state = host.state
    providers = lane.load_providers()
    enabled = {name: spec for name, spec in providers.items() if spec.get("enabled", True)}
    slots = {name: host.slots(name, spec.get("slots", 1)) for name, spec in enabled.items()}
    base_reader = getattr(host, "base_slots", None)
    base_slots = ({name: base_reader(name, spec.get("slots", 1)) for name, spec in enabled.items()}
                  if base_reader else dict(slots))
    doctor = read_json_cached(state / "doctor.json", {})
    held = read_json(state / "held.json", None)
    # The console unit has its own environment. Dispatcher observations carry the
    # effective host overrides and autoscaler result; HUD defaults are not capacity.
    slot_evidence = dispatcher_slots(doctor, enabled)
    if slot_evidence is not None:
        slots, base_slots = slot_evidence
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
        "providers": enabled, "slots": slots, "baseSlots": base_slots,
        "slotEvidence": "fresh-dispatcher" if slot_evidence is not None else "unknown",
        "autoscaleMode": lane.autoscale.mode(), "workers": running_workers(state),
        "ledger24h": dict(verdicts), "runs24h": len(receipts),
        "receipts24h": receipts, "attributionReceipts": all_receipts,
        "lastLanding": landed[0].get("endedAt") if landed else None,
        "held": held if isinstance(held, dict) else {},
        "heldError": None if isinstance(held, dict) else "held.json unavailable or invalid", "failures": read_json(state / "failures.json", {}),
        "gateTimeouts": read_json(state / "gate-timeouts.json", {}), "requeue": read_json(state / "requeue.json", {}),
        "cooldowns": cooldowns, "codex": accounts, "doctor": doctor,
        # The doctor's published status feed: delivery, merge throughput, SLOs, PR repair
        # demand and liveness conditions with owners. Absent on a non-primary host.
        "feed": read_json_cached(state / "lanes-status.json", None),
        "tick": read_json(state / "tick.json", {}),
        "gateSeats": host.gate_slots, "generatedAt": utcnow().isoformat(),
    }



def dispatcher_slots(doctor: dict, providers: dict, now: datetime | None = None):
    """Use a complete fresh native census; unknown must never become default seats."""
    now = utcnow() if now is None else now
    try:
        age_s = (now - datetime.fromisoformat(doctor["at"].replace("Z", "+00:00"))).total_seconds()
        rows = doctor["observed"]["capacityByProvider"]
        if not 0 <= age_s <= 3 * REFRESH_REMOTE_S:
            return None
        slots, bases = {}, {}
        for name in providers:
            row = rows[name]
            count, base = row["slots"], row["base"]
            if type(count) is not int or type(base) is not int or min(count, base) < 0:
                return None
            slots[name], bases[name] = count, base
        return slots, bases
    except (KeyError, TypeError, ValueError, AttributeError):
        return None


def read_text(path: Path) -> str:
    try:
        return path.read_text().strip()
    except OSError:
        return ""


def linear_model(env_file: Path, in_flight: list[str] = ()) -> dict:
    """Pool counts, triage returns and the titles of the issues this host is working, read
    from the local Linear mirror: the HUD spends no Linear request (2026-10-11)."""
    try:
        state = lane.lane_state_dir()
        if state is None:
            raise RuntimeError("no lanes state dir")
        mirror = lane.linear_sync.read_mirror(state, "JOV")
        view = lane.linear_sync.status(state)
    except Exception as error:
        return {"ok": False, "error": f"{type(error).__name__}: {error}"[:100]}
    rows = list((mirror.get("issues") or {}).values())
    todo = lane.linear_sync.todo(state, "JOV")
    pool = Counter(label for row in todo for label in row["labels"] if label in LANE_LABELS)
    wanted = set(in_flight)
    active = {row["identifier"]: row["title"] for row in rows if row["identifier"] in wanted}
    triage = sum(1 for row in rows if row["state"] == "Triage" and set(row["labels"]) & set(LANE_LABELS))
    jov = view["mirror"]["JOV"]
    synced = mirror.get("syncedAt")
    return {"ok": synced is not None, "error": "mirror filling", "pool": dict(pool), "poolTotal": len(todo),
            "active": active, "triage": triage, "mirrorAgeS": jov["ageS"], "outbox": view["outbox"]["depth"],
            "fetchedAt": datetime.fromtimestamp(synced, timezone.utc).isoformat() if synced else None}


def gh_json(args: list[str], timeout: int = 40):
    result = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout).strip().splitlines()[-1][:100] if (result.stderr or result.stdout).strip() else f"gh exit {result.returncode}")
    return json.loads(result.stdout or "null")


def github_model() -> dict:
    lane.load_github_env()
    model: dict = {"ok": True, "errors": {}, "readAt": {}}
    try:
        open_at = utcnow().isoformat()
        prs = []
        for name, spec in lane.load_providers().items():
            if not spec.get("enabled", True):
                continue
            # One small page per lane: a single 100-PR page with check rollups times out (504).
            # No statusCheckRollup: with dozens of open lane PRs that field makes GitHub 504.
            page = gh_json(["pr", "list", "--repo", lane.REPO_SLUG, "--state", "open", "--limit", "60",
                            "--search", f"head:{name}/", "--json",
                            "number,title,headRefName,headRefOid,isDraft,mergeStateStatus,updatedAt,url"])
            if not isinstance(page, list) or len(page) >= 60:
                raise RuntimeError(f"open PR inventory incomplete for {name} (page limit 60)")
            prs += page
        rows = []
        for pr in prs:
            found = lane.LANE_BRANCH.match(pr["headRefName"])
            if not found:
                continue
            rows.append({"number": pr["number"], "title": pr["title"], "lane": found.group("lane"),
                         "issue": found.group("issue").upper(), "draft": pr["isDraft"], "merge": pr["mergeStateStatus"],
                         "updatedAt": pr["updatedAt"], "headRefOid": pr.get("headRefOid")})
        model["open"] = sorted(rows, key=lambda r: r["updatedAt"], reverse=True)
        model["readAt"]["open"] = open_at
    except Exception as error:
        model["errors"]["open"] = f"{type(error).__name__}: {error}"[:100]
    try:
        until = utcnow().timestamp()
        state = lane.lane_state_dir()
        evidence = merge_evidence.collect_shared(lane.REPO_SLUG, until - 86400, until,
                                                 state / "merge-window.json" if state else None)
        model["mergedWindow"] = {k: v for k, v in evidence.items() if k != "prs"}
        merged = merge_evidence.require_complete(evidence)
        source_until = evidence["window"]["until"]
        if type(source_until) not in (int, float) or not 0 < source_until <= until:
            raise ValueError("merge window source age unknown")
        model["merged24h"] = [{"number": m["number"], "title": m["title"], "mergedAt": m["mergedAt"],
                               "createdAt": m["createdAt"], "headRefName": m["headRefName"],
                               "headRefOid": m.get("headRefOid"), "mergeCommit": m.get("mergeCommit"),
                               "url": m.get("url"), "author": m.get("author"), "mergedBy": m.get("mergedBy"),
                               "lane": (lambda found: found.group("lane") if found else None)(lane.LANE_BRANCH.match(m["headRefName"]))}
                              for m in sorted(merged, key=lambda m: m["mergedAt"], reverse=True)]
        # A shared cache preserves its original window end; reading it cannot renew it.
        model["readAt"]["merged"] = datetime.fromtimestamp(source_until, timezone.utc).isoformat()
    except Exception as error:
        model["errors"]["merged"] = f"{type(error).__name__}: {error}"[:100]
    try:
        queue_at = utcnow().isoformat()
        queue = gh_json(["api", "graphql", "-f", 'query={ repository(owner:"JovieInc", name:"Jovie"){ mergeQueue(branch:"main"){ '
                         'entries(first:20){ totalCount nodes { pullRequest { number } state enqueuedAt } } } } }'])
        entries = queue["data"]["repository"]["mergeQueue"]["entries"]
        if len(entries["nodes"]) != entries["totalCount"]:
            raise RuntimeError("merge queue inventory incomplete (page limit 20)")
        model["queue"] = {"depth": entries["totalCount"],
                          "entries": [{"number": e["pullRequest"]["number"], "state": e["state"], "enqueuedAt": e["enqueuedAt"]}
                                      for e in entries["nodes"]]}
        model["readAt"]["queue"] = queue_at
    except Exception as error:
        model["errors"]["queue"] = f"{type(error).__name__}: {error}"[:100]
    try:
        rate_at = utcnow().isoformat()
        limits = gh_json(["api", "rate_limit"])
        budget = lane.graphql_budget()
        if budget is None:
            raise RuntimeError("GraphQL rateLimit unreadable")
        model["rate"] = {"core": limits["resources"]["core"]["remaining"], "graphql": budget[0], "resetAt": budget[1]}
        model["readAt"]["rate"] = rate_at
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


def served_build(url: str = PROD_VERSION_URL, opener=urllib.request.urlopen) -> str:
    """The commit production serves, with a bounded timeout and one transport retry."""
    failure = None
    for _attempt in range(2):
        try:
            request = urllib.request.Request(url, headers={"Cache-Control": "no-cache",
                                                           "User-Agent": "jovie-symphony-hud"})
            with opener(request, timeout=5) as response:
                build = str(json.loads(response.read(4096)).get("buildId") or "").lower()
            break
        except (OSError, ValueError, AttributeError) as error:
            failure = error
    else:
        raise RuntimeError(f"production version unread ({type(failure).__name__})")
    if not re.fullmatch(r"[0-9a-f]{7,40}", build):
        raise RuntimeError(f"production build id {build or 'missing'} is not a commit")
    return build


def verified_marker(sha: str, now: float, gh=None) -> dict:
    """Whether a Production Verified marker artifact exists for this exact served commit.
    A verified answer is final; pending or unread is asked again once per GitHub interval."""
    cached = _markers.get(sha)
    if cached and (cached["status"] == "verified" or now - cached["checkedAt"] < REFRESH_GITHUB_S):
        return cached
    gh = gh or gh_json
    try:
        found = None
        for template in VERIFIED_MARKERS:
            name = template.format(sha=sha)
            page = gh(["api", f"repos/{lane.REPO_SLUG}/actions/artifacts?name={name}&per_page=20"])
            rows = page.get("artifacts") if isinstance(page, dict) else None
            if not isinstance(rows, list):
                raise RuntimeError("malformed Production Verified marker listing")
            found = next((row for row in rows if isinstance(row, dict) and row.get("expired") is False
                          and row.get("name") == name
                          and (row.get("workflow_run") or {}).get("head_branch") == "main"), None)
            if found:
                break
        result = {"status": "verified" if found else "pending", "at": found.get("created_at") if found else None,
                  "checkedAt": now, "error": None}
    except Exception as error:
        result = {"status": "unknown", "at": None, "checkedAt": now, "error": f"{type(error).__name__}: {error}"[:80]}
    _markers[sha] = result
    return result


def merge_oid(pr: dict) -> str | None:
    commit = pr.get("mergeCommit")
    oid = commit.get("oid") if isinstance(commit, dict) else commit
    return oid.lower() if isinstance(oid, str) and re.fullmatch(r"[0-9a-fA-F]{40}", oid) else None


def served_builds(path: Path | None, build: str, now: float) -> list[dict]:
    """Served-build changes this HUD has observed (its deploys/h source), kept bounded."""
    rows = read_json(path, []) if path else []
    rows = [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []
    if not rows or rows[-1].get("buildId") != build:
        rows = (rows + [{"buildId": build, "seenAt": now}])[-200:]
        if path:
            try:
                scratch = path.with_name(path.name + ".tmp")
                scratch.write_text(json.dumps(rows))
                os.replace(scratch, path)
            except OSError:
                pass  # history is a convenience; the served build itself is still shown
    return rows


def production_model(repo: Path | None, merged: list[dict] | None, history: Path | None = None,
                     fetch=served_build, run=subprocess.run, marker=verified_marker,
                     now: float | None = None) -> dict:
    """Served build vs main, which merged PRs production contains, and its verified marker.
    Ancestry comes from the local lanes clone (refreshed by every update tick), not GitHub."""
    now = time.time() if now is None else now
    model: dict = {"readAt": datetime.fromtimestamp(now, timezone.utc).isoformat(), "error": None, "deployed": {}}

    def git(*args):
        result = run(["git", "-C", str(repo), *args], capture_output=True, text=True, timeout=20)
        return result.stdout.strip() if result.returncode == 0 else None

    try:
        build = fetch()
        model["buildId"] = build
        rows = served_builds(history, build, now)
        model["servedBuilds"] = {"observedSince": rows[0]["seenAt"],
                                 "changes24h": sum(1 for row in rows[1:] if now - float(row.get("seenAt") or 0) <= 86400)}
        if repo is None:
            raise RuntimeError("no lanes repository")
        model["mainSha"] = git("rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}")
        prod = git("rev-parse", "--verify", "--quiet", f"{build}^{{commit}}")
        if not prod:
            raise RuntimeError(f"served build {build[:7]} not in the local clone yet")
        model["prodSha"] = prod
        model["marker"] = marker(prod, now)
        if model["mainSha"]:
            pending = git("rev-list", f"{prod}..{model['mainSha']}")
            recent = git("rev-list", "--since=72 hours ago", model["mainSha"])
            if pending is None or recent is None:
                raise RuntimeError("git ancestry unreadable")
            undeployed, on_main = set(pending.split()), set(recent.split())
            model["behind"] = len(undeployed)
            for pr in merged or []:
                if oid := merge_oid(pr):
                    model["deployed"][oid] = False if oid in undeployed else True if oid in on_main else None
    except Exception as error:
        model["error"] = f"{type(error).__name__}: {error}"[:100]
    return model


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
# tty1's 512-glyph font leaves the Linux console 8 foreground colours with no bright or
# half-bright intensity, so styles use the basic SGR palette. Colour never carries a state
# alone: every state also has a glyph and a word, and red is never paired against green.
# Cyan is the healthy colour (Jovie's ion accent maps to it on the console).
STYLE = {"ok": "36", "warn": "33", "fail": "31", "unknown": "35", "text": "37", "strong": "1;37",
         "label": "7", "ok-bar": "7;36", "warn-bar": "7;33", "fail-bar": "7;31", "unknown-bar": "7;35"}
MARK = {"ok": "✓", "warn": "!", "fail": "✕", "unknown": "?"}
WORD = {"ok": "OK", "warn": "WARN", "fail": "FAIL", "unknown": "UNKNOWN"}
RANK = {"ok": 0, "unknown": 1, "warn": 2, "fail": 3}
# Non-ASCII glyphs the HUD itself draws; all are in tty1's console font (hud-symbols.psf).
CONSOLE_GLYPHS = frozenset("●○✓✕→←↑↓·…│─━┃┌┐└┘├┤┬┴┼▸▲▼■◇█░▒×≠≥≤—–‘’“”•")


def paint(style: str | None, text: str) -> str:
    return f"\x1b[{STYLE[style]}m{text}\x1b[0m" if style else text


def badge(state: str, word: str | None = None) -> str:
    return paint(state, f"{MARK[state]} {WORD[state] if word is None else word}")


def worst(*states: str) -> str:
    return max(states, key=lambda state: RANK[state]) if states else "ok"


def console_text(text) -> str:
    """One console cell per character: controls, emoji and wide glyphs the PSF font lacks
    become '?', so data from titles or errors cannot shift columns or inject escapes."""
    return "".join(char if " " <= char < "\x7f" or "\xa0" <= char <= "ſ" or char in CONSOLE_GLYPHS
                   else " " if char in "\r\n\t" else "?" for char in str(text))


def rgb(color, text, bold=False):
    r, g, b = color
    return f"\x1b[{'1;' if bold else ''}38;2;{r};{g};{b}m{text}\x1b[0m"


def visible(text: str) -> int:
    return len(ANSI.sub("", text))


def clip(text: str, width: int) -> str:
    """Clip by visible width, keeping ANSI sequences balanced."""
    # Provider errors and issue titles can contain line breaks. Keep each model
    # row on one physical row so failures cannot scroll the header off tty1.
    out, seen = [], 0
    for token in re.split(r"(\x1b\[[0-9;]*[A-Za-z])", text):
        if token.startswith("\x1b") and ANSI.fullmatch(token):
            out.append(token)
            continue
        token = console_text(token)
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


def titled(prefix: str, title, width: int) -> str:
    """A row ending in free text: the text is cut at a word boundary, so an ID inside a title
    (`(JOV-7859)`) is shown whole or not at all."""
    room = width - visible(prefix)
    text = console_text(title)
    if len(text) > room:
        cut = text[:max(0, room - 1)]
        if " " in cut and not text[len(cut)].isspace():
            cut = cut[:cut.rindex(" ")]
        text = cut.rstrip() + "…" if room > 0 else ""
    return prefix + text


def fit(parts: list[tuple[int, str]], width: int, sep: str = " · ") -> str:
    """Join (priority, text) parts in order, dropping whole parts, least important first,
    until the row fits. Only a single remaining part is ever clipped, so IDs never break."""
    parts = [(priority, text) for priority, text in parts if text]
    while len(parts) > 1 and visible(sep.join(text for _, text in parts)) > width:
        parts.pop(max(range(len(parts)), key=lambda index: (parts[index][0], index)))
    return clip(sep.join(text for _, text in parts), width)


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


def since(stamp, now: datetime) -> str:
    """Compact elapsed time for fixed-width cells: '42m', '3h05m', '?' when unreadable."""
    elapsed = timestamp_age(stamp, now)
    return "?" if elapsed is None else dur(elapsed)


def num(value, suffix: str = "") -> str:
    if value is None or isinstance(value, bool):
        return "?"
    if isinstance(value, float):
        value = round(value, 1)
        value = int(value) if value == int(value) else value
    return f"{value}{suffix}"


def pct(rate) -> str:
    return "n/a" if not isinstance(rate, (int, float)) or isinstance(rate, bool) else f"{round(rate * 100)}%"


def humanize(reason) -> str:
    return str(reason).replace("-", " ") if reason else "?"


def dig(value, *keys, default=None):
    for key in keys:
        if not isinstance(value, dict):
            return default
        value = value.get(key)
    return default if value is None else value


def attribution_label(value: dict) -> str:
    if value.get("confidence") != "verified":
        method = value.get("shippingMethod") or "unknown"
        return f"{value.get('confidence') or 'unknown'} {method}"
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
    reviews = sorted({role["provider"] for role in value.get("roles", []) if role["category"] == "review"})
    return label + (f" · {','.join(reviews)} review-only" if reviews else "")


def section(title: str, width: int, color=DIM) -> str:
    return rgb(color, f"┌─ {title} " + "─" * max(0, width - visible(title) - 5) + "┐", bold=True)


def closer(width: int) -> str:
    return rgb(DIM, "└" + "─" * (width - 2) + "┘")



TARGET_TITLES = "hud-target-titles.json"
TARGET_ALERTS = "hud-target-alerts.jsonl"
TARGET_TTL_S = 300
TARGET_PR = re.compile(r"^PR(\d+)$")


def fetch_target_titles(numbers: list[int], cache: Path | None, now: float | None = None,
                        fetch=None) -> tuple[dict, str | None]:
    """Titles and states for running PR targets the lane-branch inventory cannot see (a fix
    run on a screenshots/ or ci/ branch). One batched GraphQL read, cached TARGET_TTL_S."""
    now = time.time() if now is None else now
    try:
        stored = json.loads(cache.read_text()) if cache and cache.exists() else {}
    except (OSError, ValueError):
        stored = {}
    entries = stored.get("prs", {}) if isinstance(stored, dict) else {}
    stale = [n for n in numbers if str(n) not in entries or now - float(entries[str(n)].get("at", 0)) > TARGET_TTL_S]
    error = None
    if stale:
        owner, name = lane.REPO_SLUG.split("/", 1)
        fields = " ".join(f"p{n}: pullRequest(number: {int(n)}) {{ title state }}" for n in stale)
        query = f'query {{ repository(owner: "{owner}", name: "{name}") {{ {fields} }} }}'
        try:
            data = (fetch or gh_json)(["api", "graphql", "-f", f"query={query}"])
            repo = ((data or {}).get("data") or {}).get("repository") or {}
            for n in stale:
                pr = repo.get(f"p{n}")
                if pr:
                    entries[str(n)] = {"title": pr.get("title") or "", "state": pr.get("state") or "", "at": now}
        except Exception as exc:  # a failed read is shown, never guessed
            error = f"{type(exc).__name__}: {exc}"[:100]
        if cache:
            try:
                stored = {"prs": entries, "alerted": stored.get("alerted", {}) if isinstance(stored, dict) else {}}
                cache.write_text(json.dumps(stored, sort_keys=True))
            except OSError:
                pass
    return {f"PR{n}": entries[str(n)] for n in numbers if str(n) in entries}, error


def record_closed_target_alerts(targets: dict, cache: Path | None, log: Path | None) -> list[str]:
    """One alert per running lane whose PR is closed or merged; the lane is never touched."""
    if not cache or not log:
        return []
    try:
        stored = json.loads(cache.read_text()) if cache.exists() else {}
    except (OSError, ValueError):
        stored = {}
    alerted = stored.setdefault("alerted", {})
    fresh = []
    for target, info in targets.items():
        state = info.get("state")
        if state in ("CLOSED", "MERGED") and alerted.get(target) != state:
            alerted[target] = state
            fresh.append(target)
            try:
                with log.open("a") as out:
                    out.write(json.dumps({"at": utcnow().isoformat(), "target": target, "state": state,
                                          "title": info.get("title", "")}) + "\n")
            except OSError:
                pass
    if fresh:
        try:
            cache.write_text(json.dumps(stored, sort_keys=True))
        except OSError:
            pass
    return fresh


def lane_title(titles: dict, github: dict, target: str, now: datetime) -> str:
    if title := titles.get(target):
        return title
    info = (github.get("targets") or {}).get(target)
    if info:
        if info.get("state") in ("CLOSED", "MERGED"):
            return f"CLOSED/MERGED · {info.get('title', '')}"
        return info.get("title") or "untitled PR"
    error = github.get("errors", {}).get("targets") or github_source_error(github, "open", now)
    if error and TARGET_PR.match(target or ""):
        return f"GitHub read failed: {error}"
    return "title not in current GitHub/Linear read"


def github_source_error(github: dict, source: str, now: datetime) -> str | None:
    """A quota read or refresh attempt cannot renew an older source's truth."""
    if error := github.get("errors", {}).get(source):
        return error
    stamps = github.get("readAt")
    if "readAt" in github and not isinstance(stamps, dict):
        return "source age unknown (invalid read timestamps)"
    stamp = stamps.get(source) if isinstance(stamps, dict) else github.get("fetchedAt")
    if not stamp:
        return "not-read-yet (source age unknown)"
    try:
        seconds = (now - datetime.fromisoformat(stamp.replace("Z", "+00:00"))).total_seconds()
    except (ValueError, TypeError, AttributeError):
        return "source age unknown (invalid timestamp)"
    if seconds < 0:
        return "source age unknown (future timestamp)"
    if seconds > 3 * REFRESH_GITHUB_S:
        return "stale · last read " + age(stamp, now)
    return None


def repair_hold(pr: dict, held: dict) -> str | None:
    """held.json describes a particular head, never a PR's permanent disposition."""
    entry = held.get(str(pr["number"]))
    head = pr.get("headRefOid")
    if not isinstance(entry, dict) or not head or entry.get("sha") != head:
        return None
    reason = entry.get("reason")
    if not isinstance(reason, str) or reason in ("", "unclassified"):
        evidence = entry.get("evidence")
        reason = next((line for line in evidence if isinstance(line, str) and line.strip()), "reason unknown") \
            if isinstance(evidence, list) else "reason unknown"
        reason = reason.replace("bash scripts/hooks/", "")
    return "held: " + clip(reason, 48)


def timestamp_age(stamp, now: datetime) -> float | None:
    try:
        return (now - datetime.fromisoformat(stamp.replace("Z", "+00:00"))).total_seconds()
    except (ValueError, TypeError, AttributeError):
        return None


def capacity_receipt_error(doctor: dict, capacity: dict, now: datetime) -> str | None:
    # A saved producer verdict cannot outlive the native receipt that carries it.
    for source, stamp in (("doctor", doctor.get("at")), ("capacity", capacity.get("generatedAt"))):
        elapsed = timestamp_age(stamp, now)
        if elapsed is None:
            return source + " unread"
        if not 0 <= elapsed <= 3 * REFRESH_REMOTE_S:
            return source + " stale"
    return None


def capacity_freshness(row: dict, now: datetime) -> str:
    freshness = row.get("freshness") or {}
    status = freshness.get("status") or "unknown"
    if status != "fresh":
        return status
    elapsed = timestamp_age(freshness.get("observedAt"), now)
    # Match capacity_horizon's existing account observation contract; no policy change.
    return "unknown" if elapsed is None else "contradictory" if elapsed < -60 else "stale" if elapsed > 7200 else "fresh"


class SlotViewport:
    """A view over all slot rows; visibility never changes worker state."""
    def __init__(self, offset: int = 0):
        self.offset = max(0, offset)
        self.page_size, self.total = 1, 0
        self.bottom = False

    def window(self, rows: list[str], budget: int) -> list[str]:
        self.total, self.page_size = len(rows), max(1, budget)
        maximum = max(0, self.total - self.page_size)
        self.offset = maximum if self.bottom else min(maximum, max(0, self.offset))
        return rows[self.offset:self.offset + self.page_size]

    def move(self, key: str) -> None:
        maximum = max(0, self.total - self.page_size)
        if key == "home":
            self.offset, self.bottom = 0, False
        elif key == "end":
            self.offset, self.bottom = maximum, True
        elif key in {"up", "down", "page-up", "page-down"}:
            direction = -1 if key in {"up", "page-up"} else 1
            step = self.page_size if key.startswith("page-") else 1
            self.offset = min(maximum, max(0, self.offset + direction * step))
            self.bottom = direction > 0 and maximum > 0 and self.offset == maximum


class TerminalInput:
    """Read navigation only, restoring the console before exit or re-exec."""
    KEYS = {
        b"\x1b[A": "up", b"\x1b[B": "down",
        b"\x1b[5~": "page-up", b"\x1b[6~": "page-down",
        b"\x1b[H": "home", b"\x1b[F": "end",
        b"\x1bOH": "home", b"\x1bOF": "end",
        b"\x1b[1~": "home", b"\x1b[4~": "end",
        b"\x1b[7~": "home", b"\x1b[8~": "end",
    }

    def __init__(self):
        self.fd, self.saved = None, None
        self.closed, self.pending = False, b""

    def __enter__(self):
        if sys.stdin.isatty() and sys.stdout.isatty():
            try:
                self.fd = sys.stdin.fileno()
                self.saved = termios.tcgetattr(self.fd)
                tty.setcbreak(self.fd)
            except (OSError, ValueError, termios.error):
                self.restore()
        return self

    def restore(self) -> None:
        if self.fd is not None and self.saved is not None:
            try:
                termios.tcsetattr(self.fd, termios.TCSADRAIN, self.saved)
            except (OSError, ValueError, termios.error):
                pass  # A disconnected console must not prevent process cleanup.
        self.fd, self.saved = None, None

    def __exit__(self, *_):
        self.restore()

    def feed(self, data: bytes) -> list[str]:
        self.pending = (self.pending + data)[-64:]
        keys = []
        while self.pending:
            sequence = next((key for key in self.KEYS if self.pending.startswith(key)), None)
            if sequence is not None:
                keys.append(self.KEYS[sequence])
                self.pending = self.pending[len(sequence):]
            elif any(key.startswith(self.pending) for key in self.KEYS):
                break  # A terminal may split an escape sequence across reads.
            else:
                self.pending = self.pending[1:]
        return keys

    def wait(self, timeout: float) -> list[str]:
        timeout = max(0.0, timeout)
        if self.fd is None or self.closed:
            time.sleep(timeout)
            return []
        try:
            if not select.select([self.fd], [], [], timeout)[0]:
                return []
            data = os.read(self.fd, 64)
            if data:
                return self.feed(data)
        except (OSError, ValueError):
            pass
        self.closed = True
        return []


def terminal_dimensions(args) -> tuple[int, int]:
    try:
        size = os.get_terminal_size() if sys.stdout.isatty() else os.terminal_size((160, 45))
    except OSError:
        size = os.terminal_size((160, 45))
    return max(1, args.width or size.columns), max(1, args.height or size.lines)


def render(model: dict, width: int = 160, height: int = 45,
           viewport: SlotViewport | None = None, now: datetime | None = None) -> list[str]:
    now = utcnow() if now is None else now
    local, linear, github, system = model["local"], model["linear"], model["github"], model["system"]
    lines: list[str] = []
    open_error = github_source_error(github, "open", now)
    open_known = not open_error and isinstance(github.get("open"), list)
    open_prs = github["open"] if open_known else []
    titles = {}
    for pr in open_prs:
        titles[f"PR{pr['number']}"] = pr["title"]
    titles.update(linear.get("active", {}))

    # header
    rate_error = github_source_error(github, "rate", now)
    gh_note = (f"GitHub {github['rate']['graphql']}/5000" if github.get("rate") and not rate_error else
               "GitHub " + rgb(RED, rate_error or "unread"))
    linear_note = (f"Linear mirror {age(linear['fetchedAt'], now)} · outbox {linear.get('outbox', 0)}" if linear.get("ok")
                   else "Linear " + rgb(RED, linear.get("error", "unread")))
    stale_flags = []
    if any("stale" in (github_source_error(github, source, now) or "") for source in ("open", "queue", "merged", "rate")):
        stale_flags.append("github stale")
    if linear.get("fetchedAt") and (now - datetime.fromisoformat(linear["fetchedAt"])).total_seconds() > 3 * REFRESH_REMOTE_S:
        stale_flags.append("linear stale " + age(linear["fetchedAt"], now))
    release = local.get("release") or "unknown-release"
    hud_state = rgb(GREEN, "hud=release") if local.get("releaseMatchesHud") else rgb(ORANGE, "hud≠release")
    tick = local.get("tick") or {}
    tick_age = age(tick.get("at"), now)
    tick_note = rgb(RED, f"tick {tick_age} ✕ {tick['error'][:40]}") if tick.get("error") else \
        rgb(ORANGE if tick_age not in ("never",) and "m" in tick_age and int(tick_age.split("m")[0].split("h")[-1] or 0) >= 5 else DIM, f"tick {tick_age}")
    left = rgb(WHITE, "● JOVIE · SYMPHONY", bold=True) + rgb(DIM, f" · lanes {release} on {local['host']} · {hud_state} · ") + tick_note
    right = f"{gh_note} · {linear_note}" + ("" if not stale_flags else " · " + rgb(ORANGE, "; ".join(stale_flags))) + rgb(DIM, f" · {now:%H:%M:%S}Z")
    lines.append(pad(left + " " * max(1, width - visible(left) - visible(right)) + right, width))
    # Is useful work reaching production, and what holds it back: the first answers on screen.
    facts = interpret(model, now)
    lines.append(banner(facts, width))
    lines.extend(delivery_rows(facts, width))

    # active slots
    workers = local["workers"]
    busy = [w for w in workers if w["run"]]
    total_slots = sum(local["slots"].values())
    slots_known = local.get("slotEvidence") != "unknown"
    autoscale_mode = local.get("autoscaleMode") or "off"
    bases = local.get("baseSlots") or {}
    parts = []
    for name, count in local["slots"].items():
        label = f"{name} {sum(1 for w in busy if w['provider'] == name)}/{count if slots_known else '?'}"
        base = bases.get(name)
        if autoscale_mode != "off" and isinstance(base, int) and base != count:
            label += f"{'↑' if count > base else '↓'}{base}"
        parts.append(label)
    per = " · ".join(parts)
    auto = f" · auto:{autoscale_mode}" if autoscale_mode != "off" else ""
    lines.append(section(f"ACTIVE SLOTS · {len(busy)} running / {total_slots if slots_known else 'unknown'} ({per}){auto} · gate seats {local['gateSeats']}", width))
    slot_rows = []
    slot_names = list(local["slots"])
    slot_names.extend(dict.fromkeys(w["provider"] for w in workers if w["provider"] not in local["slots"]))
    for name in slot_names:
        count = local["slots"].get(name, 0)
        mine = [w for w in workers if w["provider"] == name]
        # Seats taken before an autoscale reduction finish naturally; hiding them showed
        # "codex 2/0" with no rows while two codex workers were still running.
        for index in range(max(count, len(mine))):
            worker = mine[index] if index < len(mine) else None
            if worker and worker["run"]:
                run = worker["run"]
                title = titles.get(run["target"]) or rgb(DIM, lane_title(titles, github, run["target"], now))
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
            slot_rows.append(pad("│ " + text, width - 1) + rgb(DIM, "│"))
    viewport = viewport or SlotViewport()
    rows_budget = max(1, min(len(slot_rows), max(3, height - 30)))
    visible_slots = viewport.window(slot_rows, rows_budget)
    lines.extend(visible_slots)
    lines.append(closer(width))
    if len(slot_rows) > rows_budget:
        lines.append(pad(rgb(DIM, f"  Rows {viewport.offset + 1}-{viewport.offset + len(visible_slots)} of {len(slot_rows)}"
                             " · ↑↓ scroll · PgUp/PgDn · Home/End"), width))

    # Perishable capacity: the exact receipt Ovi consumes, with no HUD-side forecast math.
    accounts = local["codex"]
    capacity = (local.get("doctor") or {}).get("capacity")
    if capacity and capacity.get("schema") == "jovie.capacity-horizon/v1":
        capacity_error = capacity_receipt_error(local["doctor"], capacity, now)
        incidents = capacity.get("incidents") or []
        leases = [] if capacity_error else capacity.get("leases") or []
        source_gaps = sorted({capacity_freshness(row, now) for row in leases} - {"fresh"})
        lines.append(pad(rgb(FG, "CAPACITY HORIZON  ", bold=True) +
                         rgb(ORANGE if capacity_error else RED if incidents else DIM,
                             f"unknown ({capacity_error}) · show-only" if capacity_error else
                             f"{len(leases)} leases · {len(incidents)} reported incident(s) · show-only"), width))
        for row in leases[:4]:
            status = capacity_freshness(row, now)
            known = status == "fresh"
            remaining = "?" if row.get("usableRemaining") is None else f"{row['usableRemaining']:g}%"
            banked = "?" if row.get("bankedCount") is None else str(row["bankedCount"])
            event = row.get("event") or {}
            elapsed = timestamp_age(event.get("at"), now)
            deadline = "?" if elapsed is None else dur(max(0, int(-elapsed)))
            forecast = row.get("forecast") or {}
            unused = "?" if forecast.get("projectedUnused") is None else f"{forecast['projectedUnused']:g}%"
            drain = forecast.get("completionP50At") or "?"
            rate = "?" if forecast.get("sustainablePercentPerHour") is None else f"{forecast['sustainablePercentPerHour']:g}%/h"
            route = row.get("route") or {}
            job = route.get("selectedJob") or "no selected job"
            mode = str(row.get("mode") or "unknown").upper()
            coverage = str(len(forecast.get("qualifiedWork") or []))
            if not known:
                remaining = banked = deadline = drain = rate = unused = coverage = "?"
                mode, job = "UNKNOWN", "selection unknown"
            detail = (f"{row.get('alias', '?')} {remaining} · banked {banked} · {event.get('label', 'source gap')} "
                      f"{deadline} · drain {drain} @ {rate} · unused {unused} · coverage {coverage} · {mode} · {job} · {status}")
            lines.append(pad("  " + rgb(RED if mode == "EMERGENCY" else GREEN if mode == "NORMAL" and known else ORANGE, detail), width))
        blocker = f"unknown ({capacity_error})" if capacity_error else \
            "capacity source " + ", ".join(source_gaps) if source_gaps else capacity.get("topBlocker") or "no material blocker"
        lines.append(pad("  " + rgb(ORANGE if capacity_error or source_gaps else RED if incidents else DIM, f"top blocker: {blocker}"), width))
    elif accounts.get("error"):
        lines.append(pad(rgb(FG, "CODEX ACCOUNTS  ", bold=True) + rgb(RED, accounts["error"]), width))
    else:
        parts = []
        for name, row in accounts.get("accounts", {}).items():
            source = ((row.get("capacityLease") or {}).get("sources") or {}).get("capacity") or {}
            status = capacity_freshness({"freshness": {"status": "fresh", "observedAt": source.get("observedAt")}}, now)
            if status != "fresh":
                parts.append(rgb(ORANGE, f"? {name} capacity {status}" + (" · leased" if row["leased"] else "")))
                continue
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
    queue_error = github_source_error(github, "queue", now)
    queue = github.get("queue") or {}
    if not isinstance(queue.get("entries"), list) or not isinstance(queue.get("depth"), int):
        queue_error = queue_error or "not-read-yet"
    if queue_error:
        queue = {}
    queued = {e["number"]: e for e in queue.get("entries", [])}
    counts = (f"open lane PRs {len(open_prs)} · draft {sum(1 for p in open_prs if p['draft'])} · non-draft {sum(1 for p in open_prs if not p['draft'])}"
              if open_known else "open lane PRs unknown · draft unknown · non-draft unknown")
    head = f"PIPELINE · {counts} · merge queue {queue.get('depth', rgb(RED, "unknown · " + (queue_error or "unread")))}"
    if open_known:
        stamp = (github.get("readAt") or {}).get("open") or github.get("fetchedAt")
        head += " · PR read " + age(stamp, now)
    if not open_known:
        head += " · " + rgb(RED, "PR list: " + (open_error or "not-read-yet"))
    lines.append(rgb(FG, head, bold=True))
    pipeline_budget = max(4, height - len(lines) - 15)
    merge_colors = {"CLEAN": GREEN, "UNSTABLE": ORANGE, "BLOCKED": ORANGE, "DIRTY": RED, "BEHIND": DIM, "HAS_HOOKS": DIM, "UNKNOWN": DIM}
    for pr in open_prs[:pipeline_budget]:
        merge = pr.get("merge") or "UNKNOWN"
        check_text = rgb(merge_colors.get(merge, DIM), f"{merge.lower():<8}")
        held = repair_hold(pr, local["held"])
        note = ""
        if pr["number"] in queued:
            note = rgb(GREEN, f"in queue {queued[pr['number']]['state'].lower()} {age(queued[pr['number']]['enqueuedAt'], now).replace(' ago', '')}")
        elif merge == "DIRTY":
            note = rgb(RED, "merge conflict")
        elif held:
            note = rgb(ORANGE, held)
        elif pr["draft"]:
            note = rgb(DIM, "draft · awaiting gate")
        elif merge == "BLOCKED":
            note = rgb(ORANGE, "blocked · reason unknown")
        elif merge == "UNSTABLE":
            note = rgb(ORANGE, "non-passing status")
        elif merge == "UNKNOWN":
            note = rgb(DIM, "merge state unknown")
        else:
            note = rgb(DIM, merge.lower())
        if held and (pr["number"] in queued or merge == "DIRTY"):
            note += rgb(ORANGE, " · " + held)
        state = rgb(DIM, "DRAFT" if pr["draft"] else "OPEN ")
        number, lane_name, issue_id = rgb(WHITE, "#" + str(pr["number"])), rgb(DIM, f"{pr['lane']:<6}"), f"{pr['issue']:<9}"
        # Keep the full disposition visible on the console before spending space on the title.
        title_width = max(16, min(58, width - visible(f" {number} {lane_name} {issue_id}  {state} {check_text}  {note}")))
        title = clip(pr["title"], title_width)
        title += " " * (title_width - visible(title))
        lines.append(pad(f" {number} {lane_name} {issue_id} {title} {state} {check_text}  {note}", width))
    if len(open_prs) > pipeline_budget:
        lines.append(rgb(DIM, f" … {len(open_prs) - pipeline_budget} more"))

    # recently merged
    merge_error = github_source_error(github, "merged", now)
    if not merge_error and "merged24h" not in github:
        merge_error = "merged-pr-evidence:not-read-yet"
    if not merge_error and (github.get("mergedWindow") or {}).get("complete") is False:
        merge_error = "merged-pr-evidence:" + str(github["mergedWindow"].get("reason") or "incomplete")
    merged = [] if merge_error else github.get("merged24h", [])
    joins = model.get("derived") or derived({"local": local, "github": {"merged24h": merged}}, cache=False)
    # A model reloaded from --json carries string keys.
    attributions = {m["number"]: joins["attributions"].get(m["number"]) or joins["attributions"].get(str(m["number"]))
                    or lane.pr_attribution(m, local.get("attributionReceipts") or []) for m in merged}
    verified = sum(value.get("confidence") == "verified" for value in attributions.values())
    inferred = sum(value.get("confidence") == "inferred" for value in attributions.values())
    unknown = sum(value.get("confidence") == "unknown" for value in attributions.values())
    if merge_error:
        lines.append(rgb(FG, "RECENTLY MERGED · unknown · ", bold=True) + rgb(RED, merge_error))
    else:
        coverage = f"{verified}/{len(merged)}" if merged else "0/0"
        lines.append(rgb(FG, f"RECENTLY MERGED · verified {coverage} · inferred {inferred} · unknown {unknown} · "
                         f"total {len(merged)} in 24h · last lane gate {age(local.get('lastLanding'), now)}", bold=True))
    for m in merged[:3]:
        label = attribution_label(attributions[m["number"]])
        lines.append(pad(f" {rgb(GREEN, '✓')} #{m['number']} {clip(m['title'], 90)} "
                         f"{rgb(DIM, label + ' · ' + age(m['mergedAt'], now))}", width))

    lines.append(promotion_line(github.get("promotion")))
    lines.append(file_overlap_line(local.get("doctor", {}).get("fileOverlap") or {}))

    # needs attention
    ledger = local["ledger24h"]
    attention = []
    if local.get("heldError"):
        attention.append(rgb(RED, local["heldError"]))
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
        attention.append(rgb(DIM, "no alerts recorded"))
    lines.append(rgb(FG, "NEEDS ATTENTION  ", bold=True) + rgb(DIM, f"hold records {'unknown' if local.get('heldError') else len(local['held'])} · failures {len(local['failures'])} · ") + " · ".join(attention[:4]))
    throughput = joins["throughput"]
    provider_parts = []
    for provider, metric in throughput["providers"].items():
        first_pass = metric["firstPassGreenRate"]
        landed = "unknown" if merge_error else str(metric["landedOutput"])
        provider_parts.append(f"{provider} offer {metric['eligibleWorkOffered']} start {metric['workerStarts']} "
                              f"productive {metric['productiveRuns']} PR {metric['prsCreated']} "
                              f"first-pass {'n/a' if first_pass is None else f'{round(first_pass * 100)}%'} "
                              f"repair {metric['remediationRuns']} landed {landed}")
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


def status_feed(local: dict, now: datetime) -> tuple[dict | None, str | None]:
    """The doctor's lanes-status feed, only while it is the current tick's."""
    feed = local.get("feed")
    if not isinstance(feed, dict):
        return None, "lanes-status unread"
    if feed.get("schema") != STATUS_SCHEMA:
        return None, f"lanes-status schema {feed.get('schema') or 'missing'}"
    elapsed = timestamp_age(feed.get("at"), now)
    if elapsed is None:
        return None, "lanes-status age unknown"
    if not -60 <= elapsed <= 3 * REFRESH_REMOTE_S:
        return None, "lanes-status stale " + dur(abs(elapsed))
    return feed, None


def admission_facts(name: str, local: dict, now: datetime | None = None) -> dict:
    """One lane's new-issue admission from the doctor census worker admission reads."""
    feed = local.get("doctor") or {}
    # doctor.json persists the census under observed; admission is the published
    # status-feed projection. Read the native source used by worker admission.
    admission = feed.get("observed") if isinstance(feed.get("observed"), dict) else feed.get("admission") or {}
    try:
        stamp = datetime.fromisoformat(feed["at"].replace("Z", "+00:00"))
        elapsed = ((utcnow() if now is None else now) - stamp).total_seconds()
        if elapsed < 0 or elapsed > 3 * REFRESH_REMOTE_S:
            return {"error": "doctor stale"}
    except (KeyError, TypeError, ValueError, AttributeError):
        return {"error": "doctor unread"}
    if admission.get("error"):
        return {"error": str(admission["error"])}
    qualified = (admission.get("poolByProvider") or {}).get(name)
    candidates = (admission.get("candidatePoolByProvider") or {}).get(name)
    budget = (admission.get("newIssueBudgetByProvider") or {}).get(name)
    eligible = (admission.get("eligiblePoolByProvider") or {}).get(name)
    reasons = (admission.get("rejectedByProvider") or {}).get(name) or {}
    if not budget:
        return {"error": "PR budget unread"}
    if budget.get("reason") == "pr-inventory-unavailable":
        return {"error": "PR inventory unread", "eligible": eligible, "candidates": candidates}
    if qualified is None or candidates is None or eligible is None:
        return {"error": "admission unread"}
    if budget.get("cap") is None and budget.get("allowed") is True:
        capacity = "PR ceiling none"
    elif budget.get("reason") == "provider-disabled":
        capacity = "provider disabled"
    else:
        used = "?" if budget.get("used") is None else budget["used"]
        cap = "?" if budget.get("cap") is None else budget["cap"]
        capacity = f"PRs {used}/{cap} {budget['reason']}"
    return {"error": None, "qualified": qualified, "eligible": eligible, "candidates": candidates,
            "capacity": capacity, "reasons": reasons}


def pool_hint(name: str, local: dict, now: datetime | None = None) -> str:
    facts = admission_facts(name, local, now)
    if facts["error"] == "PR inventory unread":
        return f"new issues unknown (PR inventory unread) · eligible {facts['eligible']}/{facts['candidates']}"
    if facts["error"]:
        return f"new issues unknown ({facts['error']})"
    distribution = ", ".join(f"{reason} {count}" for reason, count in sorted(facts["reasons"].items()))
    return (f"new issues {facts['qualified']} · eligible {facts['eligible']}/{facts['candidates']} · {facts['capacity']}"
            + (" · " + distribution if distribution else ""))


def vacancy_hint(name: str, local: dict, linear: dict) -> str:
    if name in local["cooldowns"]:
        return f"provider cooling {dur(local['cooldowns'][name])}"
    if name == "codex" and not local["codex"].get("available"):
        return "no codex account available"
    return "no worker (timer restarts idle lanes every 5 min) · " + pool_hint(name, local)


# ---------------------------------------------------------------- interpretation

def derived(model: dict, cache: bool = True) -> dict:
    """Receipt joins that cost real CPU (attribution over every receipt, provider throughput).
    The loop recomputes them only when the ledger or the merged window changes: the ledger
    list is the same growing object between refreshes, so its identity and length key it."""
    local, github = model.get("local") or {}, model.get("github") or {}
    merged = github.get("merged24h") if isinstance(github.get("merged24h"), list) else []
    receipts = local.get("attributionReceipts") or []
    window = local.get("receipts24h") or []
    key = (id(receipts), len(receipts), len(window), window[0].get("runId") if window else None,
           tuple((m.get("number"), m.get("headRefOid")) for m in merged), tuple(sorted(local.get("providers") or {})))
    if not cache or _derived.get("key") != key:
        value = {"attributions": {m["number"]: lane.pr_attribution(m, receipts) for m in merged},
                 "throughput": lane.provider_throughput(window, local.get("providers") or {}, merged,
                                                        attribution_receipts=receipts)}
        if not cache:
            return value
        _derived.update(key=key, value=value)
    return _derived["value"]


_derived: dict = {}


def interpret(model: dict, now: datetime) -> dict:
    """Every judgement the frame shows, made once per frame from the model."""
    local, linear, github = model["local"], model["linear"], model["github"]
    f = {"now": now, "local": local, "linear": linear, "github": github, "system": model["system"]}
    f["openError"] = github_source_error(github, "open", now)
    f["openKnown"] = not f["openError"] and isinstance(github.get("open"), list)
    f["open"] = github["open"] if f["openKnown"] else []
    queue_error = github_source_error(github, "queue", now)
    queue = github.get("queue") or {}
    if not isinstance(queue.get("entries"), list) or not isinstance(queue.get("depth"), int):
        queue_error = queue_error or "not-read-yet"
    f["queueError"], f["queue"] = queue_error, ({} if queue_error else queue)
    f["queued"] = {entry["number"]: entry for entry in f["queue"].get("entries", [])}
    merge_error = github_source_error(github, "merged", now)
    if not merge_error and "merged24h" not in github:
        merge_error = "merged-pr-evidence:not-read-yet"
    if not merge_error and (github.get("mergedWindow") or {}).get("complete") is False:
        merge_error = "merged-pr-evidence:" + str(github["mergedWindow"].get("reason") or "incomplete")
    f["mergeError"], f["merged"] = merge_error, ([] if merge_error else github.get("merged24h", []))
    f["rateError"] = github_source_error(github, "rate", now)
    joins = model.get("derived") or derived({"local": local, "github": {"merged24h": f["merged"]}}, cache=False)
    numbers = {str(m["number"]) for m in f["merged"]}
    f["attributions"] = {number: value for number, value in joins["attributions"].items() if str(number) in numbers}
    f["throughput"] = joins["throughput"]
    f["feed"], f["feedError"] = status_feed(local, now)
    f["titles"] = {f"PR{pr['number']}": pr["title"] for pr in f["open"]}
    f["titles"].update(linear.get("active", {}))
    f["production"] = model.get("production") if isinstance(model.get("production"), dict) else {}
    f["prod"] = production_view(model.get("production"), f, now)
    f["slotsKnown"] = local.get("slotEvidence") != "unknown"
    workers = local.get("workers") or []
    f["busy"] = [w for w in workers if w.get("run")]
    names = list(local.get("slots") or {})
    names.extend(dict.fromkeys(w["provider"] for w in workers if w["provider"] not in names))
    f["lanes"] = [name for name in names
                  if (local.get("slots") or {}).get(name, 0) > 0 or any(w["provider"] == name for w in workers)]
    f["off"] = [name for name in names if name not in f["lanes"]]
    f["constraint"] = constraint(f)
    return f


def model_production(f: dict) -> dict:
    return f.get("production") or {}


def production_view(production, f: dict, now: datetime) -> dict:
    view: dict = {"error": None, "state": "unknown"}
    if not isinstance(production, dict) or not production.get("readAt"):
        view["error"] = "not-read-yet"
        return view
    elapsed = timestamp_age(production.get("readAt"), now)
    if elapsed is None or not -60 <= elapsed <= 3 * REFRESH_REMOTE_S:
        view["error"] = "stale" if elapsed is not None else "read age unknown"
        return view
    view.update({key: production.get(key) for key in ("buildId", "prodSha", "mainSha", "behind", "marker", "servedBuilds")})
    view["error"] = production.get("error")
    deployed = production.get("deployed") or {}
    rows = []
    for pr in f["merged"]:
        oid = merge_oid(pr)
        rows.append((pr, deployed.get(oid) if oid and not view["error"] else None))
    view["rows"] = {pr["number"]: state for pr, state in rows}
    view["deployed"] = sum(1 for _, state in rows if state is True)
    view["undeployed"] = [pr for pr, state in rows if state is False]
    view["unknown"] = sum(1 for _, state in rows if state is None)
    marker = view.get("marker") or {}
    view["verified"] = marker.get("status") or "unknown"
    oldest = max((timestamp_age(pr.get("mergedAt"), now) or 0 for pr in view["undeployed"]), default=0)
    view["oldestUndeployedS"] = oldest
    view["state"] = ("unknown" if view["error"] or not view.get("prodSha") else
                     "fail" if oldest > 3 * 3600 else
                     "warn" if oldest > 3600 or view["verified"] != "verified" else "ok")
    return view


def constraint(f: dict) -> tuple[str, str, list[tuple[int, str]]]:
    """The one thing holding useful work back from production right now, with its evidence.
    The worst state wins; among equals the most downstream stage wins (deploy, delivery,
    critical alerts, queue, worker capacity, intake). Unknown evidence is said, never assumed."""
    feed, prod = f["feed"] or {}, f["prod"]
    candidates = []
    if prod.get("undeployed") and prod["oldestUndeployedS"] > 3600:
        candidates.append(("fail" if prod["oldestUndeployedS"] > 3 * 3600 else "warn", "deploy",
                           [(0, f"{len(prod['undeployed'])} merged PR(s) not in production"),
                            (0, f"oldest {dur(prod['oldestUndeployedS'])}"),
                            (1, f"prod {short(prod.get('prodSha'))} is {num(prod.get('behind'))} commits "
                                f"behind main {short(prod.get('mainSha'))}")]))
    delivery = feed.get("delivery") or {}
    if delivery.get("state") == "stalled":
        candidates.append(("fail", "delivery", [(0, "qualified admitted work has no exact-head merge for "
                                                    f"{dur(delivery.get('staleAfterSeconds') or 0)}+"),
                                                (1, "doctor delivery-stalled")]))
    for key, condition in active_conditions(feed):
        if condition.get("severity") == "critical":
            candidates.append(("fail", key, [(0, console_text(condition.get("evidence") or "critical condition active")),
                                             (1, f"owner {console_text(condition.get('owner') or '?')}")]))
            break
    throughput = feed.get("mergeThroughput") or {}
    ejection = throughput.get("ejectionRate")
    if isinstance(ejection, (int, float)) and ejection >= 0.25:
        candidates.append(("warn", "merge queue", [(0, f"ejection rate {pct(ejection)}"),
                                                   (1, f"depth {num(throughput.get('queueDepth'))}"),
                                                   (1, f"wait p50 {num(throughput.get('queueWaitP50Minutes'), 'm')}")]))
    admission = feed.get("admission") or {}
    eligible, candidates_pool = admission.get("eligiblePool"), admission.get("candidatePool")
    idle, running = feed.get("idle"), feed.get("running")
    if isinstance(eligible, int) and eligible > 0 and idle == 0:
        candidates.append(("warn", "worker capacity", [(0, f"all {num(running)} slots busy"),
                                                       (0, f"{eligible} eligible issue(s) waiting")]))
    if isinstance(eligible, int) and eligible == 0 and isinstance(candidates_pool, int) and candidates_pool > 0:
        candidates.append(("warn", "intake", [(0, f"0 of {candidates_pool} Todo issues eligible")]
                           + [(1 + rank, f"{reason} {count}") for rank, (reason, count, _) in enumerate(exclusions(admission))]))
    if not f["feed"]:
        candidates.append(("unknown", "evidence", [(0, f["feedError"]),
                                                   (1, "the doctor writes it every tick on the primary host")]))
    if candidates:
        return max(candidates, key=lambda item: (RANK[item[0]], -candidates.index(item)))
    return ("ok", "none binding", [(0, f"merging {num(throughput.get('mergedPerHour'))}/h"),
                                   (1, f"{num(running)} running"), (1, f"{num(eligible)} eligible waiting")])


def short(sha) -> str:
    return sha[:7] if isinstance(sha, str) and sha else "?"


def active_conditions(feed: dict) -> list[tuple[str, dict]]:
    """Active liveness conditions, critical first then oldest. New condition kinds (for example
    started issues without a live owner) appear without a HUD change."""
    rows = [(key, value) for key, value in (feed.get("conditions") or {}).items()
            if isinstance(value, dict) and value.get("state") == "active"]
    return sorted(rows, key=lambda item: (item[1].get("severity") != "critical",
                                          str(item[1].get("firstObservedAt") or ""), item[0]))


def exclusions(admission: dict) -> list[tuple[str, int, list[str]]]:
    """Eligibility exclusions by reason, largest first, with the lanes each one hits."""
    merged: dict[str, dict[str, int]] = {}
    for provider, reasons in (admission.get("rejectedByProvider") or {}).items():
        for reason, count in (reasons or {}).items():
            if isinstance(count, int) and count > 0:
                merged.setdefault(str(reason), {})[provider] = count
    return sorted(((reason, max(by.values()), sorted(by)) for reason, by in merged.items()),
                  key=lambda row: (-row[1], row[0]))


def banner(f: dict, width: int) -> str:
    state, label, parts = f["constraint"]
    head = paint(f"{state}-bar", f" CONSTRAINT {MARK[state]} {WORD[state]} ") + "  " + paint("strong", label) + " · "
    return head + fit(parts, max(1, width - visible(head)))


def delivery_rows(f: dict, width: int) -> list[str]:
    prod, feed, now = f["prod"], f["feed"] or {}, f["now"]
    throughput = feed.get("mergeThroughput") or {}
    if prod.get("error") and not prod.get("prodSha"):
        first = [(0, paint("label", " PRODUCTION ") + " " + badge("unknown") + " served build unknown"),
                 (0, console_text(prod["error"])),
                 (1, f"build {prod['buildId'][:7]}" if prod.get("buildId") else "")]
    else:
        marker = prod.get("marker") or {}
        verified = ({"verified": paint("ok", "✓ verified " + since(marker.get("at"), now) + " ago"),
                     "pending": paint("warn", "! Production Verified marker pending")}.get(marker.get("status"))
                    or paint("unknown", "? verified marker unread"))
        undeployed = prod.get("undeployed") or []
        served = prod.get("servedBuilds") or {}
        observed = timestamp_age(datetime.fromtimestamp(served["observedSince"], timezone.utc).isoformat(), now) \
            if isinstance(served.get("observedSince"), (int, float)) else None
        first = [(0, paint("label", " PRODUCTION ") + " " + paint(prod["state"], f"{MARK[prod['state']]} {WORD[prod['state']]:<7}")
                  + f" serves {short(prod.get('prodSha'))}"),
                 (1, verified), (2, f"main {short(prod.get('mainSha'))}"),
                 (1, f"behind {num(prod.get('behind'))} commits"),
                 (0, (paint(prod["state"], f"{len(undeployed)} undeployed · oldest {dur(prod['oldestUndeployedS'])}")
                      if undeployed else "every merged PR deployed") + (f" (+{prod['unknown']} ?)" if prod.get("unknown") else "")),
                 (3, f"served-build changes 24h {served.get('changes24h')}"
                     + (f" (observed {dur(observed)})" if observed is not None and observed < 86400 else "")
                     if served else ""),
                 (1, paint("warn", "! " + console_text(prod["error"])) if prod.get("error") else "")]
    open_prs, queued = f["open"], f["queued"]
    known = "deployed" in prod and not prod.get("error")
    chain = [(2, f"draft {sum(1 for pr in open_prs if pr['draft'] and pr['number'] not in queued) if f['openKnown'] else '?'}"),
             (1, f"prepared {sum(1 for pr in open_prs if not pr['draft'] and pr['number'] not in queued) if f['openKnown'] else '?'}"),
             (1, f"queued {f['queue']['depth'] if not f['queueError'] else '?'}"),
             (0, f"merged {'?' if f['mergeError'] else len(f['merged'])}"),
             (0, f"deployed {prod['deployed'] if known else '?'}"),
             (0, f"verified {prod['deployed'] if known and prod.get('verified') == 'verified' else '?'}")]
    label = paint("label", " FLOW 24h   ") + " "
    flow = fit(chain, width - visible(label), sep=" → ")
    lead_p95 = dig(feed, "slo", "leadTimeP95Seconds", default={}) or {}
    slowest = max(((name, value) for name, value in lead_p95.items() if isinstance(value, (int, float))),
                  key=lambda item: item[1], default=None)
    p50 = [metric.get("issueToMergeSecondsP50") for metric in dig(feed, "throughput", "providers", default={}).values()
           if isinstance(metric, dict) and isinstance(metric.get("issueToMergeSecondsP50"), (int, float))]
    second = [(0, label + flow),
              (0, f"merges {num(throughput.get('mergedPerHour'))}/h · opened {num(throughput.get('openedPerHour'))}/h (1h)"),
              (1, f"claim→merge p50 {dur(min(p50)) if p50 else '?'}" +
               (f" · p95 {slowest[0]} {dur(slowest[1])}" if slowest else "")),
              (2, "eligible→verified ? (no producer)")]
    return [fit(first, width), fit(second, width)]





# ---------------------------------------------------------------- panels

def heading(name: str, state: str, summary, width: int) -> str:
    """A fixed-geometry title: label, then a state slot that never changes width, then the
    summary parts that fit, least important dropped first."""
    slot = f"{MARK[state]} {WORD[state]}"
    lead = paint("label", f" {name:<8} ") + " " + paint(state, f"{slot:<9}") + " "
    parts = summary if isinstance(summary, list) else [(0, summary)]
    return lead + fit(parts, max(1, width - visible(lead)))


def finish(title: str, body: list, width: int, rows: int) -> list[str]:
    """Title plus the body lines that fit. Body items are text or (priority, text); when the
    panel is short, the most important lines stay, in order, and the rest are counted."""
    items = [item if isinstance(item, tuple) else (1, item) for item in body]
    room = max(0, rows - 1)
    if len(items) > room:
        keep = room - 1 if room >= 2 else room
        chosen = sorted(sorted(range(len(items)), key=lambda index: (items[index][0], index))[:keep])
        hidden = len(items) - len(chosen)
        items = [items[index] for index in chosen] + ([(0, f"  +{hidden} more")] if room >= 2 else [])
    return [title] + [clip(text, width) for _, text in items]


def worker_rows(f: dict, width: int) -> list[str]:
    local, now = f["local"], f["now"]
    slots, workers = local.get("slots") or {}, local.get("workers") or []
    feed_providers = dig(f["feed"], "throughput", "providers", default={})
    rows = []
    for name in f["lanes"]:
        mine = [w for w in workers if w["provider"] == name]
        for worker in (w for w in mine if w.get("run")):
            run = worker["run"]
            title = lane_title(f["titles"], f["github"], run["target"], now)
            kind = {"issue": "issue", "adopt": "gate", "fix": "fix-red"}.get(run["kind"], run["kind"])
            elapsed = since(run["startedAt"], now)
            rows.append(titled(paint("ok", "● ") + f"{name:<10} {run['target']:<9} {kind:<7} {run.get('phase', '?'):<13} "
                               f"{elapsed:>6}  ", title, width))
        polling = [w for w in mine if not w.get("run")]
        vacant = max(0, slots.get(name, 0) - len(mine))
        reason = dig(feed_providers, name, "idleReason")
        # The doctor's idle reason comes from its last tick; this census is newer, so a
        # "fully-utilized" verdict against a polling worker is stale, not a reason.
        reason = None if reason in (None, "fully-utilized") else humanize(reason)
        facts = admission_facts(name, local, now)
        hint = (pool_hint(name, local, now) if facts["error"] else
                f"eligible {facts['eligible']}/{facts['candidates']} · new issues {facts['qualified']}")
        if polling:
            count = f" ×{len(polling)}" if len(polling) > 1 else ""
            rows.append(f"○ {name:<10} polling{count} · " + (reason + " · " if reason else "") + hint)
        if vacant:
            count = f" ×{vacant}" if vacant > 1 else ""
            rows.append(f"○ {name:<10} vacant{count} · " + vacancy_reason(name, local))
    return rows


def productivity_rows(f: dict, width: int) -> list[str]:
    rows = []
    for name in f["lanes"]:
        metric = f["throughput"]["providers"].get(name)
        if not metric:
            continue
        landed = "unknown" if f["mergeError"] else str(metric["landedOutput"])
        rows.append(fit([(0, f"  {name:<10} 24h started {metric['workerStarts']}"),
                         (0, f"productive {metric['productiveRuns']}"), (1, f"PR {metric['prsCreated']}"),
                         (1, f"first-pass {pct(metric['firstPassGreenRate'])}"),
                         (1, f"repair {metric['remediationRuns']}"), (0, f"landed {landed}"),
                         (2, f"offered {metric['eligibleWorkOffered']}")], width))
    verdicts = sorted((f["local"].get("ledger24h") or {}).items(), key=lambda item: (-item[1], str(item[0])))
    rows.append(fit([(0, "  24h verdicts:" + ("" if verdicts else " no runs"))]
                    + [(1 + rank, f"{key} {value}") for rank, (key, value) in enumerate(verdicts)], width,
                    sep=" · ").replace("verdicts: · ", "verdicts: "))
    return rows


def panel_workers(f: dict, width: int, rows: int, viewport: SlotViewport) -> list[str]:
    local = f["local"]
    slots, known = local.get("slots") or {}, f["slotsKnown"]
    autoscale_mode = local.get("autoscaleMode") or "off"
    bases = local.get("baseSlots") or {}
    parts = []
    for name in f["lanes"]:
        count = slots.get(name, 0)
        label = f"{name} {sum(1 for w in f['busy'] if w['provider'] == name)}/{count if known else '?'}"
        base = bases.get(name)
        if autoscale_mode != "off" and isinstance(base, int) and base != count:
            label += f"{'↑' if count > base else '↓'}{base}"
        parts.append(label)
    total = sum(slots.values())
    summary = [(0, f"{len(f['busy'])} running / {total if known else 'unknown'} ({' · '.join(parts) or 'no lanes'})"),
               (3, f"auto:{autoscale_mode}" if autoscale_mode != "off" else ""),
               (1, f"gate seats {local.get('gateSeats', '?')}"),
               (2, f"off {' '.join(f['off'])}" if f["off"] else "")]
    idle_with_work = any(dig(f["feed"], "throughput", "providers", name, "idleReason") ==
                         "capacity-idle-with-qualified-work" for name in f["lanes"])
    state = "unknown" if not known else "warn" if idle_with_work else "ok"
    slot_rows, extra = worker_rows(f, width), productivity_rows(f, width)
    budget = max(0, rows - 1)
    if len(slot_rows) + len(extra) <= budget:
        body = slot_rows + extra
    else:
        # Slots come first; productivity lines take what the slot page leaves.
        page = max(1, budget - min(len(extra), max(0, budget - 4)))
        scrolling = len(slot_rows) > page
        page = max(1, page - 1) if scrolling else len(slot_rows)
        shown = viewport.window(slot_rows, page)
        body = shown + ([f"  Rows {viewport.offset + 1}-{viewport.offset + len(shown)} of {len(slot_rows)}"
                         " · ↑↓ scroll · PgUp/PgDn · Home/End"] if scrolling else [])
        body += extra[:max(0, budget - len(body))]
    return [heading("WORKERS", state, summary, width)] + [clip(line, width) for line in body[:max(0, budget)]]


def panel_supply(f: dict, width: int, rows: int, viewport=None) -> list[str]:
    local, linear = f["local"], f["linear"]
    facts = {name: admission_facts(name, local, f["now"]) for name in f["lanes"]}
    known = [value for value in facts.values() if not value["error"]]
    eligible = max((value["eligible"] for value in known), default=None)
    qualified = sum(value["qualified"] for value in known) if known else None
    candidates = max((value["candidates"] for value in known), default=None)
    todo = linear.get("poolTotal") if linear.get("ok") else candidates
    state = ("unknown" if not known else "warn" if eligible == 0 and (candidates or 0) > 0 else "ok")
    summary = [(0, f"Todo {num(todo)} → eligible {num(eligible)} → new issues {num(qualified)}"),
               (1, f"triage returns {linear['triage']}" if linear.get("ok") else "")]
    body = []
    for name, value in facts.items():
        if value["error"]:
            body.append((0, f"  {name:<10} " + pool_hint(name, local, f["now"])))
        else:
            body.append((1, f"  {name:<10} new {value['qualified']} · eligible {value['eligible']}/{value['candidates']}"
                            f" · {value['capacity']}"))
    rejected = exclusions({"rejectedByProvider": {name: value.get("reasons") or {} for name, value in facts.items()
                                                  if not value["error"]}})
    for rank, (reason, count, lanes) in enumerate(rejected):
        lanes_text = "all lanes" if len(lanes) == len(known) and len(known) > 1 else ", ".join(lanes)
        body.append((0 if rank < 2 else 2, f"  {count:>4} excluded  {reason:<26} {lanes_text}"))
    if linear.get("ok"):
        body.append((3, f"  Linear mirror {age(linear.get('fetchedAt'), f['now'])} · in progress {len(linear.get('active') or {})}"))
    else:
        body.append((0, "  " + paint("fail", "✕ Linear " + console_text(linear.get("error", "unread")))))
    return finish(heading("SUPPLY", state, summary, width), body, width, rows)


def pr_note(pr: dict, f: dict) -> tuple[str, str]:
    merge = pr.get("merge") or "UNKNOWN"
    held = repair_hold(pr, f["local"].get("held") or {})
    queued = f["queued"].get(pr["number"])
    if queued:
        note, state = f"queued {str(queued['state']).lower()}", "ok"
    elif merge == "DIRTY":
        note, state = "merge conflict", "fail"
    elif held:
        note, state = held, "warn"
    elif pr.get("draft"):
        note, state = "draft · awaiting gate", "text"
    elif merge == "BLOCKED":
        note, state = "blocked · reason unknown", "warn"
    elif merge == "UNSTABLE":
        note, state = "unstable · non-passing status", "warn"
    elif merge == "UNKNOWN":
        note, state = "merge state unknown", "unknown"
    else:
        note, state = "prepared · " + merge.lower(), "ok"
    if held and (queued or merge == "DIRTY"):
        note += " · " + held
    return note, state


def panel_repair(f: dict, width: int, rows: int, viewport=None) -> list[str]:
    local, feed, now = f["local"], f["feed"], f["now"]
    open_prs = f["open"]
    body = []
    if f["openKnown"]:
        stamp = (f["github"].get("readAt") or {}).get("open") or f["github"].get("fetchedAt")
        summary = [(0, f"open lane PRs {len(open_prs)} · draft {sum(1 for p in open_prs if p['draft'])} · "
                       f"non-draft {sum(1 for p in open_prs if not p['draft'])}"), (1, f"PR read {since(stamp, now)}")]
    else:
        summary = [(0, "open lane PRs unknown"), (1, "draft unknown · non-draft unknown")]
        body.append((0, "  " + paint("unknown", "? PR list: " + console_text(f["openError"] or "not-read-yet"))))
    prs = dig(feed, "prs", default={})
    escalation, remediation = dig(feed, "escalation", default={}), dig(feed, "remediation", default={})
    if feed:
        body.append((0, fit([(0, f"  repo PRs open {num(prs.get('open'))}"), (0, f"red {num(prs.get('red'))}"),
                         (0, f"dirty {num(prs.get('dirty'))}"), (1, f"clean not queued {num(prs.get('cleanNotQueued'))}"),
                         (1, f"exhausted {num(prs.get('exhausted'))}"),
                         (2, f"escalating {num(escalation.get('escalating'))}"),
                         (3, f"repair events open {num(remediation.get('eventsOpen'))}")], width)))
    else:
        body.append((0, "  " + paint("unknown", f"? repair demand unknown ({f['feedError']})")))
    if local.get("heldError"):
        body.append((0, "  " + paint("unknown", f"? hold records unknown · {local['heldError']}")))
    else:
        reasons = dig(feed, "held_by_reason", default={})
        body.append((1, f"  hold records {len(local.get('held') or {})}"
                        + (" · " + " · ".join(f"{k} {v}" for k, v in sorted(reasons.items(), key=lambda i: (-i[1], i[0])))
                           if reasons else "")))
    for row in (dig(feed, "oldest_prs", default=[]) or [])[:1]:
        if isinstance(row, dict):
            body.append((2, fit([(0, f"  oldest #{row.get('pr')} {num(row.get('ageH'), 'h')}"),
                                 (1, f"idle {num(row.get('idleH'), 'h')}"), (0, console_text(row.get("state") or "?")),
                                 (2, console_text(row.get("reason") or "")), (3, console_text(row.get("next") or ""))], width)))
    rank = {"fail": 0, "warn": 1, "unknown": 2, "text": 3, "ok": 4}
    ordered = sorted(open_prs, key=lambda pr: (rank[pr_note(pr, f)[1]], pr["number"]))
    for pr in ordered:
        note, state = pr_note(pr, f)
        # ID and disposition first: the lane and title take whatever width is left.
        line = f"#{pr['number']} {pr['issue']:<9} {'DRAFT' if pr['draft'] else 'OPEN '} " + paint(None if state == "text" else state, note)
        if visible(line) + 6 <= width:
            line = titled(line + f"  {pr['lane']} · ", pr["title"], width)
        body.append((1 + min(rank[state], 2), line))
    state = ("unknown" if not f["openKnown"] else
             "warn" if prs.get("dirty") or prs.get("red") or any(pr.get("merge") == "DIRTY" for pr in open_prs)
             or (local.get("held") and not local.get("heldError")) else "ok")
    return finish(heading("REPAIR", state, summary, width), body, width, rows)


def promotion_lines(metrics) -> list[str]:
    if not metrics or metrics.get("error"):
        return ["  " + paint("unknown", "? promotion: " + console_text((metrics or {}).get("error", "not-read-yet")))]
    first = metrics["firstPass"]["rate"]
    back = metrics["reenqueueMinutes"]
    per_merge = metrics.get("queueEntriesPerMerge")
    return [[(0, f"  first-pass {pct(first)}"), (0, f"ejected→back p75 {num(back['p75'], 'm')} ({back['pending']} waiting)")],
            [(0, f"  open→enqueue p75 {num(metrics['openToFirstEnqueueMinutes']['p75'], 'm')}"),
             (1, f"CLEAN not queued {metrics['occupancy']['cleanNotQueued']}"),
             (2, f"queue entries/merge {num(per_merge)}")]]


def panel_queue(f: dict, width: int, rows: int, viewport=None) -> list[str]:
    feed, now = f["feed"] or {}, f["now"]
    throughput = feed.get("mergeThroughput") or {}
    ci = dig(feed, "slo", "ciP95Seconds", "merge_group")
    depth = "merge queue unknown" if f["queueError"] else f"merge queue {f['queue']['depth']}"
    summary = [(0, depth), (1, f"wait p50 {num(throughput.get('queueWaitP50Minutes'), 'm')}"),
               (0, f"ejections {pct(throughput.get('ejectionRate')) if throughput else '?'}"),
               (2, f"CI merge_group p95 {dur(ci) if isinstance(ci, (int, float)) else '?'}")]
    ejection = throughput.get("ejectionRate")
    state = ("unknown" if f["queueError"] else
             "warn" if isinstance(ejection, (int, float)) and ejection >= 0.25 else "ok")
    body = ([(0, "  " + paint("unknown", "? queue read: " + console_text(f["queueError"])))] if f["queueError"] else [])
    body += [line if isinstance(line, str) else fit(line, width) for line in promotion_lines(f["github"].get("promotion"))]
    for entry in sorted(f["queue"].get("entries", []), key=lambda e: str(e.get("enqueuedAt"))):
        body.append(f"  #{entry['number']} {str(entry['state']).lower():<16} {since(entry['enqueuedAt'], now):>6}")
    return finish(heading("QUEUE", state, summary, width), body, width, rows)


def panel_shipped(f: dict, width: int, rows: int, viewport=None) -> list[str]:
    local, prod, now = f["local"], f["prod"], f["now"]
    merged = f["merged"]
    if f["mergeError"]:
        summary, state = "merged unknown", "unknown"
    else:
        deployed = (f"deployed {prod['deployed']}" + (f" (+{prod['unknown']} ?)" if prod.get("unknown") else "")
                    if not prod.get("error") and "deployed" in prod else "deployed ?")
        verified = (f"verified {prod['deployed']}" if prod.get("verified") == "verified" and "deployed" in prod
                    else "verified ?")
        summary = [(0, f"merged {len(merged)} in 24h"), (0, deployed), (0, verified),
                   (2, f"last lane gate {age(local.get('lastLanding'), now)}")]
        state = prod["state"] if merged else "ok"
    values = f["attributions"].values()
    body = []
    if not f["mergeError"]:
        coverage = f"{sum(v.get('confidence') == 'verified' for v in values)}/{len(merged)}" if merged else "0/0"
        body.append((3, f"  attribution verified {coverage} · inferred {sum(v.get('confidence') == 'inferred' for v in values)}"
                        f" · unknown {sum(v.get('confidence') == 'unknown' for v in values)}"))
    if f["mergeError"]:
        body.append((0, "  " + paint("unknown", "? merged PRs: " + console_text(f["mergeError"]))))
    states = prod.get("rows") or {}
    for pr in merged:
        deployed = states.get(pr["number"])
        if deployed and prod.get("verified") == "verified":
            word, style = "verified", "ok"
        elif deployed:
            word, style = "deployed", "text"
        elif deployed is False:
            word, style = "merged", "warn" if (timestamp_age(pr.get("mergedAt"), now) or 0) > 3600 else "text"
        else:
            word, style = "merged ?", "unknown"
        body.append((1 if deployed is False else 2, titled(f"#{pr['number']} " + paint(None if style == "text" else style, f"{word:<9}")
                                                            + f" {since(pr.get('mergedAt'), now):>6}  ", pr["title"], width)))
    return finish(heading("SHIPPED", state, summary, width), body, width, rows)


def panel_alerts(f: dict, width: int, rows: int, viewport=None) -> list[str]:
    local, feed, now = f["local"], f["feed"], f["now"]
    doctor = local.get("doctor") or {}
    body, seen, states = [], set(), []
    conditions = active_conditions(feed or {})
    # Evidence gets its own line while the panel has room for every alert twice.
    loose = [key for key in (doctor.get("alerts") or {}) if key not in dict(conditions)]
    roomy = 2 * len(conditions) + len(loose) <= rows - 1
    for key, condition in conditions:
        seen.add(key)
        critical = condition.get("severity") == "critical"
        states.append("fail" if critical else "warn")
        mark = paint("fail", "✕ crit") if critical else paint("warn", "! warn")
        escalation = dig(condition, "summerEscalation", "outcome")
        evidence = console_text(condition.get("evidence") or "")
        nxt = condition.get("nextAction")
        body.append((0 if critical else 1, fit(
            [(0, f"{mark} {key} {since(condition.get('firstObservedAt'), now)}"),
             (0, f"owner {console_text(condition.get('owner') or '?')}"),
             (2, f"summer {escalation}" if escalation else ""),
             (1, "" if roomy else evidence),
             (3, f"next {console_text(nxt)}" if nxt not in (None, "none") else "")], width)))
        if roomy and evidence:
            body.append((2, "    " + evidence))
    for key, text in (doctor.get("alerts") or {}).items():
        if key not in seen:
            states.append("fail")
            body.append((0, paint("fail", f"✕ {key}: {console_text(text)}") + " · owner ?"))
    if local.get("heldError"):
        states.append("fail")
        body.append((0, paint("fail", "✕ " + local["heldError"]) + " · owner lanes harness"))
    if not feed:
        states.append("unknown")
        body.append((0, paint("unknown", f"? {f['feedError']}") + " · owner doctor.py on the primary host"))
    for name, seconds in (local.get("cooldowns") or {}).items():
        states.append("warn")
        body.append((1, paint("warn", f"! cooldown {name} {dur(seconds)}")))
    if local.get("requeue"):
        states.append("warn")
        body.append((1, paint("warn", f"! requeue pending #{', #'.join(local['requeue'])}")))
    ledger = local.get("ledger24h") or {}
    if ledger.get("failed") and "failed-runs" not in seen:
        states.append("warn")
        body.append((1, paint("warn", f"! failed runs 24h {ledger['failed']}")))
    tick = local.get("tick") or {}
    if tick.get("error"):
        states.append("fail")
        body.append((0, paint("fail", f"✕ dispatch tick: {console_text(tick['error'])}") + " · owner lanes harness"))
    if not body:
        body.append(paint("ok", "✓ no alerts recorded"))
    summary = f"{len(states)} active · {states.count('fail')} critical/failing" if states else "none active"
    return finish(heading("ALERTS", worst(*states), summary, width), body, width, rows)


def capacity_rows(f: dict, width: int) -> list[str]:
    """Perishable capacity: the exact receipt Ovi consumes, with no HUD-side forecast math."""
    local, now = f["local"], f["now"]
    accounts = local.get("codex") or {}
    doctor = local.get("doctor") or {}
    capacity = doctor.get("capacity")
    rows = []
    if capacity and capacity.get("schema") == "jovie.capacity-horizon/v1":
        capacity_error = capacity_receipt_error(doctor, capacity, now)
        incidents = capacity.get("incidents") or []
        leases = [] if capacity_error else capacity.get("leases") or []
        source_gaps = sorted({capacity_freshness(row, now) for row in leases} - {"fresh"})
        rows.append("  " + (paint("unknown", f"? capacity horizon unknown ({capacity_error}) · show-only") if capacity_error else
                            f"capacity horizon {len(leases)} leases · {len(incidents)} reported incident(s) · show-only"))
        for row in leases[:4]:
            status = capacity_freshness(row, now)
            known = status == "fresh"
            remaining = "?" if row.get("usableRemaining") is None else f"{row['usableRemaining']:g}%"
            banked = "?" if row.get("bankedCount") is None else str(row["bankedCount"])
            event = row.get("event") or {}
            elapsed = timestamp_age(event.get("at"), now)
            deadline = "?" if elapsed is None else dur(max(0, int(-elapsed)))
            forecast = row.get("forecast") or {}
            unused = "?" if forecast.get("projectedUnused") is None else f"{forecast['projectedUnused']:g}%"
            drain = forecast.get("completionP50At") or "?"
            rate = "?" if forecast.get("sustainablePercentPerHour") is None else f"{forecast['sustainablePercentPerHour']:g}%/h"
            job = (row.get("route") or {}).get("selectedJob") or "no selected job"
            mode = str(row.get("mode") or "unknown").upper()
            if not known:
                remaining = banked = deadline = drain = rate = unused = "?"
                mode, job = "UNKNOWN", "selection unknown"
            style = "fail" if mode == "EMERGENCY" else "ok" if mode == "NORMAL" and known else "warn"
            mark = MARK[style if known else "unknown"]
            rows.append("  " + paint(style if known else "unknown", fit(
                [(0, f"{mark} {row.get('alias', '?')} {remaining}"), (1, f"banked {banked}"),
                 (1, f"{event.get('label', 'source gap')} {deadline}"), (3, f"drain {drain} @ {rate}"),
                 (3, f"unused {unused}"), (0, mode), (2, console_text(job)), (0, status)], width - 2)))
        blocker = f"unknown ({capacity_error})" if capacity_error else \
            "capacity source " + ", ".join(source_gaps) if source_gaps else capacity.get("topBlocker") or "no material blocker"
        rows.append("  " + paint("warn" if capacity_error or source_gaps or incidents else None,
                                 f"top blocker: {console_text(blocker)}"))
    elif accounts.get("error"):
        rows.append("  " + paint("fail", "✕ codex accounts " + console_text(accounts["error"])))
    else:
        rows.append(f"  codex accounts {len(accounts.get('available', []))}/{accounts.get('count', 0)} available")
        for name, row in (accounts.get("accounts") or {}).items():
            source = ((row.get("capacityLease") or {}).get("sources") or {}).get("capacity") or {}
            status = capacity_freshness({"freshness": {"status": "fresh", "observedAt": source.get("observedAt")}}, now)
            if status != "fresh":
                rows.append("  " + paint("unknown", f"? {name} capacity {status}" + (" · leased" if row.get("leased") else "")))
                continue
            remaining = "?" if row.get("remainingPercent") is None else f"{row['remainingPercent']}%"
            reset = "?" if row.get("naturalResetInS") is None else dur(row["naturalResetInS"])
            banked = "?" if row.get("bankedResetCount") is None else str(row["bankedResetCount"])
            detail = f"{name} {remaining} left · reset {reset} · banked {banked}"
            if row.get("leased"):
                rows.append("  " + paint("ok", f"● {detail} · leased"))
            elif row.get("available"):
                rows.append("  " + paint("ok", f"✓ {detail}"))
            else:
                rows.append("  " + paint("fail", f"✕ {detail} · retry {dur(row.get('resetsInS') or 0)}"))
        if not accounts.get("accounts"):
            rows.append("  no ChatGPT profiles found")
    return rows


def panel_budgets(f: dict, width: int, rows: int, viewport=None) -> list[str]:
    github, feed = f["github"], f["feed"] or {}
    rate = github.get("rate") if not f["rateError"] else None
    if rate:
        remaining = min(rate["graphql"], rate["core"])
        state = "fail" if remaining < 600 else "warn" if remaining < 1500 else "ok"
        reset_in = timestamp_age(rate.get("resetAt"), f["now"])
        summary = (f"GitHub graphql {rate['graphql']}/5000 · core {rate['core']} · resets in "
                   f"{dur(-reset_in) if reset_in is not None else '?'}")
    else:
        summary, state = "GitHub budget unknown", "unknown"
    body = [] if rate else [(0, "  " + paint("unknown", "? GitHub rate: " + console_text(f["rateError"] or "unread")))]
    linear = feed.get("linear") or {}
    outbox = linear.get("outbox") if isinstance(linear.get("outbox"), dict) else {}
    if outbox:
        body.append((2, f"  Linear outbox {num(outbox.get('depth'))} · dead {num(outbox.get('dead'))} · "
                        f"oldest {dur(outbox['oldestAgeS']) if isinstance(outbox.get('oldestAgeS'), (int, float)) else 'none'}"))
    for provider, reason in sorted((dig(f["local"], "tick", "quotaBlocked", default={}) or {}).items()):
        state = worst(state, "warn")
        body.append((0, "  " + paint("warn", f"! {provider} quota-blocked: {console_text(reason)}")))
    body.extend(capacity_rows(f, width))
    return finish(heading("BUDGETS", state, summary, width), body, width, rows)


def panel_host(f: dict, width: int, rows: int, viewport=None) -> list[str]:
    system = f["system"]
    disk, memory, load, cores = system.get("diskFreePct"), system.get("memAvailPct"), system.get("load1"), system.get("cores") or 1
    state = worst("unknown" if disk is None else "fail" if disk < 10 else "warn" if disk < 20 else "ok",
                  "warn" if isinstance(memory, (int, float)) and memory < 15 else "ok",
                  "warn" if isinstance(load, (int, float)) and load > 1.5 * cores else "ok")
    summary = (f"disk {num(disk, '%')} free · mem {num(memory, '%')} free · "
               f"load {num(load)} / {system.get('cores', '?')} cores")
    return [heading("HOST", state, summary, width)]


PANELS = {"workers": panel_workers, "supply": panel_supply, "repair": panel_repair, "queue": panel_queue,
          "shipped": panel_shipped, "alerts": panel_alerts, "budgets": panel_budgets, "host": panel_host}
# Rows per panel, independent of the data so refreshes never move a panel:
# (minimum rows including the title, share of spare rows per round, maximum rows).
SIZING = {"workers": (3, 1, 12), "supply": (2, 1, 10), "repair": (3, 2, 99), "queue": (1, 1, 6),
          "shipped": (2, 2, 26), "alerts": (2, 2, 16), "budgets": (1, 1, 8), "host": (1, 0, 1)}
# Column order follows the operator's questions; one column keeps that priority top to bottom.
LAYOUTS = {
    3: [["workers", "supply", "alerts"], ["repair", "queue"], ["shipped", "budgets", "host"]],
    2: [["workers", "supply", "repair"], ["shipped", "queue", "alerts", "budgets", "host"]],
    1: [["workers", "supply", "repair", "queue", "shipped", "budgets", "host", "alerts"]],
}
GUTTER = " │ "


def allocate(names: list[str], rows: int) -> dict[str, int]:
    alloc, left = {}, rows
    for name in names:
        need = SIZING[name][0]
        if need > left:
            break
        alloc[name], left = need, left - need
    while left > 0:
        grew = False
        for name in alloc:
            _minimum, share, cap = SIZING[name]
            give = min(share, cap - alloc[name], left)
            if give > 0:
                alloc[name] += give
                left -= give
                grew = True
        if not grew:
            break
    if left and alloc:  # every panel is at its cap: the longest list takes the rest
        flex = next((name for name in ("repair", "workers", "shipped", "alerts") if name in alloc), next(iter(alloc)))
        alloc[flex] += left
    return alloc


def header(f: dict, width: int) -> str:
    local, linear, github, now = f["local"], f["linear"], f["github"], f["now"]
    release = local.get("release") or "unknown-release"
    hud_state = paint("ok", "✓ hud=release") if local.get("releaseMatchesHud") else paint("warn", "! hud≠release")
    tick = local.get("tick") or {}
    tick_age = timestamp_age(tick.get("at"), now)
    tick_note = (paint("fail", f"✕ tick {since(tick.get('at'), now)} failing") if tick.get("error") else
                 paint("warn", f"! tick {since(tick.get('at'), now)}") if tick_age is None or tick_age > 300 else
                 f"tick {since(tick.get('at'), now)}")
    left = fit([(0, paint("strong", "● JOVIE · SYMPHONY")), (0, f"lanes {release} on {local.get('host', '?')}"),
                (1, hud_state), (1, tick_note)], width)
    sources = []
    stale = [source for source in ("open", "queue", "merged", "rate") if "stale" in (github_source_error(github, source, now) or "")]
    failed = [source for source in ("open", "queue", "merged", "rate") if github.get("errors", {}).get(source)]
    sources.append((0, paint("warn", "! github stale") if stale else paint("fail", "✕ github " + "/".join(failed)) if failed
                    else f"github {since(github.get('fetchedAt'), now)}"))
    linear_age = timestamp_age(linear.get("fetchedAt"), now)
    sources.append((1, paint("fail", "✕ linear") if not linear.get("ok") else
                    paint("warn", "! linear stale " + since(linear["fetchedAt"], now)) if linear_age is None or linear_age > 3 * REFRESH_REMOTE_S
                    else f"linear {since(linear['fetchedAt'], now)}"))
    sources.append((1, f"feed {since(f['feed']['at'], now)}" if f["feed"] else paint("unknown", "? feed")))
    sources.append((2, paint("unknown", "? prod") if f["prod"]["error"] and not f["prod"].get("prodSha")
                    else f"prod {since((model_production(f) or {}).get('readAt'), now)}"))
    sources.append((0, f"{now:%H:%M:%S}Z"))
    right = fit(sources, max(10, width - visible(left) - 2))
    return pad(left + " " * max(1, width - visible(left) - visible(right)) + right, width)


def footer(f: dict, width: int, hidden: list[str]) -> str:
    return fit([(0, "● running ○ idle " + badge("ok", "ok") + " " + badge("warn", "warn") + " "
                 + badge("fail", "fail") + " " + badge("unknown", "unknown")),
                (0, paint("warn", "hidden: " + ", ".join(hidden)) if hidden else ""),
                (1, "draft→prepared→queued→merged→deployed→verified"),
                (2, "↑↓ PgUp/PgDn Home/End scroll workers"),
                (3, "sources: lane state · ledger · lanes-status · Linear mirror · GitHub · jov.ie/api/version · /proc")],
               width, sep="  │  ")


def render_panels(model: dict, width: int = 160, height: int = 45,
           viewport: SlotViewport | None = None, now: datetime | None = None) -> list[str]:
    """The panel layout: three columns from 200 cells, two from 120, one below."""
    now = utcnow() if now is None else now
    viewport = viewport or SlotViewport()
    f = interpret(model, now)
    top = [header(f, width), banner(f, width)] + delivery_rows(f, width)
    body_rows = max(0, height - len(top) - 1)
    count = 3 if width >= 200 else 2 if width >= 120 else 1
    inner = width - len(GUTTER) * (count - 1)
    widths = [inner // count + (1 if index < inner % count else 0) for index in range(count)]
    columns, hidden = [], []
    for names, column_width in zip(LAYOUTS[count], widths):
        alloc = allocate(names, body_rows)
        hidden += [name for name in names if name not in alloc]
        lines = []
        for name, rows in alloc.items():
            block = PANELS[name](f, column_width, rows, viewport)[:rows]
            lines += block + [""] * (rows - len(block))
        lines += [""] * (body_rows - len(lines))
        columns.append([pad(line, column_width) for line in lines[:body_rows]])
    body = [GUTTER.join(cells) for cells in zip(*columns)] if columns and body_rows else []
    frame = (top + body)[:max(0, height - 1)] + [footer(f, width, hidden)]
    frame = [pad(line, width) for line in frame[:height]]
    while len(frame) < height:
        frame.append(" " * width)
    return frame


def vacancy_reason(name: str, local: dict) -> str:
    if name in local.get("cooldowns", {}):
        return f"provider cooling {dur(local['cooldowns'][name])}"
    if name == "codex" and not (local.get("codex") or {}).get("available"):
        return "no codex account available"
    return "no worker process · the minute timer restarts idle lanes"


# ---------------------------------------------------------------- loop

class Remote(threading.Thread):
    def __init__(self, host):
        super().__init__(daemon=True)
        self.host, self.linear, self.github = host, {"ok": False, "error": "not read yet"}, {"ok": False, "errors": {"open": "not read yet"}}
        self.production = {}

    def run(self):
        github_at = None
        while True:
            targets = [w["run"]["target"] for w in running_workers(self.host.state) if w["run"]]
            try:
                self.linear = linear_model(self.host.linear_env, targets)
            except Exception as error:
                self.linear = {"ok": False, "error": f"{type(error).__name__}: {error}"[:100]}
            if github_at is None or time.monotonic() - github_at >= REFRESH_GITHUB_S:
                github_at = time.monotonic()
                try:
                    self.github = github_model()
                except Exception as error:
                    self.github = {"ok": False, "errors": {source: f"{type(error).__name__}: {error}"[:100]
                                   for source in ("open", "queue", "merged", "rate")}}
            try:
                self.production = production_model(getattr(self.host, "repo", None), self.github.get("merged24h"),
                                                   self.host.state / SERVED_BUILDS)
            except Exception as error:
                self.production = {"readAt": utcnow().isoformat(), "error": f"{type(error).__name__}: {error}"[:100]}
            time.sleep(REFRESH_REMOTE_S)


def build_model(host, remote: Remote | None = None) -> dict:
    local = local_model(host)
    targets = [w["run"]["target"] for w in local["workers"] if w["run"]]
    github = remote.github if remote else github_model()
    if not remote:
        known = {f"PR{pr['number']}" for pr in github.get("open") or []}
        missing = sorted({int(m.group(1)) for t in targets if t not in known and (m := TARGET_PR.match(t or ""))})
        if missing:
            cache = host.state / TARGET_TITLES
            github["targets"], error = fetch_target_titles(missing, cache)
            if error:
                github.setdefault("errors", {})["targets"] = error
            record_closed_target_alerts(github["targets"], cache, host.state / TARGET_ALERTS)
    model = {"local": local,
             "linear": remote.linear if remote else linear_model(host.linear_env, targets),
             "github": github,
             "production": remote.production if remote else production_model(
                 getattr(host, "repo", None), github.get("merged24h"), host.state / SERVED_BUILDS),
             "system": system_model()}
    model["derived"] = derived(model)
    return model


def current_hud(host) -> Path | None:
    candidate = host.state / "current" / "hud.py"
    try:
        return candidate.resolve() if candidate.exists() else None
    except OSError:
        return None


def paint_frame(frame: list[str], previous: list[str] | None) -> str:
    """Rewrite only the rows that changed. Each row is erased before it is written, so a
    full-width row keeps its final cell (EL after a pending wrap would erase it)."""
    return "".join(f"\x1b[{index + 1};1H\x1b[K{line}" for index, line in enumerate(frame)
                   if previous is None or index >= len(previous) or previous[index] != line)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--width", type=int)
    parser.add_argument("--height", type=int)
    parser.add_argument("--slot-offset", type=int, default=0,
                        help="first slot row; interactive arrows and Page Up/Down scroll")
    parser.add_argument("--interval", type=float, default=2.0)
    parser.add_argument("--layout", choices=("legacy", "panels"), default="legacy",
                        help="panels: the redesigned multi-column console layout")
    args = parser.parse_args(argv)
    host = lane.Host()
    lane.load_github_env()
    if args.json:
        print(json.dumps(build_model(host), indent=1, default=str))
        return 0
    viewport = SlotViewport(args.slot_offset)
    if args.once:
        width, height = terminal_dimensions(args)
        draw = render_panels if args.layout == "panels" else render
        sys.stdout.write("\n".join(draw(build_model(host), width, height, viewport)) + "\n")
        return 0
    remote = Remote(host)
    remote.start()
    sys.stdout.write("\x1b[?25l\x1b[2J")
    refresh_at, current_model, shown, shown_size = None, None, None, None
    try:
        with TerminalInput() as keyboard:
            while True:
                newer = current_hud(host)
                # HERE binds the loaded release. Preserve flags and restore tty
                # attributes before exec: the new process must see its real mode.
                if newer and newer != HERE / "hud.py":
                    keyboard.restore()
                    sys.stdout.write("\x1b[?25h")
                    sys.stdout.flush()
                    os.execv(sys.executable, [sys.executable, str(newer), *sys.argv[1:]])
                now = time.monotonic()
                refreshed = refresh_at is None or now >= refresh_at
                if refreshed:
                    current_model = build_model(host, remote)
                    refresh_at = time.monotonic() + max(0.0, args.interval)
                width, height = terminal_dimensions(args)
                frame = (render_panels if args.layout == "panels" else render)(current_model, width, height, viewport)
                if (width, height) != shown_size:
                    sys.stdout.write("\x1b[2J")
                    shown = None
                sys.stdout.write(paint_frame(frame, shown))
                sys.stdout.flush()
                shown, shown_size = frame, (width, height)
                if refreshed:
                    try:
                        (host.state / "hud.heartbeat").touch()
                    except OSError:
                        pass
                for key in keyboard.wait(max(0.0, refresh_at - time.monotonic())):
                    viewport.move(key)
    finally:
        sys.stdout.write("\x1b[?25h")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
