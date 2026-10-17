#!/usr/bin/env python3
"""Capacity observations from existing lane measurements, without paid-capacity ROI claims.

Runs after autoscale in the dispatch tick. Only distinct fresh source observations
advance hysteresis. Configured seats, native lease occupancy, typed quota cooldowns,
rate/auth holds, eligible demand and reported waiting retain separate evidence.

The existing signed Summer wire contract and retry identity remain unchanged;
software and unknown-measurement holds stay in the local record. No allocator,
operational limits, accounts or purchasing policy are changed by this reporter.
"""
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
# Anti-flap: a resource must bind (or be clear) for this many distinct fresh observations before it is
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
    "host-cpu": "use existing authorised headroom and reduce competing work; measure completed throughput",
    "host-memory": "release reclaimable memory and reuse existing authorised capacity",
    "host-disk": "verify safe reclamation and reuse existing authorised disk capacity",
    "codex-credits": "verify the reported quota reset and reuse healthy authorised provider capacity",
    "github-api-quota": "reuse cached reads and verify the quota reset before increasing callers",
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


def _fresh(stamp, now: float) -> bool:
    at = autoscale._epoch(stamp)
    return at is not None and 0 <= now - at <= autoscale.STALE_S


def _source_stamp(resource: str, state: dict, obs: dict):
    if resource in ("host-cpu", "host-memory"):
        return _num(state.get("observedAt"))
    if resource == "host-disk":
        return _num(obs.get("diskObservedAt"))
    if resource == "codex-credits":
        return autoscale._epoch(obs.get("codexObservedAt"))
    return _num(obs.get("doctorObservedAt"))


def _host_evidence(state: dict, obs: dict) -> dict:
    sample, disk = _obj(state.get("hostSample")), _obj(obs.get("disk"))
    mem = _num(sample.get("memAvailableBytes"))
    return {"load1": _num(sample.get("load1")), "cpuCount": autoscale._int(sample.get("cpuCount")),
            "psiCpu": _num(_obj(sample.get("psi")).get("cpuSomeAvg10")),
            "psiMemory": _num(_obj(sample.get("psi")).get("memoryFullAvg10")),
            "psiIo": _num(_obj(sample.get("psi")).get("ioFullAvg10")),
            "memAvailableGiB": None if mem is None else mem / autoscale.GIB,
            "diskFreePct": _num(disk.get("freePct")), "diskAdmitted": disk.get("admitted")}


def _host_resource(tokens: list[str], evidence: dict) -> str | None:
    """A blocker or configured ceiling alone is never physical pressure."""
    free, mem = evidence.get("diskFreePct"), evidence.get("memAvailableGiB")
    if free is not None and free <= autoscale.DISK_INCREASE_MIN:
        return "host-disk"
    if (mem is not None and mem * autoscale.GIB < autoscale.MEM_HEADROOM_BYTES) or \
            (evidence.get("psiMemory") is not None and evidence["psiMemory"] > autoscale.PSI_MEM_OK):
        return "host-memory"
    load, cpu, psi = (evidence.get(key) for key in ("load1", "cpuCount", "psiCpu"))
    if (load is not None and cpu and load / cpu >= autoscale.LOAD_INCREASE_MAX) or \
            (psi is not None and psi > autoscale.PSI_CPU_OK):
        return "host-cpu"
    return None


def lane_limit(name: str, row: dict, state: dict, obs: dict) -> tuple[str | None, dict | None, bool]:
    """Classify observations, without inferring provider hard limits or paid-capacity ROI."""
    tokens = [token for token in (row.get("blockers") or []) if isinstance(token, str)]
    reported = autoscale._count(row.get("demand"))
    eligible = autoscale._demand(name, obs) if obs.get("doctorFresh") is True else None
    evidence = {"lane": name, "blockers": tokens, "reportedWaiting": reported, "eligibleDemand": eligible,
                "configuredSeats": row.get("ceiling"), "providerHardLimit": "unknown",
                "deliveredThroughput": "unknown", "marginalThroughput": "unknown"}
    if not tokens or not reported or row.get("lastReason") == "sustained-demand" or any(token in NO_DEMAND for token in tokens):
        return None, None, False
    if not eligible:
        return None, {**evidence, "hold": "eligible-demand-unproven"}, True
    if any(token in SOFTWARE for token in tokens):
        return None, evidence, True
    first = tokens[0]
    attribution = _obj(obs.get("codexAttribution"))
    if name == "codex" and first in ("rate-bank", "rate-limited", "cooling", "codex-unleased", "lane-ceiling"):
        # The native doctor explicitly describes these as existing cooldown policy,
        # not a live quota probe. Only its typed, all-quota hold maps to credits.
        if attribution.get("state") == "quota-banked" and autoscale._count(attribution.get("quotaBanked")) \
                and not any(autoscale._count(attribution.get(key)) for key in ("authCooldown", "rateCooldown", "unleasedAvailable")):
            return "codex-credits", {**evidence, "hold": "reported-quota-cooldown", "codex": attribution}, False
        hold = "authentication-cooldown" if attribution.get("authCooldown") else \
            "burst-rate-cooldown" if attribution.get("rateCooldown") else "configured-seats-or-lease-occupancy"
        return None, {**evidence, "hold": hold, "leased": attribution.get("leased"),
                      "unleasedAvailable": attribution.get("unleasedAvailable"),
                      "reportedQuotaCooldowns": attribution.get("quotaBanked")}, True
    if first in ("rate-bank", "rate-limited", "cooling"):
        return None, {**evidence, "hold": "provider-rate-or-quota-unproven"}, True
    if first in ("github-budget", "github-budget-low"):
        left = autoscale._int(obs.get("githubRemaining"))
        if left is not None and left < autoscale.GITHUB_INCREASE_MIN:
            return "github-api-quota", {**evidence, "githubRemaining": left}, False
        return None, {**evidence, "hold": "github-quota-unproven"}, True
    if first in HOST_TOKENS:
        measured = _host_evidence(state, obs)
        resource = _host_resource(tokens, measured)
        if resource == "host-disk" and obs.get("diskReclaimable") is not False:
            return None, {**evidence, **measured, "hold": "disk-reclamation-pending"}, True
        if resource:
            return resource, {**evidence, **measured}, False
        return None, {**evidence, **measured, "hold": "configured-ceiling-or-pressure-unproven"}, True
    return None, evidence, True


def _measure(resource: str, evidence: dict, lanes: list[str], waiting: int, eligible: int, observed_at: float) -> dict:
    """Keep observation time in the existing needs field; the wire schema is unchanged."""
    observed = limit = unit = None
    if resource == "host-cpu":
        load, cpu, psi = (evidence.get(key) for key in ("load1", "cpuCount", "psiCpu"))
        summary = f"CPU load {load}/{cpu}, PSI {psi}%"
        observed, limit, unit = load, cpu, "load1"
    elif resource == "host-memory":
        observed = evidence.get("memAvailableGiB")
        limit, unit = autoscale.MEM_HEADROOM_BYTES // autoscale.GIB, "GiB-available"
        summary = f"memory {observed} GiB available, PSI {evidence.get('psiMemory')}%"
    elif resource == "host-disk":
        observed, limit, unit = evidence.get("diskFreePct"), autoscale.DISK_INCREASE_MIN, "percent-free"
        summary = f"disk {observed}% free; reclamation exhausted"
    elif resource == "github-api-quota":
        observed, limit, unit = evidence.get("githubRemaining"), autoscale.GITHUB_INCREASE_MIN, "requests"
        summary = f"GitHub {observed} requests left; growth guard {limit}"
    else:
        summary = "Codex quota cooldown reported; live quota unproven"
    needs = f"Observed {_iso(observed_at)}: {summary}; eligible {eligible}, reported waiting {waiting}; throughput unknown"
    reset = _num(_obj(evidence.get("codex")).get("earliestCooldownS"))
    return {"needs": needs[:200], "observed": observed, "limit": limit, "unit": unit,
            "untilAt": observed_at + reset if reset is not None and reset > 0 else None}


def evaluate(state: dict, obs: dict, now: float | None = None) -> tuple[dict, list]:
    """Measured bindings plus local holds; reported waiting is not eligible demand."""
    now = time.time() if now is None else now
    binding, software = {}, []
    for name, row in _obj(state.get("lanes")).items():
        if not isinstance(row, dict) or not autoscale._count(row.get("base")):
            continue
        resource, evidence, soft = lane_limit(name, row, state, obs)
        if evidence is not None:
            evidence["sourceObservedAt"] = {"autoscale": state.get("observedAt"),
                                           "doctor": obs.get("doctorObservedAt"), "codex": obs.get("codexObservedAt"),
                                           "disk": obs.get("diskObservedAt")}
        if resource:
            stamp = _source_stamp(resource, state, obs)
            if not _fresh(stamp, now) or not _fresh(state.get("observedAt"), now) or obs.get("doctorFresh") is not True:
                software.append({**evidence, "hold": "stale-or-unknown-observation"})
                continue
            entry = binding.setdefault(resource, {"lanes": [], "evidence": evidence, "waiting": 0,
                                                   "eligible": 0, "observedAt": stamp})
            entry["lanes"].append(name)
            entry["waiting"] += autoscale._count(row.get("demand")) or 0
            entry["eligible"] += evidence["eligibleDemand"]
        elif soft:
            software.append(evidence)
    return binding, software


def _material(previous: dict, current: dict) -> bool:
    """Limit changes are material; pressure jitter only refreshes local evidence/replay."""
    return previous.get("limit") != current.get("limit")


def _clear_measured(resource: str, state: dict, obs: dict, lanes: list) -> bool:
    """A fresh timestamp is insufficient: clearing needs known demand and resource values."""
    demands = [autoscale._demand(name, obs) for name in lanes]
    if not demands or any(value is None for value in demands):
        return False
    if not any(demands):
        return True
    evidence = _host_evidence(state, obs)
    if resource == "host-cpu":
        load, cpu, psi = (evidence.get(key) for key in ("load1", "cpuCount", "psiCpu"))
        return load is not None and cpu is not None and cpu > 0 and psi is not None \
            and load / cpu < autoscale.LOAD_INCREASE_MAX and psi <= autoscale.PSI_CPU_OK
    if resource == "host-memory":
        mem, psi = evidence.get("memAvailableGiB"), evidence.get("psiMemory")
        return mem is not None and psi is not None and mem * autoscale.GIB >= autoscale.MEM_HEADROOM_BYTES \
            and psi <= autoscale.PSI_MEM_OK
    if resource == "host-disk":
        free = evidence.get("diskFreePct")
        return free is not None and free > autoscale.DISK_INCREASE_MIN
    if resource == "github-api-quota":
        left = autoscale._int(obs.get("githubRemaining"))
        return left is not None and left >= autoscale.GITHUB_INCREASE_MIN
    if resource == "codex-credits":
        attribution = _obj(obs.get("codexAttribution"))
        return attribution.get("state") in ("unleased-available", "leases-occupied", "none-configured", "cooldown") \
            and autoscale._count(attribution.get("quotaBanked")) is not None
    # Withdraw legacy classifications this producer can no longer substantiate.
    return resource in RESOURCES


def step(tracker: dict | None, state: dict, obs: dict, now: float, *, host: str, release_at: float | None) -> tuple[dict, list, bool]:
    """Pure. Distinct fresh source observations advance hysteresis, never dispatch polls."""
    tracker = _obj(tracker); seen, published = _obj(tracker.get("seen")), _obj(tracker.get("published"))
    binding, software = evaluate(state, obs, now)
    found, nxt_seen = bool(software), {}
    for resource in set(seen) | set(binding) | set(published):
        row = _obj(seen.get(resource))
        stamp = _source_stamp(resource, state, obs)
        previous_at = _num(row.get("observedAt"))
        if previous_at is None:
            row = {}  # Legacy tick counts do not certify distinct observations.
        fresh = _fresh(stamp, now) and _fresh(state.get("observedAt"), now) and obs.get("doctorFresh") is True
        distinct = fresh and (previous_at is None or stamp > previous_at)
        if previous_at is not None and (stamp is None or stamp < previous_at):
            binding.pop(resource, None)
            fresh = distinct = False
        if resource in binding:
            nxt_seen[resource] = {"bound": (autoscale._int(row.get("bound")) or 0) + int(distinct), "clear": 0,
                                  "since": (_num(row.get("since")) or stamp) if row.get("bound") else stamp,
                                  "observedAt": stamp}
        elif resource in published:
            prior_clear = autoscale._int(row.get("clear")) or 0
            clear = _clear_measured(resource, state, obs, _obj(published.get(resource)).get("lanes") or [])
            nxt_seen[resource] = {**row, "bound": 0,
                                  "clear": prior_clear + 1 if distinct and clear else 0 if distinct else prior_clear,
                                  "observedAt": stamp if distinct else previous_at}
    replay = release_at is not None and release_at != tracker.get("releaseInstalledAt")
    emit, nxt_published = [], {}
    for resource, row in sorted(nxt_seen.items()):
        last = _obj(published.get(resource))
        legacy = bool(last) and _num(last.get("observedAt")) is None
        if resource in binding and (row["bound"] >= HYSTERESIS_TICKS or (last and not legacy)):
            entry = binding[resource]
            lanes = sorted(entry["lanes"])[:20]
            measured = _measure(resource, entry["evidence"], lanes, entry["waiting"], entry["eligible"], entry["observedAt"])
            action = UNBLOCK[resource]
            since = (_num(last.get("since")) or row["since"]) if last and not legacy else row["since"]
            current = {"lanes": lanes, "needs": measured["needs"], "observed": measured.get("observed"),
                       "limit": measured.get("limit"), "action": action, "since": since,
                       "observedAt": entry["observedAt"], "evidence": entry["evidence"],
                       "eligibleDemand": entry["eligible"], "reportedWaiting": entry["waiting"]}
            nxt_published[resource] = current
            changed = not last or last.get("lanes") != lanes or last.get("action") != action or _material(last, current)
            if changed or replay:
                body = {"schema": SCHEMA, "status": "limited", "resource": resource, "host": host, "lanes": lanes,
                        "needs": measured["needs"], "since": _iso(since), "unblock": {"action": action}}
                for key in ("observed", "limit", "unit"):
                    if measured.get(key) is not None:
                        body[key] = measured[key]
                if measured.get("untilAt"):
                    body["until"] = _iso(measured["untilAt"])
                emit.append(body)
        elif last and row.get("clear", 0) < HYSTERESIS_TICKS:
            nxt_published[resource] = last
        elif last:
            emit.append({"schema": SCHEMA, "status": "cleared", "resource": resource, "host": host,
                         "lanes": last.get("lanes") or [], "since": _iso(_num(last.get("since")) or now)})
            nxt_seen.pop(resource, None)
    nxt_seen = {resource: row for resource, row in nxt_seen.items() if resource in binding or resource in nxt_published}
    outbox = tracker.get("outbox") or []
    changed_local = nxt_published != published or found != (tracker.get("bottleneckFound") is True) or bool(emit) \
        or software != tracker.get("software", [])
    return ({"seen": nxt_seen, "published": nxt_published, "bottleneckFound": found, "software": software,
             "releaseInstalledAt": release_at, "outbox": outbox}, emit, changed_local)

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
    doctor = _obj(_obj(autoscale._read_json(root / "doctor.json")).get("observed"))
    obs.update(doctorObservedAt=_num(doctor.get("now")),
               codexObservedAt=_obj(doctor.get("codexAttribution")).get("observedAt"),
               diskObservedAt=now)
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
    supported, _ = evaluate(state, obs, now)
    supported = {resource: entry for resource, entry in supported.items()
                 if _num(_obj(nxt["published"].get(resource)).get("observedAt")) is not None
                 and entry["observedAt"] >= (_num(_obj(nxt["seen"].get(resource)).get("observedAt")) or entry["observedAt"])}
    deliverable = [row for row in outbox if row.get("status") != "limited" or row.get("resource") in supported]
    held = [row for row in outbox if row not in deliverable]
    nxt["outbox"] = held + deliver(deliverable, config, now, post=post) if config else []
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
