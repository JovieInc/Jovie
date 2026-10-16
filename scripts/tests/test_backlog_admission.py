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


class BoundedReadParsingTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
