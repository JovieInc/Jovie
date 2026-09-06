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
        runtime["sourceRevision"] = "not-a-sha"
        with self.assertRaisesRegex(ValueError, "exact SHA"):
            MODULE.compose_snapshot(fleet, runtime, NOW)

        fleet, runtime = sources()
        fleet["signals"]["ciAudit"]["sourceDigest"] = "bad"
        with self.assertRaisesRegex(ValueError, "exact digest"):
            MODULE.compose_snapshot(fleet, runtime, NOW)

        fleet, runtime = sources()
        del fleet["signals"]["ciAudit"]
        with self.assertRaisesRegex((ValueError, TypeError), "CI audit"):
            MODULE.compose_snapshot(fleet, runtime, NOW)

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


if __name__ == "__main__":
    unittest.main()
