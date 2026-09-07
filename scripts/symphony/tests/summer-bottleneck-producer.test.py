#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from datetime import datetime, timezone
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[3]
PATH = ROOT / "scripts/symphony/summer_bottleneck_producer.py"
SPEC = importlib.util.spec_from_file_location("summer_bottleneck_producer", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)

GATE_PATH = ROOT / "scripts/symphony/gem-priority-gate.py"
GATE_SPEC = importlib.util.spec_from_file_location("gem_priority_gate", GATE_PATH)
GATE = importlib.util.module_from_spec(GATE_SPEC)
assert GATE_SPEC and GATE_SPEC.loader
GATE_SPEC.loader.exec_module(GATE)

MAIN_SHA = "a" * 40
RUNTIME_SHA = "b" * 40
PRODUCTION_SHA = "c" * 40
NOW = datetime(2026, 9, 5, 19, 30, tzinfo=timezone.utc)


def sources():
    at = "2026-09-05T19:29:00Z"
    classes = [
        {
            "id": class_id,
            "state": "partial",
            "blockedSince": "2026-09-05T18:00:00Z",
            "impact": index + 1,
            "owner": "ci-owner",
            "handle": f"audit:{index}",
        }
        for index, class_id in enumerate(
            (
                "merge-group-flake-baseline-ratchet",
                "controller-cascade-coalescing",
                "auto-enroll-self-cancel-churn",
                "controller-check-run-pagination-cap",
                "obsolete-unaffected-native-lanes",
                "affected-only-unit-selection",
            )
        )
    ]
    fleet = {
        "schema": "jovie-fleet-gate/v1",
        "observedAt": at,
        "signals": {
            "closureHealth": {
                "schema": "jovie-closure-health/v1",
                "status": "red",
                "openPrs": 49,
                "nativeQueueCount": 1,
            },
            "queue": {
                "greenReadyPrs": 4,
                "nativeQueueCount": 1,
                "status": "known",
                "source": "live",
            },
            "lease": {
                "observedAt": at,
                "status": "ok",
                "capacity": {"available": 0},
            },
            "main": {"sha": MAIN_SHA},
            "production": {"deployedSha": PRODUCTION_SHA},
            "concurrencyEvidence": {
                "accepted": True,
                "runtime": {
                    "schema": "symphony-runtime-identity/v1",
                    "service": "symphony-elixir.service",
                    "sourceRevision": RUNTIME_SHA,
                },
            },
            "ciAudit": {
                "schema": "jovie-ci-bottleneck-audit/v1",
                "observedAt": at,
                "sourceRevision": MAIN_SHA,
                "sourceDigest": "d" * 64,
                "classes": classes,
            },
        },
    }
    runtime = {
        "generated_at": at,
        "sourceRevision": RUNTIME_SHA,
        "running": [{"issue_identifier": "JOV-1"}],
        "retrying": [],
        "blocked": [{"blocked_at": "2026-09-05T18:56:57Z"}],
    }
    return fleet, runtime


class ProducerTests(unittest.TestCase):
    def test_composes_current_authorities_without_invented_timestamps(self):
        snapshot = MODULE.compose_snapshot(*sources(), NOW)
        signals = snapshot["signals"]
        self.assertEqual(snapshot["sourceVersion"], MAIN_SHA)
        self.assertEqual(signals["closure"]["openPullRequests"], 49)
        self.assertEqual(signals["queue"]["eligibleCleanPrs"], 4)
        self.assertEqual(signals["release"]["productionSha"], PRODUCTION_SHA)
        self.assertEqual(signals["runner"]["queuedWork"], 2)
        self.assertIsNone(signals["closure"]["blockedSince"])
        self.assertEqual(
            signals["runner"]["capacitySource"]["sourceRevision"], MAIN_SHA
        )
        self.assertEqual(
            signals["runner"]["workSource"]["sourceRevision"], RUNTIME_SHA
        )
        self.assertEqual(len(signals["ciAudit"]["classes"]), 6)

    def test_semantically_unchanged_source_keeps_event_id(self):
        left = MODULE.compose_snapshot(*sources(), NOW)
        later = datetime(2026, 9, 5, 19, 31, tzinfo=timezone.utc)
        right = MODULE.compose_snapshot(*sources(), later)
        self.assertEqual(left["eventId"], right["eventId"])

    def test_rejects_stale_or_unversioned_authorities(self):
        fleet, runtime = sources()
        fleet["observedAt"] = "2026-09-05T17:00:00Z"
        with self.assertRaisesRegex(ValueError, "stale"):
            MODULE.compose_snapshot(fleet, runtime, NOW)

        fleet, runtime = sources()
        fleet["signals"]["concurrencyEvidence"]["runtime"]["sourceRevision"] = (
            "not-a-sha"
        )
        snapshot = MODULE.compose_snapshot(fleet, runtime, NOW)
        self.assertIsNone(snapshot["signals"]["runner"]["sourceRevision"])
        self.assertIsNone(snapshot["signals"]["runner"]["queuedWork"])

        fleet, runtime = sources()
        fleet["signals"]["ciAudit"]["sourceDigest"] = "bad"
        with self.assertRaisesRegex(ValueError, "exact digest"):
            MODULE.compose_snapshot(fleet, runtime, NOW)

        fleet, runtime = sources()
        del fleet["signals"]["ciAudit"]
        snapshot = MODULE.compose_snapshot(fleet, runtime, NOW)
        self.assertIsNone(snapshot["signals"]["ciAudit"])

    def test_rejects_malformed_authority_contracts(self):
        cases = [
            ("fleet object", lambda fleet, _runtime: fleet.clear(), "schema"),
            (
                "queue source",
                lambda fleet, _runtime: fleet["signals"]["queue"].__setitem__(
                    "source", "cache"
                ),
                "known live",
            ),
            (
                "lease status",
                lambda fleet, _runtime: fleet["signals"]["lease"].__setitem__(
                    "status", "unknown"
                ),
                "not healthy",
            ),
            (
                "closure status",
                lambda fleet, _runtime: fleet["signals"]["closureHealth"].__setitem__(
                    "status", "unknown"
                ),
                "closure status",
            ),
            (
                "negative count",
                lambda fleet, _runtime: fleet["signals"]["queue"].__setitem__(
                    "greenReadyPrs", -1
                ),
                "nonnegative integer",
            ),
            (
                "runtime list",
                lambda _fleet, runtime: runtime.__setitem__("running", None),
                "runtime running",
            ),
            (
                "runtime item",
                lambda _fleet, runtime: runtime.__setitem__("blocked", ["bad"]),
                "invalid item",
            ),
            (
                "future blocked time",
                lambda _fleet, runtime: runtime.__setitem__(
                    "blocked", [{"blocked_at": "2026-09-05T20:00:00Z"}]
                ),
                "in the future",
            ),
        ]
        for name, mutate, message in cases:
            with self.subTest(name=name):
                fleet, runtime = sources()
                mutate(fleet, runtime)
                with self.assertRaisesRegex((TypeError, ValueError), message):
                    MODULE.compose_snapshot(fleet, runtime, NOW)

        fleet, runtime = sources()
        with self.assertRaisesRegex(ValueError, "timezone-aware"):
            MODULE.compose_snapshot(fleet, runtime, NOW.replace(tzinfo=None))

    def test_rejects_malformed_versioned_ci_audit(self):
        cases = [
            ("schema", lambda audit: audit.__setitem__("schema", "v0"), "schema"),
            (
                "revision",
                lambda audit: audit.__setitem__("sourceRevision", RUNTIME_SHA),
                "does not match main",
            ),
            ("classes", lambda audit: audit.__setitem__("classes", []), "incomplete"),
            (
                "class object",
                lambda audit: audit["classes"].__setitem__(0, "bad"),
                "not an object",
            ),
            (
                "class id",
                lambda audit: audit["classes"][0].__setitem__("id", "unknown"),
                "not canonical",
            ),
            (
                "class state",
                lambda audit: audit["classes"][0].__setitem__("state", "unknown"),
                "state",
            ),
            (
                "class impact",
                lambda audit: audit["classes"][0].__setitem__("impact", 0),
                "impact",
            ),
            (
                "class owner",
                lambda audit: audit["classes"][0].__setitem__("owner", ""),
                "owner",
            ),
            (
                "class handle",
                lambda audit: audit["classes"][0].__setitem__("handle", ""),
                "handle",
            ),
        ]
        for name, mutate, message in cases:
            with self.subTest(name=name):
                fleet, runtime = sources()
                mutate(fleet["signals"]["ciAudit"])
                with self.assertRaisesRegex((TypeError, ValueError), message):
                    MODULE.compose_snapshot(fleet, runtime, NOW)

    def test_canonical_gate_and_runtime_shapes_emit_explicit_unknowns(self):
        at = "2026-09-05T19:29:00Z"
        args = GATE.argparse.Namespace(
            repo="JovieInc/Jovie",
            queue_target=15,
            production_url="https://jov.ie/api/health/deploy",
            symphony_url=MODULE.RUNTIME_URL,
            lease_guard_bin="symphony-lease-guard",
            state_dir=ROOT / ".test-state",
            integrity_receipt=None,
            concurrency_evidence=None,
            independent_review_receipt=None,
        )
        observations = {
            "observe_main": {"status": "green", "sha": MAIN_SHA},
            "observe_production": {
                "status": "green",
                "deployedSha": PRODUCTION_SHA,
            },
            "observe_controller": {"status": "green"},
            "observe_integrity": {"status": "clear"},
            "observe_queue": {
                "repository": "JovieInc/Jovie",
                "status": "known",
                "eligiblePrs": 4,
                "greenReadyPrs": 4,
                "nativeQueueCount": 1,
                "target": 15,
                "source": "live",
            },
            "observe_closure_health": {
                "schema": "jovie-closure-health/v1",
                "repository": "JovieInc/Jovie",
                "status": "red",
                "openPrs": 49,
                "nativeQueueCount": 1,
                "authority": "Summer",
                "newIssueIntakeAllowed": False,
                "promotionContinues": True,
                "remediationContinues": True,
                "reasons": [],
            },
            "observe_concurrency": {
                "schema": GATE.CONCURRENCY_SCHEMA,
                "accepted": False,
                "reason": "capacity-evidence-missing",
            },
            "refresh_independent_review_receipt": {"status": "missing"},
            "observe_lease": {
                "status": "ok",
                "observedAt": at,
                "capacity": {"available": 0},
            },
        }
        patches = [mock.patch.object(GATE, name, return_value=value) for name, value in observations.items()]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

        observed = GATE.observe_signals(args, NOW)
        self.assertNotIn("ciAudit", observed)
        receipt = GATE.evaluate(observed, GATE.isoformat(NOW))
        runtime = {
            "generated_at": at,
            "running": [{"issue_identifier": "JOV-1"}],
            "retrying": [],
            "blocked": [],
        }
        snapshot = MODULE.compose_snapshot(receipt, runtime, NOW)
        runner = snapshot["signals"]["runner"]
        self.assertIsNone(snapshot["signals"]["ciAudit"])
        self.assertIsNone(runner["sourceRevision"])
        self.assertIsNone(runner["workSource"]["sourceRevision"])
        self.assertIsNone(runner["queuedWork"])

    def test_freshness_metadata_does_not_change_semantic_event_identity(self):
        left_fleet, left_runtime = sources()
        left = MODULE.compose_snapshot(left_fleet, left_runtime, NOW)
        right_fleet, right_runtime = sources()
        later = "2026-09-05T19:30:00Z"
        right_fleet["observedAt"] = later
        right_fleet["signals"]["lease"]["observedAt"] = later
        right_fleet["signals"]["ciAudit"]["observedAt"] = later
        right_runtime["generated_at"] = later
        right = MODULE.compose_snapshot(
            right_fleet,
            right_runtime,
            datetime(2026, 9, 5, 19, 31, tzinfo=timezone.utc),
        )
        self.assertEqual(left["eventId"], right["eventId"])

    def test_submit_is_one_shot_and_event_bound(self):
        snapshot = MODULE.compose_snapshot(*sources(), NOW)
        calls = []

        class Response:
            status = 202

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return json.dumps(
                    {
                        "ok": True,
                        "eve": {
                            "receipt": {
                                "eventId": snapshot["eventId"],
                                "decision": "accepted",
                            }
                        },
                    }
                ).encode()

        def opener(request, timeout):
            calls.append((request, timeout))
            return Response()

        result = MODULE.submit(snapshot, "opaque-secret", opener)
        self.assertTrue(result["ok"])
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0].full_url, MODULE.BRIDGE_URL)
        self.assertNotIn(b"opaque-secret", calls[0][0].data)

    def test_submit_rejects_missing_secret_or_non_success(self):
        snapshot = MODULE.compose_snapshot(*sources(), NOW)
        with self.assertRaisesRegex(ValueError, "CRON_SECRET"):
            MODULE.submit(snapshot, "")

        class Response:
            status = 500

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return b'{"secret":"do-not-reflect"}'

        with self.assertRaisesRegex(ValueError, "non-success"):
            MODULE.submit(
                snapshot,
                "opaque-secret",
                lambda *_args, **_kwargs: Response(),
            )

    def test_submit_rejects_oversized_or_unbound_payloads(self):
        snapshot = MODULE.compose_snapshot(*sources(), NOW)
        oversized = {**snapshot, "padding": "x" * MODULE.MAX_BYTES}
        with self.assertRaisesRegex(ValueError, "snapshot exceeds"):
            MODULE.submit(oversized, "opaque-secret")

        class Response:
            status = 202

            def __init__(self, body):
                self.body = body

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return self.body

        with self.assertRaisesRegex(ValueError, "response exceeds"):
            MODULE.submit(
                snapshot,
                "opaque-secret",
                lambda *_args, **_kwargs: Response(b"x" * (MODULE.MAX_BYTES + 1)),
            )
        invalid = json.dumps(
            {"ok": True, "eve": {"receipt": {"eventId": "wrong-event"}}}
        ).encode()
        with self.assertRaisesRegex(ValueError, "invalid event-bound"):
            MODULE.submit(
                snapshot,
                "opaque-secret",
                lambda *_args, **_kwargs: Response(invalid),
            )

    def test_reads_only_a_complete_explicit_source_bundle(self):
        fleet, runtime = sources()
        with tempfile.TemporaryDirectory() as directory:
            bundle = pathlib.Path(directory) / "bundle.json"
            bundle.write_text(json.dumps({"fleet": fleet, "runtime": runtime}))
            self.assertEqual(MODULE.read_sources(str(bundle)), (fleet, runtime))
            bundle.write_text("{}")
            with self.assertRaisesRegex(ValueError, "source bundle"):
                MODULE.read_sources(str(bundle))

        with mock.patch.object(
            MODULE.sys,
            "stdin",
            io.StringIO(json.dumps({"fleet": fleet, "runtime": runtime})),
        ):
            self.assertEqual(MODULE.read_sources("-"), (fleet, runtime))

    def test_reads_live_authorities_with_a_bounded_runtime_response(self):
        fleet, runtime = sources()

        class Response:
            def __init__(self, body):
                self.body = body

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return self.body

        with tempfile.TemporaryDirectory() as directory:
            fleet_path = pathlib.Path(directory) / "latest.json"
            fleet_path.write_text(json.dumps(fleet))
            with mock.patch.object(MODULE, "FLEET_PATH", fleet_path), mock.patch.object(
                MODULE.urllib.request,
                "urlopen",
                return_value=Response(json.dumps(runtime).encode()),
            ):
                self.assertEqual(MODULE.read_sources(None), (fleet, runtime))
            with mock.patch.object(MODULE, "FLEET_PATH", fleet_path), mock.patch.object(
                MODULE.urllib.request,
                "urlopen",
                return_value=Response(b"x" * (MODULE.MAX_BYTES + 1)),
            ):
                with self.assertRaisesRegex(ValueError, "response exceeds"):
                    MODULE.read_sources(None)


if __name__ == "__main__":
    unittest.main()
