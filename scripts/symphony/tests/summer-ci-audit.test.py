"""Actual collector -> publisher contract, without network or dispatch."""
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import summer_ci_audit as audit
import summer_bottleneck_producer as producer
import closure_health

NOW = datetime(2026, 9, 14, 22, 0, tzinfo=timezone.utc)
SHA = "a" * 40
OTHER = "b" * 40


def repair_target(number=1, reason="required-checks-failed"):
    return closure_health._lifecycle_action(
        {"number": number, "headRefOid": SHA}, 0,
        {"state": "repair", "reason": reason, "issue": "JOV-1"}, None,
        NOW, "JovieInc/Jovie")


def check(identifier=1, **changes):
    return {"id": identifier, "head_sha": SHA, "name": "ci-fast (profile browser)",
            "status": "completed", "conclusion": "failure",
            "completed_at": "2026-09-14T21:00:00Z", **changes}


def fixture(rows=None, *, clock=lambda: NOW, **kwargs):
    rows = [check()] if rows is None else rows
    def reader(_repo, path):
        if path == "branches/main": return {"commit": {"sha": SHA}}
        if path.startswith("pulls/"): return {"state": "open", "head": {"sha": SHA}}
        page = int(path.split("page=")[-1])
        return {"total_count": len(rows), "check_runs": rows[(page - 1) * 100:page * 100]}
    return audit.observe_ci_audit("JovieInc/Jovie", SHA, reader, clock=clock, **kwargs)


class AuditTests(unittest.TestCase):
    def validate(self, value, now=NOW):
        return producer.audit_projection(value, SHA, now)

    def test_real_failure_is_preserved_without_owner_impact_or_action_authority(self):
        value = fixture()
        self.assertEqual(self.validate(value), value)
        self.assertEqual(value["classes"], [audit.ACCEPTED_CLASS])
        self.assertEqual(value["excludedClasses"], audit.excluded_classes())
        self.assertEqual(len(value["excludedClasses"]), 5)
        self.assertNotIn(audit.ACCEPTED_CLASS_ID, [row["id"] for row in value["excludedClasses"]])
        row = value["measurements"][0]
        self.assertEqual(row["completedAt"], "2026-09-14T21:00:00Z")
        self.assertFalse(row["dispatchable"])
        self.assertEqual(row["nonDispatchableReasons"], list(audit.REASONS))
        self.assertTrue(value["sample"]["complete"])
        self.assertEqual(fixture(), value)

    def test_complete_pagination_and_explicit_bounded_sample(self):
        value = fixture([check(i + 1) for i in range(130)], targets=[
            repair_target(n)
            for n in range(1, 6)])
        self.assertEqual(len(value["measurements"]), 25)
        self.assertEqual(value["sample"]["failuresObserved"], 520)
        self.assertEqual(value["sample"]["failuresOmitted"], 495)
        self.assertEqual(value["sample"]["targetsOmitted"], 2)
        self.assertFalse(value["sample"]["complete"])
        self.validate(value)

    def test_partial_pages_conflicts_bad_ids_and_transport_failure_do_not_grant(self):
        variants = [
            {"total_count":2,"check_runs":[check()]},
            {"total_count":2,"check_runs":[check(),check(name="changed")]},
            {"total_count":1,"check_runs":[check(id=False)]},
            {"total_count":1,"check_runs":[check(id=2**53)]},
            {"total_count":1,"check_runs":[check(head_sha=OTHER)]},
            {"total_count":False,"check_runs":[]},
            {"total_count":0,"check_runs":None},
            {"total_count":101,"check_runs":[check(i+1) for i in range(101)]},
        ]
        for response in variants:
            with self.subTest(response=response):
                def reader(_repo,path):
                    return {"commit":{"sha":SHA}} if path == "branches/main" else response
                value=audit.observe_ci_audit("JovieInc/Jovie",SHA,reader,clock=lambda:NOW)
                self.assertIn("incomplete-observation",value["sample"]["reasons"])
                self.assertEqual(value["classes"],[audit.ACCEPTED_CLASS])
                self.validate(value)
        for error in (OSError("private"),subprocess.TimeoutExpired("private",1)):
            value=audit.observe_ci_audit("JovieInc/Jovie",SHA,mock.Mock(side_effect=error),clock=lambda:NOW)
            self.assertNotIn("private",json.dumps(value))
            self.assertFalse(value["sample"]["complete"])

    def test_head_drift_preserves_diagnostics_but_excludes_dispatch(self):
        calls=0
        def reader(_repo,path):
            nonlocal calls
            if path == "branches/main":
                calls+=1
                return {"commit":{"sha": SHA if calls==1 else OTHER}}
            return {"total_count":1,"check_runs":[check()]}
        value=audit.observe_ci_audit("JovieInc/Jovie",SHA,reader,clock=lambda:NOW)
        self.assertEqual(len(value["measurements"]),1)
        self.assertEqual(value["sample"]["reasons"],["head-drift","incomplete-observation"])
        self.validate(value)

    def test_invalid_targets_and_closed_prs_never_create_a_lease_or_new_task(self):
        self.assertIsNone(audit.observe_ci_audit("Other/Repo",SHA,mock.Mock()))
        self.assertIsNone(audit.observe_ci_audit("JovieInc/Jovie","0"*40,mock.Mock()))
        self.assertEqual(fixture(targets=[None,{}, {"repository":"JovieInc/Jovie","pr":1,"action":"implement","headSha":SHA}]),fixture())
        def reader(_repo,path):
            if path.startswith("pulls/"):return {"state":"closed","head":{"sha":SHA}}
            if path=="branches/main":return {"commit":{"sha":SHA}}
            return {"total_count":0,"check_runs":[]}
        value=audit.observe_ci_audit("JovieInc/Jovie",SHA,reader,targets=[repair_target()],clock=lambda:NOW)
        self.assertFalse(value["sample"]["complete"])
        self.assertEqual(value["classes"],[audit.ACCEPTED_CLASS])

    def test_actual_fleet_lifecycle_records_select_observations_without_stealing_ownership(self):
        target = repair_target(42, "merge-state-dirty")
        self.assertEqual(target['action'], 'exact-head-branch-update')
        self.assertEqual(target['owner'], 'gem')
        value = fixture(targets=[target])
        self.assertEqual([row['pr'] for row in value['measurements']], [None, 42])
        self.assertEqual(value['classes'], [audit.ACCEPTED_CLASS])
        self.validate(value)
        self.assertEqual(fixture(targets=[{**target, 'terminal': True}]), fixture())
        self.assertEqual(fixture(targets=[{**target, 'sourceState': 'held'}]), fixture())

    def test_invalid_check_timestamps_and_names_are_explicitly_incomplete(self):
        for changes in ({"completed_at":None},{"completed_at":"2026-09-14"},
                        {"completed_at":"2026-09-15T00:00:00Z"},{"name":"bad\nname"},{"name":""}):
            value=fixture([check(**changes)])
            self.assertFalse(value["sample"]["complete"])
            self.assertEqual(value["measurements"],[])
            self.validate(value)
        self.assertEqual(fixture([check(conclusion="success")])["measurements"],[])

    def test_freshness_boundary_reuses_existing_publisher_source_policy(self):
        value=fixture()
        self.validate(value,NOW+timedelta(seconds=producer.MAX_SOURCE_AGE_SECONDS))
        self.validate(value,NOW-timedelta(seconds=60))
        for at in (NOW+timedelta(seconds=producer.MAX_SOURCE_AGE_SECONDS,microseconds=1), NOW-timedelta(seconds=61)):
            with self.assertRaises(ValueError):self.validate(value,at)

    def test_crossed_bindings_duplicate_measurements_and_forged_permission_are_rejected(self):
        value=fixture()
        accepted = audit.ACCEPTED_CLASS
        mutations=[{"extra":True},{"sourceRevision":OTHER},{"sourceDigest":"bad"},
                   {"classes":[{"id":audit.CLASS_IDS[0],"state":"open","impact":100}]},
                   {"classes":[]},
                   {"classes":[{**accepted,"id":"auto-enroll-self-cancel-churn"}]},
                   {"classes":[{**accepted,"state":"implemented"}]},
                   {"classes":[{**accepted,"owner":"forged"}]},
                   {"classes":[{**accepted,"impact-rule":"forged"}]},
                   {"classes":[{**accepted,"action":"forged"}]},
                   {"classes":[{**accepted,"handle":"forged"}]},
                   {"classes":[accepted, accepted]},
                   {"excludedClasses":[]},{"measurements":value["measurements"]*2},
                   {"measurements":[{**value["measurements"][0],"dispatchable":True}]},
                   {"measurements":[{**value["measurements"][0],"checkId":2**53}]},
                   {"measurements":[{**value["measurements"][0],"ownerAccepted":True}]},
                   {"measurements":[{**value["measurements"][0],"nonDispatchableReasons":[]}]},
                   {"measurements":None}, {"sample":{}},
                   {"sample":{**value["sample"],"failuresOmitted":1}},
                   {"sample":{**value["sample"],"reasons":["allow"]}}]
        for changes in mutations:
            with self.subTest(changes=changes),self.assertRaises((ValueError,TypeError)):
                self.validate({**value,**changes})

    def test_accepted_mapping_may_be_partial_and_matches_the_published_fixture(self):
        value = fixture()
        partial = {**value, "classes": [{**audit.ACCEPTED_CLASS, "state": "partial"}]}
        self.assertEqual(self.validate(partial)["classes"][0]["state"], "partial")
        published = json.loads((Path(__file__).resolve().parents[3]
                                / "apps/web/lib/ovie/fixtures/summer-ci-audit-v2.json").read_text())
        self.assertEqual(published["classes"], [audit.ACCEPTED_CLASS])
        self.assertEqual(published["excludedClasses"], audit.excluded_classes())


if __name__ == "__main__":
    if "--fixture" in sys.argv: print(json.dumps(fixture()))
    else: unittest.main()
