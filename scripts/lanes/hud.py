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


def ledger_window(state: Path, hours: int = 24) -> list[dict]:
    since = (utcnow() - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    try:
        with open(state / "runs" / "ledger.jsonl") as handle:
            for line in handle:
                try:
                    receipt = json.loads(line)
                except ValueError:
                    continue
                if receipt.get("endedAt", "") >= since:
                    rows.append(receipt)
    except OSError:
        pass
    return rows


def local_model(host) -> dict:
    state = host.state
    providers = lane.load_providers()
    enabled = {name: spec for name, spec in providers.items() if spec.get("enabled", True)}
    slots = {name: host.slots(name, spec.get("slots", 1)) for name, spec in enabled.items()}
    tree = read_text(state / "current" / ".tree")
    current = (state / "current").resolve()
    receipts = ledger_window(state)
    verdicts = Counter(r.get("verdict") for r in receipts)
    landed = sorted((r for r in receipts if r.get("verdict") in ("landing", "verified-not-queued")),
                    key=lambda r: r.get("endedAt", ""), reverse=True)
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
        "lastLanding": landed[0].get("endedAt") if landed else None,
        "held": read_json(state / "held.json", {}), "failures": read_json(state / "failures.json", {}),
        "gateTimeouts": read_json(state / "gate-timeouts.json", {}), "requeue": read_json(state / "requeue.json", {}),
        "cooldowns": cooldowns, "codex": accounts, "doctor": read_json(state / "doctor.json", {}),
        "gateSeats": host.gate_slots, "generatedAt": utcnow().isoformat(),
    }


def read_text(path: Path) -> str:
    try:
        return path.read_text().strip()
    except OSError:
        return ""


def linear_model(env_file: Path) -> dict:
    try:
        client = lane.Linear(env_file)
        data = client.gql(
            'query($labels:[String!]!){'
            'pool: issues(first:100,filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"Todo"}},labels:{name:{in:$labels}}})'
            '{nodes{identifier priority labels{nodes{name}}}}'
            'active: issues(first:100,filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"In Progress"}},labels:{name:{in:$labels}}})'
            '{nodes{identifier title labels{nodes{name}}}}'
            'triage: issues(first:100,filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"Triage"}},labels:{name:{in:$labels}}})'
            '{nodes{identifier}}}', {"labels": list(LANE_LABELS)})
    except Exception as error:
        return {"ok": False, "error": f"{type(error).__name__}: {error}"[:100]}
    pool = Counter()
    for node in data["pool"]["nodes"]:
        for label in node["labels"]["nodes"]:
            if label["name"] in LANE_LABELS:
                pool[label["name"]] += 1
    active = {n["identifier"]: n["title"] for n in data["active"]["nodes"]}
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
            prs += gh_json(["pr", "list", "--repo", lane.REPO_SLUG, "--state", "open", "--limit", "40",
                            "--search", f"head:{name}/", "--json",
                            "number,title,headRefName,isDraft,mergeStateStatus,statusCheckRollup,updatedAt,url"])
        rows = []
        for pr in prs:
            found = lane.LANE_BRANCH.match(pr["headRefName"])
            if not found:
                continue
            checks = Counter()
            for check in pr.get("statusCheckRollup") or []:
                conclusion = check.get("conclusion") or check.get("status") or "PENDING"
                checks["fail" if conclusion in lane.RED else "pending" if conclusion in ("IN_PROGRESS", "QUEUED", "PENDING", "EXPECTED", "WAITING")
                       else "pass" if conclusion in ("SUCCESS", "NEUTRAL", "SKIPPED") else "other"] += 1
            rows.append({"number": pr["number"], "title": pr["title"], "lane": found.group("lane"),
                         "issue": found.group("issue").upper(), "draft": pr["isDraft"], "merge": pr["mergeStateStatus"],
                         "checks": dict(checks), "updatedAt": pr["updatedAt"]})
        model["open"] = sorted(rows, key=lambda r: r["updatedAt"], reverse=True)
    except Exception as error:
        model["errors"]["open"] = f"{type(error).__name__}: {error}"[:100]
    try:
        since = (utcnow() - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
        merged = gh_json(["pr", "list", "--repo", lane.REPO_SLUG, "--state", "merged", "--limit", "30",
                          "--search", f"merged:>={since}", "--json", "number,title,headRefName,mergedAt"])
        model["merged24h"] = [{"number": m["number"], "title": m["title"], "mergedAt": m["mergedAt"],
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
        model["rate"] = {"core": limits["resources"]["core"]["remaining"], "graphql": limits["resources"]["graphql"]["remaining"],
                         "resetAt": datetime.fromtimestamp(limits["resources"]["graphql"]["reset"], timezone.utc).isoformat()}
    except Exception as error:
        model["errors"]["rate"] = f"{type(error).__name__}: {error}"[:100]
    model["ok"] = not model["errors"]
    model["fetchedAt"] = utcnow().isoformat()
    return model


def system_model() -> dict:
    try:
        load1 = os.getloadavg()[0]
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
    left = rgb(WHITE, "● JOVIE · SYMPHONY", bold=True) + rgb(DIM, f" · lanes {release} on {local['host']} · {hud_state}")
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
                text = rgb(DIM, "○ ") + rgb(FG, f"{name:<6} ") + rgb(DIM, "worker polling · " + pool_hint(name, linear))
            else:
                text = rgb(DIM, "○ ") + rgb(FG, f"{name:<6} ") + rgb(DIM, "vacant · " + vacancy_hint(name, local, linear))
            lines.append(pad("│ " + text, width - 1) + rgb(DIM, "│"))
            shown += 1
    lines.append(closer(width))

    # codex accounts
    accounts = local["codex"]
    if accounts.get("error"):
        lines.append(pad(rgb(FG, "CODEX ACCOUNTS  ", bold=True) + rgb(RED, accounts["error"]), width))
    else:
        parts = []
        for name, row in accounts.get("accounts", {}).items():
            if row["leased"]:
                parts.append(rgb(PURPLE, f"● {name} leased"))
            elif row["available"]:
                parts.append(rgb(GREEN, f"✓ {name}"))
            else:
                parts.append(rgb(RED, f"✕ {name} banked {dur(row['resetsInS'])}"))
        summary = f"{len(accounts.get('available', []))}/{accounts.get('count', 0)} available"
        lines.append(pad(rgb(FG, "CODEX ACCOUNTS  ", bold=True) + rgb(DIM, summary + "  ") + "  ".join(parts or [rgb(DIM, "no ChatGPT profiles found")]), width))

    # pipeline
    open_prs = github.get("open", [])
    queue = github.get("queue", {})
    queued = {e["number"]: e for e in queue.get("entries", [])}
    head = f"PIPELINE · open lane PRs {len(open_prs)} · draft {sum(1 for p in open_prs if p['draft'])} · ready {sum(1 for p in open_prs if not p['draft'])} · merge queue {queue.get('depth', rgb(RED, github.get('errors', {}).get('queue', 'unread')))}"
    if "open" in github.get("errors", {}):
        head += " · " + rgb(RED, "PR list: " + github["errors"]["open"])
    lines.append(rgb(FG, head, bold=True))
    pipeline_budget = max(4, height - len(lines) - 14)
    for pr in open_prs[:pipeline_budget]:
        checks = pr["checks"]
        check_text = (rgb(GREEN, f"✓{checks.get('pass', 0)}") + " " + (rgb(RED, f"✕{checks['fail']}") if checks.get("fail") else rgb(DIM, "✕0"))
                      + " " + (rgb(ORANGE, f"…{checks['pending']}") if checks.get("pending") else rgb(DIM, "…0")))
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
    lane_merged = [m for m in merged if m["lane"]]
    lines.append(rgb(FG, f"RECENTLY MERGED · lanes {len(lane_merged)} of {len(merged)} in 24h · last landing {age(local.get('lastLanding'), now)}", bold=True)
                 + ("" if "merged" not in github.get("errors", {}) else "  " + rgb(RED, github["errors"]["merged"])))
    for m in merged[:3]:
        lines.append(pad(f" {rgb(GREEN, '✓')} #{m['number']} {clip(m['title'], 90)} {rgb(DIM, (m['lane'] or 'human') + ' · ' + age(m['mergedAt'], now))}", width))

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
    if not attention:
        attention.append(rgb(GREEN, "✓ nothing needs a human"))
    lines.append(rgb(FG, "NEEDS ATTENTION  ", bold=True) + rgb(DIM, f"held {len(local['held'])} · failures {len(local['failures'])} · ") + " · ".join(attention[:4]))
    counts = " · ".join(f"{k} {v}" for k, v in sorted(ledger.items())) or "no runs"
    lines.append(rgb(DIM, f"  24h verdicts: {counts}"))

    # backlog
    if linear.get("ok"):
        pool = linear["pool"]
        backlog = " · ".join(f"{label} {pool.get(label, 0)}" for label in LANE_LABELS)
        lines.append(rgb(FG, "BACKLOG  ", bold=True) + rgb(DIM, f"Todo pool {linear['poolTotal']} ({backlog}) · in progress {len(linear['active'])} · triage returns {linear['triage']}"))
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


def pool_hint(name: str, linear: dict) -> str:
    if not linear.get("ok"):
        return "pool unknown (Linear unread)"
    pool = linear["pool"]
    total = pool.get(name, 0) + pool.get("agent-ready", 0)
    return f"pool {total} (own {pool.get(name, 0)}, shared {pool.get('agent-ready', 0)})" if total else "pool empty"


def vacancy_hint(name: str, local: dict, linear: dict) -> str:
    if name in local["cooldowns"]:
        return f"provider cooling {dur(local['cooldowns'][name])}"
    if name == "codex" and not local["codex"].get("available"):
        return "no codex account available"
    return "no worker (timer restarts idle lanes each minute) · " + pool_hint(name, linear)


# ---------------------------------------------------------------- loop

class Remote(threading.Thread):
    def __init__(self, host):
        super().__init__(daemon=True)
        self.host, self.linear, self.github = host, {"ok": False, "error": "not read yet"}, {"ok": False, "errors": {"open": "not read yet"}}

    def run(self):
        while True:
            self.linear = linear_model(self.host.linear_env)
            self.github = github_model()
            time.sleep(REFRESH_REMOTE_S)


def build_model(host, remote: Remote | None = None) -> dict:
    return {"local": local_model(host),
            "linear": remote.linear if remote else linear_model(host.linear_env),
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
            time.sleep(args.interval)
    finally:
        sys.stdout.write("\x1b[?25h")


if __name__ == "__main__":
    sys.exit(main())
