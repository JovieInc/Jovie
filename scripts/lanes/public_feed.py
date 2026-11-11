"""Bounded lanes status projection and honest payload-pressure measurements."""
from __future__ import annotations

import hashlib
import json
import time
from collections import Counter
from datetime import datetime

PUBLIC_FEED_MAX_BYTES = 256 * 1024
STATUS_DETAIL_NAME = "lanes-status-details.json"
STAGE_EVENTS_NAME = "stage-events.ndjson"


# 2026-10-25 13:50Z: the public feed hit 410,142 bytes against the 262,144 cap and every HUD tile and
# dead-man check read "unavailable". Measured sections (lanes-status.json, 557 KB complete):
# fileOverlap 217 KB (737 pair rows), remediation 82 KB (312 fingerprints, 72 KB of ask text), conditions
# 54 KB, shippingAttribution 153 KB of per-PR rows before the existing projection. The public feed keeps
# aggregates, top hotspots and operational identity; every dropped row stays in lanes-status-details.json
# (same gist) and local state, addressed by a jsonPointer.
PUBLIC_OVERLAP_TOP = 10
PUBLIC_FEED_WARN_RATIO = 0.70
PUBLIC_REMEDIATION_STATES = ("open", "claimed", "human", "exhausted", "done")

# Top-level heartbeat paths hosted dead-man receipts read straight from the lanes gist
# (canon/automation-registry.jsonl, live json-timestamp entries on this feed): gem:lanes-tick
# reads `at`, gem:deploy-health reads `deployHealth.observedAt`/`deployHealth.healthy`, and the
# production-promotion silence budget reads `deployHealth.limits`. The oversize refusal keeps
# them: during the 2026-10-25 13:50-17:41Z oversize window it dropped every heartbeat path and
# both gist-backed entries false-alerted "heartbeat-source-missing" while the tick kept
# publishing on schedule (JOV-9115). A registry test pins this list against new gist receipts.
HEARTBEAT_FEED_KEYS = ("at", "deployHealth")


def _compact_overlap(public: dict) -> None:
    overlap = public.get("fileOverlap")
    pairs = overlap.get("pairs") if isinstance(overlap, dict) else None
    if not isinstance(pairs, list):
        return
    rows = [pair for pair in pairs if isinstance(pair, dict)]
    files = Counter(name for pair in rows for name in pair.get("files") or [] if isinstance(name, str))
    overlap.pop("pairs")
    overlap["pairsSummary"] = {
        "count": len(pairs),
        "queueOwned": sum(1 for pair in rows if pair.get("queueOwned")),
        "byAction": dict(Counter(str(pair.get("actionTaken")) for pair in rows)),
        "topHotspots": [{"file": name, "pairs": count} for name, count in files.most_common(PUBLIC_OVERLAP_TOP)],
        "pairsRef": {"recordCount": len(pairs), "jsonPointer": "/fileOverlap/pairs"},
    }


# Conditions grew 54 KB -> 69 KB in about an hour (2026-10-25): 33 of 52 receipts were `resolved`, kept
# forever locally (generation numbers must survive for idempotency keys), each carrying its writing-review
# bindings (~1.5 KB). The public feed keeps every active condition and recent resolutions without the heavy
# review/evidence blobs, plus a count summary; the complete receipts stay in lanes-status-details.json.
PUBLIC_CONDITION_RESOLVED_KEEP_S = 6 * 3600
PUBLIC_CONDITION_DROP = ("writingReview", "writingDecision", "recoveryEvidence")  # heavy; full copy in the details file


def _compact_conditions(public: dict, now: float | None = None) -> None:
    conditions = public.get("conditions")
    if not isinstance(conditions, dict):
        return
    now = time.time() if now is None else now
    kept, omitted = {}, 0
    for key, event in conditions.items():
        if not isinstance(event, dict):
            kept[key] = event
            continue
        resolved = event.get("state") == "resolved"
        if resolved:
            stamp = event.get("resolvedAt")
            try:
                age = now - datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).timestamp()
            except (TypeError, ValueError):
                age = None
            if age is None or age > PUBLIC_CONDITION_RESOLVED_KEEP_S:
                omitted += 1
                continue
        row = {name: value for name, value in event.items() if name not in PUBLIC_CONDITION_DROP}
        kept[key] = row
    states = Counter(str(event.get("state")) for event in conditions.values() if isinstance(event, dict))
    public["conditions"] = kept
    public["conditionsSummary"] = {
        "total": len(conditions), "byState": dict(states), "resolvedOmitted": omitted,
        "resolvedKeptForS": PUBLIC_CONDITION_RESOLVED_KEEP_S,
        "ref": {"recordCount": len(conditions), "jsonPointer": "/conditions"}}


def _compact_remediation(public: dict) -> None:
    remediation_block = public.get("remediation")
    rows = remediation_block.get("byFingerprint") if isinstance(remediation_block, dict) else None
    if not isinstance(rows, dict):
        return
    # Fingerprints are an ever-growing historical index, not the active ownership
    # arrays. Keep their bounded counts here and the complete index in fullEvidence.
    def state(row):
        value = row.get("state") if isinstance(row, dict) else None
        return value if value in PUBLIC_REMEDIATION_STATES else "unknown"

    remediation_block.pop("byFingerprint")
    remediation_block["byFingerprintSummary"] = {
        "recordCount": len(rows), "byState": dict(Counter(state(row) for row in rows.values())),
    }
    remediation_block["byFingerprintRef"] = {
        "recordCount": len(rows), "jsonPointer": "/remediation/byFingerprint",
        "omitted": "per-fingerprint rows; complete evidence retained in the details file",
    }


FEED_SAMPLE_WINDOW_S = 6 * 3600
FEED_SAMPLE_MIN_SPAN_S = 20 * 60
FEED_GROWTH_ALERT_S = 6 * 3600  # alert when the projected time to the cap is under 6 hours


def feed_growth(samples: list, now: float, total: int, cap: int = PUBLIC_FEED_MAX_BYTES) -> dict:
    """Bytes/hour over the retained samples and the projected seconds until the cap. Needs >=3 samples
    spanning >=20 min; a shrinking or flat feed projects nothing."""
    window = [row for row in (samples or []) if isinstance(row, list) and len(row) == 2
              and 0 <= now - row[0] <= FEED_SAMPLE_WINDOW_S]
    window.append([now, total])
    span = window[-1][0] - window[0][0]
    if len(window) < 3 or span < FEED_SAMPLE_MIN_SPAN_S:
        return {"samples": window, "growthBytesPerHour": None, "secondsToCap": None}
    rate = (window[-1][1] - window[0][1]) / span  # bytes per second
    return {"samples": window[-72:], "growthBytesPerHour": round(rate * 3600),
            "secondsToCap": round((cap - total) / rate) if rate > 0 else None}


def feed_section_sizes(text: str) -> dict:
    """Bytes per top-level section of the published feed, largest first, with the cap ratio."""
    data = json.loads(text)
    sizes = {key: len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
             for key, value in data.items()}
    published_bytes = len(text.encode("utf-8"))
    total = published_bytes
    required = data.get("requiredBytes")
    if (data.get("schema") == "symphony-lanes-status-unavailable/v1"
            and data.get("reason") == "essential-public-feed-exceeds-byte-limit"
            and type(required) is int and required > PUBLIC_FEED_MAX_BYTES):
        # Measuring only the small refusal envelope falsely resolves the overflow
        # alarm. Retain the rejected snapshot's pressure until it really fits.
        total = max(total, required)
        sizes = {"rejectedPayload": required}
    return {"bytes": total, "publishedBytes": published_bytes,
            "maxBytes": PUBLIC_FEED_MAX_BYTES, "ratio": round(total / PUBLIC_FEED_MAX_BYTES, 3),
            "sections": dict(sorted(sizes.items(), key=lambda item: -item[1])[:12])}


def public_status_projection(feed: dict, full_text: str) -> str:
    """Keep operational fields whole; detailed attribution lives in the same gist."""
    def identity(value, limit):
        return value if isinstance(value, str) and len(value) <= limit else None

    evidence = {
        "fileName": STATUS_DETAIL_NAME,
        "sha256": hashlib.sha256(full_text.encode("utf-8")).hexdigest(),
        "bytes": len(full_text.encode("utf-8")),
        "at": identity(feed.get("at"), 64),
        "host": identity(feed.get("host"), 64),
        "release": identity(feed.get("release"), 128),
        "binding": "declared-feed-identity",
    }
    public = json.loads(full_text)
    attribution = public.get("shippingAttribution")
    projects = attribution.get("projects") if isinstance(attribution, dict) else None
    if isinstance(projects, list):
        for index, project in enumerate(projects):
            if isinstance(project, dict) and isinstance(project.get("pullRequests"), list):
                rows = project.pop("pullRequests")
                # Absence with an explicit locator is not an empty evidence array.
                project["pullRequestsRef"] = {
                    "recordCount": len(rows),
                    "jsonPointer": f"/shippingAttribution/projects/{index}/pullRequests",
                }
    _compact_overlap(public)
    _compact_remediation(public)
    _compact_conditions(public)
    public["publicProjection"] = {
        "schema": "symphony-lanes-public-projection/v1", "fullEvidence": evidence,
    }
    text = json.dumps(public, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    if len(text.encode("utf-8")) <= PUBLIC_FEED_MAX_BYTES:
        return text
    # Never trim operational ownership/hold/attempt arrays to pretend they fit.
    # Existing schema-checking readers reject this as unknown, not an empty fleet.
    def unavailable():
        return {
            "schema": "symphony-lanes-status-unavailable/v1", "status": "unavailable",
            "reason": "essential-public-feed-exceeds-byte-limit",
            "requiredBytes": len(text.encode("utf-8")), "maxBytes": PUBLIC_FEED_MAX_BYTES,
            "fullEvidence": evidence, "at": evidence["at"],
        }

    def fits(payload):
        return len(json.dumps(payload, ensure_ascii=False, separators=(",", ":"),
                              allow_nan=False).encode("utf-8")) <= PUBLIC_FEED_MAX_BYTES

    # Carry each heartbeat block that fits whole: a fat operational feed still reads as its
    # real heartbeats to the hosted dead-man, not "heartbeat-source-missing" (JOV-9115); a
    # heartbeat block too big to carry is refused whole, never trimmed to a half reading.
    payload = unavailable()
    for key in HEARTBEAT_FEED_KEYS:
        if key != "at" and key in public and fits({**payload, key: public[key]}):
            payload[key] = public[key]
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
