"""Regression coverage for Symphony's file-overlap guard (JOV-7595)."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import file_overlap as overlap  # noqa: E402
import workstreams  # noqa: E402


def changed(path, change="MODIFIED"):
    return {"path": path, "changeType": change, "additions": 2, "deletions": 1 if change != "ADDED" else 0}


def pr(number, files, *, branch=None, base="main", body="", title="change"):
    return {"number": number, "title": title, "body": body, "headRefName": branch or f"codex/jov-{number}",
            "baseRefName": base, "isDraft": False, "isCrossRepository": False, "labels": [], "files": files,
            "createdAt": f"2026-10-02T{number % 24:02}:00:00Z"}


class IncidentPolicyTest(unittest.TestCase):
    def test_20141_and_20166_stack_with_parent_first(self):
        parent = pr(20141, [changed("scripts/lanes/lane_runner.py")], branch="codex/jov-7590-parent")
        child = pr(20166, [changed("scripts/lanes/lane_runner.py")],
                   base="codex/jov-7590-parent", body="This child is stacked on #20141.")
        decision = overlap.classify_pair(parent, child)
        self.assertEqual((decision["firstPr"], decision["laterPr"]), (20141, 20166))
        self.assertEqual(decision["policyAction"], "stack")

    def test_20139_and_20148_serialize(self):
        foundation = pr(20139, [changed("scripts/lanes/doctor.py")], title="foundational lane contracts")
        autoscale = pr(20148, [changed("scripts/lanes/doctor.py")], body="Land after #20139.")
        decision = overlap.classify_pair(foundation, autoscale)
        self.assertEqual((decision["firstPr"], decision["laterPr"]), (20139, 20148))
        self.assertEqual(decision["policyAction"], "sequence")

    def test_readme_only_overlap_is_sequenced(self):
        decision = overlap.classify_pair(
            pr(1, [changed("scripts/lanes/README.md")]),
            pr(2, [changed("scripts/lanes/README.md")]))
        self.assertEqual(decision["policyAction"], "sequence")

    def test_two_added_0131_migrations_block_even_with_different_names(self):
        decision = overlap.classify_pair(
            pr(20131, [changed("apps/web/drizzle/migrations/0131_billing.sql", "ADDED")]),
            pr(20163, [changed("apps/web/drizzle/migrations/0131_profiles.sql", "ADDED")]))
        self.assertEqual(decision["policyAction"], "block")
        self.assertEqual(decision["migrationNumber"], "0131")
        self.assertEqual(len(decision["files"]), 2)

    def test_product_file_overlap_only_flags(self):
        decision = overlap.classify_pair(
            pr(3, [changed("apps/web/app/page.tsx")]),
            pr(4, [changed("apps/web/app/page.tsx")]))
        self.assertEqual(decision["policyAction"], "flag")

    def test_draft_prs_are_not_part_of_the_open_pr_policy(self):
        draft = pr(5, [changed("scripts/lanes/lane_runner.py")])
        draft["isDraft"] = True
        ready = pr(6, [changed("scripts/lanes/lane_runner.py")])
        self.assertEqual(overlap.open_pr_decisions([draft, ready]), [])


class PredictionAndAdmissionTest(unittest.TestCase):
    def test_fresh_target_files_align_overlap_with_worker_and_expire_conservatively(self):
        import lane_runner
        number = 21824; fingerprint = f"remediation:pr-{number}-conflict"
        issue = SimpleNamespace(identifier="JOV-8536", title=f"PR #{number} has carried lane-fix-exhausted for more than 24h ({fingerprint})",
            description=f"https://github.com/JovieInc/Jovie/pull/{number}\nFingerprint: `{fingerprint}`", labels=[fingerprint])
        witness = {number: {"schema": overlap.pr_events.TARGET_FILES_SCHEMA, "source": "graphql-inline",
            "repository": "JovieInc/Jovie", "number": number, "state": "OPEN", "headRefOid": "a"*40,
            "baseRefName": "main", "baseRefOid": "b"*40, "baseTipOid": "c"*40,
            "paths": ["apps/web/lib/profile.ts"], "totalCount": 1,
            "observedAt": 9998, "sourceAt": 9999, "confirmedAt": 10000}}
        prediction = overlap.predict_issue_files(issue, workstreams.classify, witness, 10000)
        self.assertEqual(prediction, {"files": ["apps/web/lib/profile.ts"], "source": "target-pr-files"})
        self.assertEqual(set(prediction["files"]), lane_runner.predicted_touch(issue, witness, 10000))
        self.assertEqual(overlap.admission_policy(issue, [], [], workstreams.classify, witness, 10000)["source"], "target-pr-files")
        self.assertEqual(overlap.predict_issue_files(issue, workstreams.classify, witness, 10061)["source"], "workstream:symphony-throughput")
        issue.description += " Edit scripts/lanes/lane_runner.py."
        self.assertEqual(overlap.predict_issue_files(issue, workstreams.classify, witness, 10000)["source"], "issue-declared-paths")

    def test_default_only_flags_overlap(self):
        # Tim 2026-10-12: no plain `hold` + disabled auto-merge unless enforcement is asked for.
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SYMPHONY_FILE_OVERLAP_GUARD", None)
            self.assertEqual(overlap.guard_mode(), "flag")
        self.assertEqual([overlap.guard_mode(v) for v in ("1", "enforce", "flag", "0", "maybe")],
                         ["flag", "flag", "flag", "off", "flag"])

    def test_real_worker_module_records_overlap_in_the_existing_ledger(self):
        import lane_runner
        issue = SimpleNamespace(identifier="JOV-9", title="Lane change", labels=[],
                                description="Edit `scripts/lanes/lane_runner.py`.")
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
            host = SimpleNamespace(state=Path(tmp))
            result = overlap.admission_decisions(host, lane_runner, issue,
                [pr(20139, [changed("scripts/lanes/lane_runner.py")])], [], workstreams.classify)
            self.assertTrue(result["allowed"], "an overlap is recorded, never a block")
            records = [json.loads(line) for line in (host.state / "runs/ledger.jsonl").read_text().splitlines()]
            self.assertEqual(records[0]["kind"], "file-overlap-admission")
            self.assertEqual(records[0]["prs"], [20139])

    def test_declared_paths_win_then_workstream_map_is_fallback(self):
        declared = SimpleNamespace(identifier="JOV-1", title="Change lanes", labels=[],
                                   description="Touch `scripts/lanes/doctor.py` only.")
        self.assertEqual(overlap.predict_issue_files(declared, workstreams.classify),
                         {"files": ["scripts/lanes/doctor.py"], "source": "issue-declared-paths"})
        mapped = SimpleNamespace(identifier="JOV-2", title="Symphony admission improvement", labels=[], description="")
        prediction = overlap.predict_issue_files(mapped, workstreams.classify)
        self.assertEqual(prediction["source"], "workstream:symphony-throughput")
        self.assertIn("scripts/lanes/lane_runner.py", prediction["files"])

    def test_kill_switch_allows_without_a_decision(self):
        issue = SimpleNamespace(identifier="JOV-10", title="Lane change", labels=[],
                                description="Edit `scripts/lanes/lane_runner.py`.")
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "0"}):
            host = SimpleNamespace(state=Path(tmp))
            lane = SimpleNamespace(ledger=lambda *_args: None)
            result = overlap.admission_decisions(
                host, lane, issue, [pr(1, [changed("scripts/lanes/lane_runner.py")])], [], workstreams.classify)
            self.assertTrue(result["allowed"])
            self.assertEqual(result["decisions"], [])


class LegacyHoldReleaseTest(unittest.TestCase):
    def test_the_guard_never_holds_and_releases_a_hold_it_applied_before(self):
        # Tim 2026-10-12 / hold contract #21275: overlaps are recorded only; the merge queue
        # serializes. A `hold` the old enforce mode applied is removed on the next reconcile.
        first = pr(1, [changed("scripts/lanes/lane_runner.py")])
        later = pr(2, [changed("scripts/lanes/lane_runner.py")], body="Land after #1.")
        later["labels"] = [{"name": "hold"}]
        calls = []
        lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie", ledger=lambda *_a: None,
                               sh=lambda args, **_k: calls.append(list(args)) or SimpleNamespace(returncode=0, stderr=""))
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            legacy = {"schema": "symphony-file-overlap/v1", "events": [], "tasks": {},
                      "metrics": {"conflicts_prevented": 0, "overlap_flags": 0, "rebases_caused_by_overlap": 0},
                      "active": {"1:2": {"firstPr": 1, "laterPr": 2, "policyAction": "sequence",
                                         "actionTaken": "sequence", "holdApplied": True}}}
            (state / "file-overlap.json").write_text(json.dumps(legacy))
            for mode in ("1", "enforce", "flag"):
                with patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": mode}):
                    result = overlap.reconcile_open_prs(SimpleNamespace(state=state), lane, [first, later])
                self.assertEqual(result["mode"], "flag")
                self.assertTrue(all(row["actionTaken"] == "flag" for row in result["pairs"]))
        self.assertFalse(any("labels[]=hold" in call or "--disable-auto" in call for args in calls for call in args))
        self.assertEqual([args[4] for args in calls if args[:4] == ["gh", "api", "-X", "DELETE"]],
                         ["repos/JovieInc/Jovie/issues/2/labels/hold"], "the legacy hold is released once")
        self.assertFalse(hasattr(overlap, "_hold"))


class StackedChildRetargetTest(unittest.TestCase):
    """A released overlap pair never retargets a stacked child while its parent is open
    (2026-10-13: #21507/#21508 were moved to main under open #21429, dragging its commits)."""

    def release(self, prs, child, *, live_open):
        calls = []
        def sh(args, **_kwargs):
            calls.append(list(args))
            if args[:2] == ["gh", "api"] and "pulls?state=open" in args[2]:
                return SimpleNamespace(returncode=0, stdout="1" if live_open else "0", stderr="")
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie", ledger=lambda *_a: None, sh=sh)
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            legacy = {"schema": "symphony-file-overlap/v1", "events": [], "tasks": {},
                      "metrics": {"conflicts_prevented": 0, "overlap_flags": 0, "rebases_caused_by_overlap": 0},
                      "active": {f"9:{child['number']}": {"firstPr": 9, "laterPr": child["number"],
                                                          "policyAction": "sequence", "actionTaken": "sequence"}}}
            (state / "file-overlap.json").write_text(json.dumps(legacy))
            overlap.reconcile_open_prs(SimpleNamespace(state=state), lane, prs)
        return [args for args in calls if "--base" in args]

    def test_child_of_an_open_parent_keeps_its_stack_base(self):
        parent = pr(1, [changed("a.md")], branch="chore/parent")
        child = pr(2, [changed("b.md")], base="chore/parent")
        self.assertEqual(self.release([parent, child], child, live_open=False), [])

    def test_parent_missing_from_inventory_is_checked_live(self):
        child = pr(2, [changed("b.md")], base="chore/parent")
        self.assertEqual(self.release([child], child, live_open=True), [])
        self.assertEqual(self.release([child], child, live_open=False),
                         [["gh", "pr", "edit", "2", "--repo", "JovieInc/Jovie", "--base", "main"]])


if __name__ == "__main__":
    unittest.main()
