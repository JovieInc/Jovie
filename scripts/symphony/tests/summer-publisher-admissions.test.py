"""JOV-6163: publisher-null unless gem-service attestation is fresh (600s)."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import subprocess
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
PATH = ROOT / "scripts/symphony/summer_bottleneck_producer.py"
SPEC = importlib.util.spec_from_file_location("summer_bottleneck_producer", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.path.insert(0, str(PATH.parent))
SPEC.loader.exec_module(MODULE)
import summer_existing_repair as REPAIR

MAIN_SHA = "a" * 40
RUNTIME_SHA = "b" * 40
PRODUCTION_SHA = "c" * 40
NOW = datetime(2026, 9, 5, 19, 30, tzinfo=timezone.utc)
FRESH_AT = "2026-09-05T19:29:00Z"


def sources():
    fleet = {
        "schema": "jovie-fleet-gate/v1",
        "observedAt": FRESH_AT,
        "signals": {
            "closureHealth": {
                "schema": "jovie-closure-health/v1",
                "status": "healthy",
                "openPrs": 0,
                "nativeQueueCount": 0,
            },
            "queue": {
                "greenReadyPrs": 0,
                "nativeQueueCount": 0,
                "status": "known",
                "source": "live",
            },
            "lease": {
                "observedAt": FRESH_AT,
                "status": "ok",
                "capacity": {"available": 1},
            },
            "main": {"sha": MAIN_SHA},
            "production": {"deployedSha": PRODUCTION_SHA},
            "concurrencyEvidence": {
                "accepted": False,
                "reason": "source-attestation-unavailable",
                "runtime": {
                    "schema": "symphony-runtime-identity/v1",
                    "service": "symphony-elixir.service",
                    "sourceRevision": RUNTIME_SHA,
                },
            },
        },
    }
    runtime = {
        "generated_at": FRESH_AT,
        "sourceRevision": RUNTIME_SHA,
        "running": [],
        "retrying": [],
        "blocked": [],
    }
    return fleet, runtime


def attestation(*, observed_at: str = FRESH_AT, revision: str = RUNTIME_SHA):
    return {
        "schema": "gem-service-attestation/v1",
        "observedAt": observed_at,
        "sourceRevision": revision,
        "service": "symphony-elixir.service",
        "active": True,
        "healthy": True,
        "listener": {"port": 4041, "boundToService": True},
    }


class ExistingRepairProjectionTests(unittest.TestCase):
    def test_reference_is_bound_to_event_without_changing_admissions(self):
        fleet, runtime = sources()
        reference = {
            "mode": "isolated-cli", "identifier": "JOV-6224",
            "issueId": "d1d9b064-5264-4907-a3ca-f599eb75b9de",
            "ownerId": "bb142ab2-e0e9-4f89-b330-b484d6b32139",
            "issueRevision": FRESH_AT, "repository": "JovieInc/Jovie", "pr": 17753,
            "head": MAIN_SHA, "workspace": "/fixture/owned-repair",
            "writerUnit": "fixture-repair.service", "assignmentDigest": "f" * 64,
            "expiresAt": "2026-09-05T20:00:00Z",
        }
        baseline = MODULE.compose_snapshot(fleet, runtime, NOW, attestation())
        projected = MODULE.compose_snapshot(fleet, runtime, NOW, attestation(), existing_repair=reference)
        self.assertEqual(projected["signals"]["existingRepair"], reference)
        self.assertEqual(projected["signals"]["admissions"], baseline["signals"]["admissions"])
        self.assertNotEqual(projected["eventId"], baseline["eventId"])
        changed = MODULE.compose_snapshot(fleet, runtime, NOW, attestation(),
                                          existing_repair={**reference, "assignmentDigest": "e" * 64})
        self.assertNotEqual(changed["eventId"], projected["eventId"])
        self.assertNotIn("existingRepair", baseline["signals"])


class ExistingRepairLoaderTests(unittest.TestCase):
    def assignment(self, identifier="JOV-6224"):
        return {"identifier": identifier, "issueId": "d1d9b064-5264-4907-a3ca-f599eb75b9de",
                "ownerId": "bb142ab2-e0e9-4f89-b330-b484d6b32139", "issueRevision": FRESH_AT,
                "repository": "JovieInc/Jovie", "executionMode": "isolated-cli", "pr": 17753,
                "head": MAIN_SHA, "workspace": "/fixture/repair", "writerUnit": "fixture.service",
                "expiresAt": NOW.timestamp() + 600, "providerGrant": {"digest": "provider-bound"}}

    def test_uses_read_only_canonical_validation_and_full_assignment_digest(self):
        payload = self.assignment()
        validator = mock.Mock()
        validator.candidates.return_value = [payload]
        validator.load_validated_candidate.return_value = payload
        validator.assignment_digest.return_value = "e" * 64
        with mock.patch.object(REPAIR, "load_repair_validator", return_value=(validator, "/fixture/controller")):
            reference = REPAIR.load_existing_repair_reference()
        validator.load_validated_candidate.assert_called_once_with("JOV-6224", "/fixture/controller")
        validator.assignment_digest.assert_called_once_with(payload)
        self.assertEqual(reference["assignmentDigest"], "e" * 64)
        self.assertEqual(reference["expiresAt"], "2026-09-05T19:40:00Z")
        self.assertNotIn("providerGrant", reference)
        self.assertEqual([call[0] for call in validator.mock_calls],
                         ["candidates", "load_validated_candidate", "assignment_digest"])

    def test_absent_invalid_native_and_ambiguous_grants_never_project(self):
        payload = self.assignment()
        for candidates, error in [([], None), ([payload], ValueError("expired")),
                                  ([{**payload, "executionMode": "native"}], None),
                                  ([{**payload, "repository": "JovieInc/LogYourBody"}], None),
                                  ([payload, self.assignment("JOV-6225")], None)]:
            validator = mock.Mock()
            validator.candidates.return_value = candidates
            validator.load_validated_candidate.side_effect = error or (lambda identifier, controller: self.assignment(identifier))
            validator.assignment_digest.return_value = "e" * 64
            with mock.patch.object(REPAIR, "load_repair_validator", return_value=(validator, "/fixture/controller")):
                self.assertIsNone(REPAIR.load_existing_repair_reference())

        for error in [FileNotFoundError(), ValueError("wrong-manifest"), AttributeError("old-package"), SyntaxError("broken-package")]:
            with mock.patch.object(REPAIR, "load_repair_validator", side_effect=error):
                self.assertIsNone(REPAIR.load_existing_repair_reference())

    def test_out_of_range_expiry_does_not_crash_projection(self):
        payload = {**self.assignment(), "expiresAt": 10**100}
        validator = mock.Mock()
        validator.candidates.return_value = [payload]
        validator.load_validated_candidate.return_value = payload
        validator.assignment_digest.return_value = "e" * 64
        with mock.patch.object(REPAIR, "load_repair_validator", return_value=(validator, "/fixture/controller")):
            self.assertIsNone(REPAIR.load_existing_repair_reference())

    def test_package_manifest_cannot_redirect_imports_or_accept_writable_code(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            manifest = home / "gem-workspace/config/existing-repair-controller-manifest.json"
            manifest.parent.mkdir(parents=True)
            expected = {"schema": "symphony-existing-repair-controller-package/v1",
                        "packageId": "symphony-codex-auth-fallback", "command": "symphony-codex-exhausted.py",
                        "arguments": ["owned-repair"], "launcherRelativePath": ".local/bin/symphony-codex-exhausted.py",
                        "releaseControllerRelativePath": ".local/bin/.symphony-codex-auth-fallback/current/symphony-codex-exhausted.py",
                        "releaseValidatorRelativePath": ".local/bin/.symphony-codex-auth-fallback/current/existing_pr_repair.py",
                        "installer": "scripts/symphony/symphony-codex-exhausted.py install"}
            package = home / ".local/bin/.symphony-codex-auth-fallback"
            (package / "releases/fixture").mkdir(parents=True)
            (package / "current").symlink_to("releases/fixture")
            for key in ["launcherRelativePath", "releaseControllerRelativePath", "releaseValidatorRelativePath"]:
                path = home / expected[key]
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("IDENTITY = 'fixture'\n")
                path.chmod(0o644)
            manifest.write_text(json.dumps(expected))
            source = home / "source.git"
            subprocess.run(["git", "init", "--bare", "--quiet", str(source)], check=True)
            def git(*args, data=b""):
                return subprocess.check_output(["git", "-C", str(source), *args], input=data).decode().strip()
            blob = git("hash-object", "-w", "--stdin", data=b"IDENTITY = 'fixture'\n")
            tree = git("mktree", data=f"100644 blob {blob}\texisting_pr_repair.py\n100644 blob {blob}\tsymphony-codex-exhausted.py\n100644 blob {blob}\tsymphony-existing-repair-resolv.conf\n".encode())
            tree = git("mktree", data=f"040000 tree {tree}\tsymphony\n".encode())
            tree = git("mktree", data=f"040000 tree {tree}\tscripts\n".encode())
            revision = git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit-tree", tree, data=b"fixture\n")
            with mock.patch.object(REPAIR.pathlib.Path, "home", return_value=home), \
                 mock.patch.dict(REPAIR.os.environ, {"JOVIE_CONFIGURATION_SOURCE_ROOT": str(source),
                                                     "JOVIE_CONFIGURATION_SOURCE_REVISION": revision}):
                module, controller = REPAIR.load_repair_validator()
                self.assertEqual(module.IDENTITY, "fixture")
                self.assertEqual(controller, (home / expected["releaseControllerRelativePath"]).resolve())
                resolver_path = ".local/bin/.symphony-codex-auth-fallback/current/symphony-existing-repair-resolv.conf"
                resolver = home / resolver_path
                resolver.write_text("IDENTITY = 'fixture'\n")
                resolver.chmod(0o644)
                manifest.write_text(json.dumps({**expected, "releaseResolverRelativePath": resolver_path}))
                self.assertEqual(REPAIR.load_repair_validator()[0].IDENTITY, "fixture")
                manifest.write_text(json.dumps({**expected, "releaseResolverRelativePath": "other.conf"}))
                with self.assertRaisesRegex(ValueError, "manifest-invalid"):
                    REPAIR.load_repair_validator()
                manifest.write_text(json.dumps({**expected, "releaseResolverRelativePath": resolver_path}))
                resolver.chmod(0o666)
                with self.assertRaisesRegex(ValueError, "file-untrusted"):
                    REPAIR.load_repair_validator()
                resolver.chmod(0o644)
                resolver.write_text("unreviewed resolver\n")
                with self.assertRaisesRegex(ValueError, "source-mismatch"):
                    REPAIR.load_repair_validator()
                manifest.write_text(json.dumps(expected))
                manifest.write_text(json.dumps({**expected, "releaseValidatorRelativePath": "other.py"}))
                with self.assertRaisesRegex(ValueError, "manifest-invalid"):
                    REPAIR.load_repair_validator()
                manifest.write_text(json.dumps(expected))
                (home / expected["releaseValidatorRelativePath"]).chmod(0o666)
                with self.assertRaisesRegex(ValueError, "file-untrusted"):
                    REPAIR.load_repair_validator()
                validator_path = home / expected["releaseValidatorRelativePath"]
                validator_path.chmod(0o644)
                validator_path.write_text("raise AssertionError('unverified code executed')\n")
                with self.assertRaisesRegex(ValueError, "source-mismatch"):
                    REPAIR.load_repair_validator()
                validator_path.write_text("IDENTITY = 'fixture'\n")
                for pin in ["", "main", "a" * 40]:
                    with mock.patch.dict(REPAIR.os.environ, {"JOVIE_CONFIGURATION_SOURCE_REVISION": pin}):
                        self.assertIsNone(REPAIR.load_existing_repair_reference())
                empty_tree = git("mktree")
                empty_revision = git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit-tree", empty_tree, data=b"package absent fixture\n")
                with mock.patch.dict(REPAIR.os.environ, {"JOVIE_CONFIGURATION_SOURCE_REVISION": empty_revision}):
                    self.assertIsNone(REPAIR.load_existing_repair_reference())
                invalid_bytes = b"invalid python (\n"
                invalid_blob = git("hash-object", "-w", "--stdin", data=invalid_bytes)
                bad_tree = git("mktree", data=f"100644 blob {invalid_blob}\texisting_pr_repair.py\n100644 blob {invalid_blob}\tsymphony-codex-exhausted.py\n".encode())
                bad_tree = git("mktree", data=f"040000 tree {bad_tree}\tsymphony\n".encode())
                bad_tree = git("mktree", data=f"040000 tree {bad_tree}\tscripts\n".encode())
                bad_revision = git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit-tree", bad_tree, data=b"invalid package fixture\n")
                for key in ["releaseControllerRelativePath", "releaseValidatorRelativePath"]:
                    (home / expected[key]).write_bytes(invalid_bytes)
                with mock.patch.dict(REPAIR.os.environ, {"JOVIE_CONFIGURATION_SOURCE_REVISION": bad_revision}):
                    self.assertIsNone(REPAIR.load_existing_repair_reference())
                for key in ["releaseControllerRelativePath", "releaseValidatorRelativePath"]:
                    (home / expected[key]).write_text("IDENTITY = 'fixture'\n")
                next_release = package / "releases/next"
                next_release.mkdir()
                for name in ["existing_pr_repair.py", "symphony-codex-exhausted.py"]:
                    (next_release / name).write_text("raise AssertionError('rotated code executed')\n")
                real_resolve = Path.resolve
                def rotate_between_pair(path, *args, **kwargs):
                    resolved = real_resolve(path, *args, **kwargs)
                    if path == home / expected["releaseControllerRelativePath"]:
                        (package / "current").unlink()
                        (package / "current").symlink_to("releases/next")
                    return resolved
                with mock.patch.object(REPAIR.pathlib.Path, "resolve", new=rotate_between_pair):
                    with self.assertRaisesRegex(ValueError, "release-mismatch"):
                        REPAIR.load_repair_validator()
                (package / "current").unlink()
                (package / "current").symlink_to("releases/fixture")
                real_spec = REPAIR.importlib.util.spec_from_file_location
                def rotate_after_verification(*args, **kwargs):
                    next_release = package / "releases/next"
                    next_release.mkdir(exist_ok=True)
                    for name in ["existing_pr_repair.py", "symphony-codex-exhausted.py"]:
                        (next_release / name).write_text("raise AssertionError('rotated code executed')\n")
                    (package / "current").unlink()
                    (package / "current").symlink_to("releases/next")
                    return real_spec(*args, **kwargs)
                with mock.patch.object(REPAIR.importlib.util, "spec_from_file_location", side_effect=rotate_after_verification):
                    module, controller = REPAIR.load_repair_validator()
                self.assertEqual(module.IDENTITY, "fixture")
                self.assertEqual(controller.parent, (package / "releases/fixture").resolve())


class RunnerAttestationTests(unittest.TestCase):
    def test_freshness_bound_is_not_coarsened(self):
        self.assertEqual(MODULE.EVIDENCE_MAX_AGE_SECONDS, 600)

    def test_fresh_attestation_emits_sha_even_when_capacity_is_unaccepted(self):
        fleet, runtime = sources()
        snapshot = MODULE.compose_snapshot(fleet, runtime, NOW, attestation())
        runner = snapshot["signals"]["runner"]
        self.assertEqual(runner["sourceRevision"], RUNTIME_SHA)
        self.assertEqual(runner["workSource"]["sourceRevision"], RUNTIME_SHA)
        self.assertEqual(runner["queuedWork"], 0)

    def test_stale_attestation_stays_publisher_null(self):
        fleet, runtime = sources()
        stale = (NOW - timedelta(seconds=601)).isoformat().replace("+00:00", "Z")
        snapshot = MODULE.compose_snapshot(
            fleet, runtime, NOW, attestation(observed_at=stale)
        )
        self.assertIsNone(snapshot["signals"]["runner"]["sourceRevision"])
        self.assertIsNone(snapshot["signals"]["runner"]["queuedWork"])

    def test_boundary_at_600s_still_emits(self):
        fleet, runtime = sources()
        edge = (NOW - timedelta(seconds=600)).isoformat().replace("+00:00", "Z")
        snapshot = MODULE.compose_snapshot(
            fleet, runtime, NOW, attestation(observed_at=edge)
        )
        self.assertEqual(snapshot["signals"]["runner"]["sourceRevision"], RUNTIME_SHA)

    def test_fleet_or_state_identity_cannot_bypass_stale_attestation(self):
        fleet, runtime = sources()
        snapshot = MODULE.compose_snapshot(fleet, runtime, NOW, {})
        self.assertIsNone(snapshot["signals"]["runner"]["sourceRevision"])
        self.assertIsNone(snapshot["signals"]["runner"]["queuedWork"])

    def test_conflicting_fresh_identities_fail_closed(self):
        fleet, runtime = sources()
        snapshot = MODULE.compose_snapshot(
            fleet, runtime, NOW, attestation(revision="d" * 40)
        )
        self.assertIsNone(snapshot["signals"]["runner"]["sourceRevision"])

    def test_live_fresh_attestation_file_is_read(self):
        fleet, runtime = sources()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "gem-service-attestation.json"
            path.write_text(json.dumps(attestation()))
            with mock.patch.object(MODULE, "ATTESTATION_PATH", path):
                snapshot = MODULE.compose_snapshot(fleet, runtime, NOW)
        self.assertEqual(snapshot["signals"]["runner"]["sourceRevision"], RUNTIME_SHA)


class AdmissionProjectionTests(unittest.TestCase):
    def setUp(self):
        self.fleet, self.runtime = sources()
        self.fleet['signals']['queue']['repository'] = 'JovieInc/Jovie'
        self.fleet['activities'] = ['tests', 'review']
        self.fleet['workAdmission'] = {'allowed': True, 'newImplementationAllowed': False, 'newIssueLeaseAllowed': False}
        self.fleet['closureAdmission'] = {'newImplementationAllowed': False, 'newIssueIntakeAllowed': False, 'remediationContinues': True}
        self.fleet['remediationAdmission'] = {'allowed': True, 'localAllowed': True, 'pushAllowed': False, 'authority': 'single-pr-writer-exact-head'}
        self.attestation = {**attestation(), 'runtime': {'workflowPath': '/actual/WORKFLOW.md'}}
        self.report = {'schema': 'symphony-concurrency/v1', 'observedAt': FRESH_AT, 'sourceRevision': RUNTIME_SHA,
            'provenance': {'sourceRevision': RUNTIME_SHA, 'observedAt': FRESH_AT},
            'resourceScope': {'repository': 'JovieInc/Jovie', 'runtimeUrl': MODULE.RUNTIME_URL, 'workflow': '/actual/WORKFLOW.md'},
            'provider': {'eligible': False, 'source': 'active-issue-authenticated-routes'},
            'downstream': {'healthy': False, 'repository': 'JovieInc/Jovie'}}

    def snapshot(self):
        return MODULE.compose_snapshot(self.fleet, self.runtime, NOW, self.attestation, self.report)

    def test_repair_and_push_are_independent_of_new_work_and_capacity(self):
        result = self.snapshot()['signals']['admissions']
        self.assertEqual([result[k]['state'] for k in ['newImplementation', 'ownedRemediation', 'push', 'providerEligibility', 'downstreamHealth']],
                         ['HELD', 'ALLOWED', 'HELD', 'HELD', 'HELD'])
        self.fleet['signals']['lease']['capacity']['available'] = 900
        after_capacity = self.snapshot()['signals']['admissions']
        for key in ['newImplementation', 'ownedRemediation', 'push', 'providerEligibility', 'downstreamHealth']:
            self.assertEqual(result[key]['state'], after_capacity[key]['state'])
        self.fleet['remediationAdmission']['pushAllowed'] = True
        after = self.snapshot()['signals']['admissions']
        self.assertEqual(after['push']['state'], 'ALLOWED')
        self.assertEqual(after['newImplementation']['state'], 'HELD')

    def test_source_mismatch_or_missing_authenticated_route_never_uses_capacity(self):
        self.report['provider']['eligible'] = True
        self.assertEqual(self.snapshot()['signals']['admissions']['providerEligibility']['state'], 'ALLOWED')
        for key, value in [('workflow', '/other/WORKFLOW.md'), ('repository', 'other/repo'), ('runtimeUrl', 'http://other')]:
            old = self.report['resourceScope'][key]
            self.report['resourceScope'][key] = value
            self.assertEqual(self.snapshot()['signals']['admissions']['providerEligibility']['state'], 'UNKNOWN')
            self.report['resourceScope'][key] = old
        self.report['provider']['source'] = 'aggregate-capacity'
        self.assertEqual(self.snapshot()['signals']['admissions']['providerEligibility']['state'], 'UNKNOWN')

    def test_unknown_stale_wrong_revision_and_malformed_boolean_are_not_grants(self):
        for key, value in [('observedAt', (NOW-timedelta(seconds=601)).isoformat()), ('sourceRevision', 'd'*40)]:
            old = self.report[key]; self.report[key] = value
            self.assertEqual(self.snapshot()['signals']['admissions']['downstreamHealth']['state'], 'UNKNOWN')
            self.report[key] = old
        self.fleet['remediationAdmission']['pushAllowed'] = 1
        self.assertEqual(self.snapshot()['signals']['admissions']['push']['state'], 'UNKNOWN')
        self.fleet['observedAt'] = (NOW-timedelta(seconds=601)).isoformat()
        self.assertEqual(self.snapshot()['signals']['admissions']['ownedRemediation']['state'], 'UNKNOWN')
        self.report = None
        self.assertEqual(self.snapshot()['signals']['admissions']['providerEligibility']['state'], 'UNKNOWN')

    def test_new_measured_authority_gets_an_event_without_reminting_semantics(self):
        first = self.snapshot()
        self.fleet['observedAt'] = NOW.isoformat()
        self.report['observedAt'] = NOW.isoformat()
        second = self.snapshot()
        self.assertNotEqual(first['eventId'], second['eventId'])
        self.assertEqual(first['signals']['admissions']['push']['sourceDigest'], second['signals']['admissions']['push']['sourceDigest'])
        self.assertEqual(second['eventId'], self.snapshot()['eventId'])
        self.assertNotEqual(first['signals']['admissions']['push']['observedAt'], second['signals']['admissions']['push']['observedAt'])
        self.fleet['remediationAdmission']['pushAllowed'] = True
        self.assertNotEqual(first['eventId'], self.snapshot()['eventId'])

    def test_invalid_observation_times_are_unknown_not_refreshed(self):
        for value in [None, 'not-a-time', '2026-09-05T19:29:00', (NOW+timedelta(seconds=61)).isoformat()]:
            self.report['observedAt'] = value
            result = self.snapshot()['signals']['admissions']['providerEligibility']
            self.assertEqual(result['state'], 'UNKNOWN')
            self.assertIsNone(result['observedAt'])

    def test_cli_projects_live_observations_without_submitting_and_bundle_is_isolated(self):
        for bundle in [False, True]:
            args = ['producer'] + (['--source-bundle', '-'] if bundle else [])
            with mock.patch.object(sys, 'argv', args), mock.patch.object(MODULE, 'datetime', wraps=datetime) as clock, \
                 mock.patch.object(MODULE, 'read_sources', return_value=(self.fleet, self.runtime)), \
                 mock.patch.object(MODULE, 'load_service_attestation', return_value=self.attestation), \
                 mock.patch.object(MODULE, 'load_concurrency_observation', return_value=self.report) as load, \
                 mock.patch.object(MODULE, 'load_existing_repair_reference', return_value=None) as repair_load, \
                 mock.patch.object(MODULE, 'submit') as submit, mock.patch('builtins.print') as output:
                clock.now.return_value = NOW
                self.assertEqual(MODULE.main(), 0)
                projected = json.loads(output.call_args.args[0])['signals']['admissions']
                self.assertEqual(projected['ownedRemediation']['state'], 'ALLOWED')
                self.assertEqual(projected['providerEligibility']['state'], 'UNKNOWN' if bundle else 'HELD')
                self.assertEqual(load.call_count, 0 if bundle else 1)
                self.assertEqual(repair_load.call_count, 0 if bundle else 1)
                submit.assert_not_called()

    def test_concurrency_file_missing_or_invalid_is_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'report.json'
            with mock.patch.object(MODULE, 'CONCURRENCY_PATH', path):
                self.assertIsNone(MODULE.load_concurrency_observation())
                path.write_text('not json'); self.assertIsNone(MODULE.load_concurrency_observation())
                path.write_text(json.dumps(self.report)); self.assertEqual(MODULE.load_concurrency_observation(), self.report)




class TaskAdmissionPublicationTests(unittest.TestCase):
    def setUp(self):
        self.fleet, self.runtime = sources()
        self.audit = {"schema": "jovie-ci-bottleneck-audit/v1", "observedAt": FRESH_AT,
                      "sourceRevision": MAIN_SHA, "sourceDigest": "e" * 64,
                      "classes": [{"id": name, "handle": "ci:" + name, "owner": "ci-owner",
                                   "state": "open" if index == 0 else "implemented", "impact": 10}
                                  for index, name in enumerate(sorted(MODULE.CI_CLASS_IDS))]}
        self.fleet["signals"]["ciAudit"] = self.audit
        self.reference = {"identifier": "JOV-6224", "assignmentDigest": "f" * 64,
                          "expiresAt": "2026-09-05T20:00:00Z"}
        self.binding = {"runtimeRevision": RUNTIME_SHA, "runtimeGeneration": "d" * 64,
                        "runtimeInvocationId": "c" * 32}
        self.attestation = {**attestation(), "runtime": {"generation": "d" * 64, "invocationId": "c" * 32}}
        self.observed = {"schema": "jovie.eve.summer-task-admissions/v1",
                         "assignmentDigest": self.reference["assignmentDigest"],
                         "selectedId": self.audit["classes"][0]["id"], "sourceRevision": MAIN_SHA,
                         **self.binding,
                         "providerEligibility": {"state": "UNKNOWN", "observedAt": None, "expiresAt": None,
                                                 "sourceDigest": None, "reason": "provider-quota-observation-unavailable"},
                         "providerObservation": None,
                         "downstreamHealth": {"state": "ALLOWED", "observedAt": FRESH_AT,
                                              "expiresAt": self.reference["expiresAt"], "sourceDigest": "e" * 64,
                                              "reason": "observed-target-available"}}

    def load(self, validator):
        with mock.patch.object(REPAIR, "load_repair_validator", return_value=(validator, "/fixture/controller")):
            return REPAIR.load_existing_repair_task_admissions(self.reference, self.audit, MAIN_SHA, self.binding)

    def test_observes_exact_unambiguous_target_without_selecting_or_granting(self):
        validator = mock.Mock()
        validator.observe_task_admissions.return_value = self.observed
        self.assertEqual(self.load(validator), self.observed)
        selected = self.audit["classes"][0]
        validator.observe_task_admissions.assert_called_once_with("JOV-6224", "/fixture/controller",
            selected_id=selected["id"], selected_handle=selected["handle"], source_revision=MAIN_SHA)
        self.assertEqual([call[0] for call in validator.mock_calls], ["observe_task_admissions"])
        self.assertIsNone(self.observed["providerObservation"])

    def test_absence_old_package_and_invalid_source_do_not_probe(self):
        for reference, audit, runtime in [(None, self.audit, self.binding),
                                         (self.reference, None, self.binding),
                                         (self.reference, self.audit, {}),
                                         (self.reference, {**self.audit, "classes": []}, self.binding),
                                         (self.reference, {**self.audit, "classes": self.audit["classes"] * 2}, self.binding),
                                         (self.reference, {**self.audit, "sourceRevision": "e" * 40}, self.binding)]:
            with mock.patch.object(REPAIR, "load_repair_validator") as loader:
                self.assertIsNone(REPAIR.load_existing_repair_task_admissions(reference, audit, MAIN_SHA, runtime))
                loader.assert_not_called()
        self.assertIsNone(self.load(object()))
        with mock.patch.object(REPAIR, "load_repair_validator", side_effect=ValueError("wrong-source")):
            self.assertIsNone(REPAIR.load_existing_repair_task_admissions(self.reference, self.audit, MAIN_SHA, self.binding))

    def test_crossed_or_ambiguous_observations_stay_unknown(self):
        validator = mock.Mock()
        for key in ("schema", "assignmentDigest", "sourceRevision", "runtimeRevision", "runtimeGeneration", "runtimeInvocationId", "selectedId"):
            with self.subTest(key=key):
                validator.observe_task_admissions.return_value = {**self.observed, key: "crossed"}
                self.assertIsNone(self.load(validator))
        for value in (None, {**self.observed, "downstreamHealth": None},
                      {**self.observed, "downstreamHealth": {"state": "UNKNOWN"}}):
            validator.observe_task_admissions.return_value = value
            self.assertIsNone(self.load(validator))
        self.audit["classes"][1]["state"] = "partial"
        validator.observe_task_admissions.side_effect = lambda *_args, **kw: {**self.observed, "selectedId": kw["selected_id"]}
        self.assertIsNone(self.load(validator))
        # Even another valid class cannot be substituted for the class read.
        validator.observe_task_admissions.side_effect = None
        validator.observe_task_admissions.return_value = {**self.observed, "selectedId": self.audit["classes"][1]["id"]}
        self.assertIsNone(self.load(validator))

    def test_attaches_observed_runtime_and_task_evidence_without_refreshing_rows(self):
        snapshot = MODULE.compose_snapshot(self.fleet, self.runtime, NOW, self.attestation,
                    existing_repair=self.reference, task_admissions=self.observed)
        self.assertEqual(snapshot["signals"]["runner"]["runtimeGeneration"], self.binding["runtimeGeneration"])
        self.assertEqual(snapshot["signals"]["runner"]["runtimeInvocationId"], self.binding["runtimeInvocationId"])
        self.assertEqual(snapshot["signals"]["taskAdmissions"], self.observed)
        self.assertEqual(snapshot["signals"]["taskAdmissions"]["downstreamHealth"]["observedAt"], FRESH_AT)
        refreshed = {**self.observed, "downstreamHealth": {**self.observed["downstreamHealth"], "observedAt": "2026-09-05T19:29:30Z"}}
        next_snapshot = MODULE.compose_snapshot(self.fleet, self.runtime, NOW, self.attestation,
                         existing_repair=self.reference, task_admissions=refreshed)
        self.assertNotEqual(snapshot["eventId"], next_snapshot["eventId"])
        for source in (attestation(), {**self.attestation, "observedAt": "2026-09-05T19:00:00Z"},
                       {**self.attestation, "runtime": {"generation": "not-a-digest", "invocationId": "c" * 32}}):
            result = MODULE.compose_snapshot(self.fleet, self.runtime, NOW, source,
                     existing_repair=self.reference, task_admissions=self.observed)
            self.assertNotIn("taskAdmissions", result["signals"])
            self.assertNotIn("runtimeGeneration", result["signals"]["runner"])
        self.assertFalse(REPAIR.task_admissions_match(self.observed, self.reference,
                         {**self.audit, "classes": None}, MAIN_SHA, self.binding))

    def test_live_cli_connects_observer_but_bundle_never_reads_assignments(self):
        for bundle in (False, True):
            args = ["producer"] + (["--source-bundle", "-"] if bundle else [])
            with mock.patch.object(sys, "argv", args), mock.patch.object(MODULE, "datetime", wraps=datetime) as clock, \
                 mock.patch.object(MODULE, "read_sources", return_value=(self.fleet, self.runtime)), \
                 mock.patch.object(MODULE, "load_service_attestation", return_value=self.attestation), \
                 mock.patch.object(MODULE, "load_concurrency_observation", return_value=None), \
                 mock.patch.object(MODULE, "load_existing_repair_reference", return_value=self.reference) as reference, \
                 mock.patch.object(MODULE, "load_existing_repair_task_admissions", return_value=self.observed) as observe, \
                 mock.patch.object(MODULE, "submit") as submit, mock.patch("builtins.print") as output:
                clock.now.return_value = NOW
                self.assertEqual(MODULE.main(), 0)
                snapshot = json.loads(output.call_args.args[0])
                self.assertEqual(reference.call_count, 0 if bundle else 1)
                self.assertEqual(observe.call_count, 0 if bundle else 1)
                self.assertEqual("taskAdmissions" in snapshot["signals"], not bundle)
                submit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
