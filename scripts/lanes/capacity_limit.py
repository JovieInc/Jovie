#!/usr/bin/env python3
"""Capacity-limit records: when lanes cannot grow only because a real limit binds, say which one
and what unblocks it (Tim 2026-10-12: "no bottleneck found, needs unblocking, do X").

Runs inside the dispatch tick after autoscale. Reads local files only, except for one signed POST
to Summer when a record changes (contract agreed with Summer, ``jovie.capacity-limit/v1``):
``limited`` when a real ceiling binds a lane that has waiting work, ``cleared`` once when it lifts,
and a replay of the current state after each release install. No heartbeat, no retry loop: an
undelivered record is retried on the next tick, and a failed POST never affects dispatch.

Only measured limits map to a resource. Code, gate, queue or unknown-measurement holds set
``bottleneckFound`` in the local record and are never sent as a capacity limit."""
from __future__ import annotations

import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import autoscale

SCHEMA = "jovie.capacity-limit/v1"
LOCAL_SCHEMA = "symphony-lanes-capacity-limit/v1"
RECORD_FILE, TRACKER_FILE = "capacity-limit.json", "capacity-limit-tracker.json"
ROUTE = "/summer/v1/symphony/capacity-limits"
# Anti-flap: a resource must bind (or be clear) for this many consecutive ticks before it is
# published (or cleared). Ticks are the existing dispatch minute; nothing else schedules this.
HYSTERESIS_TICKS = 3
POST_TIMEOUT_S = 10
DELIVERY_ID = re.compile(r"^[A-Za-z0-9:_-]{16,128}$")
KEY_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$")
RESOURCES = frozenset({"codex-credits", "codex-accounts", "claude-credits", "ai-gateway-credits", "host-cpu",
                       "host-memory", "host-disk", "network-bandwidth", "github-api-quota",
                       "github-actions-concurrency", "linear-api-quota"})
# Lane credits Summer knows about; other providers' banks stay in the local record only.
CREDIT_RESOURCE = {"codex": "codex-credits", "claude": "claude-credits", "hyperagent": "claude-credits"}
# Holds with no unmet demand behind them: nothing is limited.
NO_DEMAND = frozenset({"zero-demand", "unknown-demand", "not-saturated", "disabled", "provider-disabled", "host-settle"})
# Holds that are software, not a resource: bottleneckFound=true, never sent.
SOFTWARE = frozenset({"stale-doctor", "unhealthy", "unknown-running", "gate-pressure", "github-unknown"})
HOST_TOKENS = frozenset({"high-load", "psi-high", "low-mem", "disk-low", "host-pressure", "host-ceiling", "lane-ceiling"})
UNBLOCK = {
    "host-cpu": ("add compute: a second lanes host or a larger machine", "one more 16-core host"),
    "host-memory": ("add memory to the lanes host", "RAM upgrade"),
    "host-disk": ("free or add disk on the lanes host", "disk upgrade"),
    "codex-accounts": ("add a Codex account (another ChatGPT Pro login) for more concurrent runs", "$200/mo per account"),
    "codex-credits": ("raise the ChatGPT plan ($200 -> $500) or add a Codex account", "$300/mo"),
    "claude-credits": ("raise the Claude plan or add a Claude login", "plan upgrade"),
    "ai-gateway-credits": ("add AI Gateway credits", "credit top-up"),
    "github-api-quota": ("add a GitHub App installation token or raise the GitHub plan", "plan upgrade"),
}


def _obj(value) -> dict:
    return value if isinstance(value, dict) else {}


def _num(value):
    return autoscale._num(value)


def _iso(when: float) -> str:
    return autoscale._iso(when)


def canonical(value) -> str:
    """Byte-identical to canonical() in summer-triage-assessment-client.mjs for ASCII keys:
    recursively key-sorted JSON in localeCompare order (case-insensitive, lowercase first)."""
    if isinstance(value, list):
        return "[" + ",".join(canonical(child) for child in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value, key=lambda key: (key.casefold(), key.swapcase()))
        return "{" + ",".join(json.dumps(key, ensure_ascii=False) + ":" + canonical(value[key]) for key in keys) + "}"
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def read_env_file(path: Path, wanted: tuple[str, ...]) -> dict:
    """systemd EnvironmentFile subset: KEY=value, KEY="multi-line quoted value". Only `wanted`
    keys are kept; values are never logged."""
    found, key, buffer = {}, None, []
    try:
        lines = Path(path).read_text().splitlines()
    except OSError:
        return found
    for line in lines:
        if key is not None:
            buffer.append(line)
            if line.rstrip().endswith('"'):
                value = "\n".join(buffer).rstrip()[:-1]
                if key in wanted:
                    found[key] = value
                key, buffer = None, []
            continue
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        name = name.strip().removeprefix("export ").strip()
        value = value.strip()
        if value.startswith('"') and not (len(value) > 1 and value.endswith('"')):
            key, buffer = name, [value[1:]]
            continue
        if len(value) > 1 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if name in wanted:
            found[name] = value
    return found


def summer_config(env=None) -> dict | None:
    """Origin, key id and PEM from the existing Summer env files; None when absent or invalid."""
    env = os.environ if env is None else env
    home = Path.home() / ".config" / "symphony"
    origin_file = Path(env.get("LANES_SUMMER_ENV") or home / "summer-bottleneck.env")
    signing_file = Path(env.get("LANES_SUMMER_SIGNING_ENV") or home / "summer-bottleneck-signing.env")
    values = {**read_env_file(origin_file, ("SUMMER_BOTTLENECK_ORIGIN",)),
              **read_env_file(signing_file, ("SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID",
                                             "SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY"))}
    origin = values.get("SUMMER_BOTTLENECK_ORIGIN") or ""
    parsed = urllib.parse.urlsplit(origin)
    key_id = values.get("SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID") or ""
    pem = values.get("SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY") or ""
    if parsed.scheme != "https" or not parsed.hostname or parsed.path not in ("", "/") or parsed.query \
            or parsed.username or parsed.port or not KEY_ID.match(key_id) or "PRIVATE KEY" not in pem:
        return None
    return {"origin": f"https://{parsed.hostname}", "keyId": key_id, "pem": pem}


def sign(message: bytes, pem: str) -> str:
    """Ed25519 signature, base64url without padding (Node's 'base64url')."""
    import base64
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives.serialization import load_pem_private_key
    except ImportError:
        script = ("const c=require('node:crypto');let d='';process.stdin.on('data',x=>d+=x).on('end',()=>{"
                  "const j=JSON.parse(d);const k=c.createPrivateKey(j.pem);if(k.asymmetricKeyType!=='ed25519')process.exit(2);"
                  "process.stdout.write(c.sign(null,Buffer.from(j.m,'base64'),k).toString('base64url'))})")
        done = subprocess.run(["node", "-e", script], input=json.dumps({"pem": pem, "m": base64.b64encode(message).decode()}),
                              capture_output=True, text=True, timeout=20)
        if done.returncode or not done.stdout:
            raise ValueError("capacity-limit-signing-failed")
        return done.stdout.strip()
    key = load_pem_private_key(pem.encode(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("capacity-limit-signing-key-invalid")
    return base64.urlsafe_b64encode(key.sign(message)).decode().rstrip("=")


def signed_body(unsigned: dict, config: dict, now: float) -> dict:
    body = {**unsigned, "sentAt": _iso(now), "signatureKeyId": config["keyId"]}
    signature = sign(f"{SCHEMA}\0{canonical(body)}".encode(), config["pem"])
    return {**body, "signature": f"ed25519={signature}"}


ALLOWED = frozenset({"schema", "status", "resource", "host", "lanes", "needs", "observed", "limit", "unit", "since",
                     "until", "unblock", "sentAt", "deliveryId", "signatureKeyId", "signature"})


def valid_body(body: dict) -> bool:
    """The strict shape Summer accepts (unknown fields rejected)."""
    if set(body) - ALLOWED or body.get("schema") != SCHEMA or body.get("status") not in ("limited", "cleared"):
        return False
    if body.get("resource") not in RESOURCES or not isinstance(body.get("host"), str) or not body["host"]:
        return False
    lanes = body.get("lanes")
    if not isinstance(lanes, list) or len(lanes) > 20 or not all(isinstance(lane, str) and lane for lane in lanes):
        return False
    needs = body.get("needs")
    if body["status"] == "limited" and not (isinstance(needs, str) and 0 < len(needs) <= 200):
        return False
    if needs is not None and not (isinstance(needs, str) and len(needs) <= 200):
        return False
    for key in ("observed", "limit"):
        if key in body and (isinstance(body[key], bool) or not isinstance(body[key], (int, float))):
            return False
    if "unit" in body and not isinstance(body["unit"], str):
        return False
    if "unblock" in body and (not isinstance(body["unblock"], dict) or set(body["unblock"]) - {"action", "estCost"}
                              or not all(isinstance(value, str) for value in body["unblock"].values())):
        return False
    stamps = [body.get("since"), body.get("sentAt")] + ([body["until"]] if "until" in body else [])
    if not all(isinstance(stamp, str) and autoscale._epoch(stamp) is not None for stamp in stamps):
        return False
    return bool(DELIVERY_ID.match(str(body.get("deliveryId") or ""))) and isinstance(body.get("signatureKeyId"), str) \
        and str(body.get("signature") or "").startswith("ed25519=")


def _host_evidence(state: dict, obs: dict) -> dict:
    sample, disk = _obj(state.get("hostSample")), _obj(obs.get("disk"))
    mem = _num(sample.get("memAvailableBytes"))
    return {"load1": _num(sample.get("load1")), "cpuCount": autoscale._int(sample.get("cpuCount")),
            "psiCpu": _num(_obj(sample.get("psi")).get("cpuSomeAvg10")),
            "psiMemory": _num(_obj(sample.get("psi")).get("memoryFullAvg10")),
            "memAvailableGiB": None if mem is None else round(mem / autoscale.GIB, 1),
            "diskFreePct": _num(disk.get("freePct")), "diskAdmitted": disk.get("admitted")}


def _host_resource(tokens: list[str], evidence: dict) -> str:
    free, mem = evidence.get("diskFreePct"), evidence.get("memAvailableGiB")
    if "disk-low" in tokens or evidence.get("diskAdmitted") is False or (free is not None and free < autoscale.DISK_SOFT):
        return "host-disk"
    if "low-mem" in tokens or (mem is not None and mem * autoscale.GIB < autoscale.MEM_HEADROOM_BYTES):
        return "host-memory"
    return "host-cpu"


def lane_limit(name: str, row: dict, state: dict, obs: dict) -> tuple[str | None, dict | None, bool]:
    """(resource, measurement, software) for one lane's hold. Resource None: nothing binds."""
    tokens = [token for token in (row.get("blockers") or []) if isinstance(token, str)]
    demand = autoscale._count(row.get("demand"))
    if not tokens or not demand or row.get("lastReason") == "sustained-demand" or any(token in NO_DEMAND for token in tokens):
        return None, None, False
    if any(token in SOFTWARE for token in tokens):
        return None, {"lane": name, "blockers": tokens}, True
    first = tokens[0]
    attribution = _obj(obs.get("codexAttribution"))
    banked = (name == "codex" and bool(attribution.get("quotaBanked") or attribution.get("rateCooldown")
                                       or attribution.get("authCooldown"))) \
        or _num(_obj(obs.get("rateBankAt")).get(name)) is not None
    if first in ("rate-limited", "cooling") and not banked:
        # A lane cooldown without provider bank evidence is not a measured credit limit.
        return None, {"lane": name, "blockers": tokens}, True
    if first in ("rate-bank", "rate-limited", "cooling") or (name == "codex" and first in ("codex-unleased", "lane-ceiling") and banked):
        resource = CREDIT_RESOURCE.get(name, f"{name}-credits")
        return resource, {"hold": first, "codex": attribution if name == "codex" else None}, False
    if name == "codex" and first in ("codex-unleased", "lane-ceiling"):
        return "codex-accounts", {"running": row.get("running"), "ceiling": row.get("ceiling"),
                                  "loginSlots": attribution.get("loginSlots")}, False
    if first in ("github-budget", "github-budget-low"):
        return "github-api-quota", {"githubRemaining": autoscale._int(obs.get("githubRemaining"))}, False
    if first in HOST_TOKENS:
        evidence = _host_evidence(state, obs)
        resource = _host_resource(tokens, evidence)
        if resource == "host-disk" and obs.get("diskReclaimable") is not False:
            # Not a real limit while the sweep still has targets (or that is unknown).
            return None, {"lane": name, "blockers": tokens, "disk": "reclaimable"}, True
        return resource, evidence, False
    return None, {"lane": name, "blockers": tokens}, True


def _measure(resource: str, evidence: dict, lanes: list[str], waiting: int) -> dict:
    """needs line plus observed/limit/unit, from measured values only."""
    who = ", ".join(lanes)
    if resource == "host-cpu":
        load, cpu, psi = evidence.get("load1"), evidence.get("cpuCount"), evidence.get("psiCpu")
        tail = f", PSI cpu {psi:.0f}%" if psi is not None else ""
        return {"needs": f"host-cpu: load {load:.1f} on {cpu} cores{tail}; {who} hold {waiting} waiting runs"[:200]
                if load is not None and cpu else f"host-cpu saturated; {who} hold {waiting} waiting runs",
                "observed": round(load, 1) if load is not None else None, "limit": cpu, "unit": "load1"}
    if resource == "host-memory":
        gib = evidence.get("memAvailableGiB")
        return {"needs": f"host-memory: {gib} GiB available, lanes need {autoscale.MEM_HEADROOM_BYTES // autoscale.GIB} GiB "
                         f"headroom; {who} hold {waiting} waiting runs"[:200],
                "observed": gib, "limit": autoscale.MEM_HEADROOM_BYTES // autoscale.GIB, "unit": "GiB-available"}
    if resource == "host-disk":
        free = evidence.get("diskFreePct")
        return {"needs": f"host-disk: {free}% free, lanes grow above {autoscale.DISK_INCREASE_MIN}%; "
                         f"{who} hold {waiting} waiting runs"[:200],
                "observed": free, "limit": autoscale.DISK_INCREASE_MIN, "unit": "percent-free"}
    if resource == "codex-accounts":
        running, slots = evidence.get("running"), evidence.get("loginSlots") or evidence.get("ceiling")
        return {"needs": f"codex-accounts: {running}/{slots} runs on the one ChatGPT login busy; "
                         f"{waiting} codex runs waiting"[:200], "observed": running, "limit": slots, "unit": "runs"}
    if resource == "github-api-quota":
        left = evidence.get("githubRemaining")
        return {"needs": f"github-api-quota: {left} requests left this hour, lanes grow above "
                         f"{autoscale.GITHUB_INCREASE_MIN}; {who} hold {waiting} waiting runs"[:200],
                "observed": left, "limit": autoscale.GITHUB_INCREASE_MIN, "unit": "requests"}
    codex = _obj(evidence.get("codex"))
    reset = codex.get("earliestCooldownS")
    when = f", resets in {int(reset) // 60} min" if isinstance(reset, (int, float)) and reset > 0 else ""
    return {"needs": f"{resource}: {who} banked by its provider ({evidence.get('hold')}){when}; "
                     f"{waiting} runs waiting"[:200], "observed": None, "limit": None, "unit": None,
            "untilS": reset if isinstance(reset, (int, float)) and reset > 0 else None}


def evaluate(state: dict, obs: dict) -> tuple[dict, list]:
    """Current binding per resource {resource: {lanes, evidence, waiting}} and software holds."""
    binding, software = {}, []
    for name, row in _obj(state.get("lanes")).items():
        if not isinstance(row, dict) or not autoscale._count(row.get("base")):
            continue
        resource, evidence, soft = lane_limit(name, row, state, obs)
        if soft:
            software.append(evidence)
        elif resource:
            entry = binding.setdefault(resource, {"lanes": [], "evidence": evidence, "waiting": 0})
            entry["lanes"].append(name)
            entry["waiting"] += autoscale._count(row.get("demand")) or 0
    return binding, software


def _material(previous: dict, current: dict) -> bool:
    """A changed limit (e.g. login slots) is material; the observed value moving (load jitter,
    busy runs 1 -> 3) is not: re-POSTing on it was churn (Gem 03:59-04:05Z)."""
    return previous.get("limit") != current.get("limit")


def step(tracker: dict | None, state: dict, obs: dict, now: float, *, host: str, release_at: float | None) -> tuple[dict, list, bool]:
    """Pure. (next tracker, unsigned bodies to emit, local-record-changed)."""
    tracker = _obj(tracker); seen, published = _obj(tracker.get("seen")), _obj(tracker.get("published"))
    binding, software = evaluate(state, obs)
    found = bool(software)
    nxt_seen = {}
    for resource in set(seen) | set(binding):
        row = _obj(seen.get(resource))
        if resource in binding:
            nxt_seen[resource] = {"bound": (autoscale._int(row.get("bound")) or 0) + 1, "clear": 0,
                                  "since": _num(row.get("since")) or now}
        elif resource in published:
            nxt_seen[resource] = {**row, "bound": 0, "clear": (autoscale._int(row.get("clear")) or 0) + 1}
    replay = release_at is not None and release_at != tracker.get("releaseInstalledAt")
    emit, nxt_published = [], {}
    for resource, row in sorted(nxt_seen.items()):
        last = _obj(published.get(resource))
        if resource in binding and (row["bound"] >= HYSTERESIS_TICKS or last):
            entry = binding[resource]
            lanes = sorted(entry["lanes"])[:20]
            measured = _measure(resource, entry["evidence"], lanes, entry["waiting"])
            action, cost = UNBLOCK.get(resource, (f"add {resource.removesuffix('-credits')} credits", "credit top-up"))
            current = {"lanes": lanes, "needs": measured["needs"], "observed": measured.get("observed"),
                       "limit": measured.get("limit"), "action": action, "since": row["since"]}
            nxt_published[resource] = current
            changed = not last or last.get("lanes") != lanes or last.get("action") != action or _material(last, current)
            if changed or replay:
                body = {"schema": SCHEMA, "status": "limited", "resource": resource, "host": host, "lanes": lanes,
                        "needs": measured["needs"], "since": _iso(row["since"]), "unblock": {"action": action, "estCost": cost}}
                for key in ("observed", "limit", "unit"):
                    if measured.get(key) is not None:
                        body[key] = measured[key]
                if measured.get("untilS"):
                    body["until"] = _iso(now + measured["untilS"])
                if not changed:
                    nxt_published[resource] = {**current, **{key: last.get(key) for key in ("needs", "observed", "limit")}}
                emit.append(body)
        elif last and row.get("clear", 0) < HYSTERESIS_TICKS:
            nxt_published[resource] = last
        elif last:
            emit.append({"schema": SCHEMA, "status": "cleared", "resource": resource, "host": host,
                         "lanes": last.get("lanes") or [], "since": _iso(_num(last.get("since")) or now)})
            nxt_seen.pop(resource, None)
    nxt_seen = {resource: row for resource, row in nxt_seen.items() if resource in binding or resource in nxt_published}
    changed_local = set(nxt_published) != set(published) or found != (tracker.get("bottleneckFound") is True) or bool(emit)
    return ({"seen": nxt_seen, "published": nxt_published, "bottleneckFound": found, "software": software,
             "releaseInstalledAt": release_at, "outbox": tracker.get("outbox") or []}, emit, changed_local)


def _post(config: dict, body: dict) -> int:
    request = urllib.request.Request(config["origin"] + ROUTE, data=json.dumps(body).encode(), method="POST",
                                     headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=POST_TIMEOUT_S) as response:  # noqa: S310 (https origin validated)
            return response.status
    except urllib.error.HTTPError as failure:
        return failure.code


def emit(status: str, resource: str, host: str, lanes: list, needs: str | None = None, since: str | None = None,
         until: str | None = None, unblock: dict | None = None, observed=None, limit=None, unit: str | None = None, *,
         delivery_id: str, config: dict | None = None, post=_post, now: float | None = None) -> int | None:
    """Sign and POST one record. The key id and key are read from the env files on every call
    (never cached: the key may rotate). Returns the HTTP status, or None when nothing was sent.
    Never raises; the status code is logged, the key never is."""
    now = time.time() if now is None else now
    unsigned = {"schema": SCHEMA, "status": status, "resource": resource, "host": host, "lanes": list(lanes),
                "since": since or _iso(now), "deliveryId": delivery_id}
    for key, value in (("needs", needs), ("until", until), ("unblock", unblock), ("observed", observed),
                       ("limit", limit), ("unit", unit)):
        if value is not None:
            unsigned[key] = value
    try:
        config = summer_config() if config is None else config
        if not config:
            return None
        body = signed_body(unsigned, config, now)
        if not valid_body(body):
            print(f"capacity-limit: {resource} {status} not sent: body fails the strict shape", file=sys.stderr)
            return 422
        code = post(config, body)
    except Exception as failure:  # noqa: BLE001 - delivery must never affect dispatch
        print(f"capacity-limit: POST {resource} {status} failed: {type(failure).__name__}", file=sys.stderr)
        return None
    print(f"capacity-limit: POST {resource} {status} -> {code}", file=sys.stderr)
    return code


def deliver(outbox: list, config: dict | None, now: float, post=_post) -> list:
    """One attempt per pending body this tick; returns what is still undelivered. 2xx and 422
    (bad shape: retrying the same body cannot help) leave the outbox; anything else waits for
    the next tick. Never raises."""
    if not config:
        return outbox
    remaining = []
    for row in outbox:
        fields = {key: row.get(key) for key in ("status", "resource", "host", "lanes", "needs", "since", "until",
                                                 "unblock", "observed", "limit", "unit")}
        status = emit(**fields, delivery_id=row["deliveryId"], config=config, post=post, now=now)
        if status is None or not (200 <= status < 300 or status == 422):
            remaining.append(row)
    return remaining


def tick(state_dir, tick_row: dict | None = None, now: float | None = None, *, config=None, post=_post) -> dict | None:
    """Dispatch-tick entry. Returns the local record when it changed, else None."""
    now = time.time() if now is None else now
    root = Path(state_dir)
    state = autoscale._read_json(root / "autoscale.json")
    if not autoscale._valid_state(state) or state.get("mode") != "apply":
        return None
    obs = autoscale.collect(root, tick_row or {}, now)
    pressure = autoscale._read_json(root / "disk-pressure.json", max_bytes=1048576)
    obs["diskReclaimable"] = pressure.get("reclaimable") if isinstance(pressure, dict) else None
    tracker = autoscale._read_json(root / TRACKER_FILE)
    host = socket.gethostname().split(".")[0] or "gem"
    nxt, emit, changed = step(tracker, state, obs, now, host=host, release_at=autoscale.release_installed_at(root))
    config = summer_config() if config is None else config
    outbox = [row for row in nxt["outbox"] if row.get("resource") not in {body["resource"] for body in emit}]
    for body in emit:
        body["deliveryId"] = re.sub(r"[^A-Za-z0-9:_-]", "-", f"{host}:{body['resource']}:{body['status']}:{int(now)}")[:128]
        outbox.append(body)
    nxt["outbox"] = deliver(outbox, config, now, post=post) if config else []
    autoscale._atomic_json(root / TRACKER_FILE, nxt)
    if not changed:
        return None
    record = {"schema": LOCAL_SCHEMA, "at": _iso(now), "bottleneckFound": nxt["bottleneckFound"],
              "limited": [{"resource": resource, **row, "since": _iso(row["since"])} for resource, row in sorted(nxt["published"].items())],
              "software": nxt["software"],
              "running": {name: row.get("running") for name, row in _obj(state.get("lanes")).items()
                          if isinstance(row, dict) and autoscale._count(row.get("base"))},
              "demand": {name: row.get("demand") for name, row in _obj(state.get("lanes")).items()
                         if isinstance(row, dict) and autoscale._count(row.get("base"))}}
    autoscale._atomic_json(root / RECORD_FILE, record)
    return record


def read_record(state_dir) -> dict | None:
    record = autoscale._read_json(Path(state_dir) / RECORD_FILE, max_bytes=65536)
    return record if isinstance(record, dict) and record.get("schema") == LOCAL_SCHEMA else None
