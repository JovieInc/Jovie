"""Synthetic probes for the live integrations fleet work on Gem depends on (silent-breakage gap, 2026-11-02).

Overnight 2026-11-01/02 three components broke with no incident: the jovie-research MCP was down all night
(its health timer only ran `--version`, never starting the MCP server), the Hyperagent board bridge crash-looped
on TLS EOF, and the lanes watchdog timer was dark for a week. Each probe exercises the real consumer path
(gem:host-git, JOV-11391, is the Git floor: host_git.py):

  gem:lanes-tick:timer      jovie-lanes.timer armed (busy slots can mask a dead timer)
  gem:lanes-watchdog:timer  jovie-lanes-watchdog.timer armed (the watchdog went dark when it stopped)
  gem:hyperagent-bridge     unit active, NRestarts not climbing, and the hub saw the `hyperagent` agent recently
  gem:gbrain-serve          GET 127.0.0.1:7801/health answers 200
  gem:jovie-research        `jovie-research mcp` answers an MCP initialize + tools/list over stdio, and its
                            update/health timers are armed with no failed last run
  gem:mesh-hub-link         GET /v1/board/metrics answers ok with the codex worker token
  gem:codex-auth            codex_lane.py status reads accounts and they are not all held on an auth failure

The doctor runs `observe()` on every lanes tick (probes themselves at most every MIN_INTERVAL_S) and
`alerts()` turns a probe red for RED_STREAK consecutive runs into a `probe-red:<id>` condition: the
existing doctor -> Linear -> Summer detector -> board path. The condition clears (and the doctor closes
the issue with its cleared comment) only when the probe passes again. A red probe with a `heal` spec gets
a bounded `systemctl --user` restart/start (HEAL_MAX per HEAL_WINDOW_S, HEAL_GAP_S apart), recorded in
the probe state; the condition stays open until a later probe proves the heal worked.
Every passing probe touches `<state>/probes/<id>.ok`, the host-local liveness receipt its row in canon/automation-registry.jsonl watches, so a probe pass that stops running is itself silence.
Kill switches: LANES_INTEGRATION_PROBES=0 (no probes), LANES_INTEGRATION_HEAL=0 (probe, never restart).
"""
from __future__ import annotations

import json
import os
import select
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timezone
from pathlib import Path
import host_git

SCHEMA = "jovie.integration-probes/v1"
STATE_FILE = "integration-probes.json"
RECEIPTS = "probes"
MIN_INTERVAL_S = 120
RED_STREAK = 2
HEAL_MAX = 2
HEAL_WINDOW_S = 6 * 3600
HEAL_GAP_S = 10 * 60
PASS_BUDGET_S = 45
BRIDGE_RESTARTS_PER_HOUR = 3
HUB = os.environ.get("MESH_HUB", "https://jovie-mesh-hub.tim-fd8.workers.dev")
HUB_TOKEN = Path.home() / ".jovie/mesh/codex-worker/token"
GBRAIN_HEALTH = "http://127.0.0.1:7801/health"
RESEARCH_BIN = Path.home() / ".local/bin/jovie-research"
RUNBOOK = "scripts/lanes/integration_probes.py"


def iso(epoch: float | None) -> str | None:
    return None if epoch is None else datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _epoch(value) -> float | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.timestamp() if parsed.tzinfo else None


# ------------------------------------------------------------------ host readers (injectable)

def systemd_show(unit: str, run=subprocess.run) -> dict | None:
    """`systemctl --user show` properties, or None when systemd is not readable here."""
    try:
        shown = run(["systemctl", "--user", "show", unit, "--no-pager",
                     "-p", "LoadState,ActiveState,SubState,Result,NRestarts,LastTriggerUSec,NextElapseUSecRealtime"],
                    capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return None
    if getattr(shown, "returncode", 1) != 0:
        return None
    props = {}
    for line in (shown.stdout or "").splitlines():
        key, sep, value = line.partition("=")
        if sep:
            props[key] = value
    return props


def http_json(url: str, token: str | None = None, timeout: float = 15, opener=urllib.request.urlopen) -> dict:
    """{status, body (parsed JSON or None), error}. Never raises and never echoes the token."""
    headers = {"User-Agent": "jovie-lanes-integration-probe/1"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        with opener(urllib.request.Request(url, headers=headers), timeout=timeout) as response:
            raw = response.read()
            status = getattr(response, "status", 200)
    except urllib.error.HTTPError as error:
        try:
            raw = error.read()
        except Exception:  # noqa: BLE001
            raw = b""
        status = error.code
    except (urllib.error.URLError, OSError, ValueError) as error:
        return {"status": None, "body": None, "error": f"{type(error).__name__}: {str(error)[:160]}"}
    try:
        body = json.loads(raw or b"null")
    except ValueError:
        body = None
    return {"status": status, "body": body, "error": None}


def mcp_stdio_handshake(argv: list[str], timeout: float = 30, popen=subprocess.Popen) -> dict:
    """Spawn an MCP stdio server, send initialize + tools/list, wait for the tools/list answer.

    {ok, tools, error, stderr}. A server that exits, errors, or stays silent past `timeout` is red."""
    messages = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                    "clientInfo": {"name": "jovie-lanes-integration-probe", "version": "1"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    ]
    try:
        proc = popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as error:
        return {"ok": False, "tools": None, "error": f"spawn failed: {type(error).__name__}: {error}"[:200], "stderr": ""}
    result = {"ok": False, "tools": None, "error": f"no tools/list answer within {int(timeout)}s", "stderr": ""}
    try:
        proc.stdin.write("".join(json.dumps(m) + "\n" for m in messages).encode())
        proc.stdin.flush()
        # Raw fd reads: a buffered readline() can swallow both answers while select() waits on an empty pipe.
        fd, pending = proc.stdout.fileno(), b""
        deadline = time.monotonic() + timeout
        answered = False
        while not answered and time.monotonic() < deadline:
            ready, _, _ = select.select([fd], [], [], min(1.0, max(0.0, deadline - time.monotonic())))
            if not ready:
                continue
            chunk = os.read(fd, 65536)
            if not chunk:
                result["error"] = f"server exited (code {proc.poll()}) before answering tools/list"
                break
            pending += chunk
            while b"\n" in pending and not answered:
                line, pending = pending.split(b"\n", 1)
                try:
                    message = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(message, dict):
                    continue
                if message.get("id") == 1 and message.get("error"):
                    result["error"] = f"initialize error: {json.dumps(message['error'])[:160]}"
                    answered = True
                elif message.get("id") == 2:
                    answered = True
                    if message.get("error"):
                        result["error"] = f"tools/list error: {json.dumps(message['error'])[:160]}"
                    else:
                        tools = (message.get("result") or {}).get("tools") or []
                        result.update(ok=bool(tools), tools=len(tools),
                                      error=None if tools else "tools/list returned no tools")
    except (OSError, ValueError) as error:
        result["error"] = f"{type(error).__name__}: {error}"[:200]
    finally:
        try:
            proc.kill()
        except OSError:
            pass
        try:
            _, err = proc.communicate(timeout=5)
            result["stderr"] = (err or b"").decode("utf-8", "replace").strip()[-300:]
        except Exception:  # noqa: BLE001
            pass
    if not result["ok"] and result["stderr"] and result["error"] and result["stderr"] not in result["error"]:
        result["error"] = f"{result['error']}; stderr: {result['stderr'][-160:]}"
    return result


# ------------------------------------------------------------------ probes (pure over readers)

def timer_armed(props: dict | None, unit: str) -> tuple[bool | None, str]:
    """A timer is armed when loaded, active (waiting/running) and it has a next elapse."""
    if props is None:
        return None, f"{unit}: systemd unreadable"
    if props.get("LoadState") != "loaded":
        return False, f"{unit} not installed (LoadState={props.get('LoadState')})"
    if props.get("ActiveState") != "active":
        return False, f"{unit} {props.get('ActiveState')}/{props.get('SubState')}: timer stopped, nothing will fire"
    return True, f"{unit} armed (last {props.get('LastTriggerUSec') or 'never'})"


def probe_timer(unit: str, run=subprocess.run, **_) -> dict:
    ok, detail = timer_armed(systemd_show(unit, run), unit)
    return {"ok": ok, "detail": detail}


def hub_agent(status: dict, kind: str) -> dict | None:
    for agent in ((status.get("body") or {}).get("agents") or []) if isinstance(status.get("body"), dict) else []:
        if isinstance(agent, dict) and agent.get("kind") == kind:
            return agent
    return None


def probe_bridge(prior: dict, now: float, run=subprocess.run, http=http_json, token: str | None = None, **_) -> dict:
    unit = "jovie-hyperagent-bridge.service"
    props = systemd_show(unit, run)
    if props is None:
        return {"ok": None, "detail": f"{unit}: systemd unreadable"}
    reasons = []
    if props.get("LoadState") != "loaded":
        reasons.append(f"{unit} not installed")
    elif props.get("ActiveState") != "active":
        reasons.append(f"{unit} {props.get('ActiveState')}/{props.get('SubState')} (result {props.get('Result')})")
    restarts = None
    try:
        restarts = int(props.get("NRestarts") or 0)
    except ValueError:
        pass
    samples = [s for s in (prior.get("restartSamples") or []) if isinstance(s, list) and now - s[0] <= 3600]
    if restarts is not None:
        if samples and restarts < samples[0][1]:
            samples = []  # counter reset by a manual restart or reinstall
        samples.append([now, restarts])
        climbed = restarts - samples[0][1]
        if climbed >= BRIDGE_RESTARTS_PER_HOUR:
            reasons.append(f"crash-looping: {climbed} systemd restarts in the last hour (NRestarts {restarts})")
    out = {"restartSamples": samples[-30:]}
    if token is None:
        reasons.append("hub presence unknown: codex worker token missing")
    else:
        status = http(f"{HUB}/v1/status", token=token, timeout=15)
        agent = hub_agent(status, "hyperagent")
        if status.get("status") != 200:
            reasons.append(f"hub /v1/status unreadable ({status.get('status') or status.get('error')})")
        elif agent is None:
            reasons.append("hub lists no hyperagent agent")
        else:
            seen = _epoch(agent.get("lastSeenAt"))
            limit = max(3 * int(agent.get("heartbeatSec") or 120), 300)
            if seen is None or now - seen > limit:
                age = "never" if seen is None else f"{round((now - seen) / 60)} min ago"
                reasons.append(f"hub last saw the bridge {age} (limit {limit // 60} min)")
    return {"ok": not reasons, "detail": "; ".join(reasons) or f"{unit} active, hub sees hyperagent", **out}


def probe_gbrain(http=http_json, **_) -> dict:
    answer = http(GBRAIN_HEALTH, timeout=8)
    if answer.get("status") == 200:
        return {"ok": True, "detail": "gbrain /health 200"}
    body = answer.get("body") if isinstance(answer.get("body"), dict) else {}
    why = body.get("error_description") or body.get("error") or answer.get("error") or "no body"
    return {"ok": False, "detail": f"gbrain {GBRAIN_HEALTH} -> {answer.get('status')}: {str(why)[:160]}"}


def probe_research(run=subprocess.run, handshake=mcp_stdio_handshake, **_) -> dict:
    reasons = []
    for unit in ("jovie-research-update.timer", "jovie-research-health.timer"):
        ok, detail = timer_armed(systemd_show(unit, run), unit)
        if ok is False:
            reasons.append(detail)
    for unit in ("jovie-research-update.service", "jovie-research-health.service"):
        props = systemd_show(unit, run) or {}
        if props.get("Result") not in (None, "", "success"):
            reasons.append(f"{unit} last run {props.get('Result')}")
    if not RESEARCH_BIN.exists():
        reasons.append(f"{RESEARCH_BIN} missing")
        tools = None
    else:
        answer = handshake([str(RESEARCH_BIN), "mcp"], timeout=30)
        tools = answer.get("tools")
        if not answer.get("ok"):
            reasons.append(f"jovie-research MCP down: {answer.get('error')}")
    return {"ok": not reasons, "detail": "; ".join(reasons) or f"jovie-research MCP answers ({tools} tools)"}


def probe_hub(http=http_json, token: str | None = None, **_) -> dict:
    if token is None:
        return {"ok": False, "detail": f"codex worker hub token missing ({HUB_TOKEN})"}
    answer = http(f"{HUB}/v1/board/metrics", token=token, timeout=15)
    body = answer.get("body") if isinstance(answer.get("body"), dict) else {}
    if answer.get("status") == 200 and body.get("ok") is True:
        return {"ok": True, "detail": f"hub board metrics ok ({body.get('open')} open, {body.get('claimed')} claimed)"}
    return {"ok": False, "detail": f"hub {HUB}/v1/board/metrics -> {answer.get('status') or answer.get('error')}"}


def codex_auth_state(report: dict | None, now: float) -> tuple[bool, str]:
    """Red when no account is readable or every account is held on an auth failure (quota holds are not auth)."""
    accounts = (report or {}).get("accounts")
    if not isinstance(accounts, dict) or not accounts:
        return False, "codex_lane status lists no accounts"
    held = [name for name, row in accounts.items() if isinstance(row, dict) and row.get("lastKind") == "auth"
            and float(row.get("exhaustedUntil") or 0) > now]
    if len(held) == len(accounts):
        return False, f"every codex account is held on an auth failure: {', '.join(sorted(held))}"
    note = f"; auth-held: {', '.join(sorted(held))}" if held else ""
    return True, f"codex auth ok ({len(report.get('available') or [])}/{len(accounts)} available{note})"


def probe_codex(now: float, run=subprocess.run, here: Path | None = None, **_) -> dict:
    script = (here or Path(__file__).resolve().parent) / "codex_lane.py"
    try:
        shown = run(["python3", str(script), "status"], capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError) as error:
        return {"ok": False, "detail": f"codex_lane status failed: {type(error).__name__}"}
    if getattr(shown, "returncode", 1) != 0:
        return {"ok": False, "detail": f"codex_lane status exit {shown.returncode}: {(shown.stderr or '').strip()[-160:]}"}
    try:
        report = json.loads(shown.stdout)
    except ValueError:
        return {"ok": False, "detail": "codex_lane status printed no JSON"}
    ok, detail = codex_auth_state(report, now)
    return {"ok": ok, "detail": detail}


# id -> (probe, registry id watched alongside, heal spec, owner). Ids are registry ids where a row exists.
PROBES = {
    "gem:lanes-tick:timer": {"run": lambda ctx: probe_timer("jovie-lanes.timer", **ctx), "registry": "gem:lanes-tick",
                             "heal": ("start", "jovie-lanes.timer"), "owner": "gem-lanes"},
    "gem:lanes-watchdog:timer": {"run": lambda ctx: probe_timer("jovie-lanes-watchdog.timer", **ctx),
                                 "registry": "gem:lanes-watchdog",
                                 "heal": ("start", "jovie-lanes-watchdog.timer"), "owner": "gem-lanes"},
    "gem:hyperagent-bridge": {"run": lambda ctx: probe_bridge(**ctx), "registry": "gem:hyperagent-bridge",
                              "heal": ("restart", "jovie-hyperagent-bridge.service"),
                              "owner": "gem-lanes (scripts/hyperagent/board_bridge.py)"},
    "gem:gbrain-serve": {"run": lambda ctx: probe_gbrain(**ctx), "registry": "gem:gbrain-serve",
                         "heal": ("restart", "gbrain-serve.service"), "owner": "gbrain host (JOV-10028)"},
    "gem:jovie-research": {"run": lambda ctx: probe_research(**ctx), "registry": "gem:jovie-research",
                           "heal": ("start", "jovie-research-update.service"),
                           "owner": "research router (packages/research)"},
    "gem:mesh-hub-link": {"run": lambda ctx: probe_hub(**ctx), "registry": "gem:mesh-hub-link", "heal": None,
                          "owner": "mesh hub (workers/mesh-hub)"},
    "gem:codex-auth": {"run": lambda ctx: probe_codex(**ctx), "registry": "gem:codex-auth", "heal": None,
                       "owner": "gem-lanes (scripts/lanes/codex_lane.py)"},
    "gem:host-git": {"run": lambda ctx: host_git.probe(**ctx), "registry": "gem:host-git", "heal": None, "owner": "gem-lanes (scripts/hostops/install-lane-host-git.sh)"},
}


def _read_token(path: Path) -> str | None:
    try:
        token = path.read_text().strip()
    except OSError:
        return None
    return token or None


def enabled(host_name: str, which=shutil.which) -> bool:
    if os.environ.get("LANES_INTEGRATION_PROBES", "1") == "0":
        return False
    if os.environ.get("LANES_SELFTEST") or os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return False
    return host_name == "gem" and which("systemctl") is not None


def heal(spec, entry: dict, now: float, run=subprocess.run) -> dict | None:
    """One bounded systemctl action; None when no heal applies (spec, kill switch, budget or gap)."""
    if not spec or os.environ.get("LANES_INTEGRATION_HEAL", "1") == "0":
        return None
    attempts = [a for a in (entry.get("heals") or []) if isinstance(a, dict) and now - float(a.get("at") or 0) <= HEAL_WINDOW_S]
    entry["heals"] = attempts
    if len(attempts) >= HEAL_MAX or (attempts and now - float(attempts[-1]["at"]) < HEAL_GAP_S):
        return None
    action, unit = spec
    try:
        done = run(["systemctl", "--user", action, unit], capture_output=True, text=True, timeout=60)
        code, err = getattr(done, "returncode", 1), (getattr(done, "stderr", "") or "").strip()[-160:]
    except (OSError, subprocess.SubprocessError) as error:
        code, err = None, f"{type(error).__name__}"
    attempt = {"at": now, "action": f"systemctl --user {action} {unit}", "exit": code, "error": err or None}
    attempts.append(attempt)
    return attempt


def run_pass(state: Path, now: float, ctx: dict | None = None, run=subprocess.run, probes: dict | None = None,
             force: bool = False) -> dict:
    """Probe every integration (concurrently, bounded), update streaks, heal, write receipts and state."""
    path = Path(state) / STATE_FILE
    try:
        previous = json.loads(path.read_text())
    except (OSError, ValueError):
        previous = {}
    if not force and isinstance(previous.get("at"), (int, float)) and now - previous["at"] < MIN_INTERVAL_S:
        return previous
    probes = PROBES if probes is None else probes
    ctx = {"now": now, "run": run, "token": _read_token(HUB_TOKEN), **(ctx or {})}
    prior = previous.get("probes") or {}

    def one(item):
        pid, spec = item
        started = time.monotonic()
        try:
            found = spec["run"]({**ctx, "prior": prior.get(pid) or {}})
        except Exception as error:  # a broken probe is a red probe, never a dead doctor
            found = {"ok": False, "detail": f"probe raised {type(error).__name__}: {str(error)[:160]}"}
        found["elapsedMs"] = int((time.monotonic() - started) * 1000)
        return pid, found

    # Never `with`: its exit would wait on a hung probe. Unfinished probes read red and are abandoned.
    pool = ThreadPoolExecutor(max_workers=max(1, len(probes)))
    futures = [pool.submit(one, item) for item in probes.items()]
    finished, _ = wait(futures, timeout=PASS_BUDGET_S)
    pool.shutdown(wait=False, cancel_futures=True)
    results = dict(future.result() for future in finished)
    for pid in probes:
        results.setdefault(pid, {"ok": False, "detail": f"probe did not finish within {PASS_BUDGET_S}s"})

    receipts = Path(state) / RECEIPTS
    out = {}
    for pid, found in results.items():
        old = dict(prior.get(pid) or {})
        entry = {**{k: v for k, v in old.items() if k in ("lastGoodAt", "redSince", "redStreak", "heals")},
                 **{k: v for k, v in found.items()}, "observedAt": now}
        if found.get("ok") is True:
            entry.update(lastGoodAt=now, redSince=None, redStreak=0)
            if old.get("redSince") is not None:
                entry["recoveredAt"] = now
            try:
                receipts.mkdir(parents=True, exist_ok=True)
                (receipts / f"{pid.replace(':', '_')}.ok").write_text(iso(now) + "\n")
            except OSError:
                pass
        elif found.get("ok") is False:
            entry["redSince"] = old.get("redSince") or now
            entry["redStreak"] = int(old.get("redStreak") or 0) + 1
            if entry["redStreak"] >= RED_STREAK:
                attempt = heal(probes[pid].get("heal"), entry, now, run)
                if attempt:
                    entry["lastHeal"] = attempt
        out[pid] = entry
    report = {"schema": SCHEMA, "at": now, "probes": out}
    try:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(report, indent=1, sort_keys=True))
        os.replace(tmp, path)
    except OSError:
        pass
    return report


def observe(state: Path, host_name: str, now: float, **kwargs) -> dict:
    """The doctor's view: {known, probes}. Never raises."""
    if not enabled(host_name):
        return {"known": False, "skipped": True, "probes": {}}
    try:
        report = run_pass(state, now, **kwargs)
    except Exception as error:  # noqa: BLE001 - observability never takes the doctor down
        return {"known": False, "error": f"{type(error).__name__}: {str(error)[:120]}", "probes": {}}
    return {"known": True, "at": report.get("at"), "probes": report.get("probes") or {}}


def alerts(observation: dict | None, now: float) -> dict[str, str]:
    """`probe-red:<id>` for every probe red RED_STREAK runs in a row; cleared only by a passing probe."""
    found = {}
    for pid, entry in sorted(((observation or {}).get("probes") or {}).items()):
        if entry.get("ok") is not False or int(entry.get("redStreak") or 0) < RED_STREAK:
            continue
        spec = PROBES.get(pid) or {}
        since = entry.get("redSince")
        good = entry.get("lastGoodAt")
        heal_note = ""
        if entry.get("heals"):
            last = entry["heals"][-1]
            heal_note = (f"; self-heal tried {len(entry['heals'])}x (last: {last.get('action')} exit {last.get('exit')} "
                         f"at {iso(last.get('at'))}), condition stays open until a probe passes")
        found[f"probe-red:{pid}"] = (
            f"integration probe {pid} red {entry.get('redStreak')} runs since {iso(since)} "
            f"(last good {iso(good) or 'never seen'}): {str(entry.get('detail'))[:300]}{heal_note}; "
            f"owner {spec.get('owner', 'gem-lanes')}; runbook {RUNBOOK}")
    if (observation or {}).get("known") is False and (observation or {}).get("error"):
        found["integration-probes-unreadable"] = (
            f"integration probe pass failed ({observation['error']}); no Gem integration is being probed")
    return found


def suppressed_silence(observation: dict | None) -> set[str]:
    """Registry ids whose automation-silent alert is the same incident as an active probe-red (keep one issue)."""
    ids = set()
    for pid, entry in ((observation or {}).get("probes") or {}).items():
        if entry.get("ok") is False and int(entry.get("redStreak") or 0) >= RED_STREAK and PROBES.get(pid):
            ids.add(PROBES[pid]["registry"])
    return ids


def last_good(observation: dict | None, key: str) -> float | None:
    """Last proof of life for a `probe-red:<id>` condition (the start of its undetected stage)."""
    if not key.startswith("probe-red:"):
        return None
    entry = ((observation or {}).get("probes") or {}).get(key.split(":", 1)[1]) or {}
    value = entry.get("lastGoodAt")
    return float(value) if isinstance(value, (int, float)) else None


if __name__ == "__main__":
    import sys
    state_dir = Path(os.environ.get("LANES_STATE", Path.home() / ".local/state/jovie-lanes"))
    # Read-only one-shot for operators: probe now, never heal, never touch the doctor's probe state.
    os.environ["LANES_INTEGRATION_HEAL"] = "0"
    with __import__("tempfile").TemporaryDirectory() as scratch:
        report = run_pass(Path(scratch), time.time(), force=True)
    for pid, entry in sorted(report["probes"].items()):
        print(f"{'GREEN' if entry.get('ok') else 'RED  ' if entry.get('ok') is False else 'UNKWN'} {pid}: "
              f"{entry.get('detail')} ({entry.get('elapsedMs')} ms)")
    sys.exit(0 if all(e.get("ok") for e in report["probes"].values()) else 1)
