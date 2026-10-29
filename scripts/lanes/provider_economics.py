"""Attributable, observational economics. Never calls a provider or admits work.

Measurements are full execution totals, not deltas. Importers must be explicitly
authorized to read the supplied provider usage or billing source. Account-wide
balances, price tables, reservations and assistant text are not usage evidence.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import math
import os
import re
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

SCHEMA = "jovie-provider-economics/v1"
METRICS = ("cashUsd", "credits", "estimateUsd")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def stamp(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z", value):
        raise ValueError("economics-timestamp-malformed")
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def amount(value):
    # Decimal strings preserve billing precision and reject NaN, booleans and exponents.
    if not isinstance(value, str) or not re.fullmatch(r"(?:0|[1-9]\d{0,14})(?:\.\d{1,12})?", value):
        raise ValueError("economics-amount-malformed")
    return str(Decimal(value))


def segment(receipt, claimed, ident, provider, model, *, remote=False, thread=None, handoff=None, limits=None):
    attempt_id = digest(claimed["fencingToken"])
    entries = receipt.setdefault("economics", [])
    binding = {"repository": receipt["repository"], "issue": receipt.get("issue"),
               "executionGeneration": ident["executionGeneration"], "identityDigest": ident["identityDigest"],
               "attempt": claimed["attempt"], "attemptId": attempt_id, "provider": provider, "model": model,
               "executionKind": "remote" if remote else "local",
               "executionId": attempt_id if remote else f"{receipt['runId']}:{len(entries)}",
               "remoteThreadId": thread, "handoffFrom": handoff}
    entry = {"schema": SCHEMA, "binding": binding, "startedAt": receipt["startedAt"],
             "measurements": dict.fromkeys(METRICS), "evidence": [], "reservedLimits": limits or {"dispatchUnits": 1}}
    entries.append(entry)
    return entry


def run(receipt, claimed, ident, provider, model, evidence_path, execute, *, handoff=None):
    """Observe one existing local dispatch, including failures and partial output."""
    entry = segment(receipt, claimed, ident, provider, model, handoff=handoff)
    entry["startedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        result = execute()
        entry["exitCode"] = result.returncode
        return result
    finally:
        entry["observedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        # The subscription adapter labels this as notional list price. It can
        # populate an estimate only, even if the execution exits unsuccessfully.
        try:
            rows = [json.loads(line) for line in Path(evidence_path).read_text().splitlines()]
            candidates = [(index, row) for index, row in enumerate(rows) if isinstance(row, dict)
                          and row.get("schema") == "jovie-provider-lease/v1" and row.get("event") == "claude-run"
                          and row.get("provider") == provider == "claude" and row.get("model") == model
                          and row.get("notionalCostUsd") is not None]
            if len(candidates) == 1:
                index, row = candidates[0]
                if stamp(row["at"]) < int(stamp(entry["startedAt"])) or stamp(row["at"]) > stamp(entry["observedAt"]):
                    raise ValueError("economics-stale-evidence")
                value = amount(str(row["notionalCostUsd"]))
                evidence = {"schema": SCHEMA, "binding": entry["binding"], "metric": "estimateUsd",
                            "amount": value, "unit": "USD", "scope": "execution-total",
                            "source": {"kind": "provider-usage", "id": f"{Path(evidence_path).name}:{index}",
                                       "provider": provider}, "sourceObservedAt": row["at"],
                            "observedAt": entry["observedAt"]}
                entry["measurements"]["estimateUsd"] = {"amount": value, "unit": "USD"}
                entry["evidence"].append(evidence)
        except (OSError, ValueError, TypeError, KeyError):
            # Measurement failure cannot erase or repeat an execution.
            pass


def validate(evidence, entry, authorized_source, now):
    fields = {"schema", "binding", "metric", "amount", "unit", "scope", "source",
              "sourceObservedAt", "observedAt"}
    if not isinstance(evidence, dict) or set(evidence) != fields or evidence["schema"] != SCHEMA:
        raise ValueError("economics-evidence-malformed")
    if evidence["binding"] != entry["binding"]:
        raise ValueError("economics-foreign-attempt")
    source = evidence["source"]
    if (not isinstance(source, dict) or set(source) != {"kind", "id", "provider"}
            or source != authorized_source or not isinstance(source["kind"], str)
            or source["kind"] not in {"provider-usage", "billing"}
            or source["provider"] != entry["binding"]["provider"]
            or not isinstance(source["id"], str) or not re.fullmatch(r"[A-Za-z0-9_.:/-]{1,240}", source["id"])):
        raise ValueError("economics-source-unauthorized")
    metric, unit = evidence["metric"], evidence["unit"]
    if (metric not in METRICS or evidence["scope"] != "execution-total"
            or not isinstance(unit, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,39}", unit)
            or metric != "credits" and unit != "USD"):
        raise ValueError("economics-measurement-malformed")
    amount(evidence["amount"])
    source_at, observed = stamp(evidence["sourceObservedAt"]), stamp(evidence["observedAt"])
    if not stamp(entry["startedAt"]) <= source_at <= observed <= now:
        raise ValueError("economics-stale-evidence")
    if entry["binding"]["executionKind"] == "remote" and not entry["binding"]["remoteThreadId"]:
        raise ValueError("economics-remote-attribution-unknown")


def execution_key(binding):
    # A lost create response may learn its thread ID on reconciliation. That
    # enriches the existing remote execution; it does not create another cost.
    return digest({key: value for key, value in binding.items() if key != "remoteThreadId"})


def entries(rows):
    """Join resumed remote snapshots by execution identity; never add their costs."""
    result = {}
    for row in rows:
        for entry in row.get("economics", []):
            key = execution_key(entry["binding"])
            if key not in result:
                result[key] = json.loads(json.dumps(entry))
            elif any(result[key][field] != entry[field] for field in ("evidence", "measurements", "reservedLimits")):
                raise ValueError("economics-conflicting-snapshot")
            else:
                old_thread, new_thread = result[key]["binding"]["remoteThreadId"], entry["binding"]["remoteThreadId"]
                if old_thread and new_thread and old_thread != new_thread:
                    raise ValueError("economics-conflicting-thread")
                result[key]["binding"]["remoteThreadId"] = old_thread or new_thread
    return result


def observations(rows, known, *, now=None):
    now = time.time() if now is None else now
    result, sources, latest, measured = [], set(), {}, set()
    candidates = []
    for entry in known.values():
        expected = dict.fromkeys(METRICS)
        for evidence in entry["evidence"]:
            if entry["binding"]["provider"] != "claude" or evidence["metric"] != "estimateUsd":
                raise ValueError("economics-embedded-source-unauthorized")
            candidates.append((evidence, evidence["source"], stamp(entry["observedAt"])))
            expected[evidence["metric"]] = {"amount": evidence["amount"], "unit": evidence["unit"]}
        if entry["measurements"] != expected:
            raise ValueError("economics-unattributed-measurement")
    for row in rows:
        if row.get("schema") == SCHEMA:
            if (row.get("event") != "measurement-recorded" or type(row.get("recordedAt")) not in (int, float)
                    or not math.isfinite(row["recordedAt"]) or not 0 <= row["recordedAt"] <= now):
                raise ValueError("economics-record-malformed")
            candidates.append((row["evidence"], row["authorizedSource"], row["recordedAt"]))
    for evidence, source, recorded_at in candidates:
        key = execution_key(evidence["binding"])
        if key not in known:
            raise ValueError("economics-foreign-attempt")
        validate(evidence, known[key], source, recorded_at)
        source_key = (source["kind"], source["provider"], source["id"], evidence["metric"])
        measurement_key = (key, evidence["metric"])
        if source_key in sources or measurement_key in measured:
            raise ValueError("economics-duplicate-or-conflicting-evidence")
        if stamp(evidence["observedAt"]) < latest.get(key, 0):
            raise ValueError("economics-stale-evidence")
        sources.add(source_key)
        measured.add(measurement_key)
        latest[key] = stamp(evidence["observedAt"])
        result.append(evidence)
    return result


def record(ledger_path, evidence, authorized_source, *, now=None):
    """Append evidence against a previously admitted receipt, never alter that receipt.

    The explicit source argument is supplied by the authorized importer, not
    inferred from an evidence payload, model output, cap or account balance.
    """
    now = time.time() if now is None else now
    if type(now) not in (int, float) or not math.isfinite(now) or now < 0:
        raise ValueError("economics-timestamp-malformed")
    path = Path(ledger_path)
    if not path.is_file():
        raise ValueError("economics-ledger-unavailable")
    with open(path, "a+") as ledger:
        fcntl.flock(ledger, fcntl.LOCK_EX)
        ledger.seek(0)
        rows = [json.loads(line) for line in ledger if line.strip()]
        known = entries(rows)
        if not isinstance(evidence, dict) or not isinstance(evidence.get("binding"), dict):
            raise ValueError("economics-evidence-malformed")
        entry = known.get(execution_key(evidence["binding"]))
        if entry is None:
            raise ValueError("economics-foreign-attempt")
        validate(evidence, entry, authorized_source, now)
        previous = observations(rows, known, now=now)
        for old in previous:
            if old["source"] == evidence["source"] and old["metric"] == evidence["metric"]:
                raise ValueError("economics-duplicate-evidence" if old == evidence else "economics-conflicting-source")
            if old["binding"] == evidence["binding"]:
                if stamp(old["observedAt"]) > stamp(evidence["observedAt"]):
                    raise ValueError("economics-stale-evidence")
                if old["metric"] == evidence["metric"]:
                    raise ValueError("economics-conflicting-measurement")
        row = {"schema": SCHEMA, "event": "measurement-recorded", "evidence": evidence,
               "authorizedSource": authorized_source, "recordedAt": now}
        ledger.seek(0, os.SEEK_END)
        ledger.write(json.dumps(row, sort_keys=True) + "\n")
        ledger.flush()
        os.fsync(ledger.fileno())
        return row


def summarize(rows):
    """Amounts and unknown counts by provider/model/metric/unit; no cash-credit conversion."""
    known = entries(rows)
    for evidence in observations(rows, known):
        entry = known[execution_key(evidence["binding"])]
        metric = evidence["metric"]
        measurement = {"amount": evidence["amount"], "unit": evidence["unit"]}
        entry["measurements"][metric] = measurement
    for row in rows:
        no_dispatch = ((row.get("execution") or {}).get("admitted") is False
                       or (row.get("offer") or {}).get("accepted") is False
                       or row.get("verdict") == "duplicate-active")
        if (row.get("schema") == "jovie-lane-run/v1" and row.get("runId") and row.get("provider")
                and "economics" not in row and not no_dispatch):
            # Old receipts have no attributable measurement. Keep that gap in
            # the denominator without making legacy evidence importable.
            key = f"legacy:{row.get('repository')}:{row['runId']}"
            known.setdefault(key, {"binding": {"provider": row["provider"], "model": row.get("model")},
                                   "measurements": dict.fromkeys(METRICS)})
    groups = {}
    for entry in known.values():
        binding = entry["binding"]
        for metric, measurement in entry["measurements"].items():
            unit = measurement["unit"] if measurement else "unknown" if metric == "credits" else "USD"
            key = (binding["provider"], binding["model"], metric, unit)
            row = groups.setdefault(key, {"provider": key[0], "model": key[1], "metric": metric, "unit": unit,
                                          "measuredTotal": "0", "unknownExecutions": 0, "measuredExecutions": 0})
            if measurement is None:
                row["unknownExecutions"] += 1
            else:
                row["measuredTotal"] = str(Decimal(row["measuredTotal"]) + Decimal(measurement["amount"]))
                row["measuredExecutions"] += 1
    for row in groups.values():
        row["total"] = None if row["unknownExecutions"] else row["measuredTotal"]
    return list(groups.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("record", "summarize"))
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument("--authorized-evidence-file", type=Path)
    parser.add_argument("--source-kind", choices=("provider-usage", "billing"))
    parser.add_argument("--source-id")
    parser.add_argument("--provider")
    args = parser.parse_args()
    try:
        if args.command == "summarize":
            print(json.dumps(summarize([json.loads(line) for line in args.ledger.read_text().splitlines()])))
        else:
            if not all((args.authorized_evidence_file, args.source_kind, args.source_id, args.provider)):
                raise ValueError("economics-authorized-source-required")
            evidence = json.loads(args.authorized_evidence_file.read_text())
            record(args.ledger, evidence, {"kind": args.source_kind, "id": args.source_id, "provider": args.provider})
            print(json.dumps({"schema": SCHEMA, "recorded": True}))
    except (ValueError, KeyError, TypeError, OSError):
        # No payload, source ID, credentials or transport errors in diagnostics.
        parser.exit(1, "economics-evidence-rejected\n")


if __name__ == "__main__":
    main()
