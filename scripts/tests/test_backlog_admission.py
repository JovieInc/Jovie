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
                 patch.object(lane, "load_github_env") as load, \
                 patch.object(admission._NativeReads, "gh", return_value={"ref": "refs/heads/main", "object": {"type": "commit", "sha": "d" * 40}}):
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
        reads.gh = lambda endpoint: ({"ref": "refs/heads/main", "object": {"type": "commit", "sha": current}} if endpoint.endswith("git/ref/heads/main")
                                    else [{"filename": path}] if "/files?" in endpoint else {"merged": True, "merge_commit_sha": merge, "head": {"sha": head}})
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
        with patch.object(subprocess, "run", side_effect=lambda command, **kwargs:
                          SimpleNamespace(returncode=0, stdout="e" * 40 if command[-1] == "origin/main" else "")):
            with self.assertRaisesRegex(admission.Unavailable, "local-origin-main-not-current-canonical"): reads.acceptance(row)
        reads.gh = lambda endpoint: {"merged": False}
        self.assertIsNone(reads.acceptance(row))
        row["comments"]["nodes"][0]["body"] = "Done docs-only receipt"
        self.assertIsNone(reads.acceptance(row))

    def test_canonical_main_is_complete_fresh_and_immutable_across_remote_revalidation(self):
        ref = {"ref": "refs/heads/main", "object": {"type": "commit", "sha": "d" * 40}}
        for malformed in (None, [], {}, {"ref": "refs/heads/main", "object": {"type": "tag", "sha": "d" * 40}},
                          {"ref": "refs/heads/main", "object": {"type": "commit", "sha": "bad"}}):
            with self.subTest(remote=malformed):
                reads = self.reads(); reads.gh = lambda endpoint: malformed
                with self.assertRaisesRegex(admission.Unavailable, "canonical-main-read-unavailable"): reads.canonical_main()
        with patch.object(admission.time, "time", return_value=NOW):
            reads = self.reads(); values = [ref, {**ref, "object": {"type": "commit", "sha": "e" * 40}}]
            reads.gh = lambda endpoint: values.pop(0)
            self.assertEqual(reads.canonical_main(), "d" * 40)
            self.assertEqual(reads.canonical_main(), "d" * 40)
            with self.assertRaisesRegex(admission.Unavailable, "canonical-main-changed"): reads.canonical_main(revalidate=True)
            self.assertEqual(reads._main_observed_at, NOW)
            with patch.object(admission.time, "time", return_value=NOW + 61):
                with self.assertRaisesRegex(admission.Unavailable, "canonical-main-observation-stale"): reads.canonical_main(revalidate=True)



if __name__ == "__main__":
    unittest.main()
