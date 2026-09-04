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

SHA = "a" * 40
PROD = "b" * 40
NOW = datetime(2026, 9, 4, 22, 30, tzinfo=timezone.utc)


def sources():
    at = "2026-09-04T22:29:00Z"
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
            "queue": {"greenReadyPrs": 4, "status": "known", "source": "live"},
            "lease": {
                "observedAt": at,
                "status": "ok",
                "capacity": {"available": 0},
            },
            "main": {"sha": SHA},
            "production": {"deployedSha": PROD},
        },
    }
    runtime = {
        "generated_at": at,
        "running": [],
        "retrying": [],
        "blocked": [{"blocked_at": "2026-09-04T18:56:57Z"}],
    }
    return fleet, runtime


class ProducerTests(unittest.TestCase):
    def test_composes_exact_truth_without_invented_zeroes(self):
        snapshot = MODULE.compose_snapshot(*sources(), NOW)
        self.assertEqual(snapshot["sourceVersion"], SHA)
        self.assertEqual(snapshot["signals"]["closure"]["openPullRequests"], 49)
        self.assertEqual(snapshot["signals"]["queue"]["eligibleCleanPrs"], 4)
        self.assertEqual(snapshot["signals"]["queue"]["queuedPrs"], 1)
        self.assertEqual(snapshot["signals"]["release"]["productionSha"], PROD)
        self.assertEqual(snapshot["signals"]["release"]["unverifiedMerges"], 1)
        self.assertEqual(snapshot["signals"]["runner"]["queuedWork"], 1)
        self.assertEqual(len(snapshot["signals"]["ciAudit"]["classes"]), 6)

    def test_semantically_unchanged_source_keeps_event_id(self):
        left = MODULE.compose_snapshot(*sources(), NOW)
        later = datetime(2026, 9, 4, 22, 31, tzinfo=timezone.utc)
        right = MODULE.compose_snapshot(*sources(), later)
        self.assertEqual(left["eventId"], right["eventId"])

    def test_rejects_stale_or_malformed_authorities(self):
        fleet, runtime = sources()
        fleet["observedAt"] = "2026-09-04T20:00:00Z"
        with self.assertRaisesRegex(ValueError, "stale"):
            MODULE.compose_snapshot(fleet, runtime, NOW)
        fleet, runtime = sources()
        runtime["blocked"] = None
        with self.assertRaisesRegex((ValueError, TypeError), "runtime blocked"):
            MODULE.compose_snapshot(fleet, runtime, NOW)

        fleet, runtime = sources()
        fleet["schema"] = "wrong"
        with self.assertRaisesRegex(ValueError, "schema"):
            MODULE.compose_snapshot(fleet, runtime, NOW)

        fleet, runtime = sources()
        fleet["signals"]["lease"]["capacity"] = None
        with self.assertRaisesRegex((ValueError, TypeError), "lease capacity"):
            MODULE.compose_snapshot(fleet, runtime, NOW)

        with self.assertRaisesRegex(ValueError, "timezone-aware"):
            MODULE.compose_snapshot(*sources(), datetime(2026, 9, 4, 22, 30))  # noqa: DTZ001

        fleet, runtime = sources()
        fleet["signals"]["queue"]["source"] = "cache"
        with self.assertRaisesRegex(ValueError, "known live"):
            MODULE.compose_snapshot(fleet, runtime, NOW)

        fleet, runtime = sources()
        fleet["signals"]["lease"]["status"] = "degraded"
        with self.assertRaisesRegex(ValueError, "lease authority"):
            MODULE.compose_snapshot(fleet, runtime, NOW)

    def test_submit_is_one_shot_and_event_bound(self):
        snapshot = MODULE.compose_snapshot(*sources(), NOW)
        calls = []

        class Response:
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

        result = MODULE.submit(snapshot, "opaque", opener)
        self.assertTrue(result["ok"])
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0].full_url, MODULE.BRIDGE_URL)
        self.assertNotIn(b"opaque", calls[0][0].data)

    def test_submit_rejects_missing_secret_and_mismatched_receipt(self):
        snapshot = MODULE.compose_snapshot(*sources(), NOW)
        with self.assertRaisesRegex(ValueError, "CRON_SECRET"):
            MODULE.submit(snapshot, "")

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return b'{"ok":true,"eve":{"receipt":{"eventId":"wrong"}}}'

        with self.assertRaisesRegex(ValueError, "event-bound"):
            MODULE.submit(snapshot, "opaque", lambda *_args, **_kwargs: Response())

        class NonObjectResponse(Response):
            def read(self, _limit):
                return b"[]"

        with self.assertRaisesRegex(TypeError, "event-bound"):
            MODULE.submit(
                snapshot, "opaque", lambda *_args, **_kwargs: NonObjectResponse()
            )

        class OversizedResponse(Response):
            def read(self, _limit):
                return b"x" * (MODULE.MAX_BYTES + 1)

        with self.assertRaisesRegex(ValueError, "response exceeds"):
            MODULE.submit(
                snapshot, "opaque", lambda *_args, **_kwargs: OversizedResponse()
            )

        oversized = {"eventId": snapshot["eventId"], "payload": "x" * MODULE.MAX_BYTES}
        with self.assertRaisesRegex(ValueError, "snapshot exceeds"):
            MODULE.submit(oversized, "opaque", lambda *_args, **_kwargs: Response())

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
