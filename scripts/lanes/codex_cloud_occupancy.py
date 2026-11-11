"""Durable account reservations in the existing cloud journal, not a new controller.

Slot handoff: take the ordinary Codex flock, validate fresh bound capacity, persist
remote occupancy, then release the flock. Local leases consult this same journal.
Only trusted, supported worker readback can release occupancy. No production
compatibility/readback/checkpoint adapter is installed by this module.
"""
import copy
import time
from datetime import datetime
import uuid
from pathlib import Path

import cloud_lane_state as journal
import codex_slot_lease as slots
import codex_cloud_evidence as evidence
import execution_attempt

STAGE = "account-occupancy"


def reservations(events=None):
    rows = {}
    for event in journal.read() if events is None else events:
        if event["stage"] != STAGE:
            continue
        if not evidence.valid_record(event):
            raise ValueError("occupancy-record-invalid")
        previous = rows.get(event["reservationId"])
        if event.get("version") != (previous["version"] + 1 if previous else 1):
            raise ValueError("occupancy-chain-invalid")
        if previous:
            mutable = {"phase", "at", "version", "task", "workerId", "acceptance", "savedCheckpoint", "reason"}
            if any(event.get(k) != v for k, v in previous.items() if k not in mutable):
                raise ValueError("occupancy-binding-changed")
            transitions = {"reserved": {"submitted", "unknown", "accepted"}, "submitted": {"unknown", "accepted"},
                           "unknown": {"accepted"}, "accepted": {"accepted", "completed"}, "completed": set()}
            if event["phase"] not in transitions[previous["phase"]]:
                raise ValueError("occupancy-transition-invalid")
        elif event["phase"] != "reserved":
            raise ValueError("occupancy-reservation-missing")
        if previous and event["phase"] in {"accepted", "completed"}:
            proof = event.get("acceptance")
            if evidence.readback_reason(proof, previous, event["at"], 3600):
                raise ValueError("occupancy-readback-invalid")
            if event["phase"] != proof["state"] or event.get("task") != proof["task"] or event.get("workerId") != proof["workerId"]:
                raise ValueError("occupancy-worker-changed")
            if "savedCheckpoint" in event and not evidence.checkpoint_valid(event["savedCheckpoint"], event):
                raise ValueError("occupancy-checkpoint-invalid")
        rows[event["reservationId"]] = event
    return rows


def _append(row, path):
    journal.append(row, path, locked=True)
    return row


def _advance(row, path, now, **changes):
    return _append({**row, **changes, "version": row["version"] + 1, "at": now}, path)


def publication_reason(events, issue, task, token, now):
    """Called under the cloud journal lock immediately before publication intent."""
    rows = [r for r in reservations(events).values() if r["issue"] == issue]
    if not rows:
        return "account-occupancy-missing"
    row = rows[-1]
    if row["fencingToken"] != token or row.get("task") != task:
        return "stale-token"
    if row["phase"] not in {"accepted", "completed"}:
        return "worker-acceptance-unverified"
    if not evidence.execution_live(row, now):
        return "stale-execution-fence"
    return None


class Occupancy:
    """Trusted dependency supplied by a future supported cloud integration, offline today.

    adapter.compatibility(account, env) and adapter.readback(reservation) must use
    supported provider evidence. They are never inferred from local profile config.
    The existing execution claim supplies context (path, identity, owner, coordination).
    """
    def __init__(self, account, execution, adapter, *, lane=None, now=time.time):
        if lane is None:
            import codex_lane as lane
        self.lane, self.account, self.execution = lane, account, copy.deepcopy(execution)
        self.adapter, self.now = adapter, now
        self.path = journal.ledger_path().resolve()

    def reserve(self, issue, env, token, *, previous=None):
        if not journal.enabled():
            return {"ok": False, "reason": "disabled"}
        lane, now = self.lane, self.now()
        if journal.ledger_path().resolve() != self.path:
            return {"ok": False, "reason": "occupancy-journal-mismatch"}
        if not lane.subscription_pool_mode():
            return {"ok": False, "reason": "bound-account-required"}
        try:
            profile = lane.subscription_profiles()[self.account]
            row = lane.read_state().get(self.account) or {}
            binding = execution_attempt.digest(lane.subscription_binding(profile))
            proof = self.adapter.compatibility(self.account, env)
            now = self.now()
            reason = evidence.capacity_reason(lane, self.account, profile, lane.read_state().get(self.account) or {}, now)
            for name in lane.subscription_profiles():
                for slot in lane._slot_paths(name):
                    pointer = slots.receipt(slot)
                    if pointer and Path(pointer["journal"]) != self.path:
                        return {"ok": False, "reason": "occupancy-journal-mismatch"}
            if reason or not evidence.compatible(proof, self.account, binding, env, now, lane.LEDGER_CADENCE_S):
                return {"ok": False, "reason": reason or "cloud-compatibility-unverified"}
            handle = lane.lease(self.account)
            if handle is None:
                return {"ok": False, "reason": "account-occupancy"}
            try:
                profile = lane.leased_profile(self.account, handle)
                row = lane.read_state().get(self.account) or {}
                now = self.now()
                reason = evidence.capacity_reason(lane, self.account, profile, row, now)
                if reason:
                    return {"ok": False, "reason": reason}
                record = {"schema": evidence.SCHEMA, "stage": STAGE, "phase": "reserved", "version": 1,
                          "issue": issue, "provider": "codex", "repo": journal.REPO, "at": now,
                          "reservationId": uuid.uuid4().hex, "submissionId": uuid.uuid4().hex,
                          "account": self.account, "slot": Path(handle.name).name, "env": env,
                          "bindingDigest": binding, "fencingToken": token, "execution": self.execution,
                          "identityVerifiedAt": row["subscriptionIdentityVerifiedAt"],
                          "capacityObservedAt": datetime.fromisoformat(
                              row["capacityLease"]["sources"]["capacity"]["observedAt"].replace("Z", "+00:00")).timestamp(),
                          "capacity": row["capacityLease"]["usableCapacityRemaining"], "compatibility": proof}
                if not evidence.execution_live(record, now):
                    return {"ok": False, "reason": "stale-execution-fence"}
                with journal.locked(self.path):
                    events = journal.read(self.path)
                    prior = reservations(events)
                    mine = [r for r in prior.values() if r["issue"] == issue]
                    if mine:
                        old = mine[-1]
                        if (previous != old["reservationId"] or old["phase"] != "completed" or
                                old["fencingToken"] == token or evidence.execution_live(old, now) or
                                not evidence.checkpoint_valid(old.get("savedCheckpoint"), old)):
                            return {"ok": False, "reason": "successor-provenance-unverified"}
                        if old["savedCheckpoint"]["kind"] not in proof.get("checkpointKinds", []):
                            return {"ok": False, "reason": "checkpoint-compatibility-unverified"}
                        record.update(predecessor=previous, checkpoint=old["savedCheckpoint"])
                    elif previous:
                        return {"ok": False, "reason": "predecessor-missing"}
                    ok, reason = journal.admit("codex", now, events)
                    if not ok:
                        return {"ok": False, "reason": reason}
                    now = self.now()
                    reason = evidence.capacity_reason(lane, self.account, profile, lane.read_state().get(self.account) or {}, now)
                    if reason or not evidence.compatible(proof, self.account, binding, env, now, lane.LEDGER_CADENCE_S):
                        return {"ok": False, "reason": reason or "cloud-compatibility-unverified"}
                    if not evidence.execution_live(record, now):
                        return {"ok": False, "reason": "stale-execution-fence"}
                    if journal.ledger_path().resolve() != self.path:
                        return {"ok": False, "reason": "occupancy-journal-mismatch"}
                    record["at"] = now
                    slots.bind(handle, self.path, record["reservationId"])
                    _append(record, self.path)
                return {"ok": True, "reservation": record}
            finally:
                handle.close()  # occupancy is now durable; this does not advertise a free slot
        except (KeyError, ValueError, OSError, RuntimeError, TypeError, AttributeError):
            return {"ok": False, "reason": "account-evidence-unavailable"}

    def submitted(self, reservation, task=None):
        if not journal.enabled():
            return {"ok": False, "reason": "disabled"}
        with journal.locked(self.path):
            row = reservations(journal.read(self.path))[reservation]
            if row["phase"] != "reserved":
                raise ValueError("submission-already-recorded")
            return _advance(row, self.path, self.now(), phase="submitted" if task else "unknown",
                            **({"task": task} if task else {"reason": "unknown-submit-outcome"}))

    def reconcile(self, reservation):
        if not journal.enabled():
            return {"ok": False, "reason": "disabled"}
        # Fetch outside the journal lock; CAS against the exact version before applying.
        row = reservations(journal.read(self.path))[reservation]
        if row["phase"] == "completed":
            return {"ok": True, "reservation": row, "released": False}
        try:
            proof = self.adapter.readback(copy.deepcopy(row))
        except Exception:
            return {"ok": False, "reason": "worker-readback-unavailable"}
        now = self.now()
        reason = evidence.readback_reason(proof, row, now, self.lane.LEDGER_CADENCE_S)
        if reason:
            return {"ok": False, "reason": reason}
        if proof["state"] == "accepted" and not evidence.execution_live(row, now):
            return {"ok": False, "reason": "stale-execution-fence"}
        with journal.locked(self.path):
            current = reservations(journal.read(self.path))[reservation]
            if current["version"] != row["version"]:
                return {"ok": False, "reason": "reconcile-raced"}
            changes = {"phase": proof["state"], "task": proof["task"], "workerId": proof["workerId"],
                       "acceptance": proof}
            checkpoint = proof.get("checkpoint")
            if checkpoint is not None:
                if not evidence.checkpoint_valid(checkpoint, {**row, "task": proof["task"]}):
                    return {"ok": False, "reason": "checkpoint-provenance-mismatch"}
                changes["savedCheckpoint"] = checkpoint
            updated = _advance(row, self.path, now, **changes)
        # Never clear quota/auth/rate banks here. Their owner is the existing account telemetry.
        return {"ok": True, "reservation": updated, "released": updated["phase"] == "completed"}

    def submit(self, transport, args, kwargs):
        if not journal.enabled():
            return {"route": "gem", "reason": "disabled"}
        import os
        previous = kwargs.pop("previous", None)
        method = "submit_successor" if previous else "submit"
        if not callable(getattr(self.adapter, method, None)):
            return {"route": "held", "reason": "cloud-submit-binding-unavailable"}
        if Path(kwargs.get("path") or journal.ledger_path()).resolve() != self.path:
            return {"route": "held", "reason": "occupancy-journal-mismatch"}
        reserved = self.reserve(args[0], os.environ.get("CODEX_CLOUD_ENV", ""), kwargs.get("fencing_token"), previous=previous)
        if not reserved["ok"]:
            return {"route": "held", "reason": reserved["reason"]}
        row = reserved["reservation"]
        try:
            # The supported adapter owns account/environment binding and submission identity.
            # There is no fallback to an ambient local CLI login.
            def submit_bound(command):
                with journal.locked(self.path):
                    current = reservations(journal.read(self.path))[row["reservationId"]]
                    now = self.now()
                    profile = self.lane.subscription_profiles()[self.account]
                    reason = evidence.capacity_reason(self.lane, self.account, profile,
                                                       self.lane.read_state().get(self.account) or {}, now)
                    if (not journal.enabled() or journal.ledger_path().resolve() != self.path or
                            current["phase"] != "reserved" or reason or
                            not evidence.compatible(row["compatibility"], self.account, row["bindingDigest"], row["env"], now,
                                                    self.lane.LEDGER_CADENCE_S) or not evidence.execution_live(current, now)):
                        raise RuntimeError("submission-authority-unverified")
                    execution_attempt.boundary(self.execution["path"], self.execution["identity"], row["fencingToken"],
                        {"spend": 0, "mutations": 1}, now=now, coordination=self.execution.get("coordination"),
                        boundary_id="cloud-submit:" + row["submissionId"])
                    return getattr(self.adapter, method)(copy.deepcopy(row), command)
            kwargs = {**kwargs, "run": submit_bound}
            result = transport(*args, **kwargs, reservation_id=row["reservationId"])
            self.submitted(row["reservationId"], result.get("remote") if result.get("route") == "cloud" else None)
        except Exception:
            # A journal/transport exception cannot allow fallback or erase occupancy.
            return {"route": "held", "reason": "unknown-submit-outcome"}
        if result.get("route") != "cloud":
            return {"route": "held", "reason": result.get("reason", "unknown-submit-outcome")}
        return {**result, "accepted": False, "reservationId": row["reservationId"]}
