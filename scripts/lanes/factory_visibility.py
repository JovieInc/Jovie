# api-budget: linear-requests 8/hr - one exact issue query every 15 minutes per host, up to two HTTP requests on authentication retry
"""Read-only factory custody and producer evidence for the existing doctor feed."""
from __future__ import annotations

import json
import math
import re
import time
from datetime import datetime
from pathlib import Path

from atomic_state import atomic_write_text
from ownership import accepted_run_lease

DIGEST_MAX_AGE_S = 3600  # gem:waste-loop registered receipt lifetime
MAX_WATCH = 5
ISSUE_READ_MAX_AGE_S = 900
WATCH_FILE = "factory-visibility-watch.json"
SHA = re.compile(r"[a-f0-9]{40}(?:[a-f0-9]{24})?")
ISSUE = re.compile(r"JOV-[1-9][0-9]*")
TERMINAL = {"completed", "canceled"}
ISSUE_BY_IDENTIFIER = (
    "query FactoryVisibility($id:String!){issue(id:$id)"
    "{id identifier state{name type} completedAt canceledAt}}"
)


def epoch(value) -> float | None:
    try:
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return date.timestamp() if date.tzinfo else None
    except (AttributeError, TypeError, ValueError):
        return None


def number(value) -> bool:
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def source_sha(value) -> bool:
    return isinstance(value, str) and SHA.fullmatch(value) is not None


def objects(value):
    return (x for x in value if isinstance(x, dict)) if isinstance(value, list) else ()


def accepted_recovery(digest: dict, producer: dict, observed: float, received: float, latest: dict) -> dict | None:
    baseline, ceiling = producer.get("baseline"), producer.get("target")
    if not number(baseline) or not number(ceiling) or not 0 < ceiling < baseline:
        return None
    for win in objects(digest.get("fixesShippedThisWeek")):
        metric = win.get("metric")
        if not isinstance(metric, dict):
            continue
        if metric.get("name") != producer["metric"] or metric.get("before") != baseline:
            continue
        after = metric.get("after")
        if not number(after) or not 0 < after <= ceiling:
            continue
        receipts = {r.get("note"): r for r in objects(win.get("receipts"))
                    if r.get("note") in {"Before", "After"} and r.get("metric") == producer["metric"] and
                    source_sha(r.get("sha")) and isinstance(r.get("evidence"), str) and r["evidence"]}
        before, recovered = receipts.get("Before", {}), receipts.get("After", {})
        before_at, after_at = epoch(before.get("at")), epoch(recovered.get("at"))
        if (before.get("value") == metric["before"] and recovered.get("value") == after and
                before_at is not None and after_at is not None and before_at <= observed <= after_at <= received and
                before["sha"] != recovered["sha"] and recovered["sha"] == latest["evidence"]["sha"] and
                after == latest["value"]):
            return {"id": win.get("id"), "at": recovered["at"], "sha": recovered["sha"]}
    return None


def observe_producer(digest: dict, producer: dict, now: float) -> dict:
    unknown = {"sourceAdoption": "unverified", "status": "unknown"}
    if producer.get("source") != "waste-loop" or digest.get("schema") != "jovie.waste-digest/v1":
        return unknown
    received, observed = epoch(digest.get("at")), epoch(producer.get("observedAt"))
    if received is None or observed is None or received < observed or not 0 <= now - received <= DIGEST_MAX_AGE_S:
        return unknown
    row = next((r for r in objects(digest.get("techDebt")) if r.get("id") == producer.get("metric")), None)
    if not row or not number(row.get("value")) or row.get("status") not in {"OK", "WASTE"}:
        return unknown
    evidence = row.get("evidence")
    sha = evidence.get("sha") if isinstance(evidence, dict) else None
    base = {**unknown, "at": digest["at"], "value": row["value"]}
    if source_sha(sha):
        base["observedSourceSha"] = sha
    if row["status"] == "WASTE":
        return {**base, "status": "still-waste"}
    target = producer.get("target")
    if not number(target) or not 0 < row["value"] <= target:
        return base
    win = accepted_recovery(digest, producer, observed, received, row) if source_sha(sha) else None
    return {**base, "status": "verified-recovery", "recovery": win} if win else base


def load_digest(state: Path) -> dict:
    try:
        value = json.loads((state / "waste-latest.json").read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def issue_state(issue: dict) -> str | None:
    state = issue.get("state")
    return state.get("type") if isinstance(state, dict) else state if isinstance(state, str) else None


class Adoption:
    def __init__(self, state: Path, linear, now: float | None = None, previous=()):
        self.state = state
        self.linear = linear
        self.now = time.time() if now is None else now
        self.digest = load_digest(state)
        self.path = state / WATCH_FILE
        try:
            saved = json.loads(self.path.read_text())
        except FileNotFoundError:
            saved = {"watches": list(previous), "omitted": 0}
        if not isinstance(saved, dict) or not isinstance(saved.get("watches"), list):
            raise ValueError("invalid factory visibility watches")
        self.watches = {row["fingerprint"]: row for row in saved["watches"]
                        if isinstance(row, dict) and isinstance(row.get("fingerprint"), str)
                        and isinstance(row.get("producer"), dict) and row["producer"].get("source") == "waste-loop"}
        if len(self.watches) > MAX_WATCH:
            raise ValueError("invalid factory visibility watch count")
        self.previous = self.watches.copy()
        self.persistent_omitted = saved.get("omitted", 0)
        self.last_read = saved.get("lastReadAt")
        if type(self.persistent_omitted) is not int or self.persistent_omitted not in (0, 1):
            raise ValueError("invalid factory visibility overflow")
        self.rows = {}
        self.omitted = set()
        self.pending = {}

    def save(self):
        atomic_write_text(self.path, json.dumps({"watches": list(self.watches.values()),
                                                 "omitted": self.persistent_omitted, "lastReadAt": self.last_read}))

    def record_omission(self, fingerprint: str):
        self.omitted.add(fingerprint)

    def omitted_count(self) -> int:
        return max(len(self.omitted), self.persistent_omitted)

    def observe(self, item: dict, issue: dict, kind: str, *, attempted_at=None):
        if not isinstance(item.get("producer"), dict):
            return
        producer = item["producer"]
        if not isinstance(producer.get("metric"), str) or not producer["metric"]:
            return
        identifier = issue.get("identifier")
        if not isinstance(identifier, str) or not ISSUE.fullmatch(identifier):
            return
        fingerprint = item["fingerprint"]
        waste = producer.get("source") == "waste-loop"
        if waste and fingerprint not in self.watches and len(self.watches) >= MAX_WATCH:
            # The bounded watch file cannot reconstruct an omitted episode once its signal retires.
            # Keep the coverage gap visible across later successful passes.
            self.record_omission(fingerprint)
            if not self.persistent_omitted:
                self.persistent_omitted = 1
                self.save()
            return
        if not waste and fingerprint not in self.rows and len(self.rows) >= MAX_WATCH - 1:
            self.record_omission(fingerprint)
            return
        self.omitted.discard(fingerprint)
        cached = kind in {"cached", "cached-no-open"}
        read_at = None if cached else self.now
        extra_read_at = attempted_at
        if cached and waste and attempted_at is None:
            prior = self.previous.get(fingerprint, {})
            same_issue = prior.get("issue") == identifier
            read_at = prior.get("issueReadAt") if same_issue else None
            extra_read_at = prior.get("extraReadAt") if same_issue else None
            recent = number(extra_read_at) and 0 <= self.now - extra_read_at < ISSUE_READ_MAX_AGE_S
            if recent and (prior.get("issueKind") == "terminal" or
                           (kind == "cached" and prior.get("issueKind") == "open")):
                issue = {"identifier": identifier, "id": prior.get("issueId"), "state": {"type": prior.get("issueState")}}
                kind = prior["issueKind"]
            elif not recent:
                priority = extra_read_at if number(extra_read_at) else 0
                self.pending[fingerprint] = (priority, item, issue)
        elif cached:
            read_at = attempted_at
        if kind == "cached-no-open":
            kind = "cached"
        receipt = observe_producer(self.digest, producer, self.now)
        acceptance = {"status": "unknown"}
        if kind == "open":
            acceptance = accepted_run_lease(self.state, issue.get("id"), identifier, now=self.now)
        issue_type = issue_state(issue)
        if not issue_type and kind == "terminal":
            issue_type = "canceled" if issue.get("canceledAt") else "completed"
        if kind == "terminal":
            status = {"still-waste": "terminal-unresolved", "verified-recovery": "terminal-recovered"}.get(
                receipt["status"], "terminal-producer-unknown"
            )
        elif kind == "open":
            status = {"accepted": "accepted", "unknown": "open-acceptance-unknown"}.get(
                acceptance["status"], "open-awaiting-acceptance"
            )
        else:
            status = "issue-state-unknown"
        row = {
            "fingerprint": item["fingerprint"], "issue": identifier, "issueKind": kind,
            "issueState": issue_type, "issueReadAt": read_at, "issueId": issue.get("id"),
            "extraReadAt": extra_read_at, "executionAcceptance": acceptance,
            "producer": producer, "status": status,
            "producerEvidence": receipt,
        }

        self.rows[fingerprint] = row
        if waste and self.watches.get(fingerprint) != row:
            self.watches[fingerprint] = row
            self.save()

    def retained(self):
        for prior in self.previous.values():
            if prior["fingerprint"] not in self.rows:
                self.observe(prior, {"identifier": prior.get("issue")}, "cached")

    def refresh(self):
        if not self.pending or (number(self.last_read) and self.now - self.last_read < ISSUE_READ_MAX_AGE_S):
            return
        fingerprint = min(self.pending, key=lambda key: (self.pending[key][0], key))
        _, item, issue = self.pending[fingerprint]
        self.last_read = self.now
        self.save()  # Count failed calls and authentication retries against the same cooldown.
        kind = "cached"
        try:
            actual = self.linear.gql(ISSUE_BY_IDENTIFIER, {"id": issue["identifier"]}).get("issue")
            if actual and actual.get("identifier") == issue["identifier"]:
                state_type = issue_state(actual)
                if isinstance(state_type, str) and state_type:
                    issue = actual
                    kind = "terminal" if state_type in TERMINAL else "open"
        except Exception:  # Visibility readback cannot block the existing intake.
            pass
        self.observe(item, issue, kind, attempted_at=self.now)

    def report(self) -> list[dict]:
        rows = sorted(self.rows.values(), key=lambda row: row["producer"].get("source") != "waste-loop")
        for row in rows[MAX_WATCH:]:
            self.record_omission(row["fingerprint"])
        return rows[:MAX_WATCH]


def public_view(intake: dict | None) -> dict:
    intake = intake or {}
    rows = [{key: row[key] for key in (
        "fingerprint", "issue", "issueKind", "issueState", "issueReadAt", "status", "executionAcceptance", "producerEvidence"
    )} for row in intake.get("adoption") or ()]
    observed = "adoption" in intake and "error" not in intake
    omitted = intake.get("adoptionOmitted", 0)
    coverage = "unknown"
    if observed:
        coverage = "partial" if omitted else "complete"
    return {"known": coverage == "complete", "coverage": coverage, "omitted": omitted,
            "retainedOverflow": intake.get("adoptionRetainedOverflow", False), "adoption": rows}
