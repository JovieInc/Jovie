"""Regression tests for scripts/lanes/doctor.py (nothing fails silently).

Run with:
    python3 -m unittest scripts/tests/test_doctor.py -v
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


doctor = load("doctor")


def obs(**overrides):
    base = {"now": 1_000_000.0, "tick": {"at": "2026-09-26T21:00:00Z", "unhealthy": [], "error": None},
            "gateTimeouts24h": 0, "failed24h": 0, "lastLandingAge": 600, "runs24h": 12, "busy": 3,
            "codex": {"count": 2, "available": ["a"], "accounts": {"a": {"resetsInS": 0}, "b": {"resetsInS": 900}}},
            "pool": 40, "linearError": None, "githubRemaining": 4000, "diskFreePct": 35.0,
            "openPRCount": 0, "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"}},
            "hudExpected": True, "hudBeatAge": 3}
    base.update(overrides)
    if "codex" not in overrides:
        base["codex"] = {"generatedAt": doctor.epoch_iso(base["now"]), "count": 2, "available": ["a"], "accounts": {
            "a": {"available": True, "leased": False, "resetsInS": 0},
            "b": {"available": False, "leased": False, "lastKind": "limit",
                  "exhaustedUntil": doctor.epoch_iso(base["now"] + 900), "resetsInS": 900}}}
    return base


def throughput_stub(_receipts, provider_names=(), _merged=None, attribution_receipts=None):
    return {"schema": "jovie-provider-throughput/v1", "windowHours": 24,
            "providers": {name: {} for name in provider_names}, "landedByAttribution": {}}


class JudgeTest(unittest.TestCase):
    def test_healthy_host_raises_nothing(self):
        self.assertEqual(doctor.judge(obs()), {})

    def test_design_brief_held_past_24h_alerts(self):
        alerts = doctor.judge(obs(designGate={"stale": ["JOV-3"]}))
        self.assertIn("JOV-3", alerts["design-brief-stale"])
        self.assertEqual(doctor.judge(obs(designGate={"stale": []})), {})

    def test_escalation_alert_names_the_pr_and_class(self):
        alerts = doctor.judge(obs(escalation={"surfaced": [{"pr": 7, "cls": "needs-human-decision"}]}))
        self.assertIn("#7 needs-human-decision", alerts["escalation-needs-human"])
        self.assertEqual(doctor.judge(obs(escalation={"surfaced": []})), {})

    def test_each_rule_names_its_cause(self):
        alerts = doctor.judge(obs(
            tick={"at": "x", "unhealthy": ["devin"], "error": "Boom"},
            codex={"generatedAt": doctor.epoch_iso(1_000_000), "count": 2, "available": [], "accounts": {
                "a": {"available": False, "leased": False, "lastKind": "limit", "exhaustedUntil": doctor.epoch_iso(1_007_200)},
                "b": {"available": False, "leased": False, "lastKind": "limit", "exhaustedUntil": doctor.epoch_iso(1_000_600)}}},
            gateTimeouts24h=5, failed24h=10, diskFreePct=4.0, githubRemaining=100, hudBeatAge=500,
            lastLandingAge=8 * 3600))
        self.assertEqual(set(alerts), {"tick-error", "provider-down:devin", "codex-all-banked", "no-landing",
                                       "gate-timeouts", "failed-runs", "disk-critical", "github-quota", "hud-stale"})
        self.assertIn("earliest reset in 10m", alerts["codex-all-banked"])
        self.assertIn("8h ago", alerts["no-landing"])
        self.assertIn("Boom", alerts["tick-error"])

    def test_disk_tiers_page_summer_only_below_critical(self):
        self.assertEqual(set(doctor.judge(obs(diskFreePct=7.0))), {"disk-low"})
        alerts = doctor.judge(obs(diskFreePct=4.9))
        self.assertEqual(set(alerts), {"disk-critical"})
        self.assertIn("Summer", alerts["disk-critical"])

    def test_pool_empty_needs_thirty_sustained_minutes(self):
        self.assertEqual(doctor.judge(obs(pool=0, busy=0), {"poolEmptySince": 1_000_000.0}), {})
        alerts = doctor.judge(obs(pool=0, busy=0), {"poolEmptySince": 1_000_000.0 - 1801})
        self.assertIn("Summer: route work", alerts["pool-empty"])

    def test_admission_repair_needs_five_sustained_minutes(self):
        blocked = obs(eligiblePool=49, pool=0,
                      newIssueBudgetByProvider={"claude": {"reason": "over-budget"}})
        self.assertNotIn("admission-repair-needed", doctor.judge(blocked))
        recent = {"admissionRepairSince": blocked["now"] - doctor.ADMISSION_REPAIR_S + 1}
        self.assertNotIn("admission-repair-needed", doctor.judge(blocked, recent))
        sustained = {"admissionRepairSince": blocked["now"] - doctor.ADMISSION_REPAIR_S - 1}
        self.assertIn("on claude", doctor.judge(blocked, sustained)["admission-repair-needed"])

    def test_no_landing_needs_work_and_busy_slots(self):
        self.assertEqual(doctor.judge(obs(lastLandingAge=None, busy=0)), {})
        self.assertEqual(doctor.judge(obs(lastLandingAge=None, pool=0), {"poolEmptySince": 1_000_000.0}), {})
        self.assertIn("never in 24h", doctor.judge(obs(lastLandingAge=None))["no-landing"])

    def test_spawn_exit_needs_spawned_workers_no_worktrees_and_no_recent_run(self):
        idle = {"tick": {"at": "x", "unhealthy": [], "error": None, "spawned": ["devin", "codex"]}, "worktrees": 0}
        self.assertEqual(doctor.judge(obs(**idle, lastWorkAge=60)), {})
        self.assertEqual(doctor.judge(obs(**{**idle, "worktrees": 2}, lastWorkAge=None)), {})
        self.assertIn("workers exit on claim", doctor.judge(obs(**idle, lastWorkAge=301))["spawn-exit"])
        self.assertIn("spawn-exit", doctor.judge(obs(**idle, lastWorkAge=None)))

    def test_fresh_slot_leases_do_not_inherit_an_old_completion_age(self):
        fresh = obs(eligiblePool=59, busy=4, lastWorkAge=505 * 60,
                    leaseAgesComplete=True, oldestLeaseAge=13)
        self.assertNotIn("workers-without-completions", doctor.judge(fresh))
        stale = doctor.judge({**fresh, "oldestLeaseAge": 61 * 60})
        self.assertIn("oldest current lease 61m", stale["workers-without-completions"])
        unknown = doctor.judge({**fresh, "leaseAgesComplete": False, "oldestLeaseAge": 13})
        self.assertIn("current lease ages unknown", unknown["workers-without-completions"])

    def test_spawn_exit_ignores_workers_that_reached_the_claim_scan_cleanly(self):
        """Workers spawning and exiting because the pool held nothing claimable is not the
        deadlock: a fresh per-provider idle exit suppresses the alert, a stale one does not."""
        idle = {"tick": {"at": "x", "unhealthy": [], "error": None, "spawned": ["devin", "codex"]},
                "worktrees": 0, "lastWorkAge": 301}
        self.assertNotIn("spawn-exit", doctor.judge(
            obs(**idle, idleExitAge={"devin": 30, "codex": 200})))
        self.assertIn("spawn-exit", doctor.judge(
            obs(**idle, idleExitAge={"devin": 30, "codex": 301})))
        self.assertIn("spawn-exit", doctor.judge(obs(**idle, idleExitAge={"devin": 30})))

    def test_available_provider_capacity_with_compatible_work_and_no_starts_is_p0(self):
        idle = {"tick": {"at": "x", "unhealthy": [], "error": None,
                         "spawned": ["devin"] * 4 + ["codex"] * 3},
                "poolByProvider": {"codex": 12, "devin": 10},
                "capacityByProvider": {"codex": {"running": 0, "slots": 3},
                                       "devin": {"running": 0, "slots": 4}}}
        previous = {"providerIdleSince": {name: 1_000_000.0 - doctor.PROVIDER_IDLE_S - 1
                                          for name in ("codex", "devin")}}
        alerts = doctor.judge(obs(**idle), previous)
        self.assertIn("0/3 workers", alerts["provider-idle:codex"])
        self.assertIn("0/4 workers", alerts["provider-idle:devin"])
        self.assertNotIn("provider-idle:devin", doctor.judge(obs(**{**idle, "capacityByProvider": {
            **idle["capacityByProvider"], "devin": {"running": 1, "slots": 4}}}), previous))
        self.assertNotIn("provider-idle:codex", doctor.judge(
            obs(**idle), {"providerIdleSince": {"codex": 1_000_000.0 - doctor.PROVIDER_IDLE_S + 1}}))

    def test_unhealthy_provider_is_named_without_false_idle_recovery(self):
        observed = obs(tick={"at": "x", "unhealthy": ["devin"], "error": None,
                             "spawned": ["devin"] * 4},
                       poolByProvider={"devin": 12},
                       capacityByProvider={"devin": {"running": 0, "slots": 4}})
        alerts = doctor.judge(observed, {"providerIdleSince": {"devin": 0}})
        self.assertIn("provider-down:devin", alerts)
        self.assertNotIn("provider-idle:devin", alerts)

    def test_linear_and_codex_failures_are_their_own_alerts(self):
        self.assertIn("linear-down", doctor.judge(obs(linearError="HTTPError: 429", pool=None)))
        self.assertIn("codex-broken", doctor.judge(obs(codex={"error": "no codex", "accounts": {}, "available": []})))
        self.assertNotIn("hud-stale", doctor.judge(obs(hudExpected=False, hudBeatAge=None)))

    def test_sustained_merge_queue_brake_files_only_after_one_interval(self):
        signal = {"queueDepth": 30, "queueWaitP50Minutes": 38, "mergedPerHour": 6,
                  "openedPerHour": 31, "ejectionRate": 0.55}
        brake = {"active": True, "heldForS": 1800, "intervalS": 1800, "signal": signal}
        self.assertNotIn("bottleneck:merge-queue", doctor.judge(obs(autoscale={"throughputBrake": brake})))
        alert = doctor.judge(obs(autoscale={"throughputBrake": {**brake, "heldForS": 1801}}))[
            "bottleneck:merge-queue"]
        self.assertIn("30", alert)
        self.assertIn("6 merged/h vs 31 opened/h", alert)
        self.assertIn("ejection rate 0.55", alert)


class FakeTracker:
    def __init__(self):
        self.opened, self.reopened, self.closed, self.contradicted = [], [], [], []

    def open(self, key, text):
        self.opened.append((key, text))
        return f"id-{key}"

    def reopen(self, issue_id, text, key=None):
        self.reopened.append((issue_id, text))
        return True

    def close(self, issue_id, key=None):
        self.closed.append(issue_id)
        return True

    def contradict_invariant(self, event):
        self.contradicted.append(event["idempotencyKey"])


class ConditionReceiptTest(unittest.TestCase):
    def test_unknown_linear_and_pool_are_a_typed_degraded_condition(self):
        observed = obs(now=1000.0, linearError="HTTPError: 429", pool=None, tickAge=2)
        alerts = doctor.judge(observed)
        event = doctor.condition_receipts(alerts, {}, observed, "gem")["linear-down"]
        self.assertEqual(event["schema"], "jovie.control-plane-liveness-condition/v1")
        self.assertEqual(event["source"]["status"], "unknown")
        self.assertEqual(event["affectedResources"], ["linear", "pool"])
        self.assertEqual(event["owner"], "symphony-lanes-doctor")
        self.assertEqual(event["owningInvariant"], "JOV-6004")

    def test_failed_devin_restarts_emit_one_bounded_summer_escalation_generation(self):
        observed = obs(now=1000.0, tickAge=3,
                       tick={"at": "x", "unhealthy": [], "error": None, "spawned": ["devin"] * 4},
                       poolByProvider={"devin": 20},
                       capacityByProvider={"devin": {"running": 0, "slots": 4}})
        previous = {"providerIdleSince": {"devin": 699.0}}
        alerts = doctor.judge(observed, previous)
        events = doctor.condition_receipts(alerts, previous, observed, "gem")
        tracker = FakeTracker()
        state = doctor.reconcile(alerts, previous, tracker, observed["now"], events)
        event = state["conditions"]["provider-idle:devin"]
        self.assertEqual(event["idempotencyKey"], "gem:provider-idle:devin:1")
        self.assertEqual(event["firstObservedAt"], doctor.epoch_iso(699.0))
        self.assertEqual(event["recovery"], {"action": "dispatch-provider-workers", "outcome": "failed"})
        self.assertEqual(event["summerEscalation"]["outcome"], "requested")
        self.assertEqual(tracker.contradicted, [event["idempotencyKey"]])

        observed["now"] += 60
        same_events = doctor.condition_receipts(alerts, state, observed, "gem")
        state = doctor.reconcile(alerts, state, tracker, observed["now"], same_events)
        self.assertEqual(state["conditions"]["provider-idle:devin"]["generation"], 1)
        self.assertEqual(len(tracker.opened), 1)
        self.assertEqual(len(tracker.contradicted), 1)

        observed["now"] += 60
        cleared = doctor.condition_receipts({}, state, observed, "gem")
        state = doctor.reconcile({}, state, tracker, observed["now"], cleared)
        self.assertEqual(state["conditions"]["provider-idle:devin"]["terminalOutcome"], "health-proven")

        observed["now"] += 60
        refired = doctor.condition_receipts(alerts, state, observed, "gem")
        state = doctor.reconcile(alerts, state, tracker, observed["now"], refired)
        self.assertEqual(state["conditions"]["provider-idle:devin"]["generation"], 2)
        self.assertEqual(len(tracker.contradicted), 2)


class ReconcileTest(unittest.TestCase):
    def test_mac_quota_unknown_retains_original_watchdog_until_observed_budget_recovery(self):
        first = obs(now=1791321038.0, githubRemaining=230)
        alerts = doctor.judge(first)
        prior = {"alerts": alerts, "conditions": doctor.condition_receipts(alerts, {}, first, "mac")}
        for now in (1791321100.0, 1791321600.0):
            unknown = obs(now=now, githubRemaining=None)
            carried = doctor.judge(unknown, prior)
            receipt = doctor.condition_receipts(carried, prior, unknown, "mac")["github-quota"]
            self.assertEqual(receipt["state"], "active")
            self.assertEqual(receipt["source"]["status"], "unknown")
            self.assertEqual(receipt["deadlineAt"], "2026-10-06T21:20:38Z")
            self.assertEqual(receipt["generation"], 1)
            self.assertIsNone(receipt["terminalOutcome"])
            prior = {"alerts": carried, "conditions": {"github-quota": receipt}}
        recovered = obs(now=1791321700.0, githubRemaining=4854)
        receipt = doctor.condition_receipts(doctor.judge(recovered, prior), prior, recovered, "mac")["github-quota"]
        self.assertEqual(receipt["state"], "resolved")
        self.assertEqual(receipt["source"]["status"], "healthy")
        self.assertEqual(receipt["recoveryEvidence"]["githubRemaining"], 4854)
        self.assertEqual(receipt["source"]["observedAt"], doctor.epoch_iso(recovered["now"]))

    def test_mac_ownership_read_alarm_survives_cooldown_without_duplicate_issue_actions(self):
        first = obs(linearError="in-flight PR ownership unreadable", pool=None, eligiblePool=None)
        tracker = FakeTracker()
        alerts = doctor.judge(first)
        prior = doctor.reconcile(alerts, {}, tracker, first["now"], doctor.condition_receipts(alerts, {}, first, "mac"))
        unknown = obs(now=first["now"] + 600, linearError=None, linearSkipped="cooldown", pool=None, eligiblePool=None)
        alerts = doctor.judge(unknown, prior)
        receipt = doctor.condition_receipts(alerts, prior, unknown, "mac")["linear-down"]
        state = doctor.reconcile(alerts, prior, None, unknown["now"], {"linear-down": receipt})
        self.assertEqual(receipt["state"], "active")
        self.assertEqual(receipt["generation"], 1)
        self.assertEqual(receipt["deadlineAt"], prior["conditions"]["linear-down"]["deadlineAt"])
        self.assertEqual(tracker.closed, [])
        self.assertIsNone(state["issues"]["linear-down"]["closedAt"])
        recovered = obs(now=unknown["now"] + 60, pool=0, eligiblePool=50)
        receipt = doctor.condition_receipts(doctor.judge(recovered, state), state, recovered, "mac")["linear-down"]
        self.assertEqual(receipt["state"], "resolved")
        self.assertEqual(receipt["recoveryEvidence"]["eligiblePool"], 50)

    def test_shipping_alarm_does_not_recover_when_workers_or_census_disappear(self):
        first = obs(lastLandingAge=41000, pool=50)
        alerts = doctor.judge(first)
        prior = {"alerts": alerts, "conditions": doctor.condition_receipts(alerts, {}, first, "mac")}
        for unknown in (obs(lastLandingAge=41100, pool=None, eligiblePool=None, openPRCount=None),
                        obs(lastLandingAge=41100, pool=50, busy=0)):
            carried = doctor.judge(unknown, prior)
            receipt = doctor.condition_receipts(carried, prior, unknown, "mac")["no-landing"]
            self.assertEqual(receipt["state"], "active")
            self.assertEqual(receipt["generation"], 1)
            self.assertEqual(receipt["deadlineAt"], prior["conditions"]["no-landing"]["deadlineAt"])
            self.assertIsNone(receipt["terminalOutcome"])
        for recovered in (obs(lastLandingAge=60), obs(lastLandingAge=41100, pool=0, eligiblePool=0, openPRCount=0)):
            receipt = doctor.condition_receipts(doctor.judge(recovered, prior), prior, recovered, "mac")["no-landing"]
            self.assertEqual(receipt["state"], "resolved")
            self.assertEqual(receipt["recoveryEvidence"]["lastLandingAge"], recovered["lastLandingAge"])

    def test_admission_alarm_survives_unknown_inventory_until_observed_recovery(self):
        observed = obs(eligiblePool=59, pool=0, newIssueBudgetByProvider={"codex": {"reason": "over-budget"}})
        started = observed["now"] - doctor.ADMISSION_REPAIR_S - 1
        alerts = doctor.judge(observed, {"admissionRepairSince": started})
        prior = {"admissionRepairSince": started, "alerts": alerts,
                 "conditions": doctor.condition_receipts(alerts, {}, observed, "gem")}
        for unknown in (obs(eligiblePool=None, pool=None, newIssueBudgetByProvider={}),
                        obs(eligiblePool=59, pool=0, newIssueBudgetByProvider={"codex": {"reason": "pr-inventory-unavailable"}})):
            carried = doctor.judge(unknown, prior)
            receipt = doctor.condition_receipts(carried, prior, unknown, "gem")["admission-repair-needed"]
            self.assertEqual(receipt["state"], "active")
            self.assertEqual(receipt["source"]["status"], "unknown")
            self.assertEqual(receipt["generation"], 1)
        recovered = obs(eligiblePool=59, pool=59)
        receipts = doctor.condition_receipts(doctor.judge(recovered, prior), prior, recovered, "gem")
        self.assertEqual(receipts["admission-repair-needed"]["state"], "resolved")

    def test_busy_scanners_without_completions_require_diagnosis_not_more_slots(self):
        observed = obs(eligiblePool=59, busy=5, lastWorkAge=20482,
                       leaseAgesComplete=True, oldestLeaseAge=7200)
        alerts = doctor.judge(observed)
        receipt = doctor.condition_receipts(alerts, {}, observed, "gem")["workers-without-completions"]
        self.assertEqual(receipt["recovery"]["action"], "verify-process-and-fenced-repair-ownership")
        prior = {"alerts": alerts, "conditions": {"workers-without-completions": receipt}}
        unknown = obs(lastWorkAge=None)
        carried = doctor.judge(unknown, prior)
        self.assertEqual(doctor.condition_receipts(carried, prior, unknown, "gem")["workers-without-completions"]["source"]["status"], "unknown")
        self.assertNotIn("workers-without-completions", doctor.judge(obs(lastWorkAge=60), prior))
        self.assertNotIn("workers-without-completions", doctor.judge(obs(lastWorkAge=None)))

    def test_unknown_design_census_preserves_alarm_until_observed_recovery(self):
        for reason in ({"linearError": "pool read failed"}, {"linearSkipped": "cooldown"}):
            with self.subTest(reason=reason):
                tracker = FakeTracker()
                observed = obs(designGate={"stale": ["JOV-3"]})
                alerts = doctor.judge(observed)
                state = doctor.reconcile(alerts, {}, tracker, observed["now"],
                                         doctor.condition_receipts(alerts, {}, observed, "gem"))
                observed = obs(designGate=None, **reason)
                alerts = doctor.judge(observed, state)
                state = doctor.reconcile(alerts, state, tracker, observed["now"],
                                         doctor.condition_receipts(alerts, state, observed, "gem"))
                self.assertEqual(tracker.closed, [])
                self.assertIsNone(state["issues"]["design-brief-stale"]["closedAt"])
                condition = state["conditions"]["design-brief-stale"]
                self.assertEqual(condition["state"], "active")
                self.assertEqual(condition["source"]["status"], "unknown")
                self.assertEqual(condition["generation"], 1)
                observed = obs(designGate={"stale": []})
                alerts = doctor.judge(observed, state)
                state = doctor.reconcile(alerts, state, tracker, observed["now"],
                                         doctor.condition_receipts(alerts, state, observed, "gem"))
                self.assertEqual(tracker.closed.count("id-design-brief-stale"), 1)
                self.assertEqual(state["conditions"]["design-brief-stale"]["state"], "resolved")

    def test_new_alert_opens_once_clearing_closes_and_refire_reopens(self):
        tracker = FakeTracker()
        now = 1_000_000.0
        state = doctor.reconcile({"disk-low": "4% free"}, {}, tracker, now)
        self.assertEqual(tracker.opened, [("disk-low", "4% free")])
        self.assertEqual(state["issues"]["disk-low"], {"id": "id-disk-low", "closedAt": None})
        state = doctor.reconcile({"disk-low": "4% free"}, state, tracker, now + 60)
        self.assertEqual(len(tracker.opened), 1, "an open alert is not raised twice")
        state = doctor.reconcile({}, state, tracker, now + 120)
        self.assertEqual(tracker.closed, ["id-disk-low"])
        self.assertEqual(state["issues"]["disk-low"]["closedAt"], now + 120)
        state = doctor.reconcile({"disk-low": "again"}, state, tracker, now + 600)
        self.assertEqual(tracker.reopened, [("id-disk-low", "again")])
        self.assertEqual(len(tracker.opened), 1, "within the cool-off the same issue is reused")
        state = doctor.reconcile({}, state, tracker, now + 700)
        state = doctor.reconcile({"disk-low": "much later"}, state, tracker, now + 700 + doctor.COOL_OFF_S + 1)
        self.assertEqual(len(tracker.opened), 2, "after the cool-off a fresh issue is opened")

    def test_tracker_failure_still_records_the_alert_and_retries_the_open(self):
        state = doctor.reconcile({"hud-stale": "x"}, {}, None, 5.0)
        self.assertEqual(state["alerts"], {"hud-stale": "x"})
        self.assertEqual(state["issues"]["hud-stale"]["id"], None)
        tracker = FakeTracker()
        state = doctor.reconcile({"hud-stale": "x"}, state, tracker, 65.0)
        self.assertEqual(tracker.opened, [("hud-stale", "x")], "an alert whose issue never opened is retried")
        self.assertEqual(state["issues"]["hud-stale"]["id"], "id-hud-stale")

    def test_tracker_titles_carry_the_host_and_reuse_an_existing_issue(self):
        class FakeLinear:
            def __init__(self):
                self.calls = []

            def gql(self, query, variables):
                self.calls.append((query, variables))
                if "title:{eq:$t}" in query:
                    return {"issues": {"nodes": [{"id": "existing-1"}]}}
                if "teams(filter" in query:
                    return {"teams": {"nodes": [{"id": "team", "states": {"nodes": [{
                        "id": "triage", "name": "Triage"}]}, "labels": {"nodes": [{
                            "id": "symphony", "name": "symphony"}, {
                            "id": "disk", "name": "remediation:disk-low"}]}}]}}
                if "issueAddLabel" in query:
                    return {"issueAddLabel": {"success": True}}
                raise AssertionError("must not create when one exists")
        linear = FakeLinear()
        tracker = doctor.Tracker(linear, "gem")
        self.assertEqual(tracker.title("disk-low"), "Symphony doctor: disk-low (gem)")
        self.assertEqual(tracker.open("disk-low", "x"), "existing-1")
        added = [variables for query, variables in linear.calls if "issueAddLabel" in query]
        self.assertEqual(added, [{"id": "existing-1", "l": "disk"}])

    def test_idle_codex_alert_opens_as_urgent(self):
        captured = []

        class FakeLinear:
            def gql(self, query, variables):
                if "title:{eq:$t}" in query:
                    return {"issues": {"nodes": []}}
                if "teams(filter" in query:
                    return {"teams": {"nodes": [{"id": "team", "states": {"nodes": [{
                        "id": "triage", "name": "Triage"}]}, "labels": {"nodes": [{
                            "id": "symphony", "name": "symphony"}, {
                            "id": "idle", "name": "remediation:provider-idle-codex"}]}}]}}
                captured.append(variables["i"])
                return {"issueCreate": {"issue": {"id": "urgent", "identifier": "JOV-1"}}}

        self.assertEqual(doctor.Tracker(FakeLinear(), "gem").open("provider-idle:codex", "idle"), "urgent")
        self.assertEqual(captured[0]["priority"], 1)
        self.assertEqual(captured[0]["labelIds"], ["symphony", "idle"])

    def test_alert_label_is_created_on_open_reopen_and_close(self):
        created = []
        added = []

        class FakeLinear:
            def gql(self, query, variables):
                if "title:{eq:$t}" in query:
                    return {"issues": {"nodes": []}}
                if "teams(filter" in query:
                    return {"teams": {"nodes": [{"id": "team", "states": {"nodes": [{
                        "id": "triage", "name": "Triage"}]}, "labels": {"nodes": [{
                            "id": "symphony", "name": "symphony"}]}}]}}
                if "issueLabelCreate" in query:
                    created.append(variables["i"])
                    return {"issueLabelCreate": {"issueLabel": {"id": "new-label", "name": variables["i"]["name"]}}}
                if "issueAddLabel" in query:
                    added.append(variables)
                    return {"issueAddLabel": {"success": True}}
                if "issue(id:$id){state{type}}" in query:
                    return {"issue": {"state": {"type": "triage" if self.state_of("iss-1") == "Triage" else "completed"}}}
                if "issueCreate" in query:
                    return {"issueCreate": {"issue": {"id": "iss-1", "identifier": "JOV-1"}}}
                raise AssertionError(query)

            def move(self, issue_id, state):
                self.state = state

            def state_of(self, issue_id):
                return getattr(self, "state", "Done")

            def comment(self, issue_id, text):
                return None

        tracker = doctor.Tracker(FakeLinear(), "gem")
        self.assertEqual(tracker.open("provider-down:codex", "down"), "iss-1")
        self.assertEqual(created, [{
            "teamId": "team", "name": "remediation:provider-down-codex", "color": "#E5484D"}])
        tracker.reopen("iss-1", "again", "provider-down:codex")
        tracker.close("iss-1", "provider-down:codex")
        self.assertEqual([row["l"] for row in added], ["new-label", "new-label"])
        self.assertEqual(doctor.remediation.alert_key_slug("provider-down:codex"), "provider-down-codex")
        self.assertEqual(doctor.remediation.remediation_label_for_alert("provider-down:codex"),
                         "remediation:provider-down-codex")
        self.assertIsNone(doctor.remediation.alert_key_slug("---"))
        os.environ["LANES_ESCALATION"] = "0"
        try:
            quiet = []

            class OffLinear(FakeLinear):
                def gql(self, query, variables):
                    if "issueLabelCreate" in query or "issueAddLabel" in query:
                        quiet.append(query)
                    return super().gql(query, variables)

            off = doctor.Tracker(OffLinear(), "gem")
            self.assertEqual(off.open("disk-low", "low"), "iss-1")
            off.reopen("iss-1", "again", "disk-low")
            off.close("iss-1", "disk-low")
            self.assertEqual(quiet, [])
        finally:
            os.environ.pop("LANES_ESCALATION", None)

    def test_merge_queue_remediation_reopens_the_deduplicated_issue(self):
        class FakeLinear:
            def __init__(self):
                self.moves, self.comments = [], []

            def gql(self, query, variables):
                self.query, self.variables = query, variables
                return {"issues": {"nodes": [{"id": "remediation", "state": {"type": "completed"}}]}}

            def move(self, issue_id, state):
                self.moves.append((issue_id, state))

            def comment(self, issue_id, text):
                self.comments.append((issue_id, text))

        linear = FakeLinear()
        tracker = doctor.Tracker(linear, "gem")
        self.assertEqual(tracker.title("bottleneck:merge-queue"),
                         "remediation:symphony-bottleneck-merge-queue")
        self.assertEqual(tracker.open("bottleneck:merge-queue", "queue stalled"), "remediation")
        self.assertEqual(linear.moves, [("remediation", "Triage")])
        self.assertIn("fired again", linear.comments[0][1])

    def test_reopened_merge_queue_owner_survives_notification_failure_without_duplicate(self):
        class FakeLinear:
            def __init__(self):
                self.moves, self.creates = [], []

            def gql(self, query, variables):
                if "issueCreate" in query:
                    self.creates.append(variables)
                    return {"issueCreate": {"issue": {"id": "duplicate"}}}
                return {"issues": {"nodes": [{"id": "remediation", "state": {"type": "completed"}}]}}

            def move(self, issue_id, state):
                self.moves.append((issue_id, state))

            def comment(self, issue_id, text):
                raise RuntimeError("notification unavailable")

        linear = FakeLinear()
        tracker = doctor.Tracker(linear, "gem")
        with mock.patch.object(tracker, "apply_alert_label"), mock.patch.object(tracker, "_team", return_value={
            "id": "team", "states": {"nodes": [{"id": "triage", "name": "Triage"}]}, "labels": {"nodes": []},
        }), mock.patch.object(tracker, "_remediation_label_id", return_value=None):
            self.assertEqual(tracker.open("bottleneck:merge-queue", "queue stalled"), "remediation")
        self.assertEqual(linear.moves, [("remediation", "Triage")])
        self.assertEqual(linear.creates, [])

    def test_new_condition_generation_reopens_completed_liveness_owner(self):
        class FakeLinear:
            def __init__(self):
                self.moves, self.comments = [], []

            def gql(self, query, variables):
                self.assert_query = (query, variables)
                return {"issues": {"nodes": [{"id": "owner", "state": {"type": "completed"}}]}}

            def move(self, issue_id, state):
                self.moves.append((issue_id, state))

            def comment(self, issue_id, text):
                self.comments.append((issue_id, text))

        linear = FakeLinear()
        event = {"idempotencyKey": "gem:provider-idle:devin:2", "evidence": "0/4 workers",
                 "firstObservedAt": "2026-09-28T21:00:00Z", "deadlineAt": "2026-09-28T21:10:00Z",
                 "nextAction": "wake-summer"}
        doctor.Tracker(linear, "gem").contradict_invariant(event)
        self.assertEqual(linear.moves, [("owner", "Triage")])
        self.assertIn("gem:provider-idle:devin:2", linear.comments[0][1])


class TransitionAcknowledgmentTest(unittest.TestCase):
    def set_states(self, linear, *states):
        linear.state_of.side_effect = states
        types = {"Triage": "triage", "Todo": "unstarted", "In Progress": "started", "Backlog": "backlog"}
        linear.gql.side_effect = [state if isinstance(state, Exception) else
                                 {"issue": {"state": {"type": types.get(state, "completed")}}} for state in states]

    def test_failed_close_remains_pending_and_retries_the_same_issue(self):
        for acknowledged in [False, None]:
            with self.subTest(acknowledged=acknowledged):
                previous = {"issues": {"disk-low": {"id": "same", "closedAt": None}}}
                tracker = FakeTracker()
                tracker.close = mock.Mock(side_effect=[acknowledged, True])
                conditions = {"disk-low": {"state": "resolved"}}
                failed = doctor.reconcile({}, previous, tracker, 10, conditions)
                self.assertIsNone(failed["issues"]["disk-low"]["closedAt"])
                self.assertEqual(failed["issues"]["disk-low"]["pendingAction"], "close")
                self.assertEqual(failed["conditions"]["disk-low"]["summerEscalation"]["outcome"], "pending")
                restored = doctor.reconcile({}, failed, tracker, 20, conditions)
                self.assertEqual(restored["issues"]["disk-low"], {"id": "same", "closedAt": 20})
                self.assertEqual(restored["conditions"]["disk-low"]["summerEscalation"]["outcome"], "cleared")
                self.assertIsNone(previous["issues"]["disk-low"]["closedAt"])
                self.assertIsNone(failed["issues"]["disk-low"]["closedAt"])
                self.assertEqual(tracker.close.call_args_list, [mock.call("same", "disk-low")] * 2)
                self.assertEqual(tracker.opened, [])

    def test_missing_tracker_cannot_acknowledge_an_existing_issue(self):
        previous = {"issues": {"disk-low": {"id": "same", "closedAt": None}}}
        state = doctor.reconcile({}, previous, None, 10, {"disk-low": {"state": "resolved"}})
        self.assertIsNone(state["issues"]["disk-low"]["closedAt"])
        self.assertEqual(state["conditions"]["disk-low"]["summerEscalation"]["outcome"], "pending")

    def test_failed_reopen_retries_past_cool_off_without_duplicate_or_false_receipt(self):
        previous = {"issues": {"disk-low": {"id": "same", "closedAt": 1}}}
        tracker = FakeTracker()
        tracker.reopen = mock.Mock(side_effect=[False, True])
        conditions = {"disk-low": {"state": "active", "idempotencyKey": "generation-2"}}
        failed = doctor.reconcile({"disk-low": "again"}, previous, tracker, 10, conditions)
        self.assertEqual(failed["issues"]["disk-low"]["closedAt"], 1)
        self.assertEqual(failed["conditions"]["disk-low"]["summerEscalation"]["outcome"], "pending")
        self.assertEqual(tracker.contradicted, [])
        restored = doctor.reconcile({"disk-low": "again"}, failed, tracker, doctor.COOL_OFF_S + 20, conditions)
        self.assertEqual(restored["issues"]["disk-low"], {"id": "same", "closedAt": None})
        self.assertEqual(restored["conditions"]["disk-low"]["summerEscalation"]["outcome"], "requested")
        self.assertEqual(tracker.contradicted, ["generation-2"])
        self.assertEqual(tracker.opened, [])
        self.assertEqual(tracker.reopen.call_args_list, [mock.call("same", "again", "disk-low")] * 2)

    def test_refire_after_uncertain_close_reopens_the_same_issue(self):
        tracker = FakeTracker()
        tracker.close = mock.Mock(return_value=False)
        previous = {"issues": {"disk-low": {"id": "same", "closedAt": None}}}
        failed = doctor.reconcile({}, previous, tracker, 10)
        state = doctor.reconcile({"disk-low": "again"}, failed, tracker, 20)
        self.assertEqual(tracker.reopened, [("same", "again")])
        self.assertEqual(state["issues"]["disk-low"], {"id": "same", "closedAt": None})
        self.assertEqual(tracker.opened, [])

    def test_clearing_after_uncertain_reopen_requires_close_acknowledgment(self):
        tracker = FakeTracker()
        tracker.reopen = mock.Mock(return_value=False)
        previous = {"issues": {"disk-low": {"id": "same", "closedAt": 1}}}
        failed = doctor.reconcile({"disk-low": "again"}, previous, tracker, 10)
        state = doctor.reconcile({}, failed, tracker, 20, {"disk-low": {"state": "resolved"}})
        self.assertEqual(tracker.closed, ["same"])
        self.assertEqual(state["issues"]["disk-low"], {"id": "same", "closedAt": 20})
        self.assertEqual(state["conditions"]["disk-low"]["summerEscalation"]["outcome"], "cleared")

    def test_tracker_requires_matching_readback_before_notification(self):
        for action, target in [("close", "Done"), ("reopen", "Triage")]:
            for readback in ["unchanged", RuntimeError("read failed")]:
                with self.subTest(action=action, readback=readback):
                    linear = mock.Mock()
                    self.set_states(linear, "old", readback)
                    linear.move.return_value = None
                    tracker = doctor.Tracker(linear, "gem")
                    args = ("same",) if action == "close" else ("same", "again")
                    self.assertIs(getattr(tracker, action)(*args), False)
                    linear.move.assert_called_once_with("same", target)
                    linear.comment.assert_not_called()

    def test_tracker_acknowledges_state_even_when_notification_fails(self):
        for action, target in [("close", "Done"), ("reopen", "Triage")]:
            with self.subTest(action=action):
                linear = mock.Mock()
                self.set_states(linear, "old", target)
                linear.move.return_value = None
                linear.comment.side_effect = RuntimeError("notification unavailable")
                tracker = doctor.Tracker(linear, "gem")
                args = ("same",) if action == "close" else ("same", "again")
                self.assertIs(getattr(tracker, action)(*args), True)
                linear.move.assert_called_once_with("same", target)

    def test_retry_observes_already_applied_state_without_repeating_mutation(self):
        linear = mock.Mock()
        linear.state_of.return_value = "Done"
        self.assertIs(doctor.Tracker(linear, "gem").close("same"), True)
        linear.move.assert_not_called()

    def test_reopen_preserves_work_already_claimed_or_deferred_by_intake(self):
        for initial, readback in [("Done", "In Progress"), ("Todo", "Todo"), ("Backlog", "Backlog")]:
            with self.subTest(initial=initial, readback=readback):
                linear = mock.Mock()
                self.set_states(linear, initial, readback)
                self.assertIs(doctor.Tracker(linear, "gem").reopen("same", "again"), True)
                if initial != "Done":
                    linear.move.assert_not_called()
                else:
                    linear.move.assert_called_once_with("same", "Triage")

    def test_real_linear_client_rejected_mutation_cannot_acknowledge_close(self):
        lane = load("lane_runner")
        linear = lane.Linear.__new__(lane.Linear)
        def gql(query, variables):
            if "issueUpdate" in query:
                return {"issueUpdate": {"success": False}}
            if "team{states" in query:
                return {"issue": {"team": {"states": {"nodes": [{"id": "done", "name": "Done"}]}}}}
            return {"issue": {"state": {"name": "Triage"}}}
        linear.gql = mock.Mock(side_effect=gql)
        linear.comment = mock.Mock()
        self.assertIs(doctor.Tracker(linear, "gem").close("same"), False)
        linear.comment.assert_not_called()
        self.assertEqual(sum("issueUpdate" in call.args[0] for call in linear.gql.call_args_list), 1)


class MergeThroughputSampleTest(unittest.TestCase):
    def test_samples_the_five_signals_and_uses_the_bounded_cache(self):
        metrics = {
            "window": {"hours": 1},
            "occupancy": {"inQueue": 30},
            "queueWaitMinutes": {"p50": 38},
            "intake": {"mergesPerHour": 6, "opensPerHour": 31},
            "ejections": {"rate": 0.55},
        }
        calls = []

        def succeed(args, **_kwargs):
            calls.append(args)
            return SimpleNamespace(returncode=0, stdout=json.dumps(metrics), stderr="")

        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            sampled, error = doctor.sample_merge_throughput(state, 1000.0, run=succeed)
            self.assertIsNone(error)
            self.assertEqual(
                {key: sampled[key] for key in ("queueDepth", "queueWaitP50Minutes", "mergedPerHour",
                                                "openedPerHour", "ejectionRate")},
                {"queueDepth": 30, "queueWaitP50Minutes": 38, "mergedPerHour": 6,
                 "openedPerHour": 31, "ejectionRate": 0.55})
            cached, error = doctor.sample_merge_throughput(
                state, 1100.0, run=lambda *_args, **_kwargs: self.fail("fresh cache must avoid GitHub reads"))
            self.assertEqual(cached, sampled)
            self.assertIsNone(error)
            stale, error = doctor.sample_merge_throughput(
                state, 1301.0,
                run=lambda *_args, **_kwargs: SimpleNamespace(returncode=1, stdout="", stderr="GitHub down"))
            self.assertEqual(stale, sampled)
            self.assertIn("GitHub down", error)
        self.assertIn("--autoscale", calls[0])


class OrphanPrTest(unittest.TestCase):
    def test_orphan_prs_from_a_fresh_sweep_raise_one_alert(self):
        sweep = {"atEpoch": 1_000_000.0 - 60, "orphans": [18938, 18924], "counts": {"open": 150}}
        alerts = doctor.judge(obs(reconcile=sweep))
        self.assertIn("#18938 #18924", alerts["orphan-prs"])
        self.assertNotIn("orphan-prs", doctor.judge(obs(reconcile={**sweep, "orphans": []})))
        self.assertNotIn("orphan-prs", doctor.judge(obs(reconcile={**sweep, "atEpoch": 0})), "a stale sweep proves nothing")


class AgedPrTest(unittest.TestCase):
    def test_held_dispositions_do_not_keep_the_alert_firing(self):
        """JOV-7132: a hold is the answer to "why is this still open" — parked PRs stay in
        oldest_prs, but counting them makes the alert permanent noise nobody can clear."""
        sweep = {"atEpoch": 1_000_000.0 - 60, "dispositions": [
            {"pr": 1, "ageH": 460.0, "state": "hold:hold"},
            {"pr": 2, "ageH": 350.0, "state": "hold:exhausted"},
            {"pr": 3, "ageH": 300.0, "state": "hold:dependency", "reason": "waits on #9"},
            {"pr": 4, "ageH": 400.0, "state": "closing"},
        ]}
        self.assertNotIn("aged-prs", doctor.judge(obs(reconcile=sweep)))

    def test_aged_undecided_prs_still_alert_with_their_state(self):
        sweep = {"atEpoch": 1_000_000.0 - 60, "dispositions": [
            {"pr": 10, "ageH": 200.0, "state": "draft", "reason": "past the 48h stale SLO"},
            {"pr": 11, "ageH": 260.0, "state": "orphaned"},
            {"pr": 12, "ageH": 100.0, "state": "draft"},
        ]}
        alert = doctor.judge(obs(reconcile=sweep))["aged-prs"]
        self.assertIn("2 open PRs", alert)
        self.assertIn("#10 8.0d draft", alert)
        self.assertIn("#11 10.0d orphaned", alert)
        self.assertNotIn("#12", alert, "under the 7d SLO")


class StatusFeedTest(unittest.TestCase):
    def test_incomplete_merge_evidence_suppresses_landed_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = SimpleNamespace(state=Path(tmp))
            lane = SimpleNamespace(HOST="gem", provider_throughput=lambda *a, **kw: {
                "providers": {"devin": {"landedOutput": 0, "issueToMergeSecondsP50": 0}},
                "landedByAttribution": {}, "landedByOrigin": {}})
            evidence = {"complete": False, "reason": "unstable_snapshot"}
            feed = doctor.status_feed(host, lane, obs(mergedAttributionError="merged-pr-evidence:unstable_snapshot",
                                                      mergedWindow=evidence), {}, {})
        self.assertIsNone(feed["throughput"]["providers"]["devin"]["landedOutput"])
        self.assertIsNone(feed["throughput"]["providers"]["devin"]["issueToMergeSecondsP50"])
        self.assertIsNone(feed["throughput"]["landedByOrigin"])
        self.assertIsNone(feed["throughput"]["landedByAttribution"])
        self.assertEqual(feed["mergedWindow"], evidence)

    def test_feed_counts_running_and_idle_slots_per_lane(self):
        import fcntl
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "slots").mkdir()
            for name in ("devin.0.lock", "devin.1.lock", "codex.0.lock", "gate.0.lock"):
                (state / "slots" / name).touch()
            held = open(state / "slots" / "devin.0.lock", "w")
            fcntl.flock(held, fcntl.LOCK_EX)
            host = type("Host", (), {"state": state})()
            lane = type("Lane", (), {"HOST": "gem", "provider_throughput": staticmethod(throughput_stub)})
            conditions = {"disk-low": {"schema": "jovie.control-plane-liveness-condition/v1"}}
            feed = doctor.status_feed(host, lane, obs(pool=12, lastLandingAge=30, capacityByProvider={
                "devin": {"running": 1, "slots": 2}, "codex": {"running": 0, "slots": 1}}), {"disk-low": "x"},
                                      {"release": "abc1234"}, conditions=conditions)
            held.close()
        self.assertEqual((feed["running"], feed["idle"], feed["pool"], feed["release"]), (1, 2, 12, "abc1234"))
        self.assertEqual(feed["lanes"]["devin"], {"running": 1, "slots": 2})
        self.assertEqual(feed["alerts"], {"disk-low": "x"})
        self.assertEqual(feed["conditions"], conditions)
        self.assertNotIn("gate", feed["lanes"])
        self.assertEqual((feed["held_by_reason"], feed["failed_by_reason"], feed["prs"], feed["orphan_prs"]),
                         ({}, {}, {}, []))

    def test_feed_publishes_held_and_failed_records_by_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "held.json").write_text(json.dumps({
                "1": {"sha": "a", "evidence": ["gate-timeout:x3"]},
                "2": {"sha": "b", "reason": "missing-test", "next_action": "fix-loop"}}))
            (state / "failures.json").write_text(json.dumps({
                "JOV-1": {"count": 1, "at": 0, "reason": "agent-timeout"}, "JOV-2": {"count": 2, "at": 0}, "JOV-3": 1}))
            host = type("Host", (), {"state": state, "linear_env": state / "missing.env"})()
            lane = type("Lane", (), {"Linear": staticmethod(lambda env: (_ for _ in ()).throw(OSError("x"))),
                                     "load_providers": staticmethod(lambda: {}),
                                     "load_github_env": staticmethod(lambda: None), "graphql_budget": staticmethod(lambda: None),
                                     "provider_throughput": staticmethod(throughput_stub), "HOST": "gem"})
            codex = type("Codex", (), {"status": staticmethod(lambda: {})})
            os.environ["LANES_SELFTEST"] = "1"  # no open-PR read from a unit test
            try:
                observed = doctor.observe(host, lane, codex)
            finally:
                os.environ.pop("LANES_SELFTEST", None)
            (state / "slots").mkdir()
            feed = doctor.status_feed(host, lane, observed, {}, {})
        self.assertEqual(feed["held_by_reason"], {"gate-timeout": 1, "missing-test": 1})
        self.assertEqual(feed["failed_by_reason"], {"agent-timeout": 1, "legacy": 2})

    def test_observe_aggregates_gate_wait_time_from_run_receipts(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "runs").mkdir(parents=True)
            (state / "slots").mkdir()
            now = 1_800_000_000.0
            rows = [{"endedAt": doctor.epoch_iso(now - 60), "verdict": "landing", "gateWaitS": 120},
                    {"endedAt": doctor.epoch_iso(now - 120), "verdict": "held", "gateWaitS": 300},
                    {"endedAt": doctor.epoch_iso(now - 30), "verdict": "no-change"},
                    {"endedAt": doctor.epoch_iso(now - 90000), "verdict": "landing", "gateWaitS": 9999}]
            (state / "runs" / "ledger.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
            host = type("Host", (), {"state": state, "linear_env": state / "missing.env"})()
            lane = type("Lane", (), {"Linear": staticmethod(lambda env: (_ for _ in ()).throw(OSError("x"))),
                                     "load_providers": staticmethod(lambda: {}),
                                     "load_github_env": staticmethod(lambda: None), "graphql_budget": staticmethod(lambda: None),
                                     "provider_throughput": staticmethod(throughput_stub), "HOST": "gem"})
            codex = type("Codex", (), {"status": staticmethod(lambda: {})})
            os.environ["LANES_SELFTEST"] = "1"  # no open-PR read from a unit test
            try:
                observed = doctor.observe(host, lane, codex, now=now)
                feed = doctor.status_feed(host, lane, observed, {}, {})
            finally:
                os.environ.pop("LANES_SELFTEST", None)
        self.assertEqual(observed["gateWaits24h"], 2)
        self.assertEqual(observed["gateWaitMedianS24h"], 210)
        self.assertEqual(observed["gateWaitMaxS24h"], 300)
        self.assertEqual(feed["gateWaitMedianS24h"], 210)
        self.assertEqual(feed["gateWaitMaxS24h"], 300)

    def test_feed_tracks_available_codex_capacity_idle_while_compatible_work_waits(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "slots").mkdir()
            (state / "slots/codex.0.lock").touch()
            host = type("Host", (), {"state": state})()
            lane = type("Lane", (), {"HOST": "gem", "provider_throughput": staticmethod(throughput_stub)})
            observed = obs(now=1000.0, poolByProvider={"codex": 5},
                           capacityByProvider={"codex": {"running": 0, "slots": 1}})
            feed = doctor.status_feed(host, lane, observed, {}, {}, {"idleQualifiedSince": {"codex": 900.0}})
        metric = feed["throughput"]["providers"]["codex"]
        self.assertEqual(metric["idleReason"], "capacity-idle-with-qualified-work")
        self.assertEqual(metric["accountIdleSecondsWhileQualifiedWorkExists"], 100)
        self.assertEqual(feed["_idleQualifiedSince"], {"codex": 900.0})

    def test_terminal_pr_backlog_is_its_own_idle_reason(self):
        """JOV-7514: parked hold/exhausted PRs must not be reported as the active open-PR cap."""
        host = type("Host", (), {"state": Path("/tmp")})()
        lane = type("Lane", (), {"HOST": "gem", "provider_throughput": staticmethod(throughput_stub)})
        seats = {"codex": {"running": 0, "slots": 3}}
        parked = doctor.status_feed(host, lane, obs(
            capacityByProvider=seats,
            newIssueBudgetByProvider={"codex": {"reason": "terminal-pr-backlog"}}), {}, {})
        active = doctor.status_feed(host, lane, obs(
            capacityByProvider=seats,
            newIssueBudgetByProvider={"codex": {"reason": "over-budget"}}), {}, {})
        self.assertEqual(parked["throughput"]["providers"]["codex"]["idleReason"], "terminal-pr-backlog")
        self.assertEqual(active["throughput"]["providers"]["codex"]["idleReason"], "open-pr-budget")



class RunnablePoolTest(unittest.TestCase):
    def test_observe_uses_worker_admission_and_deduplicates_provider_pools(self):
        lane = load("lane_runner")
        def issue(key, labels=(), description=""):
            return lane.Issue(key, key, "Task", description, 1, "2026-09-01T00:00:00Z", list(labels))
        candidates = [issue("JOV-GOOD"), issue("JOV-EPIC", ["type:epic"]),
                      issue("JOV-SENSITIVE", ["auth"]), issue("JOV-PRICE", description="Change live pricing"),
                      issue("JOV-OWNED"), issue("JOV-EXHAUSTED"), issue("JOV-BACKOFF")]
        providers = {"devin": {"label": "devin", "slots": 4},
                     "codex": {"label": "codex", "slots": 3},
                     "claude": {"label": "claude", "slots": 2, "enabled": False}}
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            host = lane.Host(state=state, linear_env=state / "test.env")
            (state / "failures.json").write_text(json.dumps({
                "JOV-EXHAUSTED": 3, "JOV-BACKOFF": {"count": 1, "at": 9990}}))
            tracker = mock.Mock()
            tracker.lane_issues.return_value = candidates
            # Host slot overrides must not replace this fixture's provider capacities.
            fixture_env = {"LANES_SELFTEST": "1", **{
                f"LANES_SLOTS_{name.upper()}": str(config["slots"])
                for name, config in providers.items()}}
            with mock.patch.dict(os.environ, fixture_env), \
                    mock.patch.object(lane, "load_providers", return_value=providers), \
                    mock.patch.object(lane, "Linear", return_value=tracker), \
                    mock.patch.object(lane, "in_flight_issues", return_value=frozenset({"JOV-OWNED"})), \
                    mock.patch.object(lane, "load_github_env"), \
                    mock.patch.object(lane, "read_new_issue_budget", side_effect=lambda name, slots: lane.new_issue_budget(name, slots, [])), \
                    mock.patch.object(lane, "graphql_budget", return_value=None):
                observed = doctor.observe(host, lane, SimpleNamespace(status=lambda: {}), now=10000)
                self.assertEqual(observed["pool"], 2)
                self.assertEqual(observed["candidatePool"], 7)
                self.assertEqual(observed["qualifiedJobsByProvider"], {
                    "devin": ["JOV-GOOD"], "codex": ["JOV-GOOD", "JOV-SENSITIVE"], "claude": []})
                self.assertEqual(observed["poolByProvider"], {"devin": 1, "codex": 2, "claude": 0})
                self.assertEqual(observed["candidatePoolByProvider"], {"devin": 7, "codex": 7, "claude": 0})
                reasons = {"excluded-label:type:epic": 1, "sensitive-text": 1,
                           "in-flight-pr": 1, "retry-exhausted": 1, "retry-backoff": 1}
                self.assertEqual(observed["rejectedByProvider"], {
                    "devin": {**reasons, "sensitive-provider": 1}, "codex": reasons, "claude": {}})
                feed = doctor.status_feed(host, lane, observed, {}, {})
                self.assertEqual(feed["admission"]["rejectedByProvider"], observed["rejectedByProvider"])
                self.assertEqual(feed["admission"]["poolByProvider"], observed["poolByProvider"])
                self.assertEqual(tracker.lane_issues.call_args_list, [mock.call("devin"), mock.call("codex")])
                # Reproduce the reported eight nominal candidates, none runnable.
                tracker.lane_issues.return_value = [issue(f"JOV-EPIC-{n}", ["type:epic"]) for n in range(5)] + [
                    issue(f"JOV-PRICE-{n}", description="Change live pricing") for n in range(3)]
                blocked = doctor.observe(host, lane, SimpleNamespace(status=lambda: {}), now=10000)
                self.assertEqual(blocked["candidatePool"], 8)
                self.assertEqual(blocked["pool"], 0)
                self.assertEqual(blocked["rejectedByProvider"]["devin"], {
                    "excluded-label:type:epic": 5, "sensitive-text": 3})
                tracker.lane_issues.return_value = candidates
                with mock.patch.dict(os.environ, {"LANES_SLOTS_CODEX": "0"}):
                    tracker.lane_issues.reset_mock()
                    observed = doctor.observe(host, lane, SimpleNamespace(status=lambda: {}), now=10000)
                    self.assertEqual(observed["pool"], 1)
                    self.assertEqual(observed["qualifiedJobsByProvider"], {"devin": ["JOV-GOOD"], "codex": [], "claude": []})
                    self.assertEqual(observed["poolByProvider"]["codex"], 0)
                    tracker.lane_issues.assert_called_once_with("devin")
                with mock.patch.object(lane, "in_flight_issues", return_value=None):
                    observed = doctor.observe(host, lane, SimpleNamespace(status=lambda: {}), now=10000)
                    self.assertIsNone(observed["pool"])
                    self.assertIn("ownership unreadable", observed["linearError"])
                    self.assertEqual(observed["qualifiedJobsByProvider"], {})
                    self.assertEqual(observed["rejectedByProvider"], {})
                    unknown = doctor.status_feed(host, lane, observed, {}, {})["admission"]
                    self.assertIsNone(unknown["pool"])
                    self.assertIn("ownership unreadable", unknown["error"])

    def test_configured_capacity_ignores_stale_locks_and_reports_draining_workers(self):
        import fcntl
        lane = load("lane_runner")
        providers = {"devin": {"slots": 4}, "codex": {"slots": 3},
                     "claude": {"slots": 2, "enabled": False}}
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "slots").mkdir()
            for name in ("devin.0", "devin.9", "codex.0", "claude.0", "retired.0"):
                (state / "slots" / f"{name}.lock").touch()
            with open(state / "slots/codex.0.lock", "w") as held:
                fcntl.flock(held, fcntl.LOCK_EX)
                with mock.patch.object(lane, "load_providers", return_value=providers), \
                        mock.patch.dict(os.environ, {"LANES_SLOTS_CODEX": "0"}):
                    capacity = doctor.host_capacity(lane.Host(state=state), lane)
                self.assertEqual(capacity, {"devin": {"slots": 4, "running": 0, "base": 4},
                    "codex": {"slots": 0, "running": 1, "base": 0,
                              "leaseAgesComplete": False, "oldestLeaseAge": None},
                    "claude": {"slots": 0, "running": 0, "base": 0}})
                feed_lane = SimpleNamespace(HOST="mac", provider_throughput=throughput_stub)
                feed = doctor.status_feed(SimpleNamespace(state=state), feed_lane,
                                          obs(capacityByProvider=capacity), {}, {})
                self.assertEqual((feed["running"], feed["idle"]), (1, 4))
                self.assertNotIn("retired", feed["lanes"])

    def test_capacity_reports_the_current_fenced_lease_age(self):
        lane = load("lane_runner")
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            host = lane.Host(state=state)
            with mock.patch.object(lane, "now_iso", return_value="1970-01-01T00:01:40Z"), \
                    mock.patch.object(lane, "load_providers", return_value={"devin": {"slots": 1}}):
                lease = lane.Locked(state / "slots/devin.0.lock", blocking=False)
                capacity = doctor.host_capacity(host, lane, now=150)
            lease.release()
        self.assertEqual(capacity["devin"], {"slots": 1, "running": 1, "base": 1,
                                             "leaseAgesComplete": True, "oldestLeaseAge": 50})

class SloFeedTest(unittest.TestCase):
    def test_feed_passes_the_slo_block_through(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "slots").mkdir()
            host = type("Host", (), {"state": state})()
            lane = type("Lane", (), {"HOST": "gem", "provider_throughput": staticmethod(throughput_stub)})
            slo = {"at": "2026-09-28T00:00:00Z", "throughput": {"mergesPerDay": 25}}
            feed = doctor.status_feed(host, lane, obs(slo=slo), {}, {})
            self.assertEqual(feed["slo"], slo)
            self.assertIsNone(doctor.status_feed(host, lane, obs(), {}, {})["slo"])

    def test_fetch_slo_caches_and_survives_failures(self):
        import unittest.mock as mock
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            host = type("Host", (), {"state": state})()
            lane = type("Lane", (), {"load_github_env": staticmethod(lambda: None)})
            snapshot = {"at": "x", "throughput": {"mergesPerDay": 21}}
            ok = type("R", (), {"returncode": 0, "stdout": json.dumps(snapshot)})
            with mock.patch.object(doctor.subprocess, "run", return_value=ok()):
                self.assertEqual(doctor.fetch_slo(host, lane), snapshot)
            # A fresh-enough cache means no second subprocess call.
            with mock.patch.object(doctor.subprocess, "run", side_effect=AssertionError("cache missed")):
                self.assertEqual(doctor.fetch_slo(host, lane), snapshot)
            # A failed refresh falls back to the stale cache instead of raising.
            (state / "slo.json").write_text(json.dumps(
                {"fetchedAt": "2020-01-01T00:00:00Z", "snapshot": snapshot}))
            bad = type("R", (), {"returncode": 1, "stdout": ""})
            with mock.patch.object(doctor.subprocess, "run", return_value=bad()):
                self.assertEqual(doctor.fetch_slo(host, lane), snapshot)


class AccountAttributionTest(unittest.TestCase):
    NOW = 1_000_000

    def report(self, **rows):
        return {"generatedAt": doctor.epoch_iso(self.NOW), "count": len(rows),
                "available": [], "accounts": rows}

    def test_leased_is_not_exhausted_and_does_not_page_provider_down(self):
        report = self.report(a={"available": True, "leased": True, "remainingPercent": 0})
        attribution = doctor.codex_attribution(report, self.NOW)
        self.assertEqual(attribution["state"], "leases-occupied")
        self.assertEqual(attribution["quotaBanked"], 0)
        alerts = doctor.judge(obs(codex=report, tick={"unhealthy": ["codex"]}))
        self.assertNotIn("codex-all-banked", alerts)
        self.assertNotIn("provider-down:codex", alerts)

    def test_lease_occupancy_and_hold_kinds_remain_independent(self):
        rows = {kind: {"available": False, "leased": True, "lastKind": kind,
                       "exhaustedUntil": doctor.epoch_iso(self.NOW + 120)} for kind in ["auth", "rate", "limit", "ok"]}
        result = doctor.codex_attribution(self.report(**rows), self.NOW)
        self.assertEqual(result["state"], "cooldown")
        self.assertEqual([result[k] for k in ["leased", "authCooldown", "rateCooldown", "quotaBanked", "unknownCooldown"]],
                         [4, 1, 1, 1, 1])
        self.assertNotIn("codex-all-banked", doctor.judge(obs(codex=self.report(**rows))))

    def test_incomplete_stale_or_malformed_account_status_is_unknown(self):
        valid = self.report(a={"available": True, "leased": True})
        cases = [{}, {**valid, "count": 2}, {**valid, "count": True}, {**valid, "error": "probe failed"},
                 {**valid, "generatedAt": doctor.epoch_iso(self.NOW - 121)},
                 {**valid, "generatedAt": doctor.epoch_iso(self.NOW + 1)},
                 {**valid, "generatedAt": {}},
                 self.report(a={"available": False, "leased": True}),
                 self.report(a={"available": True, "leased": 1}),
                 self.report(a={"leased": False})]
        for report in cases:
            with self.subTest(report=report):
                self.assertEqual(doctor.codex_attribution(report, self.NOW)["state"], "unknown")
                self.assertNotIn("codex-all-banked", doctor.judge(obs(codex=report)))

    def test_unknown_status_cannot_advance_idle_quota_timer_or_be_reported_empty(self):
        for available in [[], ["stale-name"]]:
            report = {"available": available}
            observation = obs(codex=report, poolByProvider={"codex": 5},
                              capacityByProvider={"codex": {"running": 0, "slots": 1}})
            lane = SimpleNamespace(HOST="test", provider_throughput=throughput_stub)
            feed = doctor.status_feed(SimpleNamespace(), lane, observation, {}, {},
                                      {"idleQualifiedSince": {"codex": 1}})
            metric = feed["throughput"]["providers"]["codex"]
            self.assertEqual(metric["idleReason"], "account-status-unknown")
            self.assertIsNone(metric["accountIdleSecondsWhileQualifiedWorkExists"])
            self.assertIsNone(feed["codexAvailable"])
            self.assertEqual(feed["_idleQualifiedSince"], {})

    def test_unknown_status_cannot_advance_provider_idle_timer_or_alert(self):
        for report in [{"available": ["stale-name"]},
                       {**self.report(a={"available": True, "leased": False}),
                        "generatedAt": doctor.epoch_iso(self.NOW - 121), "available": ["stale-name"]}]:
            observation = obs(codex=report, poolByProvider={"codex": 5},
                              capacityByProvider={"codex": {"running": 0, "slots": 1}},
                              tick={"spawned": ["codex"], "unhealthy": []})
            previous = {"providerIdleSince": {"codex": 1}}
            self.assertFalse(doctor.provider_idle_with_qualified_work(observation, "codex"))
            self.assertEqual(doctor.provider_idle_since(observation, previous), {})
            self.assertNotIn("provider-idle:codex", doctor.judge(observation, previous))

    def test_malformed_cooldown_kind_is_unknown_and_does_not_crash(self):
        for kind in [[], {}, 1, True]:
            report = self.report(a={"available": False, "leased": False, "lastKind": kind,
                                    "exhaustedUntil": doctor.epoch_iso(self.NOW + 120)})
            with self.subTest(kind=kind):
                self.assertEqual(doctor.codex_attribution(report, self.NOW)["state"], "unknown")
                self.assertNotIn("codex-all-banked", doctor.judge(obs(codex=report)))

    def test_observe_uses_end_of_status_sample_clock_across_second_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = SimpleNamespace(state=Path(tmp), linear_env=Path(tmp) / "none")
            lane = SimpleNamespace(HOST="test", load_providers=lambda: {}, load_github_env=lambda: None,
                                   graphql_budget=lambda: None, Linear=mock.Mock(side_effect=SystemExit("LINEAR_API_KEY missing")))
            for generated, expected in [(1001, "leases-occupied"), (1002, "unknown")]:
                report = {"generatedAt": doctor.epoch_iso(generated), "count": 1,
                          "accounts": {"a": {"available": True, "leased": True}}}
                with mock.patch.dict(os.environ, {"LANES_SELFTEST": "1"}), \
                        mock.patch.object(doctor.time, "time", side_effect=[1000.9, 1001.2]):
                    observation = doctor.observe(host, lane, SimpleNamespace(status=lambda: report))
                self.assertEqual(observation["codexAttribution"]["state"], expected)
                self.assertIsNone(observation["pool"])
                self.assertIn("SystemExit: LINEAR_API_KEY missing", observation["linearError"])


class AdmissionBackpressureTest(unittest.TestCase):
    def test_doctor_uses_shared_budget_and_preserves_known_eligibility_on_partial_read_failure(self):
        lane = load("lane_runner")
        providers = {"devin": {"label": "devin", "slots": 4}, "codex": {"label": "codex", "slots": 3}}
        issue = lane.Issue("id", "JOV-7", "Task", "", 1, "2026-01-01T00:00:00Z", [])
        inventory = [{"number": n, "headRefName": f"codex/jov-{n}-20261002", "isDraft": True}
                     for n in range(1, 7)]
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), linear_env=Path(tmp) / "none")
            linear = mock.Mock()
            linear.lane_issues.return_value = [issue]
            with mock.patch.dict(os.environ, {"LANES_SELFTEST": "1", "LANES_SLOTS_DEVIN": "4", "LANES_SLOTS_CODEX": "3"}), \
                    mock.patch.object(lane, "Linear", return_value=linear), \
                    mock.patch.object(lane, "load_providers", return_value=providers), \
                    mock.patch.object(lane, "load_github_env"), \
                    mock.patch.object(lane, "in_flight_issues", return_value=frozenset()), \
                    mock.patch.object(lane, "graphql_budget", return_value=None), \
                    mock.patch.object(lane, "read_new_issue_budget", side_effect=lambda name, slots: lane.new_issue_budget(name, slots, inventory)):
                observed = doctor.observe(host, lane, SimpleNamespace(status=lambda: {}), now=10000)
                self.assertEqual(observed["eligiblePool"], 1)
                self.assertEqual(observed["eligiblePoolByProvider"], {"devin": 1, "codex": 1})
                self.assertEqual(observed["poolByProvider"], {"devin": 1, "codex": 0})
                self.assertEqual(observed["pool"], 1, "provider union must not sum duplicate issues")
                self.assertEqual(observed["newIssueBudgetByProvider"]["codex"], lane.new_issue_budget("codex", 3, inventory))
                with mock.patch.object(lane, "read_new_issue_budget", side_effect=lambda name, slots: lane.new_issue_budget(name, slots, None if name == "codex" else [])):
                    unknown = doctor.observe(host, lane, SimpleNamespace(status=lambda: {}), now=10000)
                self.assertEqual(unknown["eligiblePool"], 1)
                self.assertEqual(unknown["poolByProvider"], {"devin": 1, "codex": None})
                self.assertIsNone(unknown["pool"])
                self.assertIsNone(unknown["linearError"])
                feed = doctor.status_feed(host, lane, unknown, {}, {})
                self.assertIsNone(feed["admission"]["newIssuePool"])
                self.assertEqual(feed["throughput"]["providers"]["codex"]["idleReason"], "pr-inventory-unavailable")

    def test_empty_timer_cannot_survive_unknown_backpressure_or_maintenance(self):
        for changes in [
                {"openPRCount": None}, {"openPRCount": 1}, {"eligiblePool": None},
                {"newIssueBudgetByProvider": {}},
                {"newIssueBudgetByProvider": {"devin": {"reason": "over-budget"}}},
                {"newIssueBudgetByProvider": {"devin": {"reason": "pr-inventory-unavailable"}}}]:
            observation = obs(pool=0, eligiblePool=0, busy=0, **changes) if "eligiblePool" not in changes else obs(pool=0, busy=0, **changes)
            with self.subTest(changes=changes), tempfile.TemporaryDirectory() as tmp:
                host = SimpleNamespace(state=Path(tmp))
                (host.state / "doctor.json").write_text(json.dumps({"poolEmptySince": 1}))
                with mock.patch.dict(os.environ, {"LANES_SELFTEST": "1"}), mock.patch.object(doctor, "observe", return_value=observation):
                    result = doctor.run(host, SimpleNamespace(HOST="test"), None, FakeTracker())
                self.assertIsNone(result["poolEmptySince"])
                self.assertNotIn("pool-empty", result["alerts"])


class PublishTest(unittest.TestCase):
    def test_only_the_primary_host_publishes(self):
        saved = doctor.PRIMARY_FLAG
        with tempfile.TemporaryDirectory() as tmp:
            doctor.PRIMARY_FLAG = Path(tmp) / "primary"
            host = type("Host", (), {"state": Path(tmp)})()
            try:
                self.assertIsNone(doctor.publish_status(host, None, {"x": 1}))
                self.assertFalse((Path(tmp) / "lanes-status.json").exists(), "a non-primary host writes nothing")
            finally:
                doctor.PRIMARY_FLAG = saved


class DeliveryTest(unittest.TestCase):
    HEAD = "a" * 40

    def observation(self, **overrides):
        now = 1_000_000
        observation = obs(mergedWindow={"complete": True, "window": {"since": now - 86400, "until": now}},
                          merged24h=[], _allReceipts=[], tickAge=1,
                          tick={"spawned": ["codex"], "unhealthy": [], "error": None, "disk": {"admitted": True}},
                          capacityByProvider={"codex": {"slots": 1, "base": 1}}, poolByProvider={"codex": 40})
        observation.update(overrides)
        if observation["pool"] == 0:
            observation["poolByProvider"] = {"codex": 0}
        return observation

    def coding(self, **overrides):
        row = {"kind": "fix-red", "runId": "gem-codex-repair", "pr": 7, "provider": "codex",
               "agentExit": 0, "verdict": "fix-pushed", "headBefore": "b" * 40,
               "headAfter": self.HEAD, "endedAt": doctor.epoch_iso(990000)}
        row.update(overrides)
        return row

    def merge(self, **overrides):
        row = {"number": 7, "headRefOid": self.HEAD, "mergeCommit": {"oid": "c" * 40},
               "mergedAt": doctor.epoch_iso(999990)}
        row.update(overrides)
        return row

    def evaluate(self, observation, previous):
        observation["delivery"] = doctor.delivery_evidence(observation, previous)
        alerts = doctor.judge(observation, previous)
        return doctor.condition_receipts(alerts, previous, observation, "gem"), alerts

    def test_gate_scanner_and_other_heads_are_not_delivered_output(self):
        for receipt, merged in ((self.coding(agentExit=None), self.merge()),
                                (self.coding(verdict="recovery-handoff"), self.merge()),
                                (self.coding(headBefore=self.HEAD), self.merge()),
                                (self.coding(), self.merge(headRefOid="d" * 40)),
                                (self.coding(), self.merge(number=8)),
                                (self.coding(), self.merge(mergedAt=doctor.epoch_iso(989000)))):
            observed = self.observation()
            observed.update(_allReceipts=[receipt], merged24h=[merged])
            result = doctor.delivery_evidence(observed, {"deliveryDemandSince": 990000})
            self.assertIsNone(result["lastDeliveredMerge"])
            self.assertEqual(result["state"], "stalled")
            self.assertIsNone(result["deployedVerification"])

    def test_known_idle_pause_and_budget_holds_never_grant_repair_demand(self):
        for overrides, expected in (({"pool": 0, "eligiblePool": 0, "openPRCount": 0}, "no-eligible-work"),
                                     ({"operatorDraining": True}, "controller-held"),
                                     ({"capacityByProvider": {"codex": {"slots": 0, "base": 0}}}, "intentional-pause"),
                                     ({"tick": {"unhealthy": ["codex"]}}, "admission-blocked"),
                                     ({"tick": {"error": "disk denied"}}, "admission-blocked"),
                                     ({"tick": {"spawned": [], "unhealthy": [], "disk": {"admitted": True}}}, "admission-blocked"),
                                     ({"pool": 0, "eligiblePool": 50, "openPRCount": 7}, "admission-blocked")):
            result = doctor.delivery_evidence(self.observation(**overrides), {"deliveryDemandSince": 990000})
            self.assertEqual(result["state"], expected)
            self.assertNotEqual(result["state"], "stalled")

    def test_partial_stale_or_unknown_reads_preserve_alarm_until_exact_merge(self):
        first = self.observation()
        events, alerts = self.evaluate(first, {"deliveryDemandSince": 990000})
        prior = {"alerts": alerts, "conditions": events, "deliveryDemandSince": 990000}
        for overrides in ({"pool": None}, {"mergedWindow": {"complete": False}},
                          {"mergedWindow": {"complete": True, "window": {"since": 900000, "until": 998000}}}):
            observed = self.observation()
            observed.update(overrides, _allReceipts=[self.coding()], merged24h=[self.merge()])
            carried, _ = self.evaluate(observed, prior)
            self.assertEqual(carried["delivery-stalled"]["state"], "active")
            self.assertEqual(carried["delivery-stalled"]["generation"], 1)
            self.assertEqual(carried["delivery-stalled"]["source"]["status"], "unknown")
        recovered = self.observation()
        recovered.update(_allReceipts=[self.coding()], merged24h=[self.merge(mergedAt=doctor.epoch_iso(1000000))])
        events, _ = self.evaluate(recovered, prior)
        receipt = events["delivery-stalled"]
        self.assertEqual(receipt["state"], "resolved")
        self.assertEqual(receipt["terminalOutcome"], "merge-proven")
        self.assertEqual(receipt["recoveryEvidence"]["lastDeliveredMerge"]["runId"], "gem-codex-repair")

    def test_unknown_drain_cannot_resolve_an_alarm(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            path = state / "lifecycle-drain.json"
            for content in ("{", "{}", "[]"):
                path.write_text(content)
                self.assertTrue(doctor.lifecycle.draining(state))
            path.unlink()
            target = state / "request"
            target.write_text(json.dumps({"schema": doctor.lifecycle.PROTOCOL, "owner": "test",
                                          "reason": "repair", "at": doctor.now_iso()}))
            path.symlink_to(target)
            self.assertTrue(doctor.lifecycle.draining(state))
            path.unlink()
            path.write_text(target.read_text())
            self.assertTrue(doctor.lifecycle.draining(state))
            with mock.patch.object(Path, "lstat", side_effect=PermissionError):
                self.assertTrue(doctor.lifecycle.draining(state))
        first = self.observation()
        events, alerts = self.evaluate(first, {"deliveryDemandSince": 990000})
        carried, _ = self.evaluate(self.observation(operatorDraining=True),
                                   {"alerts": alerts, "conditions": events, "deliveryDemandSince": 990000})
        self.assertEqual(carried["delivery-stalled"]["state"], "active")
        self.assertEqual(carried["delivery-stalled"]["source"]["status"], "unknown")

    def test_admission_hold_resets_timer_but_does_not_clear_active_failure(self):
        blocked = self.observation(pool=0, eligiblePool=50, openPRCount=7)
        held = doctor.delivery_evidence(blocked, {"deliveryDemandSince": 980000})
        self.assertIsNone(held["demandSince"])
        resumed = doctor.delivery_evidence(self.observation(), {"deliveryDemandSince": held["demandSince"]})
        self.assertEqual(resumed["demandSince"], 1000000)
        self.assertEqual(resumed["state"], "eligible-work")
        events, alerts = self.evaluate(self.observation(), {"deliveryDemandSince": 980000})
        carried, _ = self.evaluate(blocked, {"alerts": alerts, "conditions": events, "deliveryDemandSince": 980000})
        self.assertEqual(carried["delivery-stalled"]["state"], "active")

    def test_existing_ready_or_queued_exact_output_has_delivery_demand_without_new_intake(self):
        for state in ("ready", "queued"):
            observed = self.observation(pool=0, eligiblePool=50, openPRCount=7)
            observed.update(_allReceipts=[self.coding()],
                            reconcile={"at": doctor.epoch_iso(observed["now"]), "dispositions": [
                                {"pr": 7, "headSha": self.HEAD, "state": state}]})
            result = doctor.delivery_evidence(observed, {"deliveryDemandSince": 990000})
            self.assertEqual(result["state"], "stalled")
            self.assertEqual(result["admission"]["runnablePool"], 0)
            self.assertEqual(len(result["admission"]["admittedLocalOutputs"]), 1)
        for state, head, age in (("hold:fix-exhausted", self.HEAD, 0),
                                 ("draft", self.HEAD, 0), ("ready", "f" * 40, 0),
                                 ("queued", self.HEAD, doctor.pr_events.RECONCILE_S + 1)):
            observed = self.observation(pool=0, eligiblePool=50, openPRCount=7)
            observed.update(_allReceipts=[self.coding()],
                            reconcile={"at": doctor.epoch_iso(observed["now"] - age), "dispositions": [
                                {"pr": 7, "headSha": head, "state": state}]})
            result = doctor.delivery_evidence(observed, {"deliveryDemandSince": 990000})
            self.assertEqual(result["state"], "admission-blocked")
            self.assertEqual(result["admission"]["admittedLocalOutputs"], [])

    def test_failure_restart_existing_router_claim_and_verified_rearm(self):
        from scripts.tests.test_remediation import linear_issue, providers
        observed = self.observation()
        events, alerts = self.evaluate(observed, {"deliveryDemandSince": 990000})
        tracker = FakeTracker()
        state = doctor.reconcile(alerts, {}, tracker, observed["now"], events)
        restarted = json.loads(json.dumps(state))
        state = doctor.reconcile(alerts, restarted, tracker, observed["now"] + 1, events)
        self.assertEqual([key for key, _ in tracker.opened].count("delivery-stalled"), 1)
        issue = linear_issue("JOV-1", "delivery-stalled", title="Gem delivery stalled", description=alerts["delivery-stalled"])
        plan = doctor.remediation.plan_labeled_events([issue], {}, providers(), observed["now"])
        owner = plan["events"]["delivery-stalled"]
        self.assertEqual(owner["cls"], "fixable-by-agent")
        self.assertEqual(owner["status"], "claimed")
        self.assertEqual(owner["lane"], "codex")
        again = doctor.remediation.plan_labeled_events([issue], plan["events"], providers(), observed["now"] + 1)
        self.assertEqual(again["events"]["delivery-stalled"]["attempts"], owner["attempts"])
        recovered = self.observation()
        recovered.update(_allReceipts=[self.coding()], merged24h=[self.merge(mergedAt=doctor.epoch_iso(1000000))])
        cleared, clean = self.evaluate(recovered, state)
        state = doctor.reconcile(clean, state, tracker, observed["now"] + 2, cleared)
        self.assertEqual(state["conditions"]["delivery-stalled"]["terminalOutcome"], "merge-proven")
        refired, _ = self.evaluate(self.observation(), {**state, "deliveryDemandSince": 990000})
        self.assertEqual(refired["delivery-stalled"]["generation"], 2)


class RunTest(unittest.TestCase):
    def test_legacy_admission_alarm_survives_unknown_inventory_and_restart(self):
        for timer in (None, 998000):
            with self.subTest(timer=timer), tempfile.TemporaryDirectory() as tmp:
                state = Path(tmp)
                host = SimpleNamespace(state=state)
                lane = SimpleNamespace(HOST="gem")
                tracker = FakeTracker()
                previous = {"alerts": {"admission-repair-needed": "existing inventory blocked"}}
                if timer is not None:
                    previous["admissionRepairSince"] = timer
                (state / "doctor.json").write_text(json.dumps(previous))
                unknown = obs(pool=None, eligiblePool=None, newIssueBudgetByProvider={})
                with mock.patch.dict(os.environ, {"LANES_SELFTEST": "1"}), \
                        mock.patch.object(doctor, "observe", return_value=unknown):
                    first = doctor.run(host, lane, None, tracker)
                    restarted = doctor.run(host, lane, None, tracker)
                for result in (first, restarted):
                    receipt = result["conditions"]["admission-repair-needed"]
                    self.assertEqual(result["admissionRepairSince"], timer)
                    self.assertEqual(receipt["state"], "active")
                    self.assertEqual(receipt["source"]["status"], "unknown")
                    self.assertEqual(receipt["generation"], 1)
                self.assertEqual(first["conditions"]["admission-repair-needed"]["deadlineAt"],
                                 restarted["conditions"]["admission-repair-needed"]["deadlineAt"])
                self.assertEqual(json.loads((state / "doctor.json").read_text())["admissionRepairSince"], timer)
                self.assertEqual(len(tracker.opened), 1)
                recovered = obs(pool=59, eligiblePool=59)
                with mock.patch.dict(os.environ, {"LANES_SELFTEST": "1"}), \
                        mock.patch.object(doctor, "observe", return_value=recovered):
                    result = doctor.run(host, lane, None, tracker)
                self.assertIsNone(result["admissionRepairSince"])
                self.assertEqual(result["conditions"]["admission-repair-needed"]["state"], "resolved")

    def test_run_writes_doctor_json_from_observations(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "slots").mkdir()
            (state / "runs").mkdir()
            (state / "tick.json").write_text(json.dumps({"at": "2026-09-26T21:00:00Z", "unhealthy": ["devin"], "error": None}))
            host = type("Host", (), {"state": state, "linear_env": state / "missing.env"})()

            class FakeLinear:
                def __init__(self, env):
                    raise OSError("no env")
            lane = type("Lane", (), {"Linear": FakeLinear, "load_providers": staticmethod(lambda: {}),
                                     "load_github_env": staticmethod(lambda: None), "graphql_budget": staticmethod(lambda: None), "HOST": "test"})
            codex = type("Codex", (), {"status": staticmethod(lambda: {"count": 0, "available": [], "accounts": {}})})
            tracker = FakeTracker()
            # No gist from a unit test, and the host's own overlap-guard knob (a lane host may run
            # SYMPHONY_FILE_OVERLAP_GUARD=flag) must not leak into the release self-test.
            with mock.patch.dict(os.environ, {"LANES_SELFTEST": "1"}):
                os.environ.pop("SYMPHONY_FILE_OVERLAP_GUARD", None)
                result = doctor.run(host, lane, codex, tracker)
            self.assertIn("provider-down:devin", result["alerts"])
            self.assertIn("linear-down", result["alerts"])
            self.assertEqual(result["eventsOpen"], 0)
            self.assertEqual(result["eventsClaimed"], 0)
            self.assertEqual(result["eventsHuman"], 0)
            self.assertEqual(result["eventsExhausted"], 0)
            self.assertEqual(result["byFingerprint"], {})
            written = json.loads((state / "doctor.json").read_text())
            self.assertEqual(set(written["alerts"]) >= {"provider-down:devin", "linear-down"}, True)
            self.assertEqual(written["conditions"]["linear-down"]["source"]["status"], "unknown")
            self.assertEqual(written["fileOverlap"]["mode"], "enforce")
            self.assertEqual(written["fileOverlap"]["pairs"], [])
            self.assertEqual(sorted(k for k, _ in tracker.opened), sorted(result["alerts"]))


class DoctorLockTest(unittest.TestCase):
    def test_flock_failure_closes_the_lock_fd_and_still_writes(self):
        import fcntl
        state = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(state, ignore_errors=True))
        opened = []
        real_open = open

        def tracking_open(file, mode="r", *args, **kwargs):
            handle = real_open(file, mode, *args, **kwargs)
            if str(file).endswith("doctor.lock"):
                opened.append(handle)
            return handle

        def fail_lock(handle, operation):
            raise OSError("flock failed")

        wrote = []
        with mock.patch("builtins.open", tracking_open), mock.patch.object(fcntl, "flock", fail_lock):
            doctor.locked_doctor_write(state, lambda: wrote.append("ok"))
        self.assertEqual(wrote, ["ok"])
        self.assertEqual(len(opened), 1)
        self.assertTrue(opened[0].closed)


class MergeWindowTest(unittest.TestCase):
    NOW = 1_800_000_000

    def row(self, number, age):
        return {"number": number, "title": "repair", "headRefName": "codex/jov-1",
                "baseRefName": "main", "createdAt": doctor.epoch_iso(self.NOW - 10000),
                "mergedAt": doctor.epoch_iso(self.NOW - age),
                "updatedAt": doctor.epoch_iso(self.NOW - age)}

    def pages(self, rows):
        def fetch(cursor):
            start = int(cursor or 0)
            end = min(start + 100, len(rows))
            return {"totalCount": len(rows), "nodes": rows[start:end],
                    "pageInfo": {"hasNextPage": end < len(rows), "endCursor": str(end)}}
        return fetch

    def collect(self, fetch, **options):
        return doctor.merge_evidence.collect("JovieInc/Jovie", self.NOW - 200, self.NOW,
                                             fetch_page=fetch, **options)

    def test_more_than_100_and_exact_half_open_boundaries(self):
        rows = [self.row(i + 1, i) for i in range(206)]
        result = self.collect(self.pages(rows))
        self.assertTrue(result["complete"])
        self.assertEqual(result["pages"], 6)
        self.assertEqual(result["scans"], 2)
        self.assertEqual([r["number"] for r in result["prs"]], list(range(2, 202)))

    def test_old_merge_updated_recently_does_not_count(self):
        old = self.row(1, 300)
        old["updatedAt"] = doctor.epoch_iso(self.NOW)
        result = self.collect(self.pages([old, self.row(2, 1)]))
        self.assertEqual([r["number"] for r in result["prs"]], [2])

    def test_second_scan_detects_equal_count_changed_membership(self):
        rounds = 0
        def fetch(cursor):
            nonlocal rounds
            rounds += 1
            return self.pages([self.row(rounds, 1)])(cursor)
        result = self.collect(fetch)
        self.assertEqual(result["reason"], "unstable_snapshot")
        self.assertEqual(result["prs"], [])

    def test_typed_incomplete_for_corrupt_or_partial_pages(self):
        good = self.pages([self.row(1, 1)])(None)
        cases = [
            (None, "malformed_page"),
            ({**good, "totalCount": True}, "malformed_page"),
            ({**good, "totalCount": 2}, "result_count_mismatch"),
            ({**good, "totalCount": 0}, "result_count_mismatch"),
            ({**good, "nodes": [{**good["nodes"][0], "mergedAt": "bad"}]}, "malformed_pr"),
            ({**good, "nodes": [{**good["nodes"][0], "number": True}]}, "malformed_pr"),
            ({**good, "nodes": [self.row(1, 2), self.row(2, 1)]}, "unstable_page_order"),
            ({**good, "totalCount": 2, "nodes": [self.row(1, 1), self.row(1, 1)]}, "duplicate_pr"),
            ({**good, "pageInfo": {"hasNextPage": False}}, "malformed_page"),
            ({**good, "pageInfo": {"hasNextPage": True, "endCursor": ""}}, "malformed_cursor"),
        ]
        for page, reason in cases:
            with self.subTest(reason=reason, page=page):
                result = self.collect(lambda cursor: page)
                self.assertFalse(result["complete"])
                self.assertEqual(result["reason"], reason)
                self.assertEqual(result["prs"], [])
                with self.assertRaisesRegex(doctor.merge_evidence.IncompleteMergeEvidence, reason):
                    doctor.merge_evidence.require_complete(result)

    def test_page_limit_count_drift_and_repeated_cursor(self):
        source = self.pages([self.row(i + 1, i + 1) for i in range(102)])
        self.assertEqual(self.collect(source, max_pages=1)["reason"], "max_pages_reached")
        def changed_count(cursor):
            page = source(cursor)
            if cursor:
                page["totalCount"] += 1
            return page
        self.assertEqual(self.collect(changed_count)["reason"], "unstable_snapshot")
        def repeated(cursor):
            page = source(cursor)
            page["pageInfo"] = {"hasNextPage": True, "endCursor": "100"}
            return page
        self.assertEqual(self.collect(repeated)["reason"], "malformed_cursor")

    def test_read_failure_deadline_and_invalid_options(self):
        with mock.patch.object(doctor.merge_evidence.subprocess, "run", side_effect=OSError("offline")):
            result = doctor.merge_evidence.collect("JovieInc/Jovie", 1, 2)
        self.assertEqual(result["reason"], "fetch_failed")
        with mock.patch.object(doctor.merge_evidence.time, "monotonic", side_effect=[0, 0, 61]):
            self.assertEqual(self.collect(self.pages([]))["reason"], "deadline_exceeded")
        self.assertEqual(self.collect(self.pages([]), max_pages=0)["reason"], "invalid_fetch_options")
        self.assertEqual(self.collect(self.pages([]), timeout_s=float("nan"))["reason"], "invalid_fetch_options")

    def test_default_transport_paginates_both_scans_under_one_deadline(self):
        source = self.pages([self.row(i + 1, i + 1) for i in range(120)])
        calls = []
        def run(args, **kwargs):
            calls.append((args, kwargs))
            cursor = next((arg.removeprefix("cursor=") for arg in args
                           if arg.startswith("cursor=")), None)
            return SimpleNamespace(returncode=0, stdout=json.dumps({
                "data": {"repository": {"pullRequests": source(cursor)}}}))
        with mock.patch.object(doctor.merge_evidence.subprocess, "run", side_effect=run):
            result = doctor.merge_evidence.collect("JovieInc/Jovie", self.NOW - 200, self.NOW)
        self.assertTrue(result["complete"])
        self.assertEqual((result["pages"], result["scans"], len(result["prs"])), (4, 2, 120))
        self.assertEqual(len(calls), 4)
        for args, kwargs in calls:
            self.assertEqual(args[:3], ["gh", "api", "graphql"])
            self.assertIn("owner=JovieInc", args)
            self.assertIn("name=Jovie", args)
            self.assertGreater(kwargs["timeout"], 0)
            self.assertLessEqual(kwargs["timeout"], 60)
        self.assertEqual(sum("cursor=100" in args for args, _ in calls), 2)
        timeouts = [kwargs["timeout"] for _, kwargs in calls]
        self.assertEqual(timeouts, sorted(timeouts, reverse=True))

    def test_default_transport_suppresses_bad_response_and_timeout(self):
        cases = [
            (SimpleNamespace(returncode=1, stdout=""), "fetch_failed"),
            (SimpleNamespace(returncode=0, stdout="not json"), "fetch_failed"),
            (SimpleNamespace(returncode=0, stdout="[]"), "fetch_failed"),
            (SimpleNamespace(returncode=0, stdout='{"errors":[{"message":"unavailable"}]}'), "fetch_failed"),
            (SimpleNamespace(returncode=0, stdout='{"data":{"repository":null}}'), "fetch_failed"),
            (doctor.merge_evidence.subprocess.TimeoutExpired("gh", 1), "deadline_exceeded"),
        ]
        for response, reason in cases:
            with self.subTest(response=response):
                kwargs = {"side_effect": response} if isinstance(response, Exception) else {"return_value": response}
                with mock.patch.object(doctor.merge_evidence.subprocess, "run", **kwargs):
                    result = doctor.merge_evidence.collect("JovieInc/Jovie", 1, 2)
                self.assertEqual(result["reason"], reason)
                self.assertEqual(result["prs"], [])

    def test_deadline_before_fetch_and_invalid_timestamp_relations(self):
        with mock.patch.object(doctor.merge_evidence.time, "monotonic", side_effect=[0, 61]):
            with mock.patch.object(doctor.merge_evidence.subprocess, "run") as run:
                self.assertEqual(self.collect(self.pages([]))["reason"], "deadline_exceeded")
                run.assert_not_called()
        for stamp in [None, "2026-01-01T00:00:00"]:
            with self.subTest(stamp=stamp), self.assertRaises(ValueError):
                doctor.merge_evidence._epoch(stamp)
        bad = self.row(1, 1)
        bad["updatedAt"] = doctor.epoch_iso(self.NOW - 2)
        self.assertEqual(self.collect(self.pages([bad]))["reason"], "malformed_pr")

    def test_doctor_legacy_reader_uses_shared_complete_evidence(self):
        rows = [self.row(1, 1)]
        lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie")
        with mock.patch.object(doctor.merge_evidence, "collect", return_value={"complete": True, "prs": rows}) as collect:
            self.assertEqual(doctor.merged_prs_24h(lane, self.NOW), rows)
            collect.assert_called_once_with(lane.REPO_SLUG, self.NOW - 86400, self.NOW)


if __name__ == "__main__":
    unittest.main()
