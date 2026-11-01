"""Regression tests for scripts/lanes/doctor.py (nothing fails silently).

Run with:
    python3 -m unittest scripts/tests/test_doctor.py -v
"""
from __future__ import annotations

import importlib.util
import hashlib
import json
from datetime import datetime, timezone
import os
import subprocess
import sys
import tempfile
import types
import time
import unittest
from pathlib import Path
from datetime import datetime
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
factory_watchdog = load("factory_watchdog")

# Capacity fixtures model an eligible lane; expiry has its own real guard suite.
_devin_free_fixture = mock.patch('devin_free_policy.admission_open', return_value=True)
def setUpModule():
    _devin_free_fixture.start()
def tearDownModule():
    _devin_free_fixture.stop()


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


def factory_observation(**overrides):
    base = {
        "observedAt": "2026-10-14T00:00:00Z",
        "tickAt": "2026-10-14T00:00:00Z",
        "tickEpoch": 1000,
        "tickAgeSeconds": 0,
        "doctorAt": "2026-10-14T00:00:00Z",
        "doctorEpoch": 1000,
        "doctorAgeSeconds": 0,
        "tickError": None,
        "admissionDenied": None,
        "enabledProviders": ["codex"],
        "spawnedProviders": ["codex"],
        "unhealthyProviders": [],
        "quotaBlocked": {},
        "runningWorkers": 1,
        "eligibleWork": 2,
        "openPullRequests": 0,
        "demandKnown": True,
        "demand": 2,
        "lastWorkEpoch": None,
        "activeConditions": [],
    }
    base.update(overrides)
    return base


class MutableClock:
    def __init__(self, value):
        self.value = value

    def __call__(self):
        return self.value

    def advance(self, seconds):
        self.value += seconds


class FactoryStayUpWatchdogTest(unittest.TestCase):
    def test_active_release_update_gets_a_bounded_grace_instead_of_interruption(self):
        with tempfile.TemporaryDirectory() as tmp:
            recovery = mock.Mock()
            updating = factory_observation(
                tickEpoch=300,
                tickAgeSeconds=700,
                runningWorkers=0,
                service={"active": True, "ageSeconds": 60, "manager": "systemd"},
            )
            result = factory_watchdog.run_once(
                Path(tmp), clock=MutableClock(1000), observe=lambda *_: updating,
                recover=recovery, alert=lambda *_: None,
            )
            self.assertEqual(result["status"], "observing")
            self.assertEqual(result["reasons"], ["factory-tick-in-progress"])
            recovery.assert_not_called()

    def test_three_consecutive_admission_denied_ticks_alert_without_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            streaks = []
            for n in range(4):
                tick = {"at": f"2026-10-30T00:0{n}:00Z", "admissionDenied": "disk-critical"}
                streaks.append(factory_watchdog.admission_streak(state, tick))
                factory_watchdog.admission_streak(state, tick)  # same tick observed twice counts once
            self.assertEqual(streaks, [1, 2, 3, 4])
            self.assertEqual(factory_watchdog.admission_streak(state, {"at": "2026-10-30T00:09:00Z"}), 0)
        base = dict(tickEpoch=300, tickAgeSeconds=60, runningWorkers=0, admissionDenied="disk-critical",
                    eligibleWork=4, openPullRequests=1, demandKnown=True, demand=5)
        short = factory_watchdog.assess(factory_observation(admissionDeniedStreak=2, **base))
        self.assertNotIn("admission-denied", short["reasons"])
        self.assertNotIn("zero-worker", short["reasons"])
        denied = factory_watchdog.assess(factory_observation(admissionDeniedStreak=3, **base))
        self.assertIn("admission-denied", denied["reasons"])
        self.assertTrue(denied["decisionRequired"])

    def assess_tick(self, age_s, heartbeat):
        obs = factory_observation(tickEpoch=300, tickAgeSeconds=700, runningWorkers=0,
                                  service={"active": True, "ageSeconds": age_s, "manager": "systemd"},
                                  heartbeatAgeSeconds=heartbeat)
        return factory_watchdog.assess(obs)["reasons"]

    def test_a_long_tick_that_keeps_working_is_not_restarted_but_a_silent_one_is(self):
        # 2026-10-26: a 30-minute dispatch tick was restarted at the 22-minute grace on every cycle and never
        # reached its doctor pass; the feed, the HUD and the dead-man went stale for over an hour.
        beyond_grace = factory_watchdog.ACTIVE_TICK_GRACE_S + 600
        self.assertEqual(self.assess_tick(beyond_grace, 20), ["factory-tick-in-progress"])
        self.assertEqual(self.assess_tick(beyond_grace, None), ["factory-down"])
        self.assertEqual(self.assess_tick(beyond_grace, factory_watchdog.HEARTBEAT_ALIVE_S + 60), ["factory-down"])
        self.assertEqual(self.assess_tick(factory_watchdog.TICK_HARD_CAP_S + 60, 5), ["factory-down"],
                         "a tick that never finishes is bounded even while it beats")

    def test_stale_factory_recovers_only_after_a_new_writing_observation(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            clock = MutableClock(1000.4)
            recovered = False
            before = factory_observation(tickEpoch=300, tickAgeSeconds=700,
                                         runningWorkers=0, spawnedProviders=[])
            after = factory_observation(tickEpoch=1001, doctorEpoch=1001,
                                        runningWorkers=1)

            def observe(_state, _now):
                return after if recovered else before

            def recover():
                nonlocal recovered
                recovered = True
                return {"action": "restart-systemd-lanes-service", "returncodes": [0, 0], "accepted": True}

            result = factory_watchdog.run_once(
                state, clock=clock, monotonic=lambda: 0, sleep=lambda _: None,
                observe=observe, recover=recover, alert=lambda *_: None,
            )
            self.assertEqual(result["status"], "recovered")
            self.assertEqual(result["attempts"][0]["before"], before)
            self.assertEqual(result["attempts"][0]["after"], after)
            self.assertEqual(result["attempts"][0]["action"], "restart-systemd-lanes-service")
            self.assertEqual(result["verification"], {"status": "passed", "mode": "admitting-and-writing"})
            rows = [json.loads(line) for line in (state / "runs/factory-watchdog.jsonl").read_text().splitlines()]
            self.assertEqual(rows[-1]["event"], "recovered")

    def test_old_healthy_receipts_do_not_satisfy_recovery_verification(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            clock = MutableClock(1500)
            dark = factory_observation(tickEpoch=700, tickAgeSeconds=800,
                                       runningWorkers=0, spawnedProviders=[])
            old_healthy = factory_observation(tickEpoch=1400, doctorEpoch=1400)
            observations = iter([dark, old_healthy])
            result = factory_watchdog.run_once(
                state, clock=clock, monotonic=lambda: 0, sleep=lambda _: None,
                observe=lambda *_: next(observations), verify_timeout_s=0,
                recover=lambda: {"action": "restart-systemd-lanes-service",
                                 "returncodes": [0, 0], "accepted": True},
                alert=lambda *_: None,
            )
            self.assertEqual(result["status"], "observing")
            self.assertEqual(result["verification"], {"status": "pending", "reasons": ["no-new-tick"]})

            result = factory_watchdog.run_once(
                state, clock=clock, observe=lambda *_: old_healthy,
                recover=mock.Mock(), alert=lambda *_: None,
            )
            self.assertEqual(result["status"], "observing")
            self.assertEqual(result["verification"], {"status": "pending", "reasons": ["no-new-tick"]})

            new_healthy = factory_observation(tickEpoch=1501, doctorEpoch=1501)
            result = factory_watchdog.run_once(
                state, clock=clock, observe=lambda *_: new_healthy,
                recover=mock.Mock(), alert=lambda *_: None,
            )
            self.assertEqual(result["status"], "recovered")
            self.assertEqual(result["verification"], {"status": "passed", "mode": "admitting-and-writing"})

    def test_zero_worker_timer_starts_when_that_condition_first_appears(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            clock = MutableClock(1800)
            recovery = mock.Mock(return_value={"action": "restart-systemd-lanes-service",
                                               "returncodes": [1], "accepted": False})
            updating = factory_observation(
                tickEpoch=1000, tickAgeSeconds=800, runningWorkers=0,
                service={"active": True, "ageSeconds": 60, "manager": "systemd"},
            )
            factory_watchdog.run_once(state, clock=clock, observe=lambda *_: updating,
                                      recover=recovery, alert=lambda *_: None)
            clock.advance(factory_watchdog.ZERO_WORKER_S + 1)
            zero_worker = factory_observation(runningWorkers=0)
            factory_watchdog.run_once(state, clock=clock, observe=lambda *_: zero_worker,
                                      recover=recovery, alert=lambda *_: None)
            recovery.assert_not_called()
            clock.advance(factory_watchdog.ZERO_WORKER_S)
            factory_watchdog.run_once(state, clock=clock, observe=lambda *_: zero_worker,
                                      recover=recovery, alert=lambda *_: None)
            recovery.assert_called_once()

    def test_zero_worker_state_must_persist_for_five_minutes_before_recovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            clock = MutableClock(2000)
            calls = []
            observation = factory_observation(runningWorkers=0)

            def recover():
                calls.append(clock())
                return {"action": "restart-systemd-lanes-service", "returncodes": [1], "accepted": False}

            first = factory_watchdog.run_once(state, clock=clock, observe=lambda *_: observation,
                                               recover=recover, alert=lambda *_: None)
            self.assertEqual(first["status"], "observing")
            self.assertEqual(calls, [])
            clock.advance(factory_watchdog.ZERO_WORKER_S - 1)
            factory_watchdog.run_once(state, clock=clock, observe=lambda *_: observation,
                                      recover=recover, alert=lambda *_: None)
            self.assertEqual(calls, [])
            clock.advance(2)
            factory_watchdog.run_once(state, clock=clock, observe=lambda *_: observation,
                                      recover=recover, alert=lambda *_: None)
            self.assertEqual(calls, [clock()])

    def test_recovery_is_bounded_and_alerts_once_after_exhaustion(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            clock = MutableClock(3000)
            recoveries, alerts = [], []
            dark = factory_observation(tickEpoch=2000, tickAgeSeconds=1000,
                                       runningWorkers=0, spawnedProviders=[])

            def recover():
                recoveries.append(clock())
                return {"action": "restart-systemd-lanes-service", "returncodes": [1], "accepted": False}

            def alert(record, issue_id, resolve):
                alerts.append((record["status"], issue_id, resolve))
                return "linear-incident-id"

            result = None
            for _ in range(factory_watchdog.MAX_RECOVERY_ATTEMPTS):
                result = factory_watchdog.run_once(state, clock=clock, observe=lambda *_: dark,
                                                   recover=recover, alert=alert)
                clock.advance(factory_watchdog.ATTEMPT_COOLDOWN_S + 1)
            self.assertEqual(result["status"], "exhausted")
            self.assertEqual(len(recoveries), factory_watchdog.MAX_RECOVERY_ATTEMPTS)
            self.assertEqual(alerts, [("exhausted", None, False)])
            factory_watchdog.run_once(state, clock=clock, observe=lambda *_: dark,
                                      recover=recover, alert=alert)
            self.assertEqual(len(recoveries), factory_watchdog.MAX_RECOVERY_ATTEMPTS)
            self.assertEqual(len(alerts), 1)

    def test_zero_provider_capacity_requires_a_decision_without_blind_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            recovery = mock.Mock()
            alerts = []
            zero_capacity = factory_observation(
                runningWorkers=0,
                spawnedProviders=[],
                quotaBlocked={"codex": "all-accounts-banked"},
            )
            result = factory_watchdog.run_once(
                state, clock=MutableClock(4000), observe=lambda *_: zero_capacity,
                recover=recovery,
                alert=lambda record, issue_id, resolve: alerts.append(record["reasons"]) or "issue-id",
            )
            self.assertEqual(result["status"], "decision-required")
            self.assertIn("zero-provider-capacity", result["reasons"])
            recovery.assert_not_called()
            self.assertEqual(len(alerts), 1)


def realistic_feed():
    """Shaped like the 2026-10-25 live feed that hit 410,142 bytes: 737 overlap pairs (217 KB), 312
    remediation fingerprints with long ask text (72 KB), 40 conditions (54 KB), per-PR attribution rows."""
    pairs = [{"actionTaken": "flag", "files": [f"apps/web/components/area{n % 40}/File{n % 97}.tsx", "apps/web/data/shared.ts",
                                              "apps/web/tests/unit/area/contract.test.ts", f"apps/web/lib/mod{n}.ts"],
              "first": f"pr:#{22000 + n}", "firstPr": 22000 + n, "later": f"pr:#{23000 - n}", "laterPr": 23000 - n,
              "observedAt": "2026-10-25T13:55:52.575644+00:00", "policyAction": "flag", "queueOwned": n % 3 == 0,
              "regenerateFiles": []} for n in range(737)]
    fingerprints = {f"remediation-fingerprint-{n}": {
        "state": ("done", "exhausted", "claimed", "human")[n % 4], "issue": f"JOV-{7000 + n}", "cls": "fixable-by-agent",
        "lane": None, "ask": "needs-human `ccf5eaaa-8705-49f0-b264-ec3558d678b7`: exhausted the lane ladder. " * 3,
        "recurrence": ["2026-10-24T01:02:03Z"] * 6} for n in range(312)}
    conditions = {f"condition-{n}": {"schema": "jovie.control-plane-liveness-condition/v1",
                                    "idempotencyKey": "k" * 64, "condition": "c" * 900} for n in range(40)}
    rows = [{"repository": "JovieInc/Jovie", "prNumber": n, "title": "fix(area): a typical pull request title (JOV-1)",
             "headSha": "a" * 40, "mergeCommitSha": "b" * 40, "origin": {"method": "autonomous", "provider": "codex",
                                                                        "evidence": ["x" * 60] * 4}} for n in range(560)]
    return {"schema": "symphony-lanes-status/v1", "at": "2026-10-25T15:00:00Z", "host": "gem", "release": "r1",
            "fileOverlap": {"mode": "flag", "pairs": pairs, "metrics": {"overlap_flags": 18810}},
            "remediation": {"byFingerprint": fingerprints, "surfaced": [{"pr": n} for n in range(131)]},
            "conditions": conditions,
            "shippingAttribution": {"schema": "s", "projects": [{"channel": "Jovie", "mergeCount": 118,
                                                                 "pullRequests": rows,
                                                                 "missingOriginReceiptPullRequests": ["u" * 45] * 100}]},
            "alerts": {"a": "x" * 200}}


class PublicFeedSizeTest(unittest.TestCase):
    def test_realistic_feed_stays_under_seventy_percent_of_the_cap_and_keeps_operational_identity(self):
        feed = realistic_feed()
        full = json.dumps(feed, indent=1)
        self.assertGreater(len(full.encode()), doctor.PUBLIC_FEED_MAX_BYTES * 2, "fixture must reproduce the overflow")
        out = doctor.public_status_projection(feed, full)
        public = json.loads(out)
        self.assertEqual(public["schema"], "symphony-lanes-status/v1")
        self.assertLess(len(out.encode()), doctor.PUBLIC_FEED_MAX_BYTES * doctor.PUBLIC_FEED_WARN_RATIO)
        overlap = public["fileOverlap"]
        self.assertNotIn("pairs", overlap)
        self.assertEqual(overlap["pairsSummary"]["count"], 737)
        self.assertLessEqual(len(overlap["pairsSummary"]["topHotspots"]), doctor.PUBLIC_OVERLAP_TOP)
        self.assertEqual(overlap["pairsSummary"]["topHotspots"][0]["file"], "apps/web/data/shared.ts")
        self.assertEqual(overlap["pairsSummary"]["pairsRef"]["jsonPointer"], "/fileOverlap/pairs")
        rows = public["remediation"]["byFingerprint"]
        self.assertEqual(len(rows), 312)
        self.assertEqual(set(rows["remediation-fingerprint-2"]), set(doctor.PUBLIC_REMEDIATION_FIELDS))
        self.assertEqual(public["remediation"]["byFingerprintRef"]["recordCount"], 312)
        self.assertEqual(len(public["remediation"]["surfaced"]), 131)  # ownership arrays stay whole
        # Nothing is lost: the complete evidence is what the details file carries, byte for byte.
        self.assertEqual(len(json.loads(full)["fileOverlap"]["pairs"]), 737)
        self.assertEqual(public["publicProjection"]["fullEvidence"]["bytes"], len(full.encode()))

    def test_conditions_keep_active_and_recent_resolutions_compactly_and_count_the_rest(self):
        # Gem 2026-10-25: 33 of 52 receipts were resolved, kept forever, each with ~1.5 KB of review bindings.
        now = 1_800_000_000.0
        stamp = lambda age: datetime.fromtimestamp(now - age, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        review = {"outcome": "approved-template", "bindings": {"messageSha256": "f" * 64, "extra": "x" * 1200}}
        def event(state, resolved_age=None, evidence="e" * 900):
            row = {"schema": "s", "idempotencyKey": "gem:k:1", "condition": "k", "generation": 1, "state": state,
                   "severity": "degraded", "owner": "doctor", "firstObservedAt": "2026-10-25T00:00:00Z",
                   "source": {"producer": "p", "status": "degraded", "observedAt": "t", "freshnessSeconds": 0},
                   "evidence": evidence, "writingReview": review, "writingDecision": {"d": "x" * 500},
                   "summerEscalation": {"transport": "linear", "outcome": "requested"}}
            if resolved_age is not None:
                row["resolvedAt"] = stamp(resolved_age)
            return row
        public = {"conditions": {"live": event("active"), "fresh": event("resolved", 3600),
                                 "old": event("resolved", 7 * 3600), "undated": event("resolved")}}
        before = len(json.dumps(public))
        doctor._compact_conditions(public, now)
        self.assertEqual(sorted(public["conditions"]), ["fresh", "live"])
        live = public["conditions"]["live"]
        self.assertNotIn("writingReview", live)
        self.assertNotIn("writingDecision", live)
        self.assertEqual(live["evidence"], "e" * 900, "operational evidence is never trimmed")
        self.assertEqual(live["summerEscalation"]["outcome"], "requested")
        self.assertEqual(live["source"]["status"], "degraded")
        summary = public["conditionsSummary"]
        self.assertEqual((summary["total"], summary["resolvedOmitted"], summary["byState"]),
                         (4, 2, {"active": 1, "resolved": 3}))
        self.assertEqual(summary["ref"]["jsonPointer"], "/conditions")
        self.assertLess(len(json.dumps(public)), before / 2)

    def test_growth_rate_projects_time_to_cap_and_alerts_under_six_hours(self):
        cap, now = 262144, 1_000_000.0
        flat = doctor.feed_growth([[now - 3600, 100000], [now - 1800, 100000]], now, 100000)
        self.assertEqual((flat["growthBytesPerHour"], flat["secondsToCap"]), (0, None))
        self.assertIsNone(doctor.feed_growth([[now - 60, 1]], now, 2)["secondsToCap"], "too little history")
        rising = doctor.feed_growth([[now - 3600, 145000], [now - 1800, 160000]], now, 175000)
        self.assertEqual(rising["growthBytesPerHour"], 30000)
        self.assertEqual(rising["secondsToCap"], round((cap - 175000) / (30000 / 3600)))
        self.assertLess(rising["secondsToCap"], doctor.FEED_GROWTH_ALERT_S)
        sizes = {"bytes": 175000, "maxBytes": cap, "ratio": 0.668, **rising}
        alert = doctor.judge(obs(publicFeed=sizes))["public-feed-growth"]
        self.assertIn("30000 bytes/h", alert)
        slow = doctor.feed_growth([[now - 3600, 100000], [now - 1800, 100500]], now, 101000)
        self.assertNotIn("public-feed-growth", doctor.judge(obs(publicFeed={"bytes": 101000, "maxBytes": cap, "ratio": 0.4, **slow})))
        # The level alert wins when both apply; one alert, not two.
        both = doctor.judge(obs(publicFeed={**sizes, "bytes": 190000, "ratio": 0.725}))
        self.assertIn("public-feed-near-limit", both)
        self.assertNotIn("public-feed-growth", both)

    def test_section_sizes_are_measured_and_the_doctor_alerts_before_the_cap(self):
        out = doctor.public_status_projection(realistic_feed(), json.dumps(realistic_feed(), indent=1))
        sizes = doctor.feed_section_sizes(out)
        self.assertEqual(sizes["bytes"], len(out.encode()))
        self.assertLess(sizes["ratio"], doctor.PUBLIC_FEED_WARN_RATIO)
        self.assertEqual(next(iter(sizes["sections"])), "conditions")
        self.assertNotIn("public-feed-near-limit", doctor.judge(obs(publicFeed=sizes)))
        near = {**sizes, "bytes": 190000, "ratio": 0.725}
        alert = doctor.judge(obs(publicFeed=near))["public-feed-near-limit"]
        self.assertIn("72%", alert)
        self.assertIn("conditions", alert)
        self.assertNotIn("public-feed-near-limit", doctor.judge(obs(publicFeed={})))


class JudgeTest(unittest.TestCase):
    def test_healthy_host_raises_nothing(self):
        self.assertEqual(doctor.judge(obs()), {})

    def test_install_lag_alerts_only_past_the_measured_threshold(self):
        late = doctor.judge(obs(installLag={"behindS": doctor.INSTALL_LAG_ALERT_S + 60, "behindCommit": "dcfb270acb83",
                                            "error": "AdmissionHeld: gate-admission-busy"}))
        self.assertIn("gate-admission-busy", late["install-lag"])
        self.assertIn("dcfb270a", late["install-lag"])
        for lag in ({"behindS": 600}, {"behindS": 0}, {"behindS": None}, {}):
            self.assertNotIn("install-lag", doctor.judge(obs(installLag=lag)))

    def test_install_lag_past_the_two_hour_slo_with_a_refusal_is_a_critical_owned_p0(self):
        lag = {"behindS": doctor.INSTALL_LAG_P0_S + 60, "behindCommit": "423401e4f5", "error": "release-bundle-incomplete"}
        alerts = doctor.judge(obs(installLag=lag))
        self.assertIn("release-bundle-incomplete", alerts["install-lag-refused"])
        self.assertIn("P0", alerts["install-lag-refused"])
        receipt = doctor.condition_receipts(alerts, {}, obs(installLag=lag), "gem")["install-lag-refused"]
        self.assertEqual((receipt["severity"], receipt["owner"]), ("critical", "gem-lanes-updater"))
        self.assertNotIn("install-lag-refused", doctor.judge(obs(installLag={**lag, "error": None})))
        self.assertNotIn("install-lag-refused", doctor.judge(obs(installLag={**lag, "behindS": 3600})))

    def test_failed_event_delivery_is_actionable_and_acknowledgement_clears_it(self):
        failed = obs(tick={'remediationEvents': {'deliveryFailed': 1, 'deliveryExhausted': 0, 'deliveryNextAt': 100}})
        alerts = doctor.judge(failed)
        self.assertIn('remediation-delivery', alerts)
        receipt = doctor.condition_receipts(alerts, {}, failed, 'gem')['remediation-delivery']
        self.assertEqual(receipt['recovery']['action'], 'repair-and-read-back-existing-event-delivery')
        self.assertEqual(doctor.judge(obs(tick={'remediationEvents': {'deliveryFailed': 0}})), {})

    def test_reconciliation_error_reports_durable_delivery_state_instead_of_inventing_a_failure(self):
        current = obs(tick={
            'remediationEventsError': 'RuntimeError: remediation-inventory-unreadable',
            'remediationEvents': {'deliveryFailed': 0, 'deliveryExhausted': 0, 'deliveryNextAt': None},
        })
        alert = doctor.judge(current)['remediation-delivery']
        self.assertIn('reconciliation failed', alert)
        self.assertIn('remediation-inventory-unreadable', alert)
        self.assertIn('journal failed=0, exhausted=0, next retry=None', alert)
        self.assertNotIn('lacks authoritative acknowledgement', alert)
        self.assertNotIn('unknown', alert)

    def test_busy_unknown_and_stale_delivery_cannot_resolve_prior_failure(self):
        failed = obs(tick={'remediationEvents': {'deliveryFailed': 1, 'deliveryObservedAt': 1_000_000.0}})
        prior = {'conditions': doctor.condition_receipts(doctor.judge(failed), {}, failed, 'gem')}
        for report in [{'deliveryBusy': True}, {}, {'deliveryFailed': 0},
                       {'deliveryFailed': 0, 'deliveryPending': 0, 'deliveryObservedAt': 900_000.0}]:
            with self.subTest(report=report):
                current = obs(tick={'remediationEvents': report})
                alerts = doctor.judge(current, prior)
                receipt = doctor.condition_receipts(alerts, prior, current, 'gem')['remediation-delivery']
                self.assertEqual(receipt['state'], 'active')
                self.assertEqual(receipt['deadlineAt'], prior['conditions']['remediation-delivery']['deadlineAt'])
        good = obs(tick={'remediationEvents': {'deliveryFailed': 0, 'deliveryPending': 0, 'deliveryObservedAt': 1_000_000.0}})
        alerts = doctor.judge(good, prior)
        self.assertNotIn('remediation-delivery', alerts)
        self.assertEqual(doctor.condition_receipts(alerts, prior, good, 'gem')['remediation-delivery']['state'], 'resolved')

    def test_design_brief_stale_alert_is_retired(self):
        # 2026-10-11: no issue is held for a brief, so even a legacy census never alerts.
        self.assertEqual(doctor.judge(obs(designGate={"stale": ["JOV-3"]})), {})
        self.assertEqual(doctor.judge(obs(designGate={"gated": 1, "autoAdmitted": 1})), {})

    def test_escalation_alert_names_the_pr_and_class(self):
        alerts = doctor.judge(obs(escalation={"surfaced": [{"pr": 7, "cls": "needs-human-decision"}]}))
        self.assertIn("#7 needs-human-decision", alerts["escalation-surfaced"])
        self.assertIn("repair-owner", alerts["escalation-surfaced"])  # never Tim by default
        self.assertEqual(doctor.judge(obs(escalation={"surfaced": []})), {})

    def test_escalation_alert_drops_surfaced_prs_that_are_no_longer_open(self):
        # Gem 2026-10-20: the alert still listed 12 PRs that had merged or closed by 10-13.
        surfaced = {"surfaced": [{"pr": 20117, "cls": "needs-human-decision"}, {"pr": 21776, "cls": "needs-rebase"}]}
        sweep = {"counts": {"open": 2}, "dispositions": [{"pr": 21776}, {"pr": 21725}]}
        alerts = doctor.judge(obs(escalation=surfaced, reconcile=sweep))
        self.assertIn("#21776", alerts["escalation-surfaced"])
        self.assertNotIn("#20117", alerts["escalation-surfaced"])
        self.assertEqual(doctor.judge(obs(escalation={"surfaced": surfaced["surfaced"][:1]}, reconcile=sweep)), {})
        incomplete = {"counts": {"open": 5}, "dispositions": [{"pr": 21776}]}  # unknown keeps everything
        self.assertIn("#20117", doctor.judge(obs(escalation=surfaced, reconcile=incomplete))["escalation-surfaced"])

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

    def test_repairs_spent_without_work_name_their_infrastructure_causes(self):
        quiet = doctor.judge(obs(noWorkRepairs24h={"target-state-unavailable": doctor.NO_WORK_REPAIR_ALERT - 1}))
        self.assertNotIn("repairs-without-work", quiet)
        alerts = doctor.judge(obs(noWorkRepairs24h={"target-state-unavailable": 23,
                                                    "preserved-target-needs-reconciliation": 17}))
        self.assertIn("40 PR repairs", alerts["repairs-without-work"])
        self.assertIn("target-state-unavailable 23", alerts["repairs-without-work"])

    def test_refunded_no_work_repairs_are_counted_as_requeues_not_spend(self):
        # Gem 2026-10-23: refunded infra stops never consumed an attempt, so the alert
        # must say so instead of claiming the budget was burned.
        alerts = doctor.judge(obs(noWorkRepairs24h={"target-state-unavailable": 10},
                                  refundedNoWorkRepairs24h=7))
        alert = alerts["repairs-without-work"]
        self.assertIn("3 spent a fix attempt", alert)
        self.assertIn("7 were refunded and requeued with backoff", alert)

    def test_an_unclean_previous_tick_is_a_visible_alert_with_its_recovery(self):
        alerts = doctor.judge(obs(tick={"at": "x", "error": None,
                                        "uncleanPreviousRun": {"pid": 4242, "startedAt": 1.0},
                                        "uncleanRecovery": {"refundedFixAttempts": ["6"]}}))
        self.assertIn("lanes-tick-unclean", alerts)
        self.assertIn("pid 4242", alerts["lanes-tick-unclean"])
        self.assertIn("1 stranded fix-attempt charge", alerts["lanes-tick-unclean"])

    def test_exhausted_only_delivery_failure_is_still_a_visible_alert(self):
        # Terminal exhausted rows never retry: they must alert on their own, without a
        # failed count, or a terminal failure would go silent.
        alerts = doctor.judge(obs(tick={"remediationEvents": {"deliveryFailed": 0,
                                                              "deliveryExhausted": 2,
                                                              "deliveryNextAt": None}}))
        self.assertIn("remediation-delivery", alerts)
        self.assertIn("exhausted=2", alerts["remediation-delivery"])

    def test_disk_tiers_page_summer_only_below_critical(self):
        self.assertEqual(set(doctor.judge(obs(diskFreePct=7.0))), {"disk-low"})
        alerts = doctor.judge(obs(diskFreePct=4.9))
        self.assertEqual(set(alerts), {"disk-critical"})
        self.assertIn("Summer", alerts["disk-critical"])

    def test_disk_hold_below_growth_floor_alarms_after_thirty_minutes_naming_consumers(self):
        # 2026-10-25: 13.2% free held codex at 1 seat for hours with no alarm (floor is 15%).
        top = [{"path": "/home/x/codex-worktrees", "gib": 210.5}]
        held = obs(diskFreePct=13.2, diskTop=top)
        self.assertNotIn("disk-capacity-held", doctor.judge(held))
        self.assertNotIn("disk-capacity-held", doctor.judge(
            held, {"diskHeldSince": held["now"] - doctor.DISK_HELD_S + 1}))
        alerts = doctor.judge(held, {"diskHeldSince": held["now"] - doctor.DISK_HELD_S})
        self.assertIn("/home/x/codex-worktrees 210.5 GiB", alerts["disk-capacity-held"])
        self.assertNotIn("disk-capacity-held", doctor.judge(
            obs(diskFreePct=16.0), {"diskHeldSince": held["now"] - 9999}))

    def test_top_disk_consumers_runs_du_with_a_budget_and_ranks_the_largest(self):
        import tempfile
        sizes = {}

        def fake_du(cmd, **kwargs):
            if cmd[2] not in sizes:
                raise OSError("du unavailable")
            return type("R", (), {"stdout": f"{sizes[cmd[2]]}\t{cmd[2]}\n"})()
        with tempfile.TemporaryDirectory() as tmp:
            home, state = Path(tmp) / "home", Path(tmp) / "state"
            for name in ("codex-worktrees", ".cache", "grok-wt"):
                (home / name).mkdir(parents=True)
            (state / "runs").mkdir(parents=True)
            sizes.update({str(home / "codex-worktrees"): 3 * 1048576, str(home / ".cache"): 1048576,
                          str(state / "runs"): 2 * 1048576})  # grok-wt: du raises, so it is skipped
            with mock.patch.dict(os.environ, {"HOME": str(home)}):
                top = doctor.top_disk_consumers(state, budget_s=30, run=fake_du)
        self.assertEqual([(Path(row["path"]).name, row["gib"]) for row in top],
                         [("codex-worktrees", 3.0), ("runs", 2.0), (".cache", 1.0)])

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

    def test_available_provider_capacity_with_compatible_work_and_vacant_slots_is_p0(self):
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
        partially_idle = obs(**{**idle, "capacityByProvider": {
            **idle["capacityByProvider"], "devin": {"running": 1, "slots": 4}}})
        self.assertIn("1/4 workers", doctor.judge(partially_idle, previous)["provider-idle:devin"])
        self.assertEqual(doctor.provider_idle_since(partially_idle, {})["devin"], partially_idle["now"])
        fully_occupied = obs(**{**idle, "capacityByProvider": {
            **idle["capacityByProvider"], "devin": {"running": 4, "slots": 4}}})
        self.assertNotIn("provider-idle:devin", doctor.judge(fully_occupied, previous))
        self.assertNotIn("devin", doctor.provider_idle_since(fully_occupied, previous))
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

    def test_a_missing_linear_app_credential_fails_closed_with_its_own_condition(self):
        alerts = doctor.judge(obs(linearAppCredential=False))
        self.assertIn("no personal-key fallback", alerts["linear-app-credential-missing"])
        for present in (True, None):  # installed, or a fixture/self-test with no host file
            self.assertNotIn("linear-app-credential-missing", doctor.judge(obs(linearAppCredential=present)))

    def test_started_issues_without_a_live_owner_escalate_after_the_grace(self):
        quiet = doctor.judge(obs(ownership={"started": 536, "ownerless": 3, "overGrace": 0}))
        self.assertNotIn("started-without-owner", quiet)  # inside the grace period
        loud = doctor.judge(obs(ownership={"started": 536, "ownerless": 40, "overGrace": 40,
                                           "oldestOwnerlessS": 7200,
                                           "unresolved": {"post-merge-without-merged-evidence": 40}}))
        self.assertIn("40 started JOV issues", loud["started-without-owner"])

    def test_team_templated_receipts_use_the_newest_team_file_and_ignore_sidecars(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            state = home / ".local/state/jovie-lanes"
            (state / "refill").mkdir(parents=True)
            (state / "decompose").mkdir()
            now = time.time()
            (state / "refill" / "JOV.json").write_text("{}")
            (state / "refill" / "LYB.json").write_text("{}")
            old = state / "refill" / "LYB.json"
            os.utime(old, (now - 7200, now - 7200))
            (state / "refill" / "JOV-rank.json").write_text("{}")  # sidecar, not a team receipt
            stale_only = state / "decompose" / "LYB.json"
            stale_only.write_text("{}")
            os.utime(stale_only, (now - 7200, now - 7200))
            (state / "decompose" / "seen.json").write_text("{}")  # lowercase: not a team
            fresh_sidecar = state / "decompose" / "spawn-LYB.json"
            fresh_sidecar.write_text("{}")
            row = lambda name, minutes: {"id": f"gem:{name}", "status": "live", "host": "gem", "maxStalenessMinutes": minutes,
                                         "receipt": {"kind": "host-local",
                                                     "location": f"gem:~/.local/state/jovie-lanes/{name}/<TEAM>.json"}}
            watch = doctor.automation_watch([row("refill", 15), row("decompose", 60)], "gem", now, home=home)
            self.assertNotIn("gem:refill", watch["silent"], "JOV.json is fresh")
            self.assertEqual(watch["silent"]["gem:decompose"]["ageS"] // 60, 120, "only a stale team receipt counts")
            (state / "refill" / "JOV.json").unlink()
            os.utime(state / "refill" / "JOV-rank.json", (now, now))
            gone = doctor.automation_watch([row("refill", 15)], "gem", now, home=home)
            self.assertIn("gem:refill", gone["silent"], "a sidecar cannot vouch for a team receipt")
            for path in (state / "refill").iterdir():
                path.unlink()
            missing = doctor.automation_watch([row("refill", 15)], "gem", now, home=home)
            self.assertIsNone(missing["silent"]["gem:refill"]["ageS"])

    def test_registered_host_local_automations_raise_automation_silent(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            state = home / ".local/state/jovie-lanes"
            state.mkdir(parents=True)
            (state / "fresh.json").write_text("{}")
            stale = state / "stale.json"
            stale.write_text("{}")
            now = time.time()
            os.utime(stale, (now - 3600, now - 3600))
            rows = [{"schema": "jovie-automation-registry/v1"},
                    {"id": "gem:fresh", "status": "live", "host": "gem", "maxStalenessMinutes": 15,
                     "receipt": {"kind": "host-local", "location": "gem:~/.local/state/jovie-lanes/fresh.json"}},
                    {"id": "gem:stale", "status": "live", "host": "gem", "maxStalenessMinutes": 30,
                     "receipt": {"kind": "host-local", "location": "gem:~/.local/state/jovie-lanes/stale.json"}},
                    {"id": "gem:missing", "status": "live", "host": "gem", "maxStalenessMinutes": 10,
                     "receipt": {"kind": "host-local", "location": "gem:~/.local/state/jovie-lanes/watchdog.log"}},
                    {"id": "gem:retired", "status": "retired", "host": "gem",
                     "receipt": {"kind": "host-local", "location": "gem:~/nowhere"}},
                    {"id": "mac:x", "status": "live", "host": "tims-macbook-pro", "maxStalenessMinutes": 1,
                     "receipt": {"kind": "host-local", "location": "tims-macbook-pro:~/nowhere"}}]
            watch = doctor.automation_watch([row for row in rows if row.get("id")], "gem", now, home=home)
            self.assertEqual(sorted(watch["silent"]), ["gem:missing", "gem:stale"])
            alerts = doctor.judge(obs(automation=watch, now=now))
            self.assertIn("60 min old", alerts["automation-silent:gem:stale"])
            self.assertIn("missing", alerts["automation-silent:gem:missing"])
            self.assertEqual(doctor.automation_watch(None, "gem", now), {"known": False, "silent": {}})
            self.assertIn("automation-registry-unreadable",
                          doctor.judge(obs(automation={"known": False, "silent": {}}, now=now)))
            self.assertNotIn("automation-registry-unreadable",
                             doctor.judge(obs(automation={"known": False, "silent": {}, "skipped": True}, now=now)))
            self.assertNotIn("automation-registry-unreadable", doctor.judge(obs(now=now)))

    def test_outcome_lane_stall_is_alerted_only_when_owed_receipts_age_out(self):
        now = 1_800_000_000.0
        old = doctor.epoch_iso(now - 30 * 3600)
        fresh = doctor.epoch_iso(now - 3600)
        capped = {"queued": 7, "status": "budget-exhausted", "at": now - 600, "oldestOwedAt": old,
                  "spentToday": 30, "perDay": 30}
        alert = doctor.judge(obs(outcomeQueue=capped, now=now))["outcome-lane-stalled"]
        self.assertIn("7 Validating", alert)
        self.assertIn("30/30", alert)
        silent = {**capped, "status": "drained", "at": now - 3 * 3600}
        self.assertIn("outcome-lane-stalled", doctor.judge(obs(outcomeQueue=silent, now=now)))
        self.assertNotIn("outcome-lane-stalled", doctor.judge(obs(outcomeQueue={**capped, "oldestOwedAt": fresh}, now=now)))
        self.assertNotIn("outcome-lane-stalled", doctor.judge(obs(outcomeQueue={**capped, "status": "drained"}, now=now)))
        self.assertNotIn("outcome-lane-stalled", doctor.judge(obs(outcomeQueue={**capped, "queued": 0}, now=now)))
        self.assertNotIn("outcome-lane-stalled", doctor.judge(obs(now=now)))

    def test_outcome_queue_status_feeds_the_doctor_alert(self):
        import outcome_lane
        with tempfile.TemporaryDirectory() as raw:
            state = Path(raw)
            queue = [({"identifier": "JOV-1"}, {"at": "2026-10-23T00:00:00Z"}),
                     ({"identifier": "JOV-2"}, {"at": "2026-10-22T00:00:00Z"})]
            outcome_lane.write_queue(state, "budget-exhausted", queue, 1_792_800_000.0, 30)
            row = json.loads((state / "outcome-queue.json").read_text())
            self.assertEqual((row["queued"], row["oldestOwedAt"], row["status"]),
                             (2, "2026-10-22T00:00:00Z", "budget-exhausted"))
            alerts = doctor.judge(obs(outcomeQueue=row, now=1_792_800_000.0 + 60))
            self.assertIn("outcome-lane-stalled", alerts)

    def test_the_watched_registry_is_the_one_merged_on_main(self):
        # The doctor must read the path the registry actually ships at (#22354: canon/).
        repo = Path(__file__).resolve().parents[2]
        if not (repo / "canon").is_dir():
            self.skipTest("staged lanes release trees carry no canon/")
        self.assertTrue((repo / doctor.AUTOMATION_REGISTRY).is_file(), doctor.AUTOMATION_REGISTRY)
        rows = doctor.automation_registry(repo, run=lambda *_a, **_k: doctor.subprocess.CompletedProcess(
            [], 0, (repo / doctor.AUTOMATION_REGISTRY).read_text(), ""))
        self.assertTrue(rows and any(row["id"] == "gem:lanes-watchdog" for row in rows))

    def test_harness_exceptions_alert_72h_before_expiry_and_after(self):
        # 2026-11-01: six JOV-INV-024 exceptions expired with no issue filed and blocked every PR.
        row = {"principle": "H-02", "id": "H-EX-02", "owner": "Summer", "expires": "2026-11-07",
               "nextAction": "record promotion receipts", "linearIssue": "JOV-10203"}
        day = lambda d, h=0: doctor.datetime(2026, 11, d, h, tzinfo=doctor.timezone.utc).timestamp()
        self.assertNotIn("harness-exception-expiring:H-EX-02",
                         doctor.judge(obs(harnessExceptions=[row], now=day(4, 23))))
        near = doctor.judge(obs(harnessExceptions=[row], now=day(5, 1)))["harness-exception-expiring:H-EX-02"]
        self.assertIn("71h left", near)
        self.assertIn("owner Summer", near)
        self.assertIn("JOV-10203", near)
        past = doctor.judge(obs(harnessExceptions=[row], now=day(8, 1)))["harness-exception-expiring:H-EX-02"]
        self.assertIn("expired on 2026-11-07", past)
        self.assertEqual(doctor.harness_exception_alerts(None, day(8)), {})
        self.assertEqual(doctor.harness_exception_alerts([{**row, "expires": "soon"}], day(8)), {})

    def test_harness_exceptions_read_the_registry_merged_on_main(self):
        repo = Path(__file__).resolve().parents[2]
        if not (repo / "canon").is_dir():
            self.skipTest("staged lanes release trees carry no canon/")
        text = (repo / doctor.INVARIANT_REGISTRY).read_text()
        rows = doctor.harness_exceptions(repo, run=lambda *_a, **_k: doctor.subprocess.CompletedProcess(
            [], 0, text, ""))
        self.assertTrue(rows and all(row["id"].startswith("H-EX-") and row["expires"] for row in rows))
        self.assertIsNone(doctor.harness_exceptions(repo, run=lambda *_a, **_k: doctor.subprocess.CompletedProcess(
            [], 128, "", "fatal")))

    def test_the_hosted_liveness_check_and_the_doctor_watch_each_other(self):
        now = doctor.datetime(2026, 10, 20, 22, 0, tzinfo=doctor.timezone.utc).timestamp()
        recent = {"installed": True, "lastRunAt": "2026-10-20T21:30:00Z"}
        old = {"installed": True, "lastRunAt": "2026-10-20T20:30:00Z"}
        self.assertNotIn("automation-liveness-silent", doctor.judge(obs(automationLiveness=recent, now=now)))
        self.assertIn("90 min ago", doctor.judge(obs(automationLiveness=old, now=now))["automation-liveness-silent"])
        self.assertIn("never", doctor.judge(obs(automationLiveness={"installed": True, "lastRunAt": None},
                                                now=now))["automation-liveness-silent"])
        for unknown in ({"installed": False}, {"installed": None}):  # not merged yet, or unreadable
            self.assertNotIn("automation-liveness-silent", doctor.judge(obs(automationLiveness=unknown, now=now)))

    def test_liveness_read_distinguishes_missing_workflow_from_unreadable(self):
        def fake(code, stdout="", stderr=""):
            return types.SimpleNamespace(REPO_SLUG="JovieInc/Jovie", shared=lambda key, ttl, fetch: fetch(),
                                         sh=lambda *a, **k: types.SimpleNamespace(returncode=code, stdout=stdout, stderr=stderr))
        self.assertEqual(doctor.automation_liveness(fake(0, '["2026-10-20T21:30:00Z"]'), 0),
                         {"installed": True, "lastRunAt": "2026-10-20T21:30:00Z"})
        self.assertEqual(doctor.automation_liveness(fake(1, stderr="gh: Not Found (HTTP 404)"), 0), {"installed": False})
        self.assertEqual(doctor.automation_liveness(fake(1, stderr="timeout"), 0), {"installed": None})

    def test_liveness_counts_only_successful_main_runs(self):
        # Most runs are job-skipped (every 5th Production Continuity Guard run does work).
        calls = []
        lane = types.SimpleNamespace(REPO_SLUG="JovieInc/Jovie", shared=lambda key, ttl, fetch: fetch(),
                                     sh=lambda args, **k: calls.append(args) or types.SimpleNamespace(
                                         returncode=0, stdout='[""]', stderr=""))
        self.assertEqual(doctor.automation_liveness(lane, 0), {"installed": True, "lastRunAt": None})
        self.assertIn("status=success", calls[0][2])
        self.assertIn("branch=main", calls[0][2])
        # Installed but never succeeded reads as silent, not alive.
        now = doctor.datetime(2026, 10, 20, 22, 0, tzinfo=doctor.timezone.utc).timestamp()
        self.assertIn("automation-liveness-silent", doctor.judge(obs(
            automationLiveness={"installed": True, "lastRunAt": None}, now=now)))

    def test_a_failed_status_gist_publish_raises_status_feed_stale(self):
        failed = doctor.judge(obs(), {"statusFeedError": "RuntimeError: status-gist-publish-unconfirmed"})
        self.assertIn("status-gist-publish-unconfirmed", failed["status-feed-stale"])
        self.assertNotIn("status-feed-stale", doctor.judge(obs(), {"statusFeed": "https://gist.github.com/x"}))
        self.assertNotIn("status-feed-stale", doctor.judge(obs(), None))

    def test_linear_and_codex_failures_are_their_own_alerts(self):
        self.assertIn("linear-down", doctor.judge(obs(linearError="HTTPError: 429", pool=None)))
        self.assertIn("codex-broken", doctor.judge(obs(codex={"error": "no codex", "accounts": {}, "available": []})))
        self.assertNotIn("hud-stale", doctor.judge(obs(hudExpected=False, hudBeatAge=None)))

    def test_github_read_floor_is_one_global_alert_not_one_per_provider(self):
        unavailable = {name: {"reason": "pr-inventory-unavailable", "error": "pr-read-failed"}
                       for name in ("codex", "devin", "hyperagent")}
        alerts = doctor.judge(obs(githubRemaining=doctor.GITHUB_MIN_REMAINING - 1,
                                  newIssueBudgetByProvider=unavailable))
        self.assertEqual(set(alerts), {"github-quota"})
        self.assertIn(f"{doctor.GITHUB_MIN_REMAINING}-point floor", alerts["github-quota"])

        # A failed read at or above the guard floor still needs provider-specific repair.
        alerts = doctor.judge(obs(githubRemaining=doctor.GITHUB_MIN_REMAINING,
                                  newIssueBudgetByProvider={"hyperagent": unavailable["hyperagent"]}))
        self.assertIn("pr-inventory-unavailable:hyperagent", alerts)
        self.assertNotIn("github-quota", alerts)

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

    def open(self, key, text, condition=None):
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

    def test_a_five_minute_tick_still_counts_as_live_demand_evidence(self):
        for tick_age, known in ((330, True), (doctor.TICK_FRESH_S + 1, False)):
            observed = obs(now=1000.0, tickAge=tick_age, pool=20, poolByProvider={"devin": 20},
                           tick={"at": "x", "unhealthy": [], "error": None, "spawned": ["devin"],
                                 "disk": {"admitted": True}},
                           capacityByProvider={"devin": {"running": 1, "slots": 2, "base": 2}})
            runnable = doctor.delivery_evidence(observed, {})["admission"]["runnablePool"]
            self.assertEqual(runnable is not None, known, tick_age)

    def test_failed_devin_restarts_emit_one_bounded_summer_escalation_generation(self):
        observed = obs(now=1000.0, tickAge=3,
                       tick={"at": "x", "unhealthy": [], "error": None, "spawned": ["devin"] * 4},
                       poolByProvider={"devin": 20},
                       capacityByProvider={"devin": {"running": 3, "slots": 4}})
        previous = {"providerIdleSince": {"devin": 699.0}}
        alerts = doctor.judge(observed, previous)
        events = doctor.condition_receipts(alerts, previous, observed, "gem")
        tracker = FakeTracker()
        state = doctor.reconcile(alerts, previous, tracker, observed["now"], events)
        event = state["conditions"]["provider-idle:devin"]
        self.assertEqual(event["idempotencyKey"], "gem:provider-idle:devin:1")
        self.assertEqual(event["firstObservedAt"], doctor.epoch_iso(699.0))
        self.assertEqual(event["affectedResources"], ["devin"])
        self.assertEqual(event["severity"], "critical")
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
        observed["capacityByProvider"]["devin"]["running"] = 4
        cleared_alerts = doctor.judge(observed, state)
        self.assertNotIn("provider-idle:devin", cleared_alerts)
        cleared = doctor.condition_receipts(cleared_alerts, state, observed, "gem")
        state = doctor.reconcile(cleared_alerts, state, tracker, observed["now"], cleared)
        self.assertEqual(state["conditions"]["provider-idle:devin"]["terminalOutcome"], "health-proven")

        observed["now"] += 60
        observed["capacityByProvider"]["devin"]["running"] = 3
        refired = doctor.condition_receipts(alerts, state, observed, "gem")
        state = doctor.reconcile(alerts, state, tracker, observed["now"], refired)
        self.assertEqual(state["conditions"]["provider-idle:devin"]["generation"], 2)
        self.assertEqual(len(tracker.contradicted), 2)


class ReconcileTest(unittest.TestCase):
    def test_dirty_checkout_cannot_be_claimed_as_exact_source_proof(self):
        dirty = SimpleNamespace(returncode=0, stdout=" M scripts/lanes/doctor.py\n")
        with mock.patch.dict(os.environ, {}, clear=False), \
                mock.patch.object(doctor.subprocess, "run", return_value=dirty) as run:
            os.environ.pop("JOVIE_SOURCE_SHA", None)
            self.assertEqual(doctor._source_version(), "UNKNOWN")
        run.assert_called_once()

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

    def test_open_design_brief_alarm_resolves_after_the_retirement(self):
        for reason in ({"linearError": "pool read failed"}, {"linearSkipped": "cooldown"}, {}):
            with self.subTest(reason=reason):
                tracker = FakeTracker()
                observed = obs()
                alerts = {"design-brief-stale": "1 needs-design-brief issue(s) held past 24h (JOV-3)"}
                state = doctor.reconcile(alerts, {}, tracker, observed["now"],
                                         doctor.condition_receipts(alerts, {}, observed, "gem"))
                observed = obs(designGate=None, **reason)
                alerts = doctor.judge(observed, state)
                self.assertNotIn("design-brief-stale", alerts)
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

    def test_new_alert_uses_exact_reviewed_report_once_and_persists_receipt(self):
        created = []

        class FakeLinear:
            def gql(self, query, variables):
                if "title:{eq:$t}" in query:
                    return {"issues": {"nodes": []}}
                if "teams(filter" in query:
                    return {"teams": {"nodes": [{"id": "team", "states": {"nodes": [{
                        "id": "triage", "name": "Triage"}]}, "labels": {"nodes": [{
                            "id": "symphony", "name": "symphony"}]}}]}}
                if "issueCreate" in query:
                    created.append(variables["i"])
                    return {"issueCreate": {"issue": {"id": "iss-1", "identifier": "JOV-1"}}}
                raise AssertionError(query)

        reviewed = {
            "message": "Exact reviewed Symphony report.",
            "decision": "approved-template",
            "review": {"schema": "jovie.agent-ops-report-delivery-review/v1",
                       "reviewDigest": "digest"},
        }
        condition = {"schema": "jovie.control-plane-liveness-condition/v1",
                     "idempotencyKey": "gem:disk-low:1", "generation": 1,
                     "condition": "disk-low", "state": "active", "owner": "symphony-lanes-doctor",
                     "source": {"producer": "scripts/lanes/doctor.py", "observedAt": "2026-10-12T08:00:00Z"},
                     "nextAction": "wake-summer-via-linear-or-independent-status-feed"}
        tracker = doctor.Tracker(FakeLinear(), "gem")
        with (mock.patch.object(tracker, "_remediation_label_id", return_value=None),
              mock.patch.object(tracker, "contradict_invariant"),
              mock.patch.object(doctor, "verify_ops_report", side_effect=lambda prepared, *_: prepared) as verify,
              mock.patch.object(doctor, "prepare_ops_report", return_value=reviewed) as prepare):
            state = doctor.reconcile({"disk-low": "4% free"}, {}, tracker, 1_000_000.0,
                                     {"disk-low": condition})
            state = doctor.reconcile({"disk-low": "4% free"}, state, tracker, 1_000_060.0,
                                     {"disk-low": condition})
        self.assertEqual(created[0]["description"], reviewed["message"])
        self.assertEqual(len(created), 1)
        prepare.assert_called_once()
        verify.assert_called_once_with(reviewed, "disk-low", "4% free", condition, "gem", tracker.title("disk-low"))
        self.assertEqual(state["conditions"]["disk-low"]["writingReview"], reviewed["review"])
        self.assertEqual(state["conditions"]["disk-low"]["writingDecision"], "approved-template")

    def test_an_incident_opens_even_when_the_label_cannot_be_created_or_found(self):
        issues, forbidden = [], []

        class ForbiddenLabels:
            def gql(self, query, variables):
                if "title:{eq:$t}" in query:
                    return {"issues": {"nodes": []}}
                if "teams(filter" in query:
                    return {"teams": {"nodes": [{"id": "team", "states": {"nodes": [{"id": "triage", "name": "Triage"}]},
                                                  "labels": {"nodes": [{"id": "symphony", "name": "symphony"}]}}]}}
                if "issueLabels(" in query:
                    return {"issueLabels": {"nodes": []}}
                if "issueLabelCreate" in query:
                    forbidden.append(variables)
                    raise RuntimeError("linear: request rejected (403 FORBIDDEN)")
                if "issueCreate" in query:
                    issues.append(variables["i"])
                    return {"issueCreate": {"issue": {"id": "iss-9", "identifier": "JOV-9"}}}
                raise AssertionError(query)

        self.assertEqual(doctor.Tracker(ForbiddenLabels(), "gem").open("production-deploy:lyb", "LYB deploys failing"), "iss-9")
        self.assertEqual(len(forbidden), 1)
        self.assertEqual(issues[0]["labelIds"], ["symphony"], "the incident keeps its symphony label and loses only the remediation one")

    def test_a_failed_open_is_never_silent_and_keeps_when_it_started(self):
        # 2026-10-25: production-deploy:lyb sat for ~50 min with no issue; Tracker.open swallowed the error.
        class Down:
            def gql(self, query, variables):
                if "title:{eq:$t}" in query:
                    return {"issues": {"nodes": []}}
                if "teams(filter" in query:
                    return {"teams": {"nodes": [{"id": "t", "states": {"nodes": [{"id": "tr", "name": "Triage"}]},
                                                  "labels": {"nodes": []}}]}}
                if "issueLabels(" in query or "issueLabelCreate" in query:
                    return {"issueLabels": {"nodes": []}}
                raise RuntimeError("linear: 500")

        tracker = doctor.Tracker(Down(), "gem")
        self.assertIsNone(tracker.open("production-deploy:lyb", "x"))
        self.assertTrue(tracker.last_error.startswith("create-failed:RuntimeError"))
        first = doctor.reconcile({"production-deploy:lyb": "x"}, {}, tracker, 1000.0)
        entry = first["issues"]["production-deploy:lyb"]
        self.assertEqual((entry["id"], entry["since"]), (None, 1000.0))
        self.assertIn("create-failed", entry["reason"])
        second = doctor.reconcile({"production-deploy:lyb": "x"}, first, tracker, 1300.0)
        self.assertEqual(second["issues"]["production-deploy:lyb"]["since"], 1000.0, "since survives retries")

    def test_invariant_flags_only_alerts_without_an_issue_older_than_fifteen_minutes(self):
        issues = {"a": {"id": "i1", "closedAt": None},
                  "b": {"id": None, "closedAt": None, "reason": "create-failed:RuntimeError: 500", "since": 1000.0},
                  "c": {"id": None, "closedAt": None, "since": 1000.0},
                  "d": {"id": None, "closedAt": None, "reason": "r", "since": 1500.0}}
        alerts = {"a": "", "b": "", "c": "", "d": "", "e": ""}
        gaps = doctor.alert_issue_gaps(alerts, issues, 1000.0 + doctor.ALERT_ISSUE_GRACE_S + 1)
        self.assertEqual(gaps, {"b": "create-failed:RuntimeError: 500", "c": "untracked"})
        self.assertEqual(doctor.alert_issue_gaps(alerts, issues, 1000.0 + doctor.ALERT_ISSUE_GRACE_S - 1), {})
        previous = {"issues": issues}
        with mock.patch("time.time", return_value=1000.0 + doctor.ALERT_ISSUE_GRACE_S + 1):
            raised = doctor.judge(obs(tick={"error": "boom"}), previous)
        self.assertNotIn("alert-issue-missing", raised, "only alerts present this tick count")

    def test_judge_raises_alert_issue_missing_for_a_standing_alert_without_an_issue(self):
        previous = {"issues": {"tick-error": {"id": None, "closedAt": None, "reason": "create-failed:RuntimeError: 500", "since": 100.0}}}
        with mock.patch("time.time", return_value=100.0 + doctor.ALERT_ISSUE_GRACE_S + 5):
            alerts = doctor.judge(obs(tick={"error": "boom"}), previous)
        self.assertIn("tick-error", alerts)
        self.assertIn("tick-error (create-failed:RuntimeError: 500)", alerts["alert-issue-missing"])

    def test_an_existing_label_beyond_the_first_fifty_is_found_by_name_and_not_recreated(self):
        created, issues = [], []

        class ManyLabels:
            def gql(self, query, variables):
                if "title:{eq:$t}" in query:
                    return {"issues": {"nodes": []}}
                if "teams(filter" in query:
                    return {"teams": {"nodes": [{"id": "team", "states": {"nodes": [{"id": "triage", "name": "Triage"}]},
                                                  "labels": {"nodes": []}}]}}
                if "issueLabels(" in query:
                    return {"issueLabels": {"nodes": [{"id": "old-label", "name": variables["n"]}]}}
                if "issueLabelCreate" in query:
                    created.append(variables)
                    return {}
                if "issueCreate" in query:
                    issues.append(variables["i"])
                    return {"issueCreate": {"issue": {"id": "iss-8", "identifier": "JOV-8"}}}
                raise AssertionError(query)

        self.assertEqual(doctor.Tracker(ManyLabels(), "gem").open("production-deploy:lyb", "x"), "iss-8")
        self.assertEqual((created, issues[0]["labelIds"]), ([], ["old-label"]))

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


class OpsReportDeliveryTest(unittest.TestCase):
    def setUp(self):
        self.condition = {
            "condition": "disk-low", "state": "active", "owner": "symphony-lanes-doctor",
            "source": {"producer": "scripts/lanes/doctor.py", "observedAt": doctor.now_iso()},
            "nextAction": "inspect disk usage", "generation": 1,
        }
        self.target = "Symphony doctor: disk-low (test-host)"
        self.source = mock.patch.object(doctor, "_source_version", return_value="UNKNOWN")
        self.source.start()
        self.addCleanup(self.source.stop)

    def prepare(self):
        prepared = doctor.prepare_ops_report("disk-low", "4% free", self.condition, "test-host", self.target)
        self.assertEqual(prepared["review"]["reviewStatus"], "missing-source-receipt")
        return prepared

    def verify(self, prepared, condition=None, target=None):
        return doctor.verify_ops_report(prepared, "disk-low", "4% free", condition or self.condition,
                                        "test-host", target or self.target)

    def test_real_cli_checks_exact_delivery_without_model_calls(self):
        prepared = self.prepare()
        self.assertIs(self.verify(prepared), prepared)
        for field, value in (("message", "edited after review"), ("audience", "changed audience"),
                             ("destination", {"adapter": "linear-issue", "target": "other"})):
            with self.subTest(field=field):
                result = self.verify({**prepared, field: value})
                self.assertEqual(result["review"]["reviewStatus"], "emergency-reviewer-unavailable")
                self.assertNotIn("edited after review", result["message"])
        stale = {**self.condition, "source": {**self.condition["source"], "observedAt": "2000-01-01T00:00:00Z"}}
        for condition, target in ((stale, None), (None, "changed issue")):
            result = self.verify(prepared, condition, target)
            self.assertEqual(result["review"]["reviewStatus"], "emergency-reviewer-unavailable")
        self.assertNotIn("4% free", json.dumps(prepared["review"]))

    def test_reviewer_outage_keeps_preapproved_emergency_notice_available(self):
        with mock.patch.object(doctor.subprocess, "run", side_effect=subprocess.TimeoutExpired("node", 20)) as run:
            prepared = doctor.prepare_ops_report("disk-low", "4% free", self.condition, "test-host", self.target)
            result = self.verify({**prepared, "message": "edited emergency notice"})
        run.assert_called_once()
        self.assertEqual(result["review"]["reviewStatus"], "emergency-reviewer-unavailable")
        self.assertIn("Root cause: UNKNOWN", result["message"])
        self.assertNotIn("edited emergency notice", result["message"])

    def test_linear_adapter_rechecks_after_prepare_and_preserves_duplicate_lookup(self):
        created = []

        class FakeLinear:
            def gql(self, query, variables):
                if "title:{eq:$t}" in query:
                    return {"issues": {"nodes": [{"id": "iss-1"}] if created else []}}
                if "teams(filter" in query:
                    return {"teams": {"nodes": [{"id": "team", "states": {"nodes": [
                        {"id": "triage", "name": "Triage"}]}, "labels": {"nodes": []}}]}}
                if "issueCreate" in query:
                    created.append(variables["i"])
                    return {"issueCreate": {"issue": {"id": "iss-1"}}}
                raise AssertionError(query)

        tracker = doctor.Tracker(FakeLinear(), "test-host")
        tampered = {**self.prepare(), "message": "edited after review"}
        with (mock.patch.object(tracker, "_remediation_label_id", return_value=None),
              mock.patch.object(doctor, "prepare_ops_report", return_value=tampered) as prepare):
            for _ in range(2):
                self.assertEqual(tracker.open("disk-low", "4% free", self.condition), "iss-1")
        prepare.assert_called_once()
        self.assertEqual(len(created), 1)
        self.assertIn("Symphony emergency notice", created[0]["description"])
        self.assertNotIn("edited after review", created[0]["description"])


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
    def test_feed_publishes_per_project_attribution_and_missing_receipt_links(self):
        merged = {"number": 7, "title": "change", "url": "https://github.com/JovieInc/Jovie/pull/7",
                  "headRefName": "feature/work", "headRefOid": "a" * 40,
                  "mergeCommit": {"oid": "b" * 40}, "baseRefName": "main",
                  "createdAt": "2026-10-07T10:00:00Z", "updatedAt": "2026-10-07T12:00:01Z",
                  "mergedAt": "2026-10-07T12:00:00Z", "author": {"login": "itstimwhite"},
                  "mergedBy": {"login": "merge-queue[bot]"}}
        complete = lambda rows: {"complete": True, "reason": None,
                                 "window": {"since": 900_000.0, "until": 1_000_000.0}, "prs": rows}
        observed = obs(_mergeEvidenceByRepository={"JovieInc/Jovie": complete([merged]),
                                                    "JovieInc/LogYourBody": complete([])},
                       _ledgerEvidence={"complete": True, "reason": None, "corruptRows": 0,
                                        "observedAt": None, "rows": []})
        host = SimpleNamespace(state=Path("/tmp"))
        lane = SimpleNamespace(HOST="gem", provider_throughput=throughput_stub)
        report = doctor.status_feed(host, lane, observed, {}, {})["shippingAttribution"]
        jovie = next(row for row in report["projects"] if row["channel"] == "Jovie")
        lyb = next(row for row in report["projects"] if row["channel"] == "LogYourBody")
        self.assertEqual(jovie["coverage"], {"numerator": 0, "denominator": 1, "percent": 0.0})
        self.assertEqual(jovie["byShippingMethod"], {"founder-operated-unknown-provider": 1})
        self.assertEqual(jovie["missingOriginReceiptPullRequests"], [merged["url"]])
        self.assertEqual(lyb["mergeCount"], 0)

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
            # Restore, never unconditionally pop: inside a release self-test the marker was
            # already set by selftest_env, popping it here leaves every later module
            # in the same process un-hermetic (their LANES_SELFTEST guards then open —
            # e.g. dispatch ran macos_pool's GitHub probe and broke test_autoscale).
            previous_selftest = os.environ.get("LANES_SELFTEST")
            os.environ["LANES_SELFTEST"] = "1"  # no open-PR read from a unit test
            try:
                observed = doctor.observe(host, lane, codex)
            finally:
                if previous_selftest is None:
                    os.environ.pop("LANES_SELFTEST", None)
                else:
                    os.environ["LANES_SELFTEST"] = previous_selftest
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
                    {"endedAt": doctor.epoch_iso(now - 40), "kind": "fix-red", "verdict": "recovery-handoff",
                     "reasons": ["preserved-head-superseded"]},
                    {"endedAt": doctor.epoch_iso(now - 50), "kind": "fix-red", "verdict": "skipped",
                     "reasons": ["worktree-unavailable:fatal: already used by worktree"]},
                    {"endedAt": doctor.epoch_iso(now - 55), "kind": "fix-red", "verdict": "fix-no-change"},
                    {"endedAt": doctor.epoch_iso(now - 90000), "verdict": "landing", "gateWaitS": 9999}]
            (state / "runs" / "ledger.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
            host = type("Host", (), {"state": state, "linear_env": state / "missing.env"})()
            lane = type("Lane", (), {"Linear": staticmethod(lambda env: (_ for _ in ()).throw(OSError("x"))),
                                     "load_providers": staticmethod(lambda: {}),
                                     "load_github_env": staticmethod(lambda: None), "graphql_budget": staticmethod(lambda: None),
                                     "provider_throughput": staticmethod(throughput_stub), "HOST": "gem"})
            codex = type("Codex", (), {"status": staticmethod(lambda: {})})
            previous_selftest = os.environ.get("LANES_SELFTEST")
            os.environ["LANES_SELFTEST"] = "1"  # no open-PR read from a unit test
            try:
                observed = doctor.observe(host, lane, codex, now=now)
                feed = doctor.status_feed(host, lane, observed, {}, {})
            finally:
                if previous_selftest is None:
                    os.environ.pop("LANES_SELFTEST", None)
                else:
                    os.environ["LANES_SELFTEST"] = previous_selftest
        self.assertEqual(observed["gateWaits24h"], 2)
        self.assertEqual(observed["noWorkRepairs24h"], {"preserved-head-superseded": 1, "worktree-unavailable": 1})
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

    def test_feed_names_expected_quota_block_instead_of_unhealthy_capacity(self):
        host = type("Host", (), {"state": Path("/tmp")})()
        lane = type("Lane", (), {"HOST": "gem", "provider_throughput": staticmethod(throughput_stub)})
        observed = obs(poolByProvider={"claude": 5},
                       capacityByProvider={"claude": {"running": 0, "slots": 2}})
        feed = doctor.status_feed(host, lane, observed, {},
                                  {"quotaBlocked": {"claude": "banked:usage-limit"}})
        self.assertEqual(feed["throughput"]["providers"]["claude"]["idleReason"],
                         "quota-blocked:banked:usage-limit")

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
        candidates = [issue("JOV-GOOD"), issue("JOV-EPIC", ["hold"]),
                      issue("JOV-SENSITIVE", ["auth"]), issue("JOV-PRICE", description="Change live pricing"),
                      issue("JOV-OWNED"), issue("JOV-EXHAUSTED")]
        providers = {"devin": {"label": "devin", "slots": 4},
                     "codex": {"label": "codex", "slots": 3},
                     "claude": {"label": "claude", "slots": 2, "enabled": False}}
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            host = lane.Host(state=state, linear_env=state / "test.env")
            (state / "failures.json").write_text(json.dumps({
                "JOV-EXHAUSTED": 3}))
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
                    mock.patch.object(lane, "open_hotspot_holds", return_value={}), \
                    mock.patch.object(lane, "held_back_issues", return_value=frozenset()), \
                    mock.patch.object(lane, "overlap_inventory", return_value=([], [])), \
                    mock.patch.object(lane, "load_github_env"), \
                    mock.patch.object(lane, "read_new_issue_budget", side_effect=lambda name, slots: lane.new_issue_budget(name, slots, [])), \
                    mock.patch.object(lane, "graphql_budget", return_value=None):
                observed = doctor.observe(host, lane, SimpleNamespace(status=lambda: {}), now=10000)
                self.assertEqual(observed["pool"], 2)
                self.assertEqual(observed["candidatePool"], 6)
                self.assertEqual(observed["qualifiedJobsByProvider"], {
                    "devin": ["JOV-GOOD"], "codex": ["JOV-GOOD", "JOV-SENSITIVE"], "claude": []})
                self.assertEqual(observed["poolByProvider"], {"devin": 1, "codex": 2, "claude": 0})
                self.assertEqual(observed["candidatePoolByProvider"], {"devin": 6, "codex": 6, "claude": 0})
                reasons = {"excluded-label:hold": 1, "sensitive-text": 1,
                           "in-flight-pr": 1, "retry-exhausted": 1}
                self.assertEqual(observed["rejectedByProvider"], {
                    "devin": {**reasons, "sensitive-provider": 1}, "codex": reasons, "claude": {}})
                # Per-issue rejection view (JOV-8000 follow-up 39): bounded
                # {issueId: reason} so route-held / over-budget is visible
                # without host access; every rejected candidate is named.
                rejected_issues = observed["rejectedIssues"]
                self.assertEqual(rejected_issues.get("JOV-EPIC"), "excluded-label:hold")
                self.assertEqual(rejected_issues.get("JOV-PRICE"), "sensitive-text")
                self.assertEqual(rejected_issues.get("JOV-OWNED"), "in-flight-pr")
                self.assertEqual(rejected_issues.get("JOV-EXHAUSTED"), "retry-exhausted")
                self.assertNotIn("JOV-GOOD", rejected_issues)
                self.assertLessEqual(len(rejected_issues), 20)
                feed = doctor.status_feed(host, lane, observed, {}, {})
                self.assertEqual(feed["admission"]["rejectedByProvider"], observed["rejectedByProvider"])
                self.assertEqual(feed["admission"]["poolByProvider"], observed["poolByProvider"])
                self.assertEqual(tracker.lane_issues.call_args_list, [mock.call("devin"), mock.call("codex")])
                # Reproduce the reported eight nominal candidates, none runnable.
                tracker.lane_issues.return_value = [issue(f"JOV-EPIC-{n}", ["hold"]) for n in range(5)] + [
                    issue(f"JOV-PRICE-{n}", description="Change live pricing") for n in range(3)]
                blocked = doctor.observe(host, lane, SimpleNamespace(status=lambda: {}), now=10000)
                self.assertEqual(blocked["candidatePool"], 8)
                self.assertEqual(blocked["pool"], 0)
                self.assertEqual(blocked["rejectedByProvider"]["devin"], {
                    "excluded-label:hold": 5, "sensitive-text": 3})
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

    def test_free_login_slots_count_as_unleased_capacity(self):
        # One current login with three run slots, one busy: two runs of capacity remain.
        report = self.report(**{"current-login": {"available": True, "leased": False, "freeSlots": 2}})
        self.assertEqual(doctor.codex_attribution(report, self.NOW)["unleasedAvailable"], 2)
        report = self.report(**{"current-login": {"available": False, "leased": False, "freeSlots": 2,
                                                   "exhaustedUntil": doctor.epoch_iso(self.NOW + 60), "lastKind": "limit"}})
        self.assertEqual(doctor.codex_attribution(report, self.NOW)["unleasedAvailable"], 0, "a banked login has no capacity")

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
                    mock.patch.object(lane, "open_hotspot_holds", return_value={}), \
                    mock.patch.object(lane, "held_back_issues", return_value=frozenset()), \
                    mock.patch.object(lane, "overlap_inventory", return_value=([], [])), \
                    mock.patch.object(lane, "graphql_budget", return_value=None), \
                    mock.patch.object(lane, "read_new_issue_budget", side_effect=lambda name, slots: lane.new_issue_budget(name, slots, inventory)):
                observed = doctor.observe(host, lane, SimpleNamespace(status=lambda: {}), now=10000)
                self.assertEqual(observed["eligiblePool"], 1)
                self.assertEqual(observed["eligiblePoolByProvider"], {"devin": 1, "codex": 1})
                # Six open codex PRs never shrink codex's pool (no PR ceiling, Tim 2026-10-12).
                self.assertEqual(observed["poolByProvider"], {"devin": 1, "codex": 1})
                self.assertEqual(observed["pool"], 1, "provider union must not sum duplicate issues")
                self.assertEqual(observed["newIssueBudgetByProvider"]["codex"], lane.new_issue_budget("codex", 3, inventory))
                with mock.patch.object(lane, "read_new_issue_budget", side_effect=lambda name, slots: lane.new_issue_budget(name, slots, None if name == "codex" else [])):
                    unknown = doctor.observe(host, lane, SimpleNamespace(status=lambda: {}), now=10000)
                self.assertEqual((unknown["eligiblePool"], unknown["pool"]), (1, 1), "an uncounted inventory is not unknown demand")
                self.assertIsNone(unknown["linearError"])

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



class _GistApiFake:
    """A stored gist with independent write and GET responses; never calls GitHub."""

    def __init__(self, gist_id="abc123"):
        self.gist_id = gist_id
        self.files = {}
        self.calls = []
        self.write_count = 0
        self.fail_write = False
        self.ambiguous_create = False
        self.readback_mode = None
        self.after_write = lambda: None

    def __call__(self, args, **kwargs):
        self.calls.append((list(args), kwargs.get("timeout")))
        if args[1] == "gist":  # The pre-fix transport is a valid deliberate-red control.
            self.write_count += 1
            self.files["lanes-status.json"] = Path(args[-1]).read_text()
            self.after_write()
            return SimpleNamespace(returncode=1 if self.fail_write else 0,
                                   stdout="" if self.ambiguous_create or args[2] == "edit"
                                   else f"https://gist.example/{self.gist_id}", stderr="")
        method = args[args.index("--method") + 1]
        if method != "GET":
            self.write_count += 1
            packet = json.loads(Path(args[args.index("--input") + 1]).read_text())
            if self.fail_write:
                return SimpleNamespace(returncode=1, stdout="", stderr="synthetic write failure")
            self.files.update({name: row["content"] for name, row in packet["files"].items()})
            self.after_write()
            if method == "POST" and self.ambiguous_create:
                return SimpleNamespace(returncode=0, stdout="", stderr="")
        files = {name: {"content": content, "truncated": False, "size": len(content.encode("utf-8"))}
                 for name, content in self.files.items()}
        if method == "GET" and self.readback_mode == "stage-truncated":
            files["stage-events.ndjson"].update(content=files["stage-events.ndjson"]["content"][:10], truncated=True)
        if method == "GET" and self.readback_mode == "stage-short":
            files["stage-events.ndjson"].update(content="", truncated=True, size=5)
        if method == "GET" and self.readback_mode == "changed":
            files["lanes-status-details.json"]["content"] += "\n"
        if method == "GET" and self.readback_mode == "truncated":
            files["lanes-status-details.json"]["truncated"] = True
        return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({
            "id": self.gist_id, "html_url": f"https://gist.example/{self.gist_id}", "files": files,
        }))


class PublishTest(unittest.TestCase):
    def raw_readback_fixture(self, names=("lanes-status.json", "lanes-status-details.json")):
        """Synthetic immutable Gist snapshots and bounded curl transfers, with no network."""
        fixture = SimpleNamespace(gets=0, raw_calls=[], revision="d" * 40, mutation=None,
                                  response=lambda name, content: content, code="200", exit_code=0,
                                  raw_error=None, url=lambda name, url: url, size=lambda size: size,
                                  curl_version="curl 8.4.0 synthetic", version_exit=0)
        def run(args, **kwargs):
            if args[0] == "curl":
                if "--version" in args:
                    return SimpleNamespace(returncode=fixture.version_exit, stdout=fixture.curl_version)
                url = args[args.index("--url") + 1]
                name = url.rsplit("/", 1)[1]
                fixture.raw_calls.append((list(args), kwargs))
                if fixture.raw_error:
                    raise fixture.raw_error
                content = self.api.files[name].encode("utf-8")
                Path(args[args.index("--output") + 1]).write_bytes(fixture.response(name, content))
                if fixture.mutation:
                    fixture.mutation()
                return SimpleNamespace(returncode=fixture.exit_code, stdout=fixture.code)
            result = self.api(args, **kwargs)
            if "--method" in args and args[args.index("--method") + 1] == "GET":
                fixture.gets += 1
                stored = json.loads(result.stdout)
                stored.update(owner={"login": "fixture-owner"}, history=[{"version": fixture.revision}])
                for name in names:
                    row = stored["files"][name]
                    raw = f"https://gist.githubusercontent.com/fixture-owner/abc123/raw/{fixture.revision}/{name}"
                    row.update(content=row["content"][:7], truncated=True,
                               raw_url=fixture.url(name, raw), size=fixture.size(row["size"]))
                result.stdout = json.dumps(stored)
            return result
        patch = mock.patch.object(doctor.lifecycle, "run", run)
        patch.start()
        self.addCleanup(patch.stop)
        env = mock.patch.dict(os.environ, {"LANES_STATE": str(self.state)})
        env.start()
        self.addCleanup(env.stop)
        return fixture

    def test_truncated_status_and_details_verify_exact_immutable_raw_bytes(self):
        fixture = self.raw_readback_fixture()
        feed = self.feed(0)
        feed["conditions"]["source-unknown"]["evidence"] = "界" * 100_000
        self.assertEqual(doctor.publish_status(self.host, self.lane, feed), "https://gist.example/abc123")
        self.assertEqual((fixture.gets, len(fixture.raw_calls)), (2, 2))
        receipt = json.loads(self.record.read_text())
        for name, key in (("lanes-status.json", "publicFeedSha256"),
                          ("lanes-status-details.json", "fullEvidenceSha256")):
            self.assertEqual(receipt[key], hashlib.sha256(self.api.files[name].encode()).hexdigest())
        self.assertLessEqual(len(self.api.files["lanes-status.json"].encode()), doctor.PUBLIC_FEED_MAX_BYTES)
        self.assertEqual(json.loads(self.api.files["lanes-status-details.json"]), feed)
        for args, options in fixture.raw_calls:
            name = args[-1].rsplit("/", 1)[1]
            self.assertEqual(args[:2], ["curl", "--disable"])
            self.assertEqual(args[args.index("--proto") + 1], "=https")
            self.assertEqual(args[args.index("--max-redirs") + 1], "0")
            self.assertEqual(int(args[args.index("--max-filesize") + 1]), len(self.api.files[name].encode()))
            self.assertEqual(float(args[args.index("--max-time") + 1]), options["timeout"])
            self.assertTrue(0 < options["timeout"] <= 60)
            self.assertNotIn("--location", args)
            self.assertNotIn("--insecure", args)
            self.assertNotIn("--header", args)

    def test_truncated_raw_readback_refuses_untrusted_origins_and_file_identities(self):
        fixture = self.raw_readback_fixture(("lanes-status-details.json",))
        original = self.record.read_bytes()
        urls = [
            "http://gist.githubusercontent.com/fixture-owner/abc123/raw/" + "d" * 40 + "/lanes-status-details.json",
            "https://gist.githubusercontent.com.evil.invalid/fixture-owner/abc123/raw/" + "d" * 40 + "/lanes-status-details.json",
            "https://fixture-user@gist.githubusercontent.com/fixture-owner/abc123/raw/" + "d" * 40 + "/lanes-status-details.json",
            "https://127.0.0.1/fixture-owner/abc123/raw/" + "d" * 40 + "/lanes-status-details.json",
        ]
        for replace in (lambda u: u.replace("fixture-owner", "wrong-owner"),
                        lambda u: u.replace("abc123", "def456"),
                        lambda u: u.replace("d" * 40, "HEAD"),
                        lambda u: u.replace("/lanes-status-details.json", "/lanes-status.json"),
                        lambda u: u + "?redirect=other", lambda u: u + "#fragment",
                        lambda u: u.replace("/raw/", "/raw/../raw/"),
                        lambda u: u.replace(".com/", ".com:443/")):
            urls.append(replace("https://gist.githubusercontent.com/fixture-owner/abc123/raw/" +
                                "d" * 40 + "/lanes-status-details.json"))
        for url in urls:
            with self.subTest(url=url):
                fixture.url = lambda name, raw, url=url: url
                with self.assertRaisesRegex(RuntimeError, "status-gist-readback-unconfirmed"):
                    doctor.publish_status(self.host, self.lane, self.feed(0))
                self.assertEqual(self.record.read_bytes(), original)
        self.assertEqual(fixture.raw_calls, [], "reject before any raw network operation")

    def test_truncated_raw_readback_refuses_wrong_bytes_lengths_and_http_results(self):
        fixture = self.raw_readback_fixture(("lanes-status-details.json",))
        original = self.record.read_bytes()
        for response, code, exit_code in (
                (lambda n, b: b[:-1], "200", 0),
                (lambda n, b: b + b"x", "200", 0),
                (lambda n, b: b"x" + b[1:], "200", 0),
                (lambda n, b: b, "206", 0),
                (lambda n, b: b, "302", 0),
                (lambda n, b: b, "404", 0),
                (lambda n, b: b, "200", 63)):
            with self.subTest(code=code, exit_code=exit_code, response=response):
                fixture.response, fixture.code, fixture.exit_code = response, code, exit_code
                with self.assertRaisesRegex(RuntimeError, "status-gist-readback-unconfirmed"):
                    doctor.publish_status(self.host, self.lane, self.feed(0))
                self.assertEqual(self.record.read_bytes(), original)

    def test_truncated_raw_readback_requires_exact_api_byte_size_before_fetching(self):
        fixture = self.raw_readback_fixture(("lanes-status-details.json",))
        for size in (None, True, 0, "123", 123.0, -1):
            with self.subTest(size=size):
                fixture.size = lambda _, size=size: size
                with self.assertRaisesRegex(RuntimeError, "status-gist-readback-unconfirmed"):
                    doctor.publish_status(self.host, self.lane, self.feed(0))
        self.assertEqual(fixture.raw_calls, [])
        self.assertNotIn("verifiedAt", json.loads(self.record.read_text()))

    def test_truncated_raw_readback_requires_a_curl_with_streaming_size_limits(self):
        fixture = self.raw_readback_fixture(("lanes-status-details.json",))
        original = self.record.read_bytes()
        for version, exit_code in (("curl 8.3.0 synthetic", 0), ("curl 7.88.1 synthetic", 0),
                                   ("unknown", 0), ("curl 8.4.0 synthetic", 1)):
            with self.subTest(version=version, exit_code=exit_code):
                fixture.curl_version, fixture.version_exit = version, exit_code
                with self.assertRaisesRegex(RuntimeError, "status-gist-readback-unconfirmed"):
                    doctor.publish_status(self.host, self.lane, self.feed(0))
                self.assertEqual(self.record.read_bytes(), original)
        self.assertEqual(fixture.raw_calls, [], "an unsupported curl must never download raw content")

    def test_truncated_raw_readback_accounts_for_http_failures_in_the_shared_client(self):
        fixture = self.raw_readback_fixture(("lanes-status-details.json",))
        fixture.code = "429"
        with self.assertRaisesRegex(RuntimeError, "status-gist-readback-unconfirmed"):
            doctor.publish_status(self.host, self.lane, self.feed(0))
        ledger = json.loads((self.state / "api-ledger/github.json").read_text())
        credential = ledger["credentials"]["anonymous-gist-raw"]
        self.assertEqual(credential["breaker"]["state"], "open")
        usage = next(iter(credential["usage"].values()))["report"]
        self.assertEqual((usage["attempts"], usage["errors"], usage["rateLimited"]), (1, 1, 1))
        self.assertNotIn("verifiedAt", json.loads(self.record.read_text()))

    def test_truncated_raw_readback_preserves_previous_receipt_on_timeout(self):
        fixture = self.raw_readback_fixture(("lanes-status-details.json",))
        previous = {"url": "https://gist.example/abc123", "id": "abc123", "verifiedAt": "previous",
                    "fullEvidenceSha256": "previous-full", "publicFeedSha256": "previous-public"}
        self.record.write_text(json.dumps(previous))
        for error in (subprocess.TimeoutExpired("synthetic-curl", 0.1), OSError("synthetic TLS refusal")):
            with self.subTest(error=type(error).__name__):
                fixture.raw_error = error
                with self.assertRaisesRegex(RuntimeError, "status-gist-readback-unconfirmed"):
                    doctor.publish_status(self.host, self.lane, self.feed(0))
                self.assertEqual(json.loads(self.record.read_text()), previous)

    def test_truncated_raw_readback_uses_remaining_overall_deadline(self):
        fixture = self.raw_readback_fixture(("lanes-status-details.json",))
        clock = [100.0]
        after_write = self.api.after_write
        self.api.after_write = lambda: (after_write(), clock.__setitem__(0, 159.0))
        with mock.patch.object(doctor.time, "monotonic", side_effect=lambda: clock[0]):
            doctor.publish_status(self.host, self.lane, self.feed(0))
        self.assertEqual(fixture.raw_calls[0][1]["timeout"], 1)
        fixture.raw_calls.clear()
        self.api.after_write = lambda: clock.__setitem__(0, clock[0] + 59)
        fixture.mutation = lambda: clock.__setitem__(0, clock[0] + 2)
        with mock.patch.object(doctor.time, "monotonic", side_effect=lambda: clock[0]):
            with self.assertRaisesRegex(RuntimeError, "status-gist-readback-unconfirmed"):
                doctor.publish_status(self.host, self.lane, self.feed(0))

    def test_truncated_raw_readback_cannot_certify_a_concurrent_gist_generation(self):
        fixture = self.raw_readback_fixture(("lanes-status-details.json",))
        fixture.mutation = lambda: setattr(fixture, "revision", "e" * 40)
        original = self.record.read_bytes()
        with self.assertRaisesRegex(RuntimeError, "status-gist-readback-unconfirmed"):
            doctor.publish_status(self.host, self.lane, self.feed(0))
        self.assertEqual(fixture.gets, 2)
        self.assertEqual(self.record.read_bytes(), original)

    def test_truncated_raw_readback_cannot_overwrite_a_concurrent_local_generation(self):
        fixture = self.raw_readback_fixture(("lanes-status-details.json",))
        for filename in ("status-gist.json", "lanes-status.json", "lanes-status-publish.json"):
            with self.subTest(filename=filename):
                original = self.record.read_bytes()
                fixture.mutation = lambda filename=filename: (self.state / filename).write_text("concurrent")
                with self.assertRaisesRegex(RuntimeError, "status-gist-readback-unconfirmed"):
                    doctor.publish_status(self.host, self.lane, self.feed(0))
                self.assertEqual((self.state / filename).read_text(), "concurrent")
                if filename == "status-gist.json":
                    self.record.write_bytes(original)
                self.assertNotIn("verifiedAt", json.loads(self.record.read_text()))

    def test_truncated_raw_readback_serializes_publishers_through_the_final_receipt(self):
        fixture = self.raw_readback_fixture(("lanes-status-details.json",))
        def concurrent_publish():
            writes = self.api.write_count
            with self.assertRaisesRegex(RuntimeError, "status-gist-publish-in-progress"):
                doctor.publish_status(self.host, self.lane, {"at": "other-generation"})
            self.assertEqual(self.api.write_count, writes)
        fixture.mutation = concurrent_publish
        doctor.publish_status(self.host, self.lane, self.feed(0))
        self.assertEqual(json.loads(self.api.files["lanes-status-details.json"]), self.feed(0))
        self.assertIn("verifiedAt", json.loads(self.record.read_text()))
        fixture.mutation = None
        doctor.publish_status(self.host, self.lane, self.feed(0))  # lock released after success

    def test_truncated_raw_readback_rechecks_generation_after_building_the_receipt(self):
        self.raw_readback_fixture(("lanes-status-details.json",))
        calls = [0]
        def timestamp():
            calls[0] += 1
            if calls[0] == 2:
                self.record.write_text("concurrent-final-receipt")
            return "synthetic-at"
        with mock.patch.object(doctor, "now_iso", side_effect=timestamp):
            with self.assertRaisesRegex(RuntimeError, "status-gist-readback-unconfirmed"):
                doctor.publish_status(self.host, self.lane, self.feed(0))
        self.assertEqual(self.record.read_text(), "concurrent-final-receipt")

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.state = Path(tmp.name)
        self.host = SimpleNamespace(state=self.state)
        self.lane = SimpleNamespace(load_github_env=mock.Mock())
        primary = self.state / "primary"
        primary.touch()
        primary_patch = mock.patch.object(doctor, "PRIMARY_FLAG", primary)
        primary_patch.start()
        self.addCleanup(primary_patch.stop)
        self.api = _GistApiFake()
        api_patch = mock.patch.object(doctor.lifecycle, "run", self.api)
        api_patch.start()
        self.addCleanup(api_patch.stop)
        self.record = self.state / "status-gist.json"
        self.record.write_text(json.dumps({"url": "https://gist.example/abc123", "id": "abc123"}))

    def feed(self, row_count=400):
        return {
            "schema": "symphony-lanes-status/v1", "at": "2026-10-17T18:00:00Z",
            "host": "gem", "release": "a" * 40, "running": 2, "idle": 1, "pool": None,
            "lanes": {"codex": {"running": 2, "slots": 3}}, "alerts": {"source-unknown": "held"},
            "conditions": {"source-unknown": {"owner": "existing-owner", "attempt": "b" * 64,
                                               "effect": "unknown", "readback": None}},
            "remediation": {"held": [{"issue": "JOV-1", "attempt": "c" * 64, "notSent": None}]},
            "shippingAttribution": {
                "schema": "jovie-shipping-attribution/v1", "complete": False, "mergeCount": None,
                "projects": [{"repository": "JovieInc/Jovie", "denominatorComplete": True,
                              "attributionEvidenceComplete": False, "unknownCount": row_count,
                              "pullRequests": [{"prNumber": i + 1, "origin": {"confidence": "unknown"},
                                                "diagnostic": "x" * 1024} for i in range(row_count)]}],
            },
        }

    def ledger(self, rows):
        (self.state / "runs").mkdir(exist_ok=True)
        (self.state / "runs" / "ledger.jsonl").write_text("".join(json.dumps(row) + "\n" for row in rows) + "not json\n")

    def test_stage_events_publish_with_the_status_feed_and_only_when_they_change(self):
        now = time.time()
        iso = lambda delta: doctor.datetime.fromtimestamp(now - delta, doctor.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.ledger([
            {"runId": "r1", "issue": "JOV-5", "provider": "codex", "startedAt": iso(3600), "endedAt": iso(600),
             "verdict": "landing", "pr": 22315},
            {"runId": "r2", "issue": "JOV-6", "provider": "grok", "startedAt": iso(900), "endedAt": iso(300),
             "verdict": "provider-error"},
            {"runId": "r3", "kind": "fix-red", "pr": 22301, "headBefore": "0123456789abcdef", "provider": "codex",
             "startedAt": iso(500), "endedAt": iso(100), "verdict": "fix-no-change"},
            {"runId": "old", "issue": "JOV-1", "provider": "codex", "startedAt": iso(40 * 86400), "endedAt": iso(29 * 86400)},
            {"runId": "lyb", "binding": "LYB", "issue": "LYB-1", "provider": "codex", "startedAt": iso(60), "endedAt": iso(30)},
            {"runId": "adopt", "kind": "adopt", "pr": 1, "provider": "codex", "startedAt": iso(60), "endedAt": iso(30)}])
        doctor.publish_status(self.host, self.lane, self.feed(1))
        rows = [json.loads(line) for line in self.api.files["stage-events.ndjson"].splitlines()]
        self.assertEqual([(r["entityType"], r["entityId"], r["stage"], r["actor"], r["outcome"], r["sourceReceipt"]) for r in rows], [
            ("shipping", "JovieInc/Jovie#22315", "worker-start", "codex", "advanced", "lanes-ledger:r1"),
            ("shipping", "JOV-6", "worker-start", "grok", "failed", "lanes-ledger:r2"),
            ("remediation", "JovieInc/Jovie#22301@0123456789ab", "repair-start", "codex", "failed", "lanes-ledger:r3"),
            ("shipping", "JovieInc/Jovie#1", "gate-seat", "codex", "abandoned", "lanes-ledger:adopt")])
        self.assertTrue(all(r["schema"] == "jovie-stage-event/v1" and r["enteredAt"] < r["exitedAt"] for r in rows))
        writes = self.api.write_count
        doctor.publish_status(self.host, self.lane, self.feed(1))
        packet = json.loads((self.state / "lanes-status-publish.json").read_text())
        self.assertNotIn("stage-events.ndjson", packet["files"], "unchanged rows are not re-uploaded")
        self.assertEqual(self.api.write_count, writes + 1)

    def test_gate_seat_wait_and_gate_run_are_tracked_stages(self):
        events = doctor.stage_events.events
        row = {"runId": "g1", "kind": "adopt", "pr": 22385, "provider": "grok", "gateWaitS": 120,
               "startedAt": "2026-10-21T06:33:26Z", "endedAt": "2026-10-21T07:04:02Z", "verdict": "landing"}
        seat, gate = events(row)
        self.assertEqual((seat["stage"], seat["enteredAt"], seat["exitedAt"], seat["outcome"]),
                         ("gate-seat", "2026-10-21T06:33:26Z", "2026-10-21T06:35:26Z", "advanced"))
        self.assertEqual((gate["stage"], gate["enteredAt"], gate["exitedAt"], gate["outcome"], gate["entityId"]),
                         ("gate", "2026-10-21T06:35:26Z", "2026-10-21T07:04:02Z", "advanced", "JovieInc/Jovie#22385"))
        self.assertEqual(events({**row, "verdict": "held"})[1]["outcome"], "failed")
        self.assertEqual(events({**row, "verdict": "gate-deferred"})[1]["outcome"], "abandoned")
        [deferred] = events({**row, "gateWaitS": None, "verdict": "gate-deferred"})
        self.assertEqual((deferred["stage"], deferred["exitedAt"], deferred["outcome"]),
                         ("gate-seat", "2026-10-21T07:04:02Z", "abandoned"))
        self.assertEqual(events({**row, "gateWaitS": 99999}), [events({**row, "gateWaitS": None})[0]])
        self.assertEqual(events({**row, "pr": None}), [])

    def test_a_held_sweep_snapshot_raises_an_alert_per_checkout(self):
        alerts = doctor.judge(obs(sweepSecretHeld=[{"name": "94af-Jovie", "path": "/w/Jovie",
                                                     "reason": "secret-finding:trufflehog"}]))
        self.assertIn("secret-finding:trufflehog", alerts["sweep-snapshot-secret:94af-Jovie"])
        self.assertFalse([key for key in doctor.judge(obs()) if key.startswith("sweep-snapshot-secret:")])

    def test_outcome_verification_is_the_outcome_receipt_stage(self):
        events = doctor.stage_events.events
        row = {"runId": "o1", "kind": "outcome-verify", "provider": "codex", "issue": "JOV-7771",
               "startedAt": "2026-10-21T11:27:54Z", "endedAt": "2026-10-21T12:00:00Z",
               "verdict": "recorded", "decision": "pass"}
        [event] = events(row)
        self.assertEqual((event["entityId"], event["stage"], event["outcome"]),
                         ("JOV-7771", "outcome-receipt", "advanced"))
        self.assertEqual(events({**row, "decision": "fail"})[0]["outcome"], "failed")
        self.assertEqual(events({**row, "verdict": "verifier-failed"})[0]["outcome"], "abandoned")
        self.assertEqual(events({**row, "issue": "LYB-1"}), [])

    def test_a_truncated_stage_file_is_read_back_by_its_size(self):
        now = time.time()
        iso = lambda delta: doctor.datetime.fromtimestamp(now - delta, doctor.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.ledger([{"runId": "r1", "issue": "JOV-5", "provider": "codex", "startedAt": iso(60), "endedAt": iso(30)}])
        self.api.readback_mode = "stage-truncated"
        self.assertEqual(doctor.publish_status(self.host, self.lane, self.feed(1)), "https://gist.example/abc123")
        self.ledger([{"runId": "r2", "issue": "JOV-7", "provider": "codex", "startedAt": iso(60), "endedAt": iso(30)}])
        self.api.readback_mode = "stage-short"
        with self.assertRaisesRegex(RuntimeError, "status-gist-readback-unconfirmed"):
            doctor.publish_status(self.host, self.lane, self.feed(1))

    def test_the_stage_file_is_capped_newest_first(self):
        now = time.time()
        rows = [{"runId": f"r{i}", "issue": "JOV-5", "provider": "codex",
                 "startedAt": doctor.datetime.fromtimestamp(now - 3600 + i, doctor.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "endedAt": doctor.datetime.fromtimestamp(now - 1800 + i, doctor.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
                for i in range(50)]
        self.ledger(rows)
        with mock.patch.object(doctor.stage_events, "MAX_BYTES", 1000):
            text = doctor.stage_events.ndjson(self.state / "runs" / "ledger.jsonl", now)
        self.assertLessEqual(len(text.encode()), 1000)
        self.assertIn("lanes-ledger:r49", text)
        self.assertNotIn("lanes-ledger:r0\"", text)

    def test_only_the_primary_host_publishes(self):
        saved = doctor.PRIMARY_FLAG
        with tempfile.TemporaryDirectory() as tmp:
            doctor.PRIMARY_FLAG = Path(tmp) / "primary"
            host = type("Host", (), {"state": Path(tmp)})()
            try:
                self.assertIsNone(doctor.publish_status(host, None, {"x": 1}))
                self.assertFalse((Path(tmp) / "lanes-status.json").exists(), "a non-primary host writes nothing")
                self.assertEqual(self.api.calls, [])
            finally:
                doctor.PRIMARY_FLAG = saved

    def test_growth_keeps_public_bytes_bounded_and_full_evidence_verifiable(self):
        feed = self.feed()
        self.assertGreater(len(json.dumps(feed).encode()), 256 * 1024)
        self.assertEqual(doctor.publish_status(self.host, self.lane, feed), "https://gist.example/abc123")
        public_text = self.api.files["lanes-status.json"]
        self.assertLessEqual(len(public_text.encode("utf-8")), 256 * 1024)
        public = json.loads(public_text)
        self.assertEqual(public["schema"], feed["schema"])
        for key in ("at", "release", "lanes", "pool", "alerts", "conditions", "remediation"):
            self.assertEqual(public[key], feed[key], key)
        detail = self.api.files["lanes-status-details.json"]
        self.assertEqual(json.loads(detail), feed)
        self.assertEqual((self.state / "lanes-status.json").read_text(), detail)
        proof = public["publicProjection"]["fullEvidence"]
        self.assertEqual(proof["fileName"], "lanes-status-details.json")
        self.assertEqual(proof["sha256"], hashlib.sha256(detail.encode()).hexdigest())
        self.assertEqual(proof["bytes"], len(detail.encode()))
        self.assertEqual((proof["at"], proof["release"]), (feed["at"], feed["release"]))
        project = public["shippingAttribution"]["projects"][0]
        self.assertNotIn("pullRequests", project, "omitted detail must never masquerade as an empty array")
        self.assertEqual(project["pullRequestsRef"]["recordCount"], 400)
        self.assertEqual(project["pullRequestsRef"]["jsonPointer"], "/shippingAttribution/projects/0/pullRequests")
        self.assertIs(project["attributionEvidenceComplete"], False)
        self.assertIsNone(public["shippingAttribution"]["mergeCount"])
        self.assertEqual(self.api.write_count, 1)
        self.assertEqual(len(self.api.calls), 2, "one atomic write and one independent readback")

    def test_essential_oversize_is_explicit_unavailable_without_fake_empty_counts(self):
        feed = self.feed(0)
        feed["conditions"]["source-unknown"]["evidence"] = "x" * (256 * 1024)
        doctor.publish_status(self.host, self.lane, feed)
        public = json.loads(self.api.files["lanes-status.json"])
        self.assertLessEqual(len(self.api.files["lanes-status.json"].encode()), 256 * 1024)
        self.assertEqual(public["status"], "unavailable")
        self.assertEqual(public["reason"], "essential-public-feed-exceeds-byte-limit")
        self.assertNotEqual(public["schema"], "symphony-lanes-status/v1")
        for key in ("running", "idle", "pool", "lanes", "alerts", "conditions"):
            self.assertNotIn(key, public, "refusal cannot manufacture a healthy empty fleet")
        self.assertEqual(json.loads(self.api.files["lanes-status-details.json"]), feed)

    def test_utf8_limit_counts_bytes_and_preserves_full_multibyte_evidence(self):
        feed = self.feed(0)
        feed["conditions"]["source-unknown"]["evidence"] = "界" * 100_000
        self.assertLess(len(json.dumps(feed, ensure_ascii=False, separators=(",", ":"))), 256 * 1024)
        doctor.publish_status(self.host, self.lane, feed)
        self.assertEqual(json.loads(self.api.files["lanes-status.json"])["status"], "unavailable")
        self.assertEqual(json.loads(self.api.files["lanes-status-details.json"]), feed)

    def test_unknown_attribution_is_not_rewritten_to_empty_detail(self):
        feed = self.feed(0)
        feed["shippingAttribution"]["projects"][0]["pullRequests"] = None
        doctor.publish_status(self.host, self.lane, feed)
        public = json.loads(self.api.files["lanes-status.json"])
        self.assertIsNone(public["shippingAttribution"]["projects"][0]["pullRequests"])
        self.assertIs(public["shippingAttribution"]["complete"], False)

    def test_failed_publication_does_not_report_a_successful_feed(self):
        self.api.fail_write = True
        with self.assertRaises(RuntimeError):
            doctor.publish_status(self.host, self.lane, self.feed(0))
        self.assertEqual(len(self.api.calls), 1)

    def test_changed_or_incomplete_readback_cannot_certify_full_evidence(self):
        for mode in ("changed", "truncated"):
            with self.subTest(mode=mode):
                self.api.readback_mode = mode
                with self.assertRaises(RuntimeError):
                    doctor.publish_status(self.host, self.lane, self.feed(0))

    def test_create_keeps_one_identity_after_unknown_or_unverified_effect(self):
        self.record.unlink()
        self.api.ambiguous_create = True
        with self.assertRaises(RuntimeError):
            doctor.publish_status(self.host, self.lane, self.feed(0))
        with self.assertRaises(RuntimeError):
            doctor.publish_status(self.host, self.lane, self.feed(0))
        self.assertEqual(self.api.write_count, 1, "unknown create is reconcile-required, never another gist")

    def test_known_create_with_unverified_readback_reuses_the_same_gist(self):
        self.record.unlink()
        self.api.readback_mode = "truncated"
        with self.assertRaises(RuntimeError):
            doctor.publish_status(self.host, self.lane, self.feed(0))
        self.assertEqual(json.loads(self.record.read_text())["id"], self.api.gist_id)
        self.api.readback_mode = None
        doctor.publish_status(self.host, self.lane, self.feed(0))
        methods = [args[args.index("--method") + 1] for args, _timeout in self.api.calls]
        self.assertEqual(methods, ["POST", "GET", "PATCH", "GET"])

    def test_foreign_resource_path_is_refused_before_any_github_effect(self):
        self.record.write_text(json.dumps({"url": "https://gist.example/abc123", "id": "../user"}))
        with self.assertRaises(RuntimeError):
            doctor.publish_status(self.host, self.lane, self.feed(0))
        self.assertEqual(self.api.calls, [])

    def test_existing_publication_deadline_covers_write_and_readback(self):
        clock = {"now": 0}
        self.api.after_write = lambda: clock.update(now=61)
        with mock.patch.object(doctor.time, "monotonic", side_effect=lambda: clock["now"]):
            with self.assertRaises(RuntimeError):
                doctor.publish_status(self.host, self.lane, self.feed(0))
        self.assertEqual(len(self.api.calls), 1)
        self.assertLessEqual(self.api.calls[0][1], 60)


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

    def test_positive_exact_head_observation_can_resolve_without_population_certainty(self):
        first = self.observation()
        events, alerts = self.evaluate(first, {"deliveryDemandSince": 990000})
        prior = {"alerts": alerts, "conditions": events, "deliveryDemandSince": 990000}
        now = first["now"] + 60
        row = {**self.merge(mergedAt=doctor.epoch_iso(now - 1)), "title": "repair",
               "headRefName": "fix/work", "baseRefName": "main",
               "createdAt": doctor.epoch_iso(980000), "updatedAt": doctor.epoch_iso(now - 1)}
        evidence = doctor.merge_evidence.collect("JovieInc/Jovie", now - 86400, now,
            fetch_page=lambda lo, hi: {"issueCount": 1, "nodes": [row]})
        observed = self.observation(now=now, _allReceipts=[self.coding()], merged24h=evidence["prs"],
            mergedWindow={k: v for k, v in evidence.items() if k != "prs"},
            mergedAttributionError="merged-pr-evidence:" + doctor.merge_evidence.SEARCH_COVERAGE_REASON)
        resolved, _ = self.evaluate(observed, prior)
        self.assertFalse(observed["delivery"]["mergeEvidenceComplete"])
        self.assertEqual(observed["delivery"]["state"], "unknown")
        self.assertEqual(resolved["delivery-stalled"]["terminalOutcome"], "merge-proven")
        self.assertEqual(resolved["delivery-stalled"]["recoveryEvidence"]["lastDeliveredMerge"]["headSha"], self.HEAD)
        self.assertIsNone(observed["delivery"]["deployedVerification"])
        # No missing event or unrelated/stale/malformed observation authorizes recovery.
        for mutation in ("wrong-head", "wrong-repository", "stale", "unfinished", "missing-witness", "contradictory-witness"):
            candidate = json.loads(json.dumps(observed))
            if mutation == "wrong-head":
                candidate["merged24h"][0]["headRefOid"] = "d" * 40
            elif mutation == "wrong-repository":
                candidate["mergedWindow"]["source"]["repository"] = "JovieInc/LogYourBody"
            elif mutation == "stale":
                candidate["now"] += 4000
            elif mutation == "unfinished":
                candidate["mergedWindow"]["providerEnumerationComplete"] = False
            elif mutation == "contradictory-witness":
                candidate["mergedWindow"]["enumeratedSlices"][0].update(providerCount=0, returnedCount=0)
            else:
                candidate["mergedWindow"]["enumeratedSlices"] = []
            with self.subTest(mutation=mutation):
                carried, _ = self.evaluate(candidate, prior)
                self.assertEqual(carried["delivery-stalled"]["state"], "active")
                self.assertIsNone(candidate["delivery"]["lastDeliveredMerge"])

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
    def test_factory_adapter_and_intake_failures_do_not_abort_doctor(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "factory-signals").mkdir()
            (state / "factory-signals/pending.json").write_text(json.dumps({
                "schema": "jovie-factory-signal/v1", "fingerprint": "pending", "title": "Repair",
                "problem": "Evidence", "acceptance": ["Reproduce and repair"], "metric": {"name": "failures", "target": 0}}))
            class Down:
                def gql(self, query, variables):
                    raise RuntimeError("fixture Linear down")
            tracker = FakeTracker()
            tracker.linear = Down()
            with mock.patch.dict(os.environ, {"LANES_SELFTEST": "1"}), \
                    mock.patch.object(doctor, "observe", return_value=obs()), \
                    mock.patch.object(doctor.factory_signals, "sentinel_signals", side_effect=ValueError("bad adapter")):
                result = doctor.run(SimpleNamespace(state=state), SimpleNamespace(HOST="test"), None, tracker)
            self.assertIn("fixture Linear down", result["factoryIntake"]["error"])
            self.assertEqual(json.loads((state / "doctor.json").read_text())["factoryIntake"], result["factoryIntake"])
            self.assertTrue((state / "factory-signals/pending.json").exists())

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
            self.assertEqual(written["fileOverlap"]["mode"], "flag")
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


class SearchPopulationCoverageTest(unittest.TestCase):
    """Search can omit a known merge even when issueCount equals returned rows."""
    START = doctor.merge_evidence._epoch("2026-10-26T14:30:00Z")
    END = doctor.merge_evidence._epoch("2026-10-27T00:23:00Z")

    def row(self, number=23424):
        return {"number": number, "title": "observed merge", "headRefName": "fix/example",
                "baseRefName": "main", "createdAt": "2026-10-25T00:00:00Z",
                "updatedAt": "2026-10-27T00:20:32Z", "mergedAt": "2026-10-27T00:20:32Z",
                "headRefOid": "a" * 40, "mergeCommit": {"oid": "b" * 40}}

    def evidence(self, rows):
        return doctor.merge_evidence.collect("JovieInc/Jovie", self.START, self.END,
            fetch_page=lambda lo, hi: {"issueCount": len(rows), "nodes": rows})

    def test_sparse_origin_emitter_does_not_import_the_merge_reader(self):
        # Existing automation checkouts copy only these two files. Reporting's
        # optional merge reader must not expand the origin emitter dependency set.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for relative in ("scripts/shipping_origin.py", "scripts/lanes/shipping_attribution.py"):
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / relative).read_bytes())
            result = subprocess.run([sys.executable, "scripts/shipping_origin.py", "--help"],
                cwd=root, text=True, capture_output=True, timeout=10,
                env={**os.environ, "PYTHONPATH": ""})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("emit-automation", result.stdout)

    def test_observe_preserves_events_while_propagating_unknown_population(self):
        evidence = self.evidence([self.row()])
        lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie", HOST="test",
            Linear=mock.Mock(side_effect=OSError("offline")), load_github_env=lambda: None,
            graphql_budget=lambda: (4000,), provider_throughput=throughput_stub)
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.dict(os.environ, {"LANES_SELFTEST": ""}), \
                mock.patch.object(doctor, "host_capacity", return_value={}), \
                mock.patch.object(doctor, "qualified_pool", side_effect=OSError("offline")), \
                mock.patch.object(doctor.merge_evidence, "collect_shared", return_value=evidence) as collect, \
                mock.patch.object(doctor.shipping_attribution, "PROJECTS", [{"repository": lane.REPO_SLUG}]), \
                mock.patch.object(doctor, "sample_merge_throughput", return_value=(None, "unavailable")), \
                mock.patch.object(doctor, "sample_quota_deferred_heads", return_value=(None, "unavailable")), \
                mock.patch.object(doctor, "sample_quota_drain", return_value=(None, "unavailable")), \
                mock.patch.object(doctor, "open_pr_numbers", return_value=None), \
                mock.patch.object(doctor, "automation_observation", return_value={}), \
                mock.patch.object(doctor.fleet_ledger, "record_ready"), \
                mock.patch.object(doctor.deploy_health, "sample", return_value=(None, None)), \
                mock.patch.object(doctor.release_evidence, "sample", return_value=(None, None)), \
                mock.patch.object(doctor.release_gates, "sample", return_value=(None, None)), \
                mock.patch.object(doctor.throughput_sentinel, "observe", return_value={}):
            host = SimpleNamespace(state=Path(tmp), linear_env=Path(tmp) / "absent")
            observed = doctor.observe(host, lane, SimpleNamespace(status=lambda: {}), now=self.END)
        collect.assert_called_once()
        self.assertEqual(observed["merged24h"], [self.row()])
        self.assertEqual(observed["mergedAttributionError"], "merged-pr-evidence:" + evidence["reason"])
        self.assertFalse(observed["mergedWindow"]["complete"])
        self.assertIsNone(observed["mergedWindow"]["populationCount"])
        self.assertEqual(observed["_mergeEvidenceByRepository"][lane.REPO_SLUG], evidence)

    def test_known_22413_omission_cannot_certify_a_population(self):
        # Exact GET: #22413 merged at 23:21:28, SHA 828288651b830f7514aaeee4f7fa4622acf63e14.
        # Search omitted it with a matching count and no pagination remaining.
        direct_merged_at = doctor.merge_evidence._epoch("2026-10-26T23:21:28Z")
        self.assertTrue(self.START <= direct_merged_at < self.END)
        evidence = self.evidence([self.row()])
        self.assertFalse(evidence["complete"])
        self.assertTrue(evidence["providerEnumerationComplete"])
        self.assertEqual(evidence["populationCoverage"], "unknown")
        self.assertIsNone(evidence["populationCount"])
        self.assertEqual(evidence["observedCount"], 1)
        self.assertEqual([r["number"] for r in evidence["prs"]], [23424])
        with self.assertRaises(doctor.merge_evidence.IncompleteMergeEvidence):
            doctor.merge_evidence.require_complete(evidence)

    def test_empty_search_is_zero_observations_not_zero_population(self):
        evidence = self.evidence([])
        self.assertFalse(evidence["complete"])
        self.assertTrue(evidence["providerEnumerationComplete"])
        self.assertEqual(evidence["observedCount"], 0)
        self.assertIsNone(evidence["populationCount"])

    def test_legacy_complete_cache_does_not_resurrect_the_false_claim(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "merge-window.json"
            legacy = {"complete": True, "reason": None, "prs": [self.row()],
                      "window": {"since": self.START, "until": self.END}}
            cache.write_text(json.dumps({"repository": "JovieInc/Jovie", "evidence": legacy}))
            fetch = mock.Mock(return_value=self.evidence([self.row()]))
            result = doctor.merge_evidence.collect_shared("JovieInc/Jovie", self.START,
                self.END + 10, cache, collect_fn=fetch)
            fetch.assert_called_once()
            self.assertFalse(result["complete"])

    def test_attribution_keeps_observed_events_without_an_exact_denominator(self):
        evidence = self.evidence([self.row()])
        report = doctor.shipping_attribution.project_report(
            {"channel": "Jovie", "repository": "JovieInc/Jovie", "instrumented": True},
            evidence, {"complete": True, "rows": []}, self.END)
        self.assertFalse(report["denominatorComplete"])
        self.assertIsNone(report["mergeCount"])
        self.assertIsNone(report["coverage"])
        self.assertEqual(report["observedMergeCount"], 1)
        self.assertEqual([r["prNumber"] for r in report["pullRequests"]], [23424])

    def test_invalid_cached_rows_or_slice_witnesses_are_not_reused(self):
        for mutation in ("outside-window", "duplicate", "bad-time", "slice-gap", "slice-count"):
            stale = self.evidence([self.row()])
            if mutation == "outside-window":
                stale["prs"][0]["mergedAt"] = "2026-10-26T14:29:59Z"
            elif mutation == "duplicate":
                stale["prs"].append(dict(stale["prs"][0])); stale["observedCount"] = 2
            elif mutation == "bad-time":
                stale["prs"][0]["mergedAt"] = "not-a-time"
            elif mutation == "slice-gap":
                stale["enumeratedSlices"][0]["sinceInclusive"] += 1
            else:
                stale["enumeratedSlices"][0]["providerCount"] += 1
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as tmp:
                cache = Path(tmp) / "merge-window.json"
                cache.write_text(json.dumps({"repository": "JovieInc/Jovie", "evidence": stale}))
                fetch = mock.Mock(return_value=self.evidence([]))
                result = doctor.merge_evidence.collect_shared("JovieInc/Jovie", self.START,
                    self.END + 10, cache, collect_fn=fetch)
                fetch.assert_called_once()
                self.assertFalse(result["complete"])

    def test_observed_events_survive_a_later_page_failure_without_a_total(self):
        calls = []
        def fetch(lo, hi):
            calls.append((lo, hi))
            if len(calls) == 1:
                return {"issueCount": 101, "nodes": []}
            if len(calls) == 2:
                return {"issueCount": 1, "nodes": [self.row()]}
            raise OSError("offline")
        result = doctor.merge_evidence.collect("JovieInc/Jovie", self.START, self.END, fetch_page=fetch)
        self.assertFalse(result["complete"])
        self.assertFalse(result["providerEnumerationComplete"])
        self.assertEqual(result["reason"], "fetch_failed")
        self.assertEqual(result["observedCount"], 1)
        self.assertEqual(result["prs"], [self.row()])
        self.assertIsNone(result["populationCount"])

    def test_retained_events_cannot_exceed_their_slice_witness(self):
        evidence = self.evidence([self.row()])
        # The overall returned count can still match: a different slice must not
        # lend its witness count to the slice containing the retained event.
        split = int(self.START + 3600)
        evidence["enumeratedSlices"] = [
            {"sinceInclusive": int(self.START), "untilInclusive": split, "providerCount": 1, "returnedCount": 1},
            {"sinceInclusive": split + 1, "untilInclusive": int(self.END), "providerCount": 0, "returnedCount": 0}]
        self.assertFalse(doctor.merge_evidence.search_observations(evidence, "JovieInc/Jovie"))
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "merge-window.json"
            cache.write_text(json.dumps({"repository": "JovieInc/Jovie", "evidence": evidence}))
            fetch = mock.Mock(return_value=self.evidence([]))
            doctor.merge_evidence.collect_shared("JovieInc/Jovie", self.START, self.END + 1,
                                                 cache, collect_fn=fetch)
            fetch.assert_called_once()

    def test_rows_outside_the_returned_search_slice_are_rejected(self):
        result = doctor.merge_evidence.collect("JovieInc/Jovie", self.START, self.START + 10,
            fetch_page=lambda lo, hi: {"issueCount": 1, "nodes": [self.row()]})
        self.assertFalse(result["providerEnumerationComplete"])
        self.assertEqual(result["reason"], "malformed_pr")
        self.assertEqual(result["observedCount"], 0)

    def test_real_shared_reader_reuses_honest_coverage_without_extra_requests(self):
        response = SimpleNamespace(returncode=0, stdout=json.dumps({"data": {
            "search": {"issueCount": 1, "nodes": [self.row()]}}}))
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(doctor.merge_evidence.subprocess, "run", return_value=response) as run:
            cache = Path(tmp) / "merge-window.json"
            first = doctor.merge_evidence.collect_shared("JovieInc/Jovie", self.START, self.END, cache)
            second = doctor.merge_evidence.collect_shared("JovieInc/Jovie", self.START + 1,
                                                          self.END + 60, cache)
            self.assertEqual(run.call_count, 1, "unknown population does not disable the existing five-minute cache")
            self.assertFalse(second["complete"])
            self.assertEqual(second["source"], first["source"])
            self.assertEqual(second["window"]["until"], self.END, "cache read cannot renew source time")
            doctor.merge_evidence.collect_shared("JovieInc/Jovie", self.START,
                self.END + doctor.merge_evidence.SHARED_TTL_S, cache)
            self.assertEqual(run.call_count, 2, "expiry triggers one bounded refresh, not a new retry loop")
            for call in run.call_args_list:
                self.assertEqual(call.args[0][:3], ["gh", "api", "graphql"])
                self.assertGreater(call.kwargs["timeout"], 0)
                self.assertLessEqual(call.kwargs["timeout"], 60)

    def test_fractional_adjacent_windows_filter_exactly_without_double_counting(self):
        rows = [{**self.row(n), "createdAt": doctor.epoch_iso(90),
                 "mergedAt": doctor.epoch_iso(n), "updatedAt": doctor.epoch_iso(n)}
                for n in range(100, 105)]
        def fetch(lo, hi):
            hits = [r for r in rows if lo <= doctor.merge_evidence._epoch(r["mergedAt"]) <= hi]
            return {"issueCount": len(hits), "nodes": hits}
        first = doctor.merge_evidence.collect("JovieInc/Jovie", 100.5, 102.5, fetch_page=fetch)
        second = doctor.merge_evidence.collect("JovieInc/Jovie", 102.5, 104.0, fetch_page=fetch)
        self.assertEqual([r["number"] for r in first["prs"]], [101, 102])
        self.assertEqual([r["number"] for r in second["prs"]], [103])
        self.assertEqual(first["window"], {"since": 100.5, "until": 102.5})
        self.assertTrue(first["providerEnumerationComplete"])
        self.assertFalse(first["complete"])
        self.assertIsNone(second["populationCount"])

    def test_status_feed_preserves_zero_observations_as_unknown_totals(self):
        evidence = self.evidence([])
        observed = obs(mergedAttributionError="merged-pr-evidence:" + evidence["reason"],
            mergedWindow={k: v for k, v in evidence.items() if k != "prs"},
            _mergeEvidenceByRepository={"JovieInc/Jovie": evidence},
            _ledgerEvidence={"complete": True, "rows": []})
        lane = SimpleNamespace(HOST="gem", provider_throughput=lambda *a, **k: {
            "providers": {"codex": {"landedOutput": 0, "issueToMergeSecondsP50": 0}},
            "landedByAttribution": {}, "landedByOrigin": {}})
        with tempfile.TemporaryDirectory() as tmp:
            feed = doctor.status_feed(SimpleNamespace(state=Path(tmp)), lane, observed, {}, {})
        self.assertEqual(feed["mergedWindow"]["observedCount"], 0)
        self.assertIsNone(feed["mergedWindow"]["populationCount"])
        self.assertIsNone(feed["throughput"]["providers"]["codex"]["landedOutput"])
        project = feed["shippingAttribution"]["projects"][0]
        self.assertEqual(project["observedMergeCount"], 0)
        self.assertIsNone(project["mergeCount"])
        self.assertFalse(project["denominatorComplete"])


class MergeWindowTest(unittest.TestCase):
    NOW = 1_800_000_000

    def row(self, number, age):
        return {"number": number, "title": "repair", "headRefName": "codex/jov-1",
                "baseRefName": "main", "createdAt": doctor.epoch_iso(self.NOW - 10000),
                "mergedAt": doctor.epoch_iso(self.NOW - age),
                "updatedAt": doctor.epoch_iso(self.NOW - age)}

    def pages(self, rows):
        """A search API stand-in: every PR merged in [lo, hi], at most 100 per page."""
        def fetch(lo, hi):
            hits = [row for row in rows if lo <= doctor.merge_evidence._epoch(row["mergedAt"]) <= hi]
            return {"issueCount": len(hits), "nodes": hits[:100]}
        return fetch

    def collect(self, fetch, **options):
        return doctor.merge_evidence.collect("JovieInc/Jovie", self.NOW - 200, self.NOW,
                                             fetch_page=fetch, **options)

    def test_more_than_100_and_exact_half_open_boundaries(self):
        rows = [self.row(i + 1, i) for i in range(206)]
        result = self.collect(self.pages(rows))
        self.assertTrue(result["providerEnumerationComplete"])
        self.assertFalse(result["complete"])
        self.assertGreater(result["pages"], 1, "a window over one page is split, never paged by cursor")
        self.assertEqual([r["number"] for r in result["prs"]], list(range(2, 202)))

    def test_lagging_updated_order_does_not_lose_search_observations(self):
        # 2026-10-13: the connection listed #21435 (22:41Z) ahead of #21430 (23:19Z).
        late = self.row(2, 5)
        late["updatedAt"] = doctor.epoch_iso(self.NOW - 1)
        result = self.collect(self.pages([self.row(1, 3), late, self.row(3, 1)]))
        self.assertTrue(result["providerEnumerationComplete"])
        self.assertFalse(result["complete"])
        self.assertEqual([r["number"] for r in result["prs"]], [1, 2, 3])

    def test_old_merge_updated_recently_does_not_count(self):
        old = self.row(1, 300)
        old["updatedAt"] = doctor.epoch_iso(self.NOW)
        result = self.collect(self.pages([old, self.row(2, 1)]))
        self.assertEqual([r["number"] for r in result["prs"]], [2])

    def test_typed_incomplete_for_corrupt_or_partial_pages(self):
        good = self.pages([self.row(1, 1)])(0, self.NOW)
        cases = [
            (None, "malformed_page"),
            ({**good, "issueCount": True}, "malformed_page"),
            ({**good, "issueCount": 0}, "malformed_page"),
            ({**good, "nodes": [{**good["nodes"][0], "mergedAt": "bad"}]}, "malformed_pr"),
            ({**good, "nodes": [{**good["nodes"][0], "number": True}]}, "malformed_pr"),
            ({"issueCount": 2, "nodes": [self.row(1, 1), {**self.row(1, 1), "title": "other"}]}, "duplicate_pr"),
            ({"issueCount": 101, "nodes": []}, "slice_too_dense"),
        ]
        for page, reason in cases:
            with self.subTest(reason=reason, page=page):
                result = self.collect(lambda lo, hi: page)
                self.assertFalse(result["complete"])
                self.assertEqual(result["reason"], reason)
                self.assertEqual(result["prs"], [])
                with self.assertRaisesRegex(doctor.merge_evidence.IncompleteMergeEvidence, reason):
                    doctor.merge_evidence.require_complete(result)

    def test_page_limit(self):
        source = self.pages([self.row(i + 1, i + 1) for i in range(102)])
        self.assertEqual(self.collect(source, max_pages=1)["reason"], "max_pages_reached")
        self.assertTrue(self.collect(source)["providerEnumerationComplete"])

    def test_read_failure_deadline_and_invalid_options(self):
        with mock.patch.object(doctor.merge_evidence.subprocess, "run", side_effect=OSError("offline")):
            result = doctor.merge_evidence.collect("JovieInc/Jovie", 1, 2)
        self.assertEqual(result["reason"], "fetch_failed")
        with mock.patch.object(doctor.merge_evidence.time, "monotonic", side_effect=[0, 0, 61]):
            self.assertEqual(self.collect(self.pages([]))["reason"], "deadline_exceeded")
        self.assertEqual(self.collect(self.pages([]), max_pages=0)["reason"], "invalid_fetch_options")
        self.assertEqual(self.collect(self.pages([]), timeout_s=float("nan"))["reason"], "invalid_fetch_options")

    def test_default_transport_splits_search_windows_under_one_deadline(self):
        source = self.pages([self.row(i + 1, i + 1) for i in range(120)])
        calls = []
        def run(args, **kwargs):
            calls.append((args, kwargs))
            query = next(arg.removeprefix("q=") for arg in args if arg.startswith("q="))
            lo, hi = query.split("merged:", 1)[1].split("..")
            page = source(doctor.merge_evidence._epoch(lo), doctor.merge_evidence._epoch(hi))
            return SimpleNamespace(returncode=0, stdout=json.dumps({"data": {"search": page}}))
        with mock.patch.object(doctor.merge_evidence.subprocess, "run", side_effect=run):
            result = doctor.merge_evidence.collect("JovieInc/Jovie", self.NOW - 200, self.NOW)
        self.assertTrue(result["providerEnumerationComplete"])
        self.assertFalse(result["complete"])
        self.assertEqual(len(result["prs"]), 120)
        self.assertEqual(result["pages"], len(calls))
        self.assertGreater(len(calls), 1)
        for args, kwargs in calls:
            self.assertEqual(args[:3], ["gh", "api", "graphql"])
            self.assertTrue(any(arg.startswith("q=repo:JovieInc/Jovie is:pr is:merged merged:") for arg in args))
            self.assertGreater(kwargs["timeout"], 0)
            self.assertLessEqual(kwargs["timeout"], 60)
        timeouts = [kwargs["timeout"] for _, kwargs in calls]
        self.assertEqual(timeouts, sorted(timeouts, reverse=True))

    def test_default_transport_suppresses_bad_response_and_timeout(self):
        cases = [
            (SimpleNamespace(returncode=1, stdout=""), "fetch_failed"),
            (SimpleNamespace(returncode=0, stdout="not json"), "fetch_failed"),
            (SimpleNamespace(returncode=0, stdout="[]"), "fetch_failed"),
            (SimpleNamespace(returncode=0, stdout='{"errors":[{"message":"unavailable"}]}'), "fetch_failed"),
            (SimpleNamespace(returncode=0, stdout='{"data":null}'), "fetch_failed"),
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

    def test_shared_reader_reuses_provider_enumeration_without_claiming_population(self):
        rows = [self.row(1, 50), self.row(2, 150)]
        collect = mock.Mock(return_value=self.collect(self.pages(rows)))
        shared = doctor.merge_evidence.collect_shared
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "merge-window.json"
            first = shared("JovieInc/Jovie", self.NOW - 200, self.NOW, cache, collect_fn=collect)
            later = shared("JovieInc/Jovie", self.NOW - 100, self.NOW + 60, cache, collect_fn=collect)
            self.assertEqual(collect.call_count, 1)
            self.assertEqual(first["prs"], rows)
            # The reused read keeps its own `until` and only the rows inside the new `since`.
            self.assertEqual(later["window"], {"since": self.NOW - 100, "until": self.NOW})
            self.assertEqual([r["number"] for r in later["prs"]], [1])
            self.assertFalse(later["complete"])
            self.assertTrue(later["providerEnumerationComplete"])
            self.assertEqual(later["observedCount"], 1)
            self.assertIsNone(later["populationCount"])
            shared("JovieInc/Jovie", self.NOW - 200, self.NOW + 300, cache, collect_fn=collect)
            self.assertEqual(collect.call_count, 2)
            shared("JovieInc/Other", self.NOW - 200, self.NOW + 300, cache, collect_fn=collect)
            self.assertEqual(collect.call_count, 3)

    def test_shared_reader_never_shares_incomplete_or_unreadable_evidence(self):
        collect = mock.Mock(return_value={"complete": False, "reason": "fetch_failed", "prs": [],
                                          "window": {"since": self.NOW - 200, "until": self.NOW}})
        shared = doctor.merge_evidence.collect_shared
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "merge-window.json"
            for _ in range(2):
                self.assertEqual(shared("JovieInc/Jovie", self.NOW - 200, self.NOW, cache,
                                        collect_fn=collect)["reason"], "fetch_failed")
            self.assertFalse(cache.exists())
            self.assertEqual(collect.call_count, 2)
            cache.write_text("{not json")
            shared("JovieInc/Jovie", self.NOW - 200, self.NOW, cache, collect_fn=collect)
            self.assertEqual(collect.call_count, 3)
        shared("JovieInc/Jovie", self.NOW - 200, self.NOW, None, collect_fn=collect)
        self.assertEqual(collect.call_count, 4)

    def test_doctor_legacy_reader_uses_shared_complete_evidence(self):
        rows = [self.row(1, 1)]
        lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie", lane_state_dir=lambda: None)
        with mock.patch.object(doctor.merge_evidence, "collect", return_value={"complete": True, "prs": rows}) as collect:
            self.assertEqual(doctor.merged_prs_24h(lane, self.NOW), rows)
            collect.assert_called_once_with(lane.REPO_SLUG, self.NOW - 86400, self.NOW)



class StatusFeedContractTest(unittest.TestCase):
    def test_published_feed_keeps_schema_and_a_fresh_at_every_tick(self):
        # Summer reads the raw gist as a liveness guard: stale `at` after 10 min = producer down.
        lane = load("lane_runner")
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            fake = SimpleNamespace(HOST="gem", provider_throughput=lambda *a, **k: {"providers": {}})
            feed = doctor.status_feed(host, fake, {"now": time.time(), "codexAttribution": {"state": "available"}}, {}, {})
            self.assertEqual(feed["schema"], "symphony-lanes-status/v1")
            stamp = datetime.fromisoformat(feed["at"].replace("Z", "+00:00"))
            self.assertLess(abs(time.time() - stamp.timestamp()), 60)
            with mock.patch.object(doctor, "PRIMARY_FLAG", Path(tmp) / "primary"), \
                    mock.patch.object(doctor.lifecycle, "run", _GistApiFake("abc123")):
                (Path(tmp) / "primary").write_text("")
                (Path(tmp) / "status-gist.json").write_text(json.dumps({"url": "https://gist.example/abc123", "id": "abc123"}))
                doctor.publish_status(host, SimpleNamespace(load_github_env=lambda: None), feed)
            published = json.loads((Path(tmp) / "lanes-status.json").read_text())
            self.assertEqual((published["schema"], published["at"]), ("symphony-lanes-status/v1", feed["at"]))



class WorkerCensusParityTest(unittest.TestCase):
    def fixture(self, stack, host, lane, issues, inventory=([], [])):
        providers = {"codex": {"label": "codex", "slots": 1}}
        client = mock.Mock()
        client.lane_issues.return_value = issues
        for name, value in {
            "Linear": client, "load_providers": providers, "load_github_env": None,
            "in_flight_issues": frozenset(),
            "open_hotspot_holds": {"scripts/lanes/lane_runner.py": 21724},
            "held_back_issues": frozenset({"JOV-HELD"}), "overlap_inventory": inventory,
        }.items():
            stack.enter_context(mock.patch.object(lane, name, return_value=value))
        return {"codex": {"slots": 1, "base": 1, "running": 0}}

    def test_four_target_cards_have_worker_census_parity_without_writing_admission(self):
        from contextlib import ExitStack
        lane = load("lane_runner")
        issues, witnesses = [], {}
        for number in (21824, 21810, 21793, 21770):
            fingerprint = f"remediation:pr-{number}-conflict"
            issues.append(lane.Issue(str(number), f"JOV-{number}",
                f"PR #{number} has carried lane-fix-exhausted for more than 24h ({fingerprint})",
                f"https://github.com/JovieInc/Jovie/pull/{number}\nFingerprint: `{fingerprint}`",
                2, "2026-01-01T00:00:00Z", [fingerprint]))
            witnesses[number] = {"schema": lane.pr_events.TARGET_FILES_SCHEMA, "source": "graphql-inline",
                "repository": "JovieInc/Jovie", "number": number, "state": "OPEN", "headRefOid": "a"*40,
                "baseRefName": "main", "baseRefOid": "b"*40, "baseTipOid": "c"*40,
                "paths": [f"apps/web/lib/product-{number}.ts"], "totalCount": 1,
                "observedAt": 9998, "sourceAt": 9999, "confirmedAt": 10000}
        with tempfile.TemporaryDirectory() as tmp, ExitStack() as stack:
            host = lane.Host(state=Path(tmp), linear_env=Path(tmp) / "none")
            current = [{**row, "baseRef": {"target": {"oid": row["baseTipOid"]}},
                        "files": [{"path": path} for path in row["paths"]], "filesComplete": True,
                        "inlineFilesEvidence": row} for row in witnesses.values()]
            capacity = self.fixture(stack, host, lane, issues, inventory=(current, []))
            stack.enter_context(mock.patch.object(lane.pr_events, "capture_target_file_witnesses", return_value=witnesses))
            record = stack.enter_context(mock.patch.object(doctor.file_overlap, "record_admission"))
            clock = stack.enter_context(mock.patch.object(doctor.time, "time", return_value=10001))
            for row in witnesses.values():
                row["confirmedAt"] = 10001  # Capture finished after the original observation time.
            qualified = doctor.qualified_pool(host, lane, capacity, 10000)[0]["codex"]
            self.assertEqual(qualified, issues)
            self.assertIn(lane.pick_issue(issues, {}, now=10001, provider="codex",
                holds=lane.open_hotspot_holds(), target_files=witnesses), qualified)
            self.assertEqual(doctor.qualified_pool(host, lane, capacity, 10061)[0]["codex"], [])
            record.assert_not_called()
            self.assertEqual(list(host.state.iterdir()), [])

    def test_hotspot_and_preserved_only_pools_match_the_worker_and_keep_ready_neighbors(self):
        from contextlib import ExitStack
        lane = load("lane_runner")
        issue = lambda key, path: lane.Issue(key, key, "Task", path, 1, "2026-01-01T00:00:00Z", [])
        hot = issue("JOV-HOT", "scripts/lanes/lane_runner.py")
        held = issue("JOV-HELD", "docs/preserved.md")
        good = issue("JOV-GOOD", "docs/available.md")
        with tempfile.TemporaryDirectory() as tmp, ExitStack() as stack:
            host = lane.Host(state=Path(tmp), linear_env=Path(tmp) / "none")
            capacity = self.fixture(stack, host, lane, [hot, held])
            qualified, _, _, rejected, details = doctor.qualified_pool(host, lane, capacity, 10000)
            self.assertEqual(qualified, {"codex": []})
            self.assertEqual(rejected["codex"], {"hotspot-held": 1, "preserved-or-recovery-held": 1})
            self.assertEqual(details["JOV-HOT"], "hotspot-held:scripts/lanes/lane_runner.py#21724")
            lane.Linear.return_value.lane_issues.return_value = [hot, held, good]
            qualified = doctor.qualified_pool(host, lane, capacity, 10000)[0]
            picked = lane.pick_issue([hot, held, good], {}, now=10000, provider="codex",
                                     holds=lane.open_hotspot_holds(), held_back=lane.held_back_issues(host))
            self.assertEqual(qualified["codex"], [picked])
            self.assertIs(picked, good)
            self.assertEqual(list(host.state.iterdir()), [], "census cannot reserve or write telemetry")

    def test_unavailable_file_ownership_is_unknown_and_blocked_preview_is_not_eligible(self):
        from contextlib import ExitStack
        lane = load("lane_runner")
        issue = lane.Issue("id", "JOV-GOOD", "Task", "docs/available.md", 1, "2026-01-01T00:00:00Z", [])
        with tempfile.TemporaryDirectory() as tmp, ExitStack() as stack:
            host = lane.Host(state=Path(tmp), linear_env=Path(tmp) / "none")
            capacity = self.fixture(stack, host, lane, [issue], inventory=None)
            with self.assertRaisesRegex(RuntimeError, "file-overlap ownership unreadable"):
                doctor.qualified_pool(host, lane, capacity, 10000)
            lane.overlap_inventory.return_value = ([], [])
            with mock.patch.object(doctor.file_overlap, "admission_policy", return_value={"allowed": False}), \
                    mock.patch.object(doctor.file_overlap, "record_admission") as record:
                qualified, _, _, rejected, _ = doctor.qualified_pool(host, lane, capacity, 10000)
            self.assertEqual(qualified["codex"], [])
            self.assertEqual(rejected["codex"], {"file-overlap-held": 1})
            record.assert_not_called()

    def test_preview_and_worker_use_identical_overlap_policy_but_only_worker_records(self):
        overlap = doctor.file_overlap
        issue = SimpleNamespace(identifier="JOV-GOOD")
        with mock.patch.object(overlap, "guard_mode", return_value="flag"), \
                mock.patch.object(overlap, "predict_issue_files", return_value={"files": ["x"], "source": "fixture"}), \
                mock.patch.object(overlap, "classify_pair", return_value={"policyAction": "sequence"}), \
                mock.patch.object(overlap, "record_admission") as record:
            args = (issue, [{"number": 7, "files": ["x"]}], [], lambda _: {})
            preview = overlap.admission_policy(*args)
            record.assert_not_called()
            self.assertEqual(overlap.admission_decisions("host", "lane", *args), preview)
            record.assert_called_once_with("host", "lane", issue, preview["decisions"])


class ProviderPayloadCensusTest(unittest.TestCase):
    def process(self, proc, pid, name, cwd, args=None):
        entry = proc / str(pid)
        entry.mkdir(parents=True)
        (entry / "comm").write_text(name)
        (entry / "cmdline").write_bytes(b"\0".join(value.encode() for value in (args or ["/bin/" + name, "exec"])))
        (entry / "cwd").symlink_to(cwd, target_is_directory=True)
        (entry / "stat").write_text(str(pid) + " (" + name + ") " + " ".join(["S", "1"] + ["0"] * 17 + ["100", "0"]))
        return entry

    def test_native_payloads_are_separate_from_workers_and_unrelated_or_login_processes(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "state"
            cwd = state / "worktrees/native-run"
            cwd.mkdir(parents=True)
            proc = Path(tmp) / "proc"
            self.process(proc, 12, "codex", cwd)
            self.process(proc, 13, "grok", cwd, ["/bin/grok", "--prompt-file", "prompt.md"])
            self.process(proc, 14, "codex", cwd, ["/bin/codex", "login", "status"])
            self.process(proc, 15, "codex", Path(tmp))
            result = doctor.provider_payloads(state, ["codex", "grok", "devin"], proc)
            self.assertEqual((result["codex"]["running"], result["codex"]["pids"]), (1, [12]))
            self.assertEqual(result["grok"]["running"], 1)
            self.assertIsNone(result["devin"]["running"])

    def test_missing_probe_and_live_unreadable_identity_stay_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertIsNone(doctor.provider_payloads(root, ["codex"], root / "missing")["codex"]["running"])
            cwd = root / "worktrees/run"
            cwd.mkdir(parents=True)
            proc = root / "proc"
            entry = self.process(proc, 12, "codex", cwd)
            (entry / "stat").unlink()
            self.assertIsNone(doctor.provider_payloads(root, ["codex"], proc)["codex"]["running"])

    def test_pid_reuse_is_unknown_instead_of_a_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cwd = root / "worktrees/run"
            cwd.mkdir(parents=True)
            proc = root / "proc"
            entry = self.process(proc, 12, "codex", cwd)
            stat = (entry / "stat").read_text()
            original = Path.read_text
            calls = []
            def read(path, *args, **kwargs):
                if path == entry / "stat":
                    calls.append(path)
                    return stat if len(calls) == 1 else stat.replace("100", "101")
                return original(path, *args, **kwargs)
            with mock.patch.object(Path, "read_text", read):
                result = doctor.provider_payloads(root, ["codex"], proc)
            self.assertFalse(result["codex"]["known"])
            self.assertIsNone(result["codex"]["running"])

    def test_invalid_process_name_is_unknown_without_aborting_observation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cwd = root / "worktrees/run"
            cwd.mkdir(parents=True)
            proc = root / "proc"
            entry = self.process(proc, 12, "codex", cwd)
            (entry / "comm").write_bytes(b"\xff")
            result = doctor.provider_payloads(root, ["codex", "grok"], proc)
            self.assertIsNone(result["codex"]["running"])
            self.assertIsNone(result["grok"]["running"])

    def test_binding_payloads_share_the_host_census_but_unmanaged_neighbors_do_not(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            binding = root / "bindings/logyourbody/worktrees/run"
            other = root / "bindings/logyourbody/unmanaged"
            binding.mkdir(parents=True)
            other.mkdir()
            proc = root / "proc"
            self.process(proc, 12, "codex", binding)
            self.process(proc, 13, "grok", binding, ["/bin/grok", "--prompt-file", "prompt.md"])
            self.process(proc, 14, "codex", other)
            result = doctor.provider_payloads(root, ["codex", "grok"], proc)
            self.assertEqual(result["codex"]["pids"], [12])
            self.assertEqual(result["grok"]["pids"], [13])

    def test_grok_models_is_health_even_inside_a_managed_worktree(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cwd = root / "worktrees/run"
            cwd.mkdir(parents=True)
            proc = root / "proc"
            self.process(proc, 12, "grok", cwd, ["/bin/grok", "models"])
            result = doctor.provider_payloads(root, ["grok"], proc)
            self.assertEqual(result["grok"]["running"], 0)

if __name__ == "__main__":
    unittest.main()


class RedDispatchAlertTest(unittest.TestCase):
    """JOV-8931: a relayed red check with no lane claim inside the grace window alerts."""

    NOW = 1_000_000_000.0

    def write_ledger(self, state, rows):
        ledger = state / "runs/red-dispatch.jsonl"
        ledger.parent.mkdir(parents=True, exist_ok=True)
        with ledger.open("a") as handle:
            for row in rows:
                handle.write(json.dumps(row) + "\n")

    def dispatched_row(self, *, pr=22868, sha="a" * 40, red_epoch=None):
        return {"schema": "jovie-lane-red-dispatch/v1", "status": "dispatched", "pr": pr,
                "sha": sha, "runId": 987654, "runAttempt": 2,
                "redAt": "2026-10-23T18:27:30Z", "redAtEpoch": red_epoch,
                "dispatchedAt": "2026-10-23T18:28:00Z", "claimAt": None,
                "provider": "codex", "reason": None}

    def test_summary_flags_dispatch_rows_past_the_grace_window(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.write_ledger(state, [
                self.dispatched_row(red_epoch=self.NOW - 60),
                self.dispatched_row(pr=1, sha="b" * 40, red_epoch=self.NOW - 300),
            ])
            summary = doctor.red_dispatch_summary(state, self.NOW)
            self.assertEqual(summary["graceS"], 180)
            self.assertEqual([row["pr"] for row in summary["unclaimed"]], [1])
            self.assertEqual(summary["unclaimed"][0]["ageS"], 300)

    def test_summary_clears_once_a_claim_row_lands(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.write_ledger(state, [
                self.dispatched_row(pr=1, sha="b" * 40, red_epoch=self.NOW - 300),
                {"status": "claimed", "pr": 1, "sha": "b" * 40, "claimAt": "2026-10-23T18:30:00Z"},
            ])
            self.assertEqual(doctor.red_dispatch_summary(state, self.NOW)["unclaimed"], [])

    def test_summary_tolerates_missing_or_corrupt_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.assertEqual(doctor.red_dispatch_summary(state, self.NOW),
                             {"graceS": 180, "unclaimed": []})
            (state / "runs").mkdir(parents=True)
            (state / "runs/red-dispatch.jsonl").write_text("not json\n")
            self.assertEqual(doctor.red_dispatch_summary(state, self.NOW)["unclaimed"], [])

    def test_judge_raises_the_alert_with_a_stable_key_per_pr(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.write_ledger(state, [self.dispatched_row(pr=1, sha="b" * 40, red_epoch=self.NOW - 300)])
            obs = {"now": self.NOW, "redDispatch": doctor.red_dispatch_summary(state, self.NOW)}
            alerts = doctor.judge(obs)
            self.assertIn("red-dispatch-unclaimed:1", alerts)
            self.assertIn("unclaimed 300s after red_at", alerts["red-dispatch-unclaimed:1"])

    def test_judge_stays_quiet_inside_the_grace_window(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.write_ledger(state, [self.dispatched_row(red_epoch=self.NOW - 60)])
            obs = {"now": self.NOW, "redDispatch": doctor.red_dispatch_summary(state, self.NOW)}
            self.assertFalse(doctor.judge(obs))


class QuotaDeferredHeadsTests(unittest.TestCase):
    def test_alert_names_the_heads_and_is_silent_at_zero(self):
        deferred = {"value": 2, "heads": [{"number": 7, "ageMinutes": 90}, {"number": 8, "ageMinutes": 70}]}
        alert = doctor.judge(obs(quotaDeferredHeads=deferred))["quota-deferred-heads"]
        self.assertIn("2 open PR heads", alert)
        self.assertIn("#7 90m", alert)
        self.assertNotIn("quota-deferred-heads", doctor.judge(obs(quotaDeferredHeads={"value": 0, "heads": []})))
        self.assertNotIn("quota-deferred-heads", doctor.judge(obs()))

    def test_sampler_parses_exit_one_caches_and_keeps_a_stale_read_on_failure(self):
        import tempfile
        from types import SimpleNamespace
        out = json.dumps({"metric": "quota_deferred_heads_older_than_1h", "value": 1,
                          "heads": [{"number": 9, "ageMinutes": 80}]})
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            return SimpleNamespace(returncode=1, stdout=out, stderr="")
        with tempfile.TemporaryDirectory() as tmp:
            signal, error = doctor.sample_quota_deferred_heads(Path(tmp), 1000.0, run)
            self.assertEqual((signal["value"], error), (1, None))
            again, _ = doctor.sample_quota_deferred_heads(Path(tmp), 1100.0, run)
            self.assertEqual(len(calls), 1, "a fresh cache is not re-read")
            self.assertEqual(again["value"], 1)
            broken = lambda *a, **k: SimpleNamespace(returncode=2, stdout="", stderr="boom")
            stale, error = doctor.sample_quota_deferred_heads(Path(tmp), 5000.0, broken)
            self.assertEqual(stale["value"], 1)
            self.assertIn("boom", error)


class QuotaDrainTests(unittest.TestCase):
    ALERT = {"bucket": "github-token", "remaining": 3000, "ratePerMinute": 200,
             "emptyAt": "2026-10-26T01:00:00.000Z", "resetAt": "2026-10-26T01:35:00.000Z", "minutesEarly": 35}

    def test_alert_names_the_bucket_and_is_silent_without_a_projection(self):
        alert = doctor.judge(obs(quotaDrain={"alerts": [self.ALERT]}))["quota-drain"]
        self.assertIn("github-token has 3000 left at ~200/min", alert)
        self.assertIn("35 min before its reset", alert)
        self.assertNotIn("quota-drain", doctor.judge(obs(quotaDrain={"alerts": []})))
        self.assertNotIn("quota-drain", doctor.judge(obs()))

    def test_sampler_parses_exit_three_caches_and_keeps_a_stale_read_on_failure(self):
        import tempfile
        from types import SimpleNamespace
        report = {"schema": "jovie-actions-quota-drain/v1", "generatedAt": "x", "alerts": [self.ALERT]}
        out = "::notice::ignored\n".replace("::notice::ignored\n", "") + json.dumps(report) + "\n::warning title=x::y\n"
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            return SimpleNamespace(returncode=3, stdout=out, stderr="")
        with tempfile.TemporaryDirectory() as tmp:
            signal, error = doctor.sample_quota_drain(Path(tmp), 1000.0, run)
            self.assertEqual((len(signal["alerts"]), error), (1, None))
            self.assertEqual(calls[0][2:], ["drain", "--json", "--hours", "1"])
            again, _ = doctor.sample_quota_drain(Path(tmp), 1100.0, run)
            self.assertEqual(len(calls), 1, "a fresh cache is not re-read")
            self.assertEqual(again["alerts"][0]["bucket"], "github-token")
            broken = lambda *a, **k: SimpleNamespace(returncode=2, stdout="", stderr="boom")
            stale, error = doctor.sample_quota_drain(Path(tmp), 5000.0, broken)
            self.assertEqual(len(stale["alerts"]), 1)
            self.assertIn("boom", error)
