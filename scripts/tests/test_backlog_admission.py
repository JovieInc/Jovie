"""Admission observations must never manufacture authority or erase a real gate."""
from copy import deepcopy
from contextlib import contextmanager
from types import SimpleNamespace
import subprocess
from pathlib import Path
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import backlog_admission as admission
import execution_attempt

NOW = 1792180000.0
STATE = "/home/fixture/.local/state/jovie-lanes"
VERSION = "2026-10-16T19:46:00Z"


def packet():
    issue = {"id": "fixture-issue-uuid", "identifier": "JOV-6641", "title": "Pure confidence policy",
             "description": "Extend the existing certification kernel.", "state": "Backlog", "stateType": "backlog",
             "updatedAt": VERSION, "priority": 2, "labelsComplete": True, "dependencyIds": ["prerequisite-uuid"],
             "observedAt": NOW}
    runtime = {"issueId": issue["id"], "issueUpdatedAt": VERSION, "observedAt": NOW, "statePath": STATE,
               "installedPath": STATE + "/releases/" + "a" * 64 + "/scripts/lanes", "sourceHash": "b" * 64,
               "policyHash": "c" * 64, "releaseTree": "d" * 40,
               "fileOverlap": {"allowed": True, "decisions": []},
               "worker": {"sourceFunctions": ["admission_rejection", "pool_rejections", "held_back_issues", "in_flight_issues"],
                          "sourceHash": "b" * 64, "provider": "codex", "rejection": None, "poolRejection": None,
                          "heldBack": False, "inFlight": False, "claims": []},
               "resources": {"observedAt": NOW, "workAdmission": "allowed", "newIssueLease": "allowed", "budget": "within-budget",
                             "disk": "admitted", "quota": "available", "intakeSlots": 6, "freeSlots": 1}}
    return {"issue": issue, "expected": {key: issue[key] for key in admission.IDENTITY_FIELDS}, "runtime": runtime,
            "expectedRuntime": {key: runtime[key] for key in admission.RUNTIME_FIELDS},
            "dependencies": {"issueId": issue["id"], "issueUpdatedAt": VERSION, "observedAt": NOW, "complete": True,
                             "rows": [{"id": "prerequisite-uuid", "owner": "Certification kernel owner / JOV-6640",
                                       "state": "Done", "stateType": "completed", "observedAt": NOW,
                                       "sourceAcceptance": {"kind": "implemented-source", "mergeSha": "e" * 40,
                                                            "sourceSha": "f" * 40, "paths": ["apps/web/lib/agent-os/dogfood-receipt.ts"],
                                                            "receipt": "https://github.com/JovieInc/Jovie/pull/19037"}}]},
            "custody": {"issueId": issue["id"], "issueUpdatedAt": VERSION, "observedAt": NOW, "complete": True,
                        "sources": ["linear-comments", "native-claims", "open-prs"], "holders": [], "unknown": []},
            "attemptHistory": {"repository": "JovieInc/Jovie", "anchor": execution_attempt.GITHUB_LEDGER_ANCHOR,
                               "observedAt": NOW, "complete": True, "hasNextPage": False, "pages": [[]]}}


def project(value, now=NOW):
    return admission.project_backlog_admission(value, now=now, canonical_state_path=STATE)


def status(identifier="JOV-6641", generation="earlier", terminal="failed_known"):
    ident = execution_attempt.identity("linear-work", {"issue": identifier, "outcome": "draft-pr"}, generation)
    row = {"schema": execution_attempt.SCHEMA, **ident, "event": "attempt_finished", "terminalState": terminal}
    return {"id": 7, "context": "jovie-execution/" + ident["identityDigest"],
            "creator": {"login": "jovie-bot[bot]", "type": "Bot"},
            "target_url": "https://github.com/JovieInc/Jovie#jovie-execution=" + execution_attempt._pack(row)}


class ProjectionTest(unittest.TestCase):
    def assertHeld(self, value, code):
        result = project(value)
        self.assertFalse(result["allowed"])
        self.assertIn(code, [row["code"] for row in result["holds"]])
        for row in result["holds"]:
            self.assertTrue(row["owner"])
            self.assertTrue(row["nextAction"])
        self.assertFalse(result["authorizesTransition"])
        self.assertFalse(result["authorizesDispatch"])
        return result

    def test_complete_current_leaf_is_observation_only_and_does_no_io(self):
        value = packet()
        before = deepcopy(value)
        with patch.object(Path, "read_text", side_effect=AssertionError("projection read a file")), \
             patch.object(execution_attempt, "_gh", side_effect=AssertionError("projection used network")), \
             patch.object(execution_attempt, "claim", side_effect=AssertionError("projection claimed")):
            result = project(value)
        self.assertTrue(result["allowed"])
        self.assertEqual(result["holds"], [])
        self.assertFalse(result["authorizesTransition"])
        self.assertFalse(result["authorizesDispatch"])
        self.assertEqual(value, before)

    def test_priority_event_requires_current_expected_priority_and_does_not_inflate_missing(self):
        value = packet(); value["issue"]["priority"] = 1
        self.assertHeld(value, "issue-preimage-changed")
        value["expected"]["priority"] = 1
        self.assertTrue(project(value)["allowed"])
        for priority in (0, None, True, "1", 5):
            with self.subTest(priority=priority):
                value["issue"]["priority"] = value["expected"]["priority"] = priority
                self.assertHeld(value, "issue-not-a-complete-backlog-candidate")

    def test_identity_state_version_and_complete_labels_are_required(self):
        for key, value in [("id", "another"), ("updatedAt", "2026-10-16T19:47:00Z"), ("state", "Todo")]:
            with self.subTest(key=key):
                candidate = packet(); candidate["issue"][key] = value
                self.assertHeld(candidate, "issue-preimage-changed")
        for key, value in [("identifier", "LYB-1"), ("stateType", "unstarted"), ("updatedAt", "unknown"), ("labelsComplete", False)]:
            with self.subTest(key=key):
                candidate = packet(); candidate["issue"][key] = value
                self.assertHeld(candidate, "issue-not-a-complete-backlog-candidate")

    def test_unknown_states_hold_and_todo_is_only_valid_in_ordering_projection(self):
        for state in ("Unknown", None, {}, []):
            with self.subTest(state=state):
                value = packet()
                value["issue"]["state"] = value["expected"]["state"] = state
                value["issue"]["stateType"] = None
                self.assertHeld(value, "issue-not-a-complete-backlog-candidate")
        value = packet()
        value["issue"]["state"] = value["expected"]["state"] = "Todo"
        value["issue"]["stateType"] = "unstarted"
        self.assertHeld(value, "issue-not-a-complete-backlog-candidate")
        result = admission.project_backlog_admission(value, now=NOW, canonical_state_path=STATE, _ordering_only=True)
        self.assertTrue(result["allowed"])
        self.assertFalse(result["authorizesTransition"])
        self.assertFalse(result["authorizesDispatch"])

    def test_attempt_decode_is_bounded_and_creator_checked_before_decode(self):
        import base64
        import zlib
        value = packet()
        row = status()
        row["creator"] = {"login": "untrusted", "type": "User"}
        value["attemptHistory"]["pages"] = [[row]]
        with patch.object(admission, "_bounded_attempt_receipt", side_effect=AssertionError("untrusted decode")):
            self.assertHeld(value, "canonical-attempt-history-unreadable")
        packed = status()["target_url"].split("#jovie-execution=", 1)[1]
        self.assertEqual(admission._bounded_attempt_receipt(packed), execution_attempt._unpack(packed))
        def encode(raw):
            return base64.urlsafe_b64encode(raw).decode().rstrip("=")
        compressed = zlib.compress(b'{"a":1}')
        for invalid in [execution_attempt._pack({"padding": "a" * 65537}), encode(compressed[:-1]),
                        encode(compressed + b"trailing"), encode(zlib.compress(b"not-json")), "!invalid"]:
            with self.subTest(invalid=invalid[:16]), self.assertRaises((ValueError, zlib.error)):
                admission._bounded_attempt_receipt(invalid)

    def test_every_join_is_fresh_and_future_or_missing_stamps_hold(self):
        for name in ("issue", "dependencies", "custody", "runtime", "attemptHistory"):
            for stamp in (NOW - admission.MAX_AGE_S - 1, NOW + 1, None, "unknown"):
                with self.subTest(name=name, stamp=stamp):
                    value = packet(); value[name]["observedAt"] = stamp
                    result = project(value)
                    self.assertFalse(result["allowed"])
        self.assertFalse(admission.project_backlog_admission(packet(), now=float("nan"), canonical_state_path=STATE)["allowed"])
        self.assertFalse(project(packet(), now=str(NOW))["allowed"])

    def test_dependency_done_needs_actual_implementation_and_complete_matching_set(self):
        value = packet(); value["dependencies"]["rows"][0]["sourceAcceptance"] = None
        self.assertHeld(value, "dependency-acceptance-unproven")
        value["dependencies"]["rows"][0]["sourceAcceptance"] = {"kind": "docs-merge"}
        self.assertHeld(value, "dependency-acceptance-unproven")
        value = packet(); value["dependencies"]["rows"][0]["state"] = "Validating"
        self.assertHeld(value, "dependency-not-fulfilled")
        for mutation in (lambda v: v["dependencies"].update(complete=False),
                         lambda v: v["dependencies"].update(rows=[]),
                         lambda v: v["dependencies"].update(issueUpdatedAt="changed"),
                         lambda v: v["dependencies"]["rows"][0].update(id=None),
                         lambda v: v["issue"].update(dependencyIds=["prerequisite-uuid", "prerequisite-uuid"])):
            value = packet(); mutation(value)
            self.assertHeld(value, "dependency-set-unproven")
        value = packet(); value["dependencies"]["rows"][0]["observedAt"] = NOW - 61
        self.assertFalse(project(value)["allowed"])

    def test_no_dependencies_requires_complete_empty_read(self):
        value = packet(); value["issue"]["dependencyIds"] = []; value["dependencies"]["rows"] = []
        self.assertTrue(project(value)["allowed"])
        del value["dependencies"]["complete"]
        self.assertHeld(value, "dependency-set-unproven")

    def test_current_and_legacy_custody_and_unknown_owner_preserve_holds(self):
        for field, entries in [("holders", [{"owner": "accepted worker", "leaseId": "existing"}]), ("unknown", ["legacy lease"] )]:
            value = packet(); value["custody"][field] = entries
            self.assertHeld(value, "accepted-custody-held")
        for mutation in (lambda v: v["custody"].update(complete=False),
                         lambda v: v["custody"].update(sources=["native-claims"]),
                         lambda v: v["custody"].update(sources=[{}]),
                         lambda v: v["custody"].update(issueId="other")):
            value = packet(); mutation(value)
            self.assertHeld(value, "accepted-custody-unproven")

    def test_scratch_state_changed_installed_source_policy_or_release_never_clear(self):
        for field, value in [("statePath", "/tmp/ci-lanes"), ("installedPath", STATE + "/releases/../../scratch"),
                             ("installedPath", STATE + "/releases/not-a-bundle/scripts/lanes"),
                             ("installedPath", STATE + "/releases/" + "a" * 64 + "/other/lanes"),
                             ("sourceHash", "e" * 64), ("policyHash", "f" * 64), ("releaseTree", "1" * 40),
                             ("issueUpdatedAt", "changed")]:
            candidate = packet(); candidate["runtime"][field] = value
            self.assertHeld(candidate, "installed-runtime-preimage-unproven")
        value = packet(); value["runtime"]["sourceHash"] = value["expectedRuntime"]["sourceHash"] = "not-a-hash"
        self.assertHeld(value, "installed-runtime-preimage-unproven")
        self.assertFalse(admission.project_backlog_admission(packet(), now=NOW, canonical_state_path="relative")["allowed"])

    def test_native_predicate_results_are_preserved_without_copied_sensitivity_or_routing(self):
        for field, verdict in [("rejection", "sensitive-text"), ("rejection", "routed:codex"),
                               ("poolRejection", "hotspot-held:scripts/lanes/lane_runner.py#21724"),
                               ("heldBack", True), ("inFlight", True), ("claims", [{"status": "active"}])]:
            value = packet(); value["runtime"]["worker"][field] = verdict
            result = self.assertHeld(value, "native-worker-held")
            self.assertEqual(next(row for row in result["holds"] if row["code"] == "native-worker-held")["evidence"][field], verdict)
        for mutation in (lambda v: v["runtime"]["worker"].update(sourceHash="a" * 64),
                         lambda v: v["runtime"]["worker"].update(sourceFunctions=[{}]),
                         lambda v: v["runtime"]["worker"].pop("inFlight"),
                         lambda v: v["runtime"]["worker"].update(rejection=False)):
            value = packet(); mutation(value)
            self.assertHeld(value, "native-worker-predicates-unavailable")

    def test_existing_capacity_budget_disk_quota_and_typed_work_holds_are_not_waived(self):
        for field, verdict in [("workAdmission", "hold"), ("newIssueLease", "hold"), ("budget", "unknown"),
                               ("disk", "critical"), ("quota", "banked"), ("intakeSlots", 0), ("freeSlots", 0), ("freeSlots", True)]:
            value = packet(); value["runtime"]["resources"][field] = verdict
            self.assertHeld(value, "native-resource-held-or-unknown")
        value = packet(); value["runtime"]["resources"]["observedAt"] = NOW - 61
        self.assertHeld(value, "resources-stale-or-unreadable")

    def test_actual_file_overlap_blocks_or_unknowns_are_never_ignored(self):
        for verdict in (None, {"allowed": False, "decisions": []}, {"allowed": True}, {"allowed": "true", "decisions": []}):
            value = packet(); value["runtime"]["fileOverlap"] = verdict
            self.assertHeld(value, "native-file-overlap-held-or-unknown")
        value = packet(); value["runtime"]["fileOverlap"] = {"allowed": True, "decisions": [{"actionTaken": "flag"}]}
        self.assertTrue(project(value)["allowed"])

    def test_all_workkey_generations_hold_even_when_current_generation_and_reentry_flag_differ(self):
        for terminal in ("failed_known", "succeeded", "budget_exhausted", None):
            value = packet(); value["attemptHistory"]["pages"] = [[status(generation="old", terminal=terminal)]]
            value.update(allowed=True, reentryGrant={"approved": True})
            self.assertHeld(value, "existing-attempt-reentry-owner-hold")
        value = packet(); value["attemptHistory"]["pages"] = [[{"id": 1, "context": "unrelated-ci"}, status(identifier="JOV-9999")]]
        self.assertTrue(project(value)["allowed"])

    def test_incomplete_wrong_anchor_or_unreadable_attempt_history_fails_closed(self):
        for field, verdict in [("complete", False), ("hasNextPage", True), ("anchor", "f" * 40),
                               ("repository", "Fixture/Repo"), ("pages", []), ("pages", [None]), ("pages", [[]] * 101)]:
            value = packet(); value["attemptHistory"][field] = verdict
            self.assertHeld(value, "canonical-attempt-history-unavailable")
        for row in (None, {"context": {}}, {"context": "jovie-execution/bad", "target_url": "missing"},
                    {"context": "jovie-execution/bad", "target_url": "https://x#jovie-execution=broken"}):
            value = packet(); value["attemptHistory"]["pages"] = [[row]]
            self.assertHeld(value, "canonical-attempt-history-unreadable")
        value = packet(); row = status(); row["creator"] = {"login": "untrusted", "type": "User"}
        value["attemptHistory"]["pages"] = [[row]]
        self.assertHeld(value, "canonical-attempt-history-unreadable")
        value = packet(); row = status(); row["context"] = "jovie-execution/wrong"
        value["attemptHistory"]["pages"] = [[row]]
        self.assertHeld(value, "canonical-attempt-history-unreadable")
        value = packet(); row = status(); receipt = execution_attempt._unpack(row["target_url"].split("#jovie-execution=", 1)[1])
        receipt["workKey"] = "unreadable-work-key"
        row["target_url"] = "https://x#jovie-execution=" + execution_attempt._pack(receipt)
        value["attemptHistory"]["pages"] = [[row]]
        self.assertHeld(value, "canonical-attempt-history-unreadable")

    def test_replay_restart_and_redelivery_do_not_create_authority_or_mutate_inputs(self):
        value = packet()
        first = project(value)
        self.assertEqual(first, project(deepcopy(value)))
        encoded = json.dumps(value)
        self.assertEqual(first, project(json.loads(encoded)))
        value["allowed"] = False
        self.assertTrue(project(value)["allowed"])
        self.assertFalse(project(None)["allowed"])


class InstalledCollectorTest(unittest.TestCase):
    def test_repo_or_ci_scratch_execution_cannot_impersonate_installed_host(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"LANES_STATE": "/tmp/ci-lanes"}):
            result = admission.collect_backlog_admission("JOV-6641", VERSION, home=tmp)
        self.assertFalse(result["allowed"])
        self.assertEqual({row["code"] for row in result["holds"]},
                         {"collector-not-installed-canonical-runtime", "noncanonical-state-environment"})

    def test_installed_collector_joins_only_host_reads_and_rejects_changes(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {}, clear=True):
            home = Path(tmp); state = home / ".local/state/jovie-lanes"
            current = state / "releases" / ("a" * 64) / "scripts/lanes"; current.mkdir(parents=True)
            module = current / "backlog_admission.py"; module.write_text("fixture")
            for name in ("lane_runner.py", "routing.json", "providers.json"):
                (current / name).write_text("{}")
            (current / ".tree").write_text("d" * 40)
            (state / "current").symlink_to(current)
            (state / "linear").mkdir()
            mirror_path = state / "linear/mirror-JOV.json"
            mirror_path.write_text(json.dumps({"issues": {"fixture": {"id": "fixture", "identifier": "JOV-6641", "updatedAt": VERSION}}}))
            reads = SimpleNamespace(issue=lambda identity: {"id": "fixture", "identifier": "JOV-6641", "updatedAt": VERSION}, validate_runtime=lambda: None)
            prepared = SimpleNamespace(observation=admission._observation("JOV-6641", []))
            with patch.object(admission, "_NativeReads", return_value=reads), \
                 patch.object(admission, "_PreparedGuard", return_value=prepared) as context:
                result = admission.collect_backlog_admission("JOV-6641", VERSION, home=home, module_path=module)
                self.assertTrue(result["allowed"])
                self.assertFalse(result["authorizesDispatch"])
                self.assertEqual(context.call_args.kwargs["reads"], reads)
                self.assertEqual(context.call_args.args[0], state.resolve())
            with patch.object(admission, "_NativeReads", return_value=reads):
                reads.issue = lambda identity: {"identifier": "JOV-6641", "updatedAt": "changed"}
                changed = admission.collect_backlog_admission("JOV-6641", VERSION, home=home, module_path=module)
                self.assertEqual(changed["holds"][0]["evidence"], "fresh-linear-identity-version-mismatch")
            mirror_path.write_text("broken")
            self.assertFalse(admission.collect_backlog_admission("JOV-6641", VERSION, home=home, module_path=module)["allowed"])

    def test_invalid_identity_version_and_cli_remain_observation_only(self):
        self.assertFalse(admission.collect_backlog_admission("LYB-1", "missing")["allowed"])
        with patch.object(admission, "collect_backlog_admission", return_value=admission._observation("JOV-6641", [])), \
             patch("builtins.print") as printed:
            self.assertEqual(admission.main(["--issue", "JOV-6641", "--expected-version", VERSION]), 0)
            self.assertFalse(json.loads(printed.call_args.args[0])["authorizesTransition"])
        with patch("builtins.print"):
            self.assertEqual(admission.main(["--issue", "JOV-6641", "--expected-version", VERSION]), 2)


def linear_row(identifier="JOV-6641", identity="fixture", state="Backlog"):
    row = {"id": identity, "identifier": identifier, "title": "Bounded CI behavior", "description": "Reuse existing native predicates",
           "priority": 2, "updatedAt": VERSION, "createdAt": VERSION, "state": {"name": state, "type": "backlog" if state == "Backlog" else "completed"},
           "assignee": None, "delegate": None, "parent": None, "archivedAt": None}
    for key in admission.CONNECTIONS:
        row[key] = {"nodes": [], "pageInfo": {"hasNextPage": False}}
    row["labels"]["nodes"] = [{"id": "label-1", "name": "agent-ready"}]
    return row


class ReadBoundaryTest(unittest.TestCase):
    def reads(self):
        reads = object.__new__(admission._NativeReads)
        reads.linear = SimpleNamespace(admit=lambda cost: True, gql=lambda query, variables: {"issue": linear_row()})
        return reads

    def test_runtime_bootstrap_uses_installed_release_validator_and_existing_transports(self):
        import lane_runner as lane
        with tempfile.TemporaryDirectory() as tmp:
            current = Path(tmp).resolve() / ("a" * 64) / "scripts/lanes"; current.mkdir(parents=True)
            (current / ".release.json").write_text(json.dumps({"schema": "jovie-lane-release-bundle/v1", "bundleDigest": "a" * 64}))
            state = current.parent.parent.parent
            with patch.object(lane, "__file__", str(current / "lane_runner.py")), \
                 patch.object(lane.lifecycle, "validate_release") as validate, patch.object(lane, "Linear") as linear, \
                 patch.object(lane, "load_github_env") as load:
                reads = admission._NativeReads(current, state)
                validate.assert_called_once(); linear.assert_called_once(); load.assert_called_once()
                fleet = current.parent / "fleet-gate"; fleet.mkdir()
                (fleet / "scoped_admission.py").write_text("from datetime import timedelta\nMAX_AGE=timedelta(minutes=10)\n")
                self.assertEqual(reads.fleet_max_age(), 600)
                (current / ".release.json").write_text(json.dumps({"schema": "jovie-lane-release-bundle/v1", "bundleDigest": "changed"}))
                with self.assertRaisesRegex(admission.Unavailable, "installed-release-bundle-mismatch"): reads.validate_runtime()
                (current / ".release.json").write_text("{}")
                with self.assertRaisesRegex(admission.Unavailable, "canonical-file-schema"): reads.validate_runtime()
            with self.assertRaisesRegex(admission.Unavailable, "native-module-not-installed"): admission._NativeReads(current, state)

    def test_bounded_pagination_is_complete_and_rechecks_first_page(self):
        calls = []
        pages = {1: [1, 2], 2: [3]}
        result = admission._paged(lambda n: calls.append(n) or pages[n], limit=2)
        self.assertEqual(result, [[1, 2], [3]])
        self.assertEqual(calls, [1, 2, 1])
        calls.clear()
        self.assertEqual(admission._paged(lambda n: calls.append(n) or [], recheck=False), [[]])
        self.assertEqual(calls, [1])
        for fetch, kwargs in [(lambda n: {}, {}), (lambda n: [1, 2, 3], {"limit": 2}),
                              (lambda n: [1, 2], {"limit": 2, "maximum": 2})]:
            with self.subTest(kwargs=kwargs), self.assertRaises(admission.Unavailable):
                admission._paged(fetch, **kwargs)
        values = iter([[1, 2], [], [0, 1]])
        with self.assertRaisesRegex(admission.Unavailable, "paged-history-changed"):
            admission._paged(lambda n: next(values), limit=2)

    def test_inverse_blocks_and_outgoing_blocked_by_are_deduplicated(self):
        row = linear_row()
        row["relations"]["nodes"] = [{"id": "r1", "type": "blocks", "relatedIssue": {"id": "child"}},
                                        {"id": "r2", "type": "blocked_by", "relatedIssue": {"id": "dep"}}]
        row["inverseRelations"]["nodes"] = [{"id": "r3", "type": "blocks", "issue": {"id": "dep"}}]
        self.assertEqual(admission._dependency_ids(row), ["dep"])
        row["inverseRelations"]["nodes"][0]["issue"] = {}
        with self.assertRaises(admission.Unavailable): admission._dependency_ids(row)

    def test_native_transport_preserves_budget_and_rejects_errors(self):
        reads = self.reads()
        self.assertIn("issue", reads.query("query{}", {}))
        reads.linear.gql = lambda *args: {"data": {"ok": True}}
        self.assertEqual(reads.query("query{}", {}), {"ok": True})
        reads.linear.admit = lambda cost: False
        with self.assertRaisesRegex(admission.Unavailable, "linear-native-budget-held"): reads.query("query{}", {})
        reads.linear.admit = lambda cost: True
        for value in (None, {"errors": ["failure"]}):
            reads.linear.gql = lambda *args: value
            with self.assertRaises(admission.Unavailable): reads.query("query{}", {})
        with patch.object(subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout='{"ok":true}')) as run:
            self.assertTrue(reads.gh("repos/JovieInc/Jovie/pulls")["ok"])
            self.assertEqual(run.call_args.args[0][2:5], ["-X", "GET", "repos/JovieInc/Jovie/pulls"])
        with patch.object(subprocess, "run", return_value=SimpleNamespace(returncode=1, stdout="")):
            with self.assertRaises(admission.Unavailable): reads.gh("fixture")

    def test_global_cohort_reads_all_priority_tiers_without_priority_inflation_and_fails_closed(self):
        reads = self.reads(); row = linear_row()
        row["labels"]["nodes"].append({"id":"designation", "name":"dispatch-next"})
        calls = []
        def query(text, variables):
            calls.append(variables)
            self.assertIn('includeArchived:false', text)
            return {"issues": {"nodes": [deepcopy(row)], "pageInfo": {"hasNextPage": False}}}
        reads.query = query
        self.assertEqual(reads.cohort(), [row])
        filters = calls[0]["filter"]
        self.assertIn({"priority": {"eq": 1}}, filters["or"])
        self.assertIn({"labels": {"some": {"name": {"eq": "P0"}}}}, filters["or"])
        self.assertIn({"and": [{"priority": {"eq": 2}}, {"labels": {"some": {"name": {"eq": "agent-ready"}}}},
                               {"labels": {"some": {"name": {"eq": "dispatch-next"}}}}]}, filters["or"])
        row["priority"] = 0
        row["labels"]["nodes"].append({"id":"p0", "name":"P0"})
        self.assertEqual(reads.cohort()[0]["priority"], 0)
        row["labels"]["pageInfo"]["hasNextPage"] = True
        complete = deepcopy(row); complete["labels"]["pageInfo"]["hasNextPage"] = False
        with patch.object(reads, "issue", return_value=complete) as full:
            self.assertEqual(reads.cohort(), [complete]); full.assert_called_once_with("fixture")
        row["labels"]["pageInfo"]["hasNextPage"] = False
        for page in ({}, {"nodes": None, "pageInfo": {"hasNextPage": False}},
                     {"nodes": [{}], "pageInfo": {"hasNextPage": False}},
                     {"nodes": [row, row], "pageInfo": {"hasNextPage": False}},
                     {"nodes": [{**row, "labels": {"nodes": None}}], "pageInfo": {"hasNextPage": False}},
                     {"nodes": [], "pageInfo": {"hasNextPage": True, "endCursor": None}}):
            reads.query = lambda *args: {"issues": page}
            with self.subTest(page=page), self.assertRaises(admission.Unavailable): reads.cohort()
        def pages(text, variables):
            return {"issues": {"nodes": [row] if variables["after"] is None else [],
                               "pageInfo": {"hasNextPage": variables["after"] is None, "endCursor": "cursor"}}}
        reads.query = pages
        self.assertEqual(reads.cohort(), [row])
        with patch.object(admission, "MAX_PAGES", 1), self.assertRaisesRegex(admission.Unavailable, "global-cohort-pagination-bound"):
            reads.cohort()

    def test_full_linear_read_batches_complete_connections_and_bounds_remaining_pages(self):
        reads = self.reads(); core = linear_row(); calls = []
        reads.query = lambda text, variables: calls.append(text) or {"issue": deepcopy(core)}
        self.assertEqual(reads.issue("fixture"), core)
        self.assertEqual(len(calls), 1)
        self.assertTrue(all(name + "(first:50)" in calls[0] for name in admission.CONNECTIONS))
        self.assertEqual(reads.issue("fixture", full=False), core)
        for connection in ({"nodes": None},
                           {"nodes": [{"id": "x"}, {"id": "x"}], "pageInfo": {"hasNextPage": False}},
                           {"nodes": [], "pageInfo": {"hasNextPage": True, "endCursor": None}}):
            reads.query = lambda text, variables: {"issue": {**deepcopy(core), "labels": connection}}
            with self.subTest(connection=connection), self.assertRaises(admission.Unavailable): reads.issue("fixture")
        reads.query = lambda *args: {"issue": None}
        with self.assertRaises(admission.Unavailable): reads.issue("fixture")
        def multipage(text, variables):
            if "after" not in variables:
                row = deepcopy(core)
                row["labels"] = {"nodes": [{"id": "x", "name": "first"}], "pageInfo": {"hasNextPage": True, "endCursor": "cursor"}}
                return {"issue": row}
            return {"issue": {"updatedAt": VERSION, "labels": {"nodes": [{"id": "y", "name": "second"}], "pageInfo": {"hasNextPage": False}}}}
        reads.query = multipage
        self.assertEqual(len(reads.issue("fixture")["labels"]["nodes"]), 2)
        with patch.object(admission, "MAX_PAGES", 1), self.assertRaisesRegex(admission.Unavailable, "linear-pagination-bound"):
            reads.issue("fixture")
        reads.query = lambda text, variables: {"issue": {"updatedAt": "changed"}} if "after" in variables else multipage(text, variables)
        with self.assertRaisesRegex(admission.Unavailable, "linear-issue-changed-during-pagination"): reads.issue("fixture")

    def test_complete_native_pr_reader_and_canonical_history_are_reused_without_cache_writes(self):
        import lane_runner as lane
        reads = self.reads(); reads.lane = lane
        pr = {"number": 5, "headRefOid": "a" * 40, "headRefName": "codex/jov-6641", "baseRefName": "main", "baseRefOid": "b" * 40,
              "state": "OPEN", "labels": [], "isDraft": False, "files": [{"path": "apps/web/lib/example.ts"}],
              "labelsComplete": True, "filesComplete": True, "inlineFilesEvidence": {"source": "protected fixture"}}
        raw = {"number": 5, "head": {"sha": "a" * 40, "ref": "codex/jov-6641"}, "base": {"sha": "b" * 40, "ref": "main"},
               "state": "open", "labels": [], "draft": False}
        reads.pr_metadata = lambda: [[deepcopy(raw)]]
        def native(proxy, report):
            report["complete"] = True
            self.assertIsNone(lane.pr_events.pr_files_cache(pr))
            return [deepcopy(pr)]
        with patch.object(lane.pr_events, "open_prs_state", side_effect=native), \
             patch.object(lane.pr_events, "_valid_target_file_evidence", return_value=True):
            self.assertEqual(reads.open_prs()[0]["files"], pr["files"])
            raw["head"]["sha"] = "changed"
            with self.assertRaisesRegex(admission.Unavailable, "github-open-pr-set-changed"): reads.open_prs()
            raw["head"]["sha"] = "a" * 40
            pr["filesComplete"] = False
            with self.assertRaisesRegex(admission.Unavailable, "native-open-pr-scope-incomplete"): reads.open_prs()
            pr["filesComplete"] = True
        with patch.object(lane.pr_events, "open_prs_state", return_value=None), self.assertRaises(admission.Unavailable): reads.open_prs()
        with patch.object(lane.pr_events, "open_prs_state", side_effect=native), \
             patch.object(lane.pr_events, "_valid_target_file_evidence", return_value=False), self.assertRaisesRegex(admission.Unavailable, "inline-scope-unavailable"):
            reads.open_prs()
        reads.gh = lambda endpoint: []
        with patch.object(execution_attempt, "_gh", return_value=[[]]) as gh:
            self.assertEqual(reads.history(), [[]]); self.assertEqual(gh.call_args.args[1], "GET")
        for pages in ([], [None], [[]] * 101):
            with patch.object(execution_attempt, "_gh", return_value=pages), self.assertRaises(admission.Unavailable): reads.history()
        with patch.object(execution_attempt, "_gh", return_value=[[status()]]), self.assertRaisesRegex(admission.Unavailable, "paged-history-changed"):
            reads.history()
        self.assertEqual(reads._read_gh_command(["gh", "api", "repos/JovieInc/Jovie/pulls"]).returncode, 1)
        with patch.object(subprocess, "run", return_value=SimpleNamespace(returncode=0)) as run:
            reads._read_gh_command(["gh", "api", "graphql"], timeout=120)
            self.assertEqual(run.call_args.kwargs["timeout"], 30)

    def test_installed_custody_helper_requires_bound_transitive_files_and_valid_output(self):
        reads = self.reads()
        with tempfile.TemporaryDirectory() as tmp:
            reads.current = Path(tmp).resolve() / "scripts/lanes"; reads.current.mkdir(parents=True)
            with self.assertRaisesRegex(admission.Unavailable, "interpreter-unavailable"): reads.ownership(linear_row())
            base = reads.current.parent / "backlog-orchestrator"; base.mkdir()
            for name in ("admission-disposition.mjs", "admission-policy.mjs", "ownership-inventory.mjs", "ownership-inventory.json"):
                (base / name).write_text("fixture")
            output = {"ownership": {"status": "unowned"}, "founder": False, "founderComments": []}
            with patch.object(subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout=json.dumps(output))) as run:
                self.assertEqual(reads.ownership(linear_row()), output)
                self.assertIn('classifyAdmissionDisposition', run.call_args.args[0][-1])
            for output in (SimpleNamespace(returncode=1, stdout=""), SimpleNamespace(returncode=0, stdout='{}')):
                with patch.object(subprocess, "run", return_value=output), self.assertRaises(admission.Unavailable): reads.ownership(linear_row())

    def test_dependency_acceptance_needs_owner_binding_actual_merge_and_identical_current_blobs(self):
        reads = self.reads(); row = linear_row("JOV-6640", "dep", "Done")
        merge, head, reviewed, current = (c * 40 for c in "abcd")
        path = "apps/web/lib/agent-os/dogfood-receipt.ts"
        row["comments"]["nodes"] = [{"id": "binding", "body": f"source binding correction https://github.com/JovieInc/Jovie/pull/19037 `{merge}` `{head}` reviewed current source `{reviewed}` `{path}`"}]
        reads.ownership = lambda issue: {"founderComments": ["binding"]}
        reads.host = SimpleNamespace(repo=Path("/canonical/repo"))
        reads.gh = lambda endpoint: [{"filename": path}] if "/files?" in endpoint else {"merged": True, "merge_commit_sha": merge, "head": {"sha": head}}
        def git(command, **kwargs):
            if "rev-parse" in command and command[-1] == "origin/main": return SimpleNamespace(returncode=0, stdout=current)
            if "merge-base" in command: return SimpleNamespace(returncode=0, stdout="")
            return SimpleNamespace(returncode=0, stdout="blob\nblob\n")
        with patch.object(subprocess, "run", side_effect=git):
            result = reads.acceptance(row)
            self.assertEqual(result["mergeSha"], merge)
            self.assertEqual(result["sourceSha"], current)
        with patch.object(subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout=current)):
            self.assertIsNone(reads.acceptance(row))
        reads.gh = lambda endpoint: {"merged": False}
        self.assertIsNone(reads.acceptance(row))
        row["comments"]["nodes"][0]["body"] = "Done docs-only receipt"
        self.assertIsNone(reads.acceptance(row))


class NativeJoinTest(unittest.TestCase):
    def test_native_join_reuses_worker_overlap_capacity_and_claim_predicates_without_mutation(self):
        import lane_runner as native
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp).resolve(); (state / "linear").mkdir()
            originals = {
                "claims.json": {"schema": native.linear_sync.CLAIMS, "claims": {"fixture": {"status": "active"}}},
                "outbox.json": {"schema": native.linear_sync.OUTBOX, "entries": [{"key": "existing", "issueId": "fixture"}]},
                "mirror-JOV.json": {"schema": native.linear_sync.MIRROR, "issues": {}},
            }
            for name, value in originals.items(): (state / "linear" / name).write_text(json.dumps(value))
            (state / "failures.json").write_text("{}")
            (state / "file-overlap.json").write_text(json.dumps({"schema":"symphony-file-overlap/v1", "tasks":{}, "active":{}}))
            gate = state / "gem-workspace/state/gem-priority-gate"; gate.mkdir(parents=True)
            fleet = {"schema": "jovie-fleet-gate/v1", "observedAt": NOW - 240,
                     "workAdmission": {"allowed": True, "newImplementationAllowed": True, "newIssueLeaseAllowed": True,
                                       "productNewIssueLeaseAllowed": {"jovie": True}},
                     "closureAdmission": {"newIssueIntakeAllowed": True}}
            (gate / "latest.json").write_text(json.dumps(fleet))
            row = linear_row()
            codex = SimpleNamespace(status=lambda now: {"accounts": {"existing": {"available": True, "freeSlots": 1}}})
            @contextmanager
            def slots(lane): yield set(), codex
            lane = SimpleNamespace(Issue=native.Issue, LANE_BRANCH=native.LANE_BRANCH, ISSUE_MARKER=native.ISSUE_MARKER,
                linear_sync=SimpleNamespace(CLAIMS=native.linear_sync.CLAIMS, OUTBOX=native.linear_sync.OUTBOX, MIRROR=native.linear_sync.MIRROR,
                                            todo=lambda *args: []),
                shared=native.shared, in_flight_issues=lambda: frozenset({"JOV-6641"}) if prs else frozenset(),
                overlap_prs_summary=lambda: [], overlap_inventory=lambda *args: (lane.overlap_prs_summary(), []),
                handoff_cooldown_path=native.handoff_cooldown_path,
                pr_events=native.pr_events, held_back_issues=lambda *args: frozenset(), ROUTING_POLICY=Path("routing.json"),
                load_providers=lambda: {"codex": {"slots": 6, "quota": {"source": "codex-accounts"}}},
                read_json=lambda path: {"schema": "current-native-routing"},
                issue_router=lambda *args: None, admission_rejection=native.admission_rejection,
                quota_pressure=lambda *args: {"ok": True}, new_issue_budget=native.new_issue_budget,
                hotspot_holds=native.hotspot_holds, pool_rejections=native.pool_rejections,
                file_overlap=SimpleNamespace(_state_path=native.file_overlap._state_path, local_tasks=lambda *args: [], admission_policy=native.file_overlap.admission_policy),
                workstreams=native.workstreams, disk_guard=SimpleNamespace(free_pct=lambda path: 30, CRITICAL_PCT=5, PRESERVED_REPAIR=native.disk_guard.PRESERVED_REPAIR))
            host = SimpleNamespace(state=state, slots=lambda *args: 6, intake_slots=lambda *args: 6)
            reads = SimpleNamespace(lane=lane, host=host, state=state, fleet_max_age=lambda: 600, linear=None)
            binding = {"sourceHash": "b" * 64}
            prs = [{"number": 5, "headRefName": "codex/jov-6641-20261016", "headRefOid": "a" * 40,
                    "body": "<!-- linear-issue-id:JOV-6641 -->", "title": "JOV-6641", "labels": [], "files": []}]
            with patch.object(admission, "_observed_slots", side_effect=slots), patch.object(Path, "home", return_value=state):
                runtime, own_prs, pending, preimages = admission._native_runtime(reads, row, prs, binding, NOW)
                self.assertEqual(own_prs, [{"number": 5, "headSha": "a" * 40}]); self.assertEqual(pending, ["existing"])
                self.assertEqual(runtime["worker"]["claims"], [{"status": "active"}])
                self.assertTrue(runtime["fileOverlap"]["allowed"])
                self.assertEqual(runtime["resources"]["workAdmission"], "allowed")
                self.assertEqual(runtime["resources"]["freeSlots"], 1)
                self.assertEqual(len(preimages), 3)
                codex.status = lambda now: {"accounts": {}}
                runtime = admission._native_runtime(reads, row, [], binding, NOW)[0]
                self.assertEqual(runtime["resources"]["quota"], "hold")
                self.assertEqual(runtime["resources"]["freeSlots"], 0)
                fleet["observedAt"] = NOW - 601; (gate / "latest.json").write_text(json.dumps(fleet))
                with self.assertRaisesRegex(admission.Unavailable, "fleet-typed-work-stale"):
                    admission._native_runtime(reads, row, [], binding, NOW)
                lane.load_providers = lambda: {}
                with self.assertRaisesRegex(admission.Unavailable, "native-routing-policy-unreadable"):
                    admission._native_runtime(reads, row, [], binding, NOW)
                originals["outbox.json"]["entries"] = {}; (state / "linear/outbox.json").write_text(json.dumps(originals["outbox.json"]))
                with self.assertRaisesRegex(admission.Unavailable, "native-custody-ledger-unreadable"):
                    admission._native_runtime(reads, row, [], binding, NOW)

    def test_slot_observer_reads_kernel_locks_and_never_acquires_any_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "slot.lock"; path.write_text(""); stat = path.stat()
            key = (os.major(stat.st_dev), os.minor(stat.st_dev), stat.st_ino)
            self.assertTrue(admission._kernel_free(path, set()))
            self.assertFalse(admission._kernel_free(path, {key}))
            self.assertTrue(admission._kernel_free(path.with_name("absent"), {key}))
            codex = SimpleNamespace(_free_slots=lambda name: 99, _slot_paths=lambda name: [path])
            original = lambda *args: "original"
            lane = SimpleNamespace(slot_free=original, codex_lane_module=lambda: codex)
            lockline = f"1: FLOCK ADVISORY WRITE 123 {key[0]:02x}:{key[1]:02x}:{key[2]} 0 EOF"
            with patch.object(Path, "read_text", return_value=lockline):
                with admission._observed_slots(lane) as (locked, observed):
                    self.assertEqual(locked, {key}); self.assertEqual(observed._free_slots("fixture"), 0)
                    self.assertTrue(lane.slot_free(SimpleNamespace(state=Path(tmp)), "fixture", 1))
                self.assertIs(lane.slot_free, original); self.assertEqual(codex._free_slots("fixture"), 99)
            with patch.object(Path, "read_text", return_value="1 xx:yy:zz"), self.assertRaises(admission.Unavailable):
                with admission._observed_slots(lane): pass

    def test_collect_packet_preserves_custody_and_rechecks_full_issue_dependencies_and_ledgers(self):
        row = linear_row(); dep = linear_row("JOV-6640", "dep", "Done")
        row["inverseRelations"]["nodes"] = [{"id": "relation", "type": "blocks", "issue": {"id": "dep"}}]
        with tempfile.TemporaryDirectory() as tmp, patch.object(admission.time, "time", return_value=NOW):
            state = Path(tmp); (state / "runs").mkdir(); ledger = state / "runs/ledger.jsonl"; ledger.write_text("")
            runtime = packet()["runtime"]
            reads = SimpleNamespace(state=state, issue=lambda identity: deepcopy(dep if identity == "dep" else row),
                                    acceptance=lambda issue: packet()["dependencies"]["rows"][0]["sourceAcceptance"],
                                    open_prs=lambda: [], history=lambda: [[]],
                                    ownership=lambda issue: {"founder": True, "ownership": {"status": "unowned"}})
            with patch.object(admission, "_native_runtime", return_value=(runtime, [], [], {})):
                value = admission._collect_packet(reads, row, {}, NOW)
                self.assertEqual(value["issue"]["dependencyIds"], ["dep"])
                self.assertEqual(value["attemptHistory"]["observedAt"], NOW)
                self.assertEqual(value["custody"]["holders"], [])
                row["assignee"] = {"id": "owner", "name": "Accepted worker"}; row["delegate"] = {"id": "delegate"}
                row["comments"]["nodes"] = [{"id": "lease", "body": "jovie-active-lease"}]
                reads.ownership = lambda issue: {"founder": False, "ownership": {"status": "active", "owner": "Incumbent"}}
                ledger.write_text(json.dumps({"issue": "JOV-6641", "startedAt": VERSION, "provider": "existing"}) + "\n")
                value = admission._collect_packet(reads, row, {}, NOW)
                self.assertEqual(len(value["custody"]["holders"]), 3)
                self.assertEqual(len(value["custody"]["unknown"]), 2)
                ledger.write_text("[]\n")
                with self.assertRaisesRegex(admission.Unavailable, "native-attempt-ledger-unreadable"): admission._collect_packet(reads, row, {}, NOW)
                ledger.write_text("")
                original = reads.issue
                reads.issue = lambda identity: {**original(identity), "comments": {"nodes": [{"id": "new-lease"}], "pageInfo": {"hasNextPage": False}}} if identity == "fixture" else original(identity)
                with self.assertRaisesRegex(admission.Unavailable, "linear-preimage-changed"): admission._collect_packet(reads, row, {}, NOW)
                reads.issue = original
                count = 0
                def changing_dep(identity):
                    nonlocal count
                    value = original(identity)
                    if identity == "dep":
                        count += 1
                        if count == 2: value["priority"] = 1
                    return value
                reads.issue = changing_dep
                with self.assertRaisesRegex(admission.Unavailable, "dependency-preimage-changed"): admission._collect_packet(reads, row, {}, NOW)
                reads.issue = original
                row["children"]["nodes"] = [{"id": "child"}]
                with self.assertRaisesRegex(admission.Unavailable, "archived-or-parent-candidate"): admission._collect_packet(reads, row, {}, NOW)


class PreparedContextTest(unittest.TestCase):
    @contextmanager
    def context(self, others=(), *, native_holds=(), projection_mutator=None):
        import lane_runner as lane
        with tempfile.TemporaryDirectory() as tmp, patch.object(admission.time, "time", return_value=NOW):
            state = Path(tmp).resolve() / ".local/state/jovie-lanes"
            current = state / "releases" / ("a" * 64) / "scripts/lanes"; current.mkdir(parents=True)
            (state / "current").symlink_to(current)
            selected = linear_row(identity="selected")
            rows = {row["id"]: deepcopy(row) for row in [selected, *others]}
            reads = SimpleNamespace(lane=lane, state=state, current=current, prs=[], pages=[[]],
                                    cohort=lambda: [deepcopy(rows[key]) for key in sorted(rows) if rows[key]["state"]["name"] in ("Backlog", "Todo")],
                                    issue=lambda identity, full=True: deepcopy(rows[identity]),
                                    validate_runtime=lambda: None)
            reads.open_prs_count = reads.history_count = 0
            def prs(): reads.open_prs_count += 1; return deepcopy(reads.prs)
            def history(): reads.history_count += 1; return deepcopy(reads.pages)
            reads.open_prs, reads.history = prs, history
            reads.pr_metadata = lambda: [[{"number": pr["number"], "title": pr.get("title"), "body": pr.get("body"),
                                           "head": {"ref": pr.get("headRefName"), "sha": pr.get("headRefOid")},
                                           "base": {"ref": pr.get("baseRefName"), "sha": pr.get("baseRefOid")},
                                           "draft": pr.get("isDraft"), "labels": pr.get("labels")} for pr in reads.prs]]
            reads.gh = lambda endpoint: deepcopy(reads.pages[0])
            binding = {"installedPath": str(current), "sourceHash": "b" * 64, "policyHash": "c" * 64, "releaseTree": "d" * 40}
            def projection(shared, row, binding, observed):
                value = packet(); value["issue"].update({key: row[key] for key in ("id", "identifier", "title", "description", "updatedAt", "priority")})
                value["issue"].update(state=row["state"]["name"], stateType=row["state"]["type"], dependencyIds=[], observedAt=observed)
                value["expected"] = {key: value["issue"][key] for key in admission.IDENTITY_FIELDS}
                value["dependencies"].update(issueId=row["id"], issueUpdatedAt=row["updatedAt"], rows=[], observedAt=observed)
                value["custody"].update(issueId=row["id"], issueUpdatedAt=row["updatedAt"], observedAt=observed)
                value["runtime"].update(binding, issueId=row["id"], issueUpdatedAt=row["updatedAt"], statePath=str(state))
                value["expectedRuntime"] = binding
                value["attemptHistory"].update(pages=shared.history(), observedAt=shared.history_observed_at)
                if projection_mutator: projection_mutator(value, row)
                return value
            def native(shared, row, prs, binding, now):
                value = packet()["runtime"]
                if row["id"] in native_holds: value["worker"]["claims"] = [{"status": "active"}]
                return value, [], [], {}
            with patch.object(admission, "_collect_packet", side_effect=projection) as project, patch.object(admission, "_native_runtime", side_effect=native):
                ctx = admission._PreparedGuard(state, "JOV-6641", reads=reads, row=selected, binding=binding, started=NOW)
                yield ctx, reads, rows, project

    def urgent(self, *, state="Backlog", identity="urgent", ready=True):
        row = linear_row("JOV-7330", identity)
        row.update(priority=1)
        row["state"] = {"name": state, "type": "unstarted" if state == "Todo" else "backlog"}
        if not ready: row["labels"]["nodes"] = []
        return row

    def test_eligible_urgent_backlog_fences_high_candidate(self):
        for state in ("Backlog",):
            with self.subTest(state=state), self.context([self.urgent(state=state)]) as (ctx, reads, rows, project):
                result = ctx.observation
                self.assertFalse(result["allowed"])
                self.assertIn("higher-ranked-candidate-eligible", [hold["code"] for hold in result["holds"]])
                self.assertEqual(ctx.issue_id, "selected"); self.assertEqual(ctx.priority, 2)
                self.assertEqual(reads.open_prs_count, 1); self.assertEqual(reads.history_count, 1)
                self.assertEqual(project.call_count, 2)
                result["allowed"] = True
                self.assertFalse(ctx.observation["allowed"])
                self.assertFalse(ctx.revalidate()["authorizesDispatch"])
                self.assertEqual(reads.open_prs_count, 1)

    def test_active_owned_todo_and_unready_backlog_are_named_holds_without_displacement(self):
        with self.context([self.urgent(state="Todo")], native_holds={"urgent"}) as (ctx, reads, rows, project):
            self.assertTrue(ctx.observation["allowed"])
            holds = ctx.observation["evidence"]["predecessorHolds"]
            self.assertEqual(holds[0]["code"], "already-admitted-native-Todo-ordering")
            self.assertEqual(project.call_count, 1)
        with self.context([self.urgent(ready=False)]) as (ctx, reads, rows, project):
            self.assertTrue(ctx.observation["allowed"])
            self.assertEqual(ctx.observation["evidence"]["predecessorHolds"][0]["code"], "backlog-readiness-not-established")

    def test_unclaimed_urgent_todo_keeps_native_claim_order_without_blocking_backlog_admission(self):
        with self.context([self.urgent(state="Todo")]) as (ctx, reads, rows, project):
            self.assertTrue(ctx.observation["allowed"])
            self.assertEqual(ctx.observation["evidence"]["predecessorHolds"][0]["code"], "already-admitted-native-Todo-ordering")
            self.assertEqual(project.call_count, 1)
            self.assertFalse(ctx.assert_bound()["authorizesTransition"])
            self.assertEqual(set(ctx.observation["evidence"]["linearPreimages"]), {"selected"})
            self.assertEqual(ctx.observation["evidence"]["linearPreimages"]["selected"]["state"]["name"], "Backlog")
            self.assertEqual(ctx.observation["evidence"]["linearPreimagesObservedAt"], NOW)
            metadata = ctx.observation["evidence"]["cohortMetadataPreimages"]
            self.assertEqual(set(metadata), {"selected", "urgent"})
            self.assertEqual(set(metadata["urgent"]) & set(admission.CONNECTIONS), {"labels"})

    def test_assert_bound_is_local_only_and_detects_native_history_eligibility_and_retained_changes(self):
        with self.context() as (ctx, reads, rows, project):
            runtime = packet()["runtime"]
            ctx._reads.observe_runtime(rows["selected"], runtime)
            with patch.object(reads, "cohort", side_effect=AssertionError("network under lock")), \
                 patch.object(reads, "pr_metadata", side_effect=AssertionError("network under lock")), \
                 patch.object(reads, "gh", side_effect=AssertionError("network under lock")), \
                 patch.object(reads, "issue", side_effect=AssertionError("network under lock")):
                self.assertTrue(ctx.assert_bound()["allowed"])
            file = Path(ctx.canonical_state_path) / "ledger.fixture"; file.write_text("original")
            ctx._reads.observe_file(file, "original"); file.write_text("changed")
            self.assertEqual(ctx.assert_bound()["holds"][0]["evidence"], "prepared-native-history-changed")
        with self.context() as (ctx, reads, rows, project):
            ctx._cohort[0]["priority"] = 1
            self.assertEqual(ctx.assert_bound()["holds"][0]["evidence"], "retained-cohort-binding-changed")
        with self.context() as (ctx, reads, rows, project):
            with patch.object(admission.time, "time", return_value=NOW + 61):
                self.assertEqual(ctx.assert_bound()["holds"][0]["evidence"], "prepared-cohort-read-stale")

    def test_actual_parent_terminal_and_dependency_holds_keep_named_owners(self):
        parent = self.urgent(); parent["children"]["nodes"] = [{"id": "child"}]
        with self.context([parent]) as (ctx, reads, rows, project):
            self.assertEqual(ctx._cheap_hold(rows["urgent"])["code"], "parent-or-archived")
        with self.context([self.urgent()]) as (ctx, reads, rows, project):
            row = rows["urgent"]; row["priority"] = 0
            self.assertEqual(ctx._cheap_hold(row)["code"], "priority-invalid")
            row["priority"] = 1
            key = execution_attempt.identity("linear-work", {"issue": row["identifier"], "outcome": "draft-pr"}, {})["workKey"]
            ctx._reads.attempts[key] = [{"terminalState": "failed_known"}]
            self.assertEqual(ctx._cheap_hold(row)["owner"], admission.ATTEMPT_OWNER)
        row = self.urgent(); row["inverseRelations"]["nodes"] = [{"id": "rel", "type": "blocks", "issue": {"id": "dep"}}]
        dep = linear_row("JOV-7310", "dep", "Validating"); dep["state"] = {"name": "Validating", "type": "started"}
        with self.context([row, dep]) as (ctx, reads, rows, project):
            self.assertEqual(ctx._cheap_hold(rows["urgent"])["code"], "dependency-not-fulfilled")
            rows["dep"]["state"] = {}
            with self.assertRaises(admission.Unavailable): ctx._cheap_hold(rows["urgent"])

    def test_confirmed_custody_hold_can_preserve_owner_without_calling_it_unknown_eligibility(self):
        def held(value, row):
            if row["id"] == "urgent": value["custody"]["holders"] = [{"owner": "Incumbent"}]
        with self.context([self.urgent()], projection_mutator=held) as (ctx, reads, rows, project):
            self.assertTrue(ctx.observation["allowed"])
            self.assertEqual(ctx.observation["evidence"]["predecessorHolds"][0]["issue"], "JOV-7330")

    def test_unknown_higher_acceptance_cannot_be_a_negative_eligibility_receipt(self):
        def unknown(value, row):
            if row["id"] == "urgent": value["dependencies"]["complete"] = False
        with self.context([self.urgent()], projection_mutator=unknown) as (ctx, reads, rows, project):
            self.assertFalse(ctx.observation["allowed"])
            self.assertIn("higher-ranked-candidate-unknown", [hold["code"] for hold in ctx.observation["holds"]])

    def test_higher_read_failure_keeps_its_identity_and_never_clears_lower_work(self):
        def unavailable(value, row):
            if row["id"] == "urgent": raise admission.Unavailable("current-source-unavailable")
        with self.context([self.urgent()], projection_mutator=unavailable) as (ctx, reads, rows, project):
            held = next(hold for hold in ctx.observation["holds"] if hold["code"] == "higher-ranked-candidate-unknown")
            self.assertEqual(held["evidence"]["issue"], "JOV-7330")
            self.assertEqual(held["evidence"]["reason"], "current-source-unavailable")
            self.assertFalse(ctx.observation["allowed"])

    def test_new_native_claim_between_network_revalidation_and_local_fence_holds(self):
        active = set()
        with self.context(native_holds=active) as (ctx, reads, rows, project):
            ctx._reads.observe_runtime(rows["selected"], packet()["runtime"])
            active.add("selected")
            result = ctx.assert_bound()
            self.assertFalse(result["allowed"])
            self.assertEqual(result["holds"][0]["evidence"], "prepared-native-eligibility-changed")

    def test_changed_cohort_priority_membership_comments_or_dependencies_invalidates_preparation(self):
        mutations = [lambda rows: rows.update(new=self.urgent(identity="new")),
                     lambda rows: rows["selected"].update(priority=1),
                     lambda rows: rows["selected"]["comments"]["nodes"].append({"id": "new-custody", "body": "accepted lease"}),
                     lambda rows: rows["selected"]["inverseRelations"]["nodes"].append({"id": "new-dep", "type": "blocks", "issue": {"id": "dep"}})]
        for mutate in mutations:
            with self.context() as (ctx, reads, rows, project):
                self.assertTrue(ctx.observation["allowed"])
                mutate(rows)
                result = ctx.revalidate()
                self.assertFalse(result["allowed"])
                self.assertIn(result["holds"][0]["evidence"], {"global-cohort-preimage-changed", "prepared-issue-dependency-preimage-changed"})

    def test_new_attempt_or_pr_head_and_original_timestamp_staleness_hold(self):
        with self.context() as (ctx, reads, rows, project):
            reads.pages[0].append(status())
            self.assertEqual(ctx.revalidate()["holds"][0]["evidence"], "prepared-attempt-first-page-changed")
        with self.context() as (ctx, reads, rows, project):
            reads.prs.append({"number": 8, "headRefOid": "e" * 40, "labels": []})
            self.assertEqual(ctx.revalidate()["holds"][0]["evidence"], "prepared-open-pr-preimage-changed")
        with self.context() as (ctx, reads, rows, project):
            initial = ctx.observation["evidence"]["prObservedAt"]
            with patch.object(admission.time, "time", return_value=NOW + 61):
                self.assertEqual(ctx.revalidate()["holds"][0]["evidence"], "prepared-shared-read-stale")
            self.assertEqual(ctx._reads.pr_observed_at, initial)

    def test_shared_read_context_binds_dependencies_and_native_claims_without_adopting_changes(self):
        with self.context() as (ctx, reads, rows, project):
            shared = ctx._reads
            shared.observe_local({Path("/canonical/claims"): "original"})
            with self.assertRaisesRegex(admission.Unavailable, "prepared-native-custody-changed"):
                shared.observe_local({Path("/canonical/claims"): "new"})
            shared.issue("selected", full=False)
            rows["selected"]["state"]["name"] = "Validating"
            with self.assertRaisesRegex(admission.Unavailable, "prepared-dependency-state-changed"):
                shared.issue("selected", full=False)
            with self.assertRaisesRegex(admission.Unavailable, "prepared-cohort-issue-metadata-changed"):
                shared.issue("selected")
            rows["selected"]["labels"]["pageInfo"]["hasNextPage"] = True
            with self.assertRaisesRegex(admission.Unavailable, "prepared-issue-connection-incomplete"):
                admission._issue_digest(rows["selected"])


if __name__ == "__main__":
    unittest.main()
