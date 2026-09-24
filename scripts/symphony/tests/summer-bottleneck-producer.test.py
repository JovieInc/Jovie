#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import io
import json
import pathlib
import tempfile
import sys
import subprocess
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[3]
PATH = ROOT / "scripts/symphony/summer_bottleneck_producer.py"
SPEC = importlib.util.spec_from_file_location("summer_bottleneck_producer", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.path.insert(0, str(PATH.parent))
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
        observed_service = {"schema": "gem-service-attestation/v1", "observedAt": "2026-09-05T19:29:00Z",
                            "service": "symphony-elixir.service", "active": True, "healthy": True,
                            "sourceRevision": RUNTIME_SHA, "listener": {"port": 4041, "boundToService": True}}
        snapshot = MODULE.compose_snapshot(*sources(), NOW, observed_service)
        signals = snapshot["signals"]
        self.assertEqual(snapshot["sourceVersion"], MAIN_SHA)
        self.assertEqual(signals["closure"]["openPullRequests"], 49)
        self.assertEqual(signals["queue"]["eligibleCleanPrs"], 4)
        self.assertEqual(signals["release"]["productionSha"], PRODUCTION_SHA)
        self.assertEqual(signals["runner"]["queuedWork"], 2)
        self.assertEqual(signals["closure"]["blockedSince"], "2026-09-05T19:29:00Z")
        self.assertEqual(signals["release"]["blockedSince"], "2026-09-05T19:29:00Z")
        self.assertEqual(
            signals["runner"]["capacitySource"]["sourceRevision"], MAIN_SHA
        )
        self.assertEqual(
            signals["runner"]["workSource"]["sourceRevision"], RUNTIME_SHA
        )
        self.assertEqual(len(signals["ciAudit"]["classes"]), 6)

    def test_composes_when_queue_native_queue_count_is_null(self):
        fleet, runtime = sources()
        fleet["signals"]["queue"]["nativeQueueCount"] = None
        fleet["signals"]["closureHealth"]["nativeQueueCount"] = 0
        snapshot = MODULE.compose_snapshot(fleet, runtime, NOW)
        self.assertEqual(snapshot["signals"]["queue"]["queuedPrs"], 0)
        self.assertEqual(snapshot["signals"]["closure"]["openPullRequests"], 49)

    def test_copies_latest_merge_as_closure_blocked_since_when_merge_progress_stalled(self):
        fleet, runtime = sources()
        fleet["signals"]["closureHealth"]["reasons"] = ["no-merge-progress-over-1h"]
        fleet["signals"]["closureHealth"]["latestMergeAt"] = "2026-09-05T16:31:49Z"
        snapshot = MODULE.compose_snapshot(fleet, runtime, NOW)
        self.assertEqual(
            snapshot["signals"]["closure"]["blockedSince"],
            "2026-09-05T16:31:49Z",
        )

    def test_stamps_fleet_observation_when_adverse_signals_lack_blocked_since(self):
        fleet, runtime = sources()
        snapshot = MODULE.compose_snapshot(fleet, runtime, NOW)
        fleet_at = "2026-09-05T19:29:00Z"
        self.assertEqual(snapshot["signals"]["closure"]["blockedSince"], fleet_at)
        self.assertEqual(snapshot["signals"]["release"]["blockedSince"], fleet_at)

        fleet, runtime = sources()
        fleet["signals"]["closureHealth"]["status"] = "healthy"
        fleet["signals"]["production"]["deployedSha"] = MAIN_SHA
        healthy = MODULE.compose_snapshot(fleet, runtime, NOW)
        self.assertIsNone(healthy["signals"]["closure"]["blockedSince"])
        self.assertIsNone(healthy["signals"]["release"]["blockedSince"])

        fleet, runtime = sources()
        fleet["signals"]["closureHealth"]["blockedSince"] = "2026-09-05T18:10:00Z"
        fleet["signals"]["production"]["blockedSince"] = "2026-09-05T17:40:00Z"
        preserved = MODULE.compose_snapshot(fleet, runtime, NOW)
        self.assertEqual(
            preserved["signals"]["closure"]["blockedSince"],
            "2026-09-05T18:10:00Z",
        )
        self.assertEqual(
            preserved["signals"]["release"]["blockedSince"],
            "2026-09-05T17:40:00Z",
        )

    def test_compose_rejects_all_zero_main_sha_when_mirror_is_unavailable(self):
        fleet, runtime = sources()
        fleet["signals"]["main"]["sha"] = "0" * 40
        with mock.patch.dict(
            MODULE.os.environ,
            {"JOVIE_CONFIGURATION_SOURCE_ROOT": "/no/such/jovie.mirror.git"},
            clear=False,
        ):
            with self.assertRaisesRegex(ValueError, "main-sha-unavailable"):
                MODULE.compose_snapshot(fleet, runtime, NOW)

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
            "observe_ci_audit": None,
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
        self.assertIsNone(observed["ciAudit"])
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


    def test_resolve_main_sha_falls_back_to_refs_heads_main_not_zeros(self):
        with tempfile.TemporaryDirectory() as directory:
            git_dir = pathlib.Path(directory) / "mirror.git"
            subprocess = __import__("subprocess")
            subprocess.check_call(
                ["git", "init", "--bare", str(git_dir)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            work = pathlib.Path(directory) / "work"
            work.mkdir()
            subprocess.check_call(
                ["git", "clone", str(git_dir), str(work)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.check_call(
                ["git", "-C", str(work), "checkout", "-b", "main"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            (work / "README").write_text("x\n")
            subprocess.check_call(
                ["git", "-C", str(work), "add", "README"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.check_call(
                [
                    "git",
                    "-C",
                    str(work),
                    "-c",
                    "user.email=ci@example.com",
                    "-c",
                    "user.name=ci",
                    "commit",
                    "-m",
                    "init",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.check_call(
                ["git", "-C", str(work), "push", "origin", "HEAD:refs/heads/main"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            expected = subprocess.check_output(
                ["git", "--git-dir", str(git_dir), "rev-parse", "refs/heads/main"],
                text=True,
            ).strip()
            with mock.patch.dict(
                MODULE.os.environ,
                {"JOVIE_CONFIGURATION_SOURCE_ROOT": str(git_dir)},
                clear=False,
            ):
                self.assertEqual(
                    MODULE.resolve_main_sha({"sha": "0" * 40}), expected
                )
                self.assertEqual(MODULE.resolve_main_sha({}), expected)
            with mock.patch.dict(
                MODULE.os.environ,
                {"JOVIE_CONFIGURATION_SOURCE_ROOT": str(pathlib.Path(directory) / "missing.git")},
                clear=False,
            ):
                with self.assertRaisesRegex(ValueError, "main-sha-unavailable"):
                    MODULE.resolve_main_sha({"sha": "0" * 40})
        self.assertEqual(MODULE.resolve_main_sha({"sha": MAIN_SHA}), MAIN_SHA)



class UpstreamObservationTests(unittest.TestCase):
    def shipping_evidence(self):
        fleet, runtime, evidence = self.evidence()
        runtime.update(counts={"running": 1, "retrying": 0, "blocked": 0},
                       running=[{"issue_id": "issue-1", "issue_identifier": "JOV-6586",
                                 "session_id": "session-1", "started_at": "2026-09-05T19:29:20Z",
                                 "last_message": "private worker content"}], retrying=[], blocked=[])
        evidence["stateDigest"] = MODULE.digest(runtime)
        return fleet, runtime, evidence

    def test_shipping_projection_keeps_identity_without_worker_content_or_authority(self):
        _, runtime, evidence = self.shipping_evidence()
        result = MODULE.shipping_runtime_observation(runtime, evidence, NOW)
        self.assertEqual(result["generation"], "f" * 64)
        self.assertEqual(result["invocationId"], "e" * 32)
        self.assertEqual(result["sourceRevision"], RUNTIME_SHA)
        self.assertEqual(result["stateDigest"], MODULE.digest(runtime))
        self.assertEqual(result["running"], [{"issueId": "issue-1", "identifier": "JOV-6586",
                                             "sessionId": "session-1", "startedAt": "2026-09-05T19:29:20Z"}])
        self.assertNotIn("private worker content", json.dumps(result))
        self.assertNotIn("acceptance", result)
        self.assertNotIn("terminal", result)

    def test_shipping_projection_rejects_fixtures_stale_proof_and_unknown_queue_shapes(self):
        _, runtime, evidence = self.shipping_evidence()
        for proof in [dict(evidence), {}, {**evidence, "stateDigest": "a" * 64}]:
            with self.assertRaises(ValueError): MODULE.shipping_runtime_observation(runtime, proof, NOW)
        with self.assertRaises(ValueError):
            MODULE.shipping_runtime_observation(runtime, evidence, NOW + timedelta(minutes=20))
        for change in [{"counts": {}}, {"running": None}, {"counts": {"running": 0}},
                       {"running": [{}]}, {"running": [{"issue_id": "id", "issue_identifier": ""}]}]:
            changed = {**runtime, **change}
            bound = copy.deepcopy(evidence)
            bound["stateDigest"] = MODULE.digest(changed)
            with self.subTest(change=change), self.assertRaises(ValueError):
                MODULE.shipping_runtime_observation(changed, bound, NOW)

    def test_shipping_cli_only_reads_existing_live_observer(self):
        values = self.shipping_evidence()
        with mock.patch.dict(MODULE.os.environ, {"GEM_SERVICE_ATTESTATION_MODE": "upstream-preservation"}, clear=True), \
             mock.patch.object(sys, "argv", ["producer", "--observe-shipping-runtime"]), \
             mock.patch.object(MODULE, "read_upstream_sources", return_value=values) as live, \
             mock.patch.object(MODULE, "submit") as submit, \
             mock.patch.object(MODULE, "load_existing_repair_reference") as repair, \
             mock.patch.object(MODULE, "datetime", wraps=datetime) as clock, \
             mock.patch("sys.stdout", new_callable=io.StringIO) as output:
            clock.now.return_value = NOW
            self.assertEqual(MODULE.main(), 0)
            self.assertEqual(json.loads(output.getvalue())["schema"], "symphony-shipping-runtime-observation/v1")
            live.assert_called_once_with()
            submit.assert_not_called()
            repair.assert_not_called()

    def test_shipping_cli_rejects_submit_bundle_and_legacy_combinations_before_reads(self):
        for mode, options in [("legacy", []), ("upstream-preservation", ["--submit"]),
                              ("upstream-preservation", ["--source-bundle", "fixture.json"])]:
            with mock.patch.dict(MODULE.os.environ, {"GEM_SERVICE_ATTESTATION_MODE": mode}, clear=True), \
                 mock.patch.object(sys, "argv", ["producer", "--observe-shipping-runtime", *options]), \
                 mock.patch.object(MODULE, "read_upstream_sources") as live:
                with self.assertRaisesRegex(ValueError, "read-only"): MODULE.main()
                live.assert_not_called()

    def evidence(self):
        fleet, runtime = sources()
        runtime["generated_at"] = "2026-09-05T19:29:31Z"
        row = {"schema": "symphony-upstream-preservation/v1", "mode": "upstream-preserved",
               "service": "symphony-elixir.service", "sourceRevision": RUNTIME_SHA,
               "observedAt": "2026-09-05T19:29:00Z", "activation": "not-activated", "admission": "unverified",
               "packageSha256": "a" * 64, "payloadManifestSha256": "b" * 64,
               "configurationBindingSha256": "c" * 64, "workflowSha256": "d" * 64,
               "invocationId": "e" * 32, "runtimeGeneration": "f" * 64}
        before = {**row, "observedAt": "2026-09-05T19:29:30Z"}
        after = {**row, "observedAt": "2026-09-05T19:29:40Z"}
        evidence = MODULE.LiveUpstreamObservation({"schema": MODULE.UPSTREAM_OBSERVATION_SCHEMA, "published": row,
                    "before": before, "after": after, "stateDigest": MODULE.digest(runtime)})
        return fleet, runtime, evidence

    def test_proven_source_and_work_count_remain_separate_from_admission(self):
        fleet, runtime, evidence = self.evidence()
        snapshot = MODULE.compose_snapshot(fleet, runtime, NOW, attestation=evidence)
        runner = snapshot["signals"]["runner"]
        self.assertEqual(runner["sourceRevision"], RUNTIME_SHA)
        self.assertEqual(runner["queuedWork"], 2)
        self.assertEqual(runner["workSource"]["schema"], "symphony-runtime-state/v1")
        self.assertEqual(runner["runtimeGeneration"], "f" * 64)
        self.assertEqual(runner["runtimeInvocationId"], "e" * 32)
        for key in ["providerEligibility", "downstreamHealth"]:
            self.assertEqual(snapshot["signals"]["admissions"][key]["state"], "UNKNOWN")
        self.assertEqual(evidence["published"]["admission"], "unverified")
        self.assertIsNone(MODULE.attested_runtime_revision(fleet["signals"], runtime, NOW, evidence["published"]))

    def test_stale_cross_generation_or_unbound_queue_stays_null(self):
        fleet, runtime, original = self.evidence()
        mutations = [
            ("published", "observedAt", "2026-09-05T19:19:59Z"),
            ("after", "observedAt", "2026-09-05T19:32:00Z"),
            ("after", "observedAt", "2026-09-05T19:29:29Z"),
            ("before", "observedAt", "2026-09-05T19:29:32Z"),
            ("after", "invocationId", "a" * 32),
            ("before", "runtimeGeneration", "a" * 64),
            ("published", "configurationBindingSha256", "a" * 64),
            ("after", "sourceRevision", "a" * 40),
            ("after", "packageSha256", "bad"),
            ("after", "schema", "gem-service-attestation/v1"),
            ("before", "admission", "allowed"),
            ("published", "invocationId", None),
        ]
        for section, key, value in mutations:
            with self.subTest(section=section, key=key):
                changed = copy.deepcopy(original)
                changed[section][key] = value
                self.assertIsNone(MODULE.upstream_runtime_revision(changed, runtime, NOW))
                snapshot = MODULE.compose_snapshot(fleet, runtime, NOW, attestation=changed)
                self.assertIsNone(snapshot["signals"]["runner"]["queuedWork"])
        for changed in [{}, {**original, "before": None}, {**original, "stateDigest": "a" * 64}]:
            self.assertIsNone(MODULE.upstream_runtime_revision(changed, runtime, NOW))
        changed_runtime = {**runtime, "running": []}
        self.assertIsNone(MODULE.upstream_runtime_revision(original, changed_runtime, NOW))

    def test_live_reader_brackets_state_and_does_not_write_or_submit(self):
        fleet, runtime, evidence = self.evidence()
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "preservation.json"
            raw = json.dumps(evidence["published"]).encode()
            path.write_bytes(raw)
            env = {"SYMPHONY_UPSTREAM_BINDING": str(pathlib.Path(directory) / "approved.json"),
                   "SYMPHONY_UPSTREAM_BINDING_SHA256": "c" * 64}
            events = []
            def check(command, **kwargs):
                self.assertIn("--check", command)
                self.assertIn("--upstream-binding-sha256", command)
                self.assertNotIn("--submit", command)
                events.append("check")
                return json.dumps(evidence["before"] if len(events) == 1 else evidence["after"]).encode()
            def read(bundle):
                self.assertIsNone(bundle)
                events.append("state")
                return fleet, runtime
            with mock.patch.dict(MODULE.os.environ, env, clear=True), \
                 mock.patch.object(MODULE, "UPSTREAM_ATTESTATION_PATH", path), \
                 mock.patch.object(MODULE.subprocess, "check_output", side_effect=check), \
                 mock.patch.object(MODULE, "read_sources", side_effect=read), \
                 mock.patch.object(MODULE, "datetime", wraps=datetime) as clock:
                clock.now.return_value = NOW
                observed = MODULE.read_upstream_sources()
            self.assertEqual(events, ["check", "state", "check"])
            self.assertEqual(observed, (fleet, runtime, evidence))
            self.assertIsInstance(observed[2], MODULE.LiveUpstreamObservation)
            self.assertEqual(path.read_bytes(), raw)

    def test_serialized_wrapper_cannot_switch_legacy_or_fixture_trust_path(self):
        fleet, runtime, evidence = self.evidence()
        decoded = json.loads(json.dumps(evidence))
        self.assertIsNone(MODULE.attested_runtime_revision(fleet["signals"], runtime, NOW, decoded))
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "legacy.json"
            path.write_text(json.dumps(evidence))
            with mock.patch.dict(MODULE.os.environ, {}, clear=True), \
                 mock.patch.object(sys, "argv", ["producer", "--source-bundle", "/fixture.json"]), \
                 mock.patch.object(MODULE, "ATTESTATION_PATH", path), \
                 mock.patch.object(MODULE, "read_sources", return_value=(fleet, runtime)), \
                 mock.patch.object(MODULE, "read_upstream_sources") as live, \
                 mock.patch.object(MODULE, "datetime", wraps=datetime) as clock, \
                 mock.patch("sys.stdout", new_callable=io.StringIO) as output:
                clock.now.return_value = NOW
                self.assertEqual(MODULE.main(), 0)
                runner = json.loads(output.getvalue())["signals"]["runner"]
                self.assertIsNone(runner["sourceRevision"])
                self.assertIsNone(runner["queuedWork"])
                live.assert_not_called()

    def test_reader_rejects_missing_mixed_or_mismatched_operator_binding(self):
        fleet, runtime, evidence = self.evidence()
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "receipt.json"
            path.write_text(json.dumps(evidence["published"]))
            base = {"SYMPHONY_UPSTREAM_BINDING": "/approved.json", "SYMPHONY_UPSTREAM_BINDING_SHA256": "c" * 64}
            cases = [{}, {**base, "SYMPHONY_UPSTREAM_BINDING_SHA256": "bad"},
                     {**base, "JOVIE_CONFIGURATION_SOURCE_REVISION": "a" * 40}]
            for env in cases:
                with self.subTest(env=list(env)), mock.patch.dict(MODULE.os.environ, env, clear=True), \
                     mock.patch.object(MODULE.subprocess, "check_output") as check:
                    with self.assertRaises(ValueError): MODULE.read_upstream_sources()
                    check.assert_not_called()
            with mock.patch.dict(MODULE.os.environ, {**base, "SYMPHONY_UPSTREAM_BINDING_SHA256": "d" * 64}, clear=True), \
                 mock.patch.object(MODULE, "UPSTREAM_ATTESTATION_PATH", path), \
                 mock.patch.object(MODULE.subprocess, "check_output", side_effect=[json.dumps(evidence["before"]).encode(), json.dumps(evidence["after"]).encode()]), \
                 mock.patch.object(MODULE, "read_sources", return_value=(fleet, runtime)), \
                 mock.patch.object(MODULE, "datetime", wraps=datetime) as clock:
                clock.now.return_value = NOW
                with self.assertRaisesRegex(ValueError, "unverified"): MODULE.read_upstream_sources()

    def test_reader_handles_second_precision_without_weakening_strict_bracket(self):
        fleet, runtime, evidence = self.evidence()
        evidence["before"]["observedAt"] = "2026-09-05T19:29:30.250000Z"
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "receipt.json"
            path.write_text(json.dumps(evidence["published"]))
            env = {"SYMPHONY_UPSTREAM_BINDING": "/approved.json", "SYMPHONY_UPSTREAM_BINDING_SHA256": "c" * 64}
            events = []
            def read(bundle):
                events.append("read")
                return fleet, runtime
            with mock.patch.dict(MODULE.os.environ, env, clear=True), \
                 mock.patch.object(MODULE, "UPSTREAM_ATTESTATION_PATH", path), \
                 mock.patch.object(MODULE.subprocess, "check_output", side_effect=[json.dumps(evidence["before"]).encode(), json.dumps(evidence["after"]).encode()]), \
                 mock.patch.object(MODULE, "read_sources", side_effect=read), \
                 mock.patch.object(MODULE.time, "sleep", side_effect=lambda delay: events.append(("wait", delay))), \
                 mock.patch.object(MODULE, "datetime", wraps=datetime) as clock:
                clock.now.side_effect = [datetime(2026, 9, 5, 19, 29, 30, 500000, tzinfo=timezone.utc), NOW]
                self.assertEqual(MODULE.read_upstream_sources()[2], evidence)
            self.assertEqual(events, [("wait", 0.5), "read"])
            old_runtime = {**runtime, "generated_at": "2026-09-05T19:29:30Z"}
            self.assertIsNone(MODULE.upstream_runtime_revision({**evidence, "stateDigest": MODULE.digest(old_runtime)}, old_runtime, NOW))
            exact_second = copy.deepcopy(evidence)
            exact_second["before"]["observedAt"] = "2026-09-05T19:29:30Z"
            self.assertIsNone(MODULE.upstream_runtime_revision({**exact_second, "stateDigest": MODULE.digest(old_runtime)}, old_runtime, NOW))
            with mock.patch.dict(MODULE.os.environ, env, clear=True), \
                 mock.patch.object(MODULE, "UPSTREAM_ATTESTATION_PATH", path), \
                 mock.patch.object(MODULE.subprocess, "check_output", side_effect=[json.dumps(exact_second["before"]).encode(), json.dumps(exact_second["after"]).encode()]), \
                 mock.patch.object(MODULE, "read_sources", return_value=(fleet, runtime)), \
                 mock.patch.object(MODULE.time, "sleep") as sleep, \
                 mock.patch.object(MODULE, "datetime", wraps=datetime) as clock:
                clock.now.side_effect = [datetime(2026, 9, 5, 19, 29, 30, 500000, tzinfo=timezone.utc), NOW]
                self.assertIsInstance(MODULE.read_upstream_sources()[2], MODULE.LiveUpstreamObservation)
                sleep.assert_called_once_with(0.5)
            with mock.patch.dict(MODULE.os.environ, env, clear=True), \
                 mock.patch.object(MODULE, "UPSTREAM_ATTESTATION_PATH", path), \
                 mock.patch.object(MODULE.subprocess, "check_output", return_value=json.dumps(evidence["before"]).encode()), \
                 mock.patch.object(MODULE, "read_sources") as read, \
                 mock.patch.object(MODULE, "datetime", wraps=datetime) as clock:
                clock.now.return_value = datetime(2026, 9, 5, 19, 29, 28, tzinfo=timezone.utc)
                with self.assertRaisesRegex(ValueError, "clock inconsistent"): MODULE.read_upstream_sources()
                read.assert_not_called()

    def test_live_reader_propagates_failed_or_oversized_checks_without_submission(self):
        fleet, runtime, evidence = self.evidence()
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "receipt.json"
            env = {"SYMPHONY_UPSTREAM_BINDING": "/approved.json", "SYMPHONY_UPSTREAM_BINDING_SHA256": "c" * 64}
            for raw, output in [(b"x" * (MODULE.MAX_BYTES + 1), b"{}"),
                                (json.dumps(evidence["published"]).encode(), b"x" * (MODULE.MAX_BYTES + 1)),
                                (json.dumps(evidence["published"]).encode(), b"invalid-json")]:
                path.write_bytes(raw)
                with mock.patch.dict(MODULE.os.environ, env, clear=True), \
                     mock.patch.object(MODULE, "UPSTREAM_ATTESTATION_PATH", path), \
                     mock.patch.object(MODULE.subprocess, "check_output", return_value=output), \
                     mock.patch.object(MODULE, "submit") as submit:
                    with self.assertRaises(ValueError): MODULE.read_upstream_sources()
                    submit.assert_not_called()
            path.write_text(json.dumps(evidence["published"]))
            with mock.patch.dict(MODULE.os.environ, env, clear=True), \
                 mock.patch.object(MODULE, "UPSTREAM_ATTESTATION_PATH", path), \
                 mock.patch.object(MODULE.subprocess, "check_output", side_effect=subprocess.TimeoutExpired("check", 40)), \
                 mock.patch.object(MODULE, "read_sources") as read:
                with self.assertRaises(subprocess.TimeoutExpired): MODULE.read_upstream_sources()
                read.assert_not_called()

    def test_main_requires_live_mode_and_keeps_existing_submission_boundary(self):
        fleet, runtime, evidence = self.evidence()
        for mode, arguments in [("unknown", []), ("upstream-preservation", ["--source-bundle", "/fixture.json"])]:
            with mock.patch.dict(MODULE.os.environ, {"GEM_SERVICE_ATTESTATION_MODE": mode}, clear=True), \
                 mock.patch.object(sys, "argv", ["producer", *arguments]), \
                 mock.patch.object(MODULE, "read_upstream_sources") as read, \
                 mock.patch.object(MODULE, "submit") as submit:
                with self.assertRaises(ValueError): MODULE.main()
                read.assert_not_called()
                submit.assert_not_called()
        for should_submit in (False, True):
            with mock.patch.dict(MODULE.os.environ, {"GEM_SERVICE_ATTESTATION_MODE": "upstream-preservation", "CRON_SECRET": "test-key"}, clear=True), \
                 mock.patch.object(sys, "argv", ["producer", *(["--submit"] if should_submit else [])]), \
                 mock.patch.object(MODULE, "read_upstream_sources", return_value=(fleet, runtime, evidence)), \
                 mock.patch.object(MODULE, "load_concurrency_observation", return_value=None), \
                 mock.patch.object(MODULE, "load_existing_repair_reference", return_value=None), \
                 mock.patch.object(MODULE, "datetime", wraps=datetime) as clock, \
                 mock.patch.object(MODULE, "submit", return_value={"accepted": True}) as submit, \
                 mock.patch("sys.stdout", new_callable=io.StringIO) as output:
                clock.now.return_value = NOW
                self.assertEqual(MODULE.main(), 0)
                result = json.loads(output.getvalue())
                if should_submit:
                    self.assertEqual(result, {"accepted": True})
                    self.assertEqual(submit.call_args.args[0]["signals"]["runner"]["sourceRevision"], RUNTIME_SHA)
                    self.assertEqual(submit.call_args.args[1], "test-key")
                else:
                    self.assertEqual(result["signals"]["runner"]["queuedWork"], 2)
                    submit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
