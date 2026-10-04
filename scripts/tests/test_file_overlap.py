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
    def test_real_worker_module_records_overlap_in_the_existing_ledger(self):
        import lane_runner
        issue = SimpleNamespace(identifier="JOV-9", title="Lane change", labels=[],
                                description="Edit `scripts/lanes/lane_runner.py`.")
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
            host = SimpleNamespace(state=Path(tmp))
            result = overlap.admission_decisions(host, lane_runner, issue,
                [pr(20139, [changed("scripts/lanes/lane_runner.py")])], [], workstreams.classify)
            self.assertFalse(result["allowed"])
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

    def test_admission_blocks_in_enforce_mode_and_only_flags_in_flag_mode(self):
        issue = SimpleNamespace(identifier="JOV-9", title="Lane change", labels=[],
                                description="Edit `scripts/lanes/lane_runner.py`.")
        existing = pr(20139, [changed("scripts/lanes/lane_runner.py")])
        with tempfile.TemporaryDirectory() as tmp:
            rows = []
            host = SimpleNamespace(state=Path(tmp))
            lane = SimpleNamespace(ledger=lambda _host, row: rows.append(row))
            with patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
                result = overlap.admission_decisions(host, lane, issue, [existing], [], workstreams.classify)
            self.assertFalse(result["allowed"])
            self.assertEqual(result["decisions"][0]["actionTaken"], "block")
            rows = [json.loads(line) for line in (host.state / "runs/ledger.jsonl").read_text().splitlines()]
            self.assertEqual(rows[0]["prs"], [20139])
            state = overlap.read_state(host.state)
            self.assertEqual(state["metrics"]["conflicts_prevented"], 1)
            with patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
                overlap.admission_decisions(host, lane, issue, [existing], [], workstreams.classify)
            self.assertEqual(overlap.read_state(host.state)["metrics"]["conflicts_prevented"], 1)

            with patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "flag"}):
                result = overlap.admission_decisions(host, lane, issue, [existing], [], workstreams.classify)
            self.assertTrue(result["allowed"])
            self.assertEqual(result["decisions"][0]["actionTaken"], "flag")

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


class SequencingTest(unittest.TestCase):
    def test_saved_stack_hold_releases_when_retargeted_child_becomes_queue_owned(self):
        for ownership in ({"isInMergeQueue": True}, {"autoMergeRequest": {"enabledAt": "2026-10-04T01:00:00Z"}}):
            with self.subTest(ownership=ownership), tempfile.TemporaryDirectory() as tmp, \
                    patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
                calls = []
                lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie",
                    sh=lambda args, **_kwargs: calls.append(args) or SimpleNamespace(returncode=0),
                    ledger=lambda *_args: None)
                parent = pr(20141, [changed("scripts/lanes/lane_runner.py")], branch="codex/parent")
                child = pr(20166, [changed("scripts/lanes/lane_runner.py")], base="codex/parent")
                host = SimpleNamespace(state=Path(tmp))
                overlap.reconcile_open_prs(host, lane, [parent, child])
                child.update(ownership, baseRefName="main", labels=[{"name": "hold"}])
                calls.clear()
                recovered = overlap.reconcile_open_prs(host, lane, [parent, child])
                self.assertEqual(recovered["pairs"][0]["actionTaken"], "flag")
                self.assertEqual(recovered["released"], 1)
                self.assertIn(["gh", "api", "-X", "DELETE", "repos/JovieInc/Jovie/issues/20166/labels/hold"], calls)
                self.assertFalse(any("--disable-auto" in args or "labels[]=lane-fix-dequeued" in args for args in calls))
                self.assertEqual(recovered["metrics"]["rebases_caused_by_overlap"], 0)
                self.assertTrue(all(row["actionTaken"] == "flag" for row in overlap.read_state(host.state)["active"].values()))
                calls.clear()
                overlap.reconcile_open_prs(host, lane, [parent, child])
                self.assertEqual(calls, [])

    def test_queue_ownership_does_not_release_duplicate_migration_blocks(self):
        for ownership in (
                {"isInMergeQueue": True},
                {"autoMergeRequest": {"enabledAt": "2026-10-04T01:00:00Z"}}):
            with self.subTest(ownership=ownership), tempfile.TemporaryDirectory() as tmp, \
                    patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
                calls = []
                lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie",
                    sh=lambda args, **_kwargs: calls.append(args) or SimpleNamespace(returncode=0),
                    ledger=lambda *_args: None)
                first = pr(1, [changed("apps/web/drizzle/migrations/0131_billing.sql", "ADDED")])
                later = pr(2, [changed("apps/web/drizzle/migrations/0131_profiles.sql", "ADDED")])
                later.update(ownership)
                result = overlap.reconcile_open_prs(SimpleNamespace(state=Path(tmp)), lane, [first, later])
                self.assertEqual(result["pairs"][0]["actionTaken"], "block")
                self.assertTrue(any("repos/JovieInc/Jovie/issues/2/labels" in args
                                    and "labels[]=hold" in args for args in calls))
                self.assertEqual(result["metrics"]["conflicts_prevented"], 1)

    def test_child_targets_main_then_rebases_after_parent_lands(self):
        calls, ledger = [], []
        lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie",
                               sh=lambda args, **_kwargs: calls.append(args) or SimpleNamespace(returncode=0),
                               ledger=lambda _host, row: ledger.append(row))
        parent = pr(20141, [changed("scripts/lanes/lane_runner.py")], branch="codex/parent")
        child = pr(20166, [changed("scripts/lanes/lane_runner.py")], base="codex/parent")
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
            host = SimpleNamespace(state=Path(tmp))
            first = overlap.reconcile_open_prs(host, lane, [parent, child])
            self.assertEqual(first["pairs"][0]["actionTaken"], "stack")
            self.assertIn(["gh", "pr", "edit", "20166", "--repo", "JovieInc/Jovie", "--base", "main"], calls)
            self.assertTrue(any("labels[]=hold" in call for args in calls for call in args))

            calls.clear()
            child["baseRefName"] = "main"
            repeated = overlap.reconcile_open_prs(host, lane, [parent, child])
            self.assertEqual(repeated["created"], 0)
            self.assertEqual(calls, [])

            second = overlap.reconcile_open_prs(host, lane, [child])
            self.assertEqual(second["released"], 1)
            self.assertTrue(any("labels[]=lane-fix-dequeued" in call for args in calls for call in args))
            self.assertEqual(second["metrics"]["rebases_caused_by_overlap"], 1)
            ledger = [json.loads(line) for line in (host.state / "runs/ledger.jsonl").read_text().splitlines()]
            self.assertEqual([row["kind"] for row in ledger],
                             ["file-overlap-sequence", "file-overlap-release"])
            written = json.loads((host.state / "file-overlap.json").read_text())
            self.assertEqual(written["active"], {})

    def test_queue_owned_later_pr_is_flagged_never_held(self):
        # 2026-10-04: holds on queued #20469/#20447 failed every merge group behind them.
        calls = []
        lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie",
                               sh=lambda args, **_kwargs: calls.append(args) or SimpleNamespace(returncode=0),
                               ledger=lambda *_args: None)
        first = pr(20166, [changed("scripts/lanes/lane_runner.py")])
        queued = pr(20469, [changed("scripts/lanes/lane_runner.py")])
        queued["isInMergeQueue"] = True
        armed = pr(20470, [changed("scripts/lanes/lane_runner.py")])
        armed["autoMergeRequest"] = {"enabledAt": "2026-10-04T01:00:00Z"}
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
            host = SimpleNamespace(state=Path(tmp))
            result = overlap.reconcile_open_prs(host, lane, [first, queued, armed])
        later = {row["laterPr"]: row for row in result["pairs"]}
        self.assertEqual(set(later), {20469, 20470})
        for row in later.values():
            self.assertEqual((row["policyAction"], row["actionTaken"], row["queueOwned"]),
                             ("sequence", "flag", True))
        self.assertFalse(any("labels[]=hold" in call or "--disable-auto" in call
                             for args in calls for call in args))

    def test_hold_on_a_pr_that_joins_the_queue_is_released(self):
        calls = []
        lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie",
                               sh=lambda args, **_kwargs: calls.append(args) or SimpleNamespace(returncode=0),
                               ledger=lambda *_args: None)
        first = pr(20148, [changed("scripts/lanes/lane_runner.py")])
        first["isInMergeQueue"] = True
        later = pr(20469, [changed("scripts/lanes/lane_runner.py")])
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
            host = SimpleNamespace(state=Path(tmp))
            overlap.reconcile_open_prs(host, lane, [first, later])
            self.assertTrue(any("labels[]=hold" in call for args in calls for call in args))
            calls.clear()
            later["labels"] = [{"name": "hold"}]
            later["isInMergeQueue"] = True
            released = overlap.reconcile_open_prs(host, lane, [first, later])
        self.assertEqual(released["released"], 1)
        self.assertIn(["gh", "api", "-X", "DELETE", "repos/JovieInc/Jovie/issues/20469/labels/hold"], calls)

    def test_0116_incident_replay_holds_nothing(self):
        # 2026-10-04 01:16Z: unqueued #20148 and draft #20166 held queued #20469/#20447 and
        # idle #20388; every merge group behind the holds failed Fork PR Gate.
        calls = []
        lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie",
                               sh=lambda args, **_kwargs: calls.append(args) or SimpleNamespace(returncode=0),
                               ledger=lambda *_args: None)
        idle = pr(20148, [changed("scripts/lanes/lane_runner.py"), changed("scripts/ci-fast-lanes.mjs")])
        draft = pr(20166, [changed("scripts/lanes/lane_runner.py")])
        draft["isDraft"] = True
        queued_head = pr(20469, [changed("scripts/lanes/lane_runner.py"), changed("scripts/lanes/README.md")])
        queued_head["isInMergeQueue"] = True
        queued = pr(20447, [changed("scripts/ci-fast-lanes.mjs")])
        queued["isInMergeQueue"] = True
        later_idle = pr(20388, [changed("scripts/ci-fast-lanes.mjs")])
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
            host = SimpleNamespace(state=Path(tmp))
            result = overlap.reconcile_open_prs(host, lane, [idle, draft, queued_head, queued, later_idle])
        self.assertTrue(result["pairs"])
        self.assertNotIn(20166, {row["firstPr"] for row in result["pairs"]} | {row["laterPr"] for row in result["pairs"]})
        owned = {20469, 20447}
        for row in result["pairs"]:
            if row["actionTaken"] != "flag":  # only an idle PR may wait behind a queued one
                self.assertIn(row["firstPr"], owned)
                self.assertNotIn(row["laterPr"], owned)
        # Queued PRs are never labeled, un-armed or retargeted.
        self.assertFalse(any(str(number) in " ".join(args) for args in calls for number in owned))

    def test_sequence_still_holds_behind_a_queued_first_pr(self):
        calls = []
        lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie",
                               sh=lambda args, **_kwargs: calls.append(args) or SimpleNamespace(returncode=0),
                               ledger=lambda *_args: None)
        first = pr(20139, [changed("scripts/lanes/doctor.py")], title="foundational lane contracts")
        first["isInMergeQueue"] = True
        later = pr(20148, [changed("scripts/lanes/doctor.py")], body="Land after #20139.")
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
            result = overlap.reconcile_open_prs(SimpleNamespace(state=Path(tmp)), lane, [first, later])
        self.assertEqual(result["pairs"][0]["actionTaken"], "sequence")
        self.assertTrue(any("labels[]=hold" in call for args in calls for call in args))


class StatefulOverlapRemote:
    """Apply label/auto-merge effects, then return detached inventory snapshots."""
    REPO_SLUG = "JovieInc/Jovie"

    def __init__(self, rows):
        self.rows = {row["number"]: row for row in rows}
        self.calls = []

    def inventory(self, order):
        return json.loads(json.dumps([self.rows[number] for number in order]))

    def sh(self, args):
        self.calls.append(list(args))
        if args[:4] == ["gh", "api", "-X", "POST"]:
            number = int(args[4].split("/")[-2])
            assert args[5] == "-f" and args[6].startswith("labels[]=")
            label = args[6].split("=", 1)[1]
            labels = self.rows[number]["labels"]
            if not any(row["name"] == label for row in labels):
                labels.append({"name": label})
        elif args[:4] == ["gh", "api", "-X", "DELETE"]:
            assert args[4].endswith("/labels/hold")
            number = int(args[4].split("/")[-3])
            self.rows[number]["labels"] = [row for row in self.rows[number]["labels"]
                                           if row["name"] != "hold"]
        else:
            assert args[:3] == ["gh", "pr", "merge"]
            assert args[4:] == ["--repo", self.REPO_SLUG, "--disable-auto"]
            self.rows[int(args[3])]["autoMergeRequest"] = None
        return SimpleNamespace(returncode=0)


class SharedHoldOwnershipTest(unittest.TestCase):
    def make_remote(self, *, external=False):
        first = pr(1, [changed("scripts/lanes/lane_runner.py")])
        first["autoMergeRequest"] = {"enabledAt": "2026-10-04T01:00:00Z"}
        migration = pr(2, [changed("apps/web/drizzle/migrations/0131_billing.sql", "ADDED")])
        later = pr(3, [changed("scripts/lanes/lane_runner.py"),
                       changed("apps/web/drizzle/migrations/0131_profiles.sql", "ADDED")])
        if external:
            later["labels"] = [{"name": "hold"}, {"name": "human-owned"}]
        return StatefulOverlapRemote([first, migration, later])

    def test_pair_downgrade_preserves_and_transfers_the_remaining_semantic_hold(self):
        for order in ([1, 2, 3], [2, 1, 3]):
            for external in (False, True):
                for retirement in ("later-armed", "first-idle"):
                    with self.subTest(order=order, external=external, retirement=retirement), \
                            tempfile.TemporaryDirectory() as tmp, \
                            patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
                        remote = self.make_remote(external=external)
                        host = SimpleNamespace(state=Path(tmp))
                        # The sequence owns the newly added hold. The migration pair
                        # arrives later and sees that hold rather than claiming it.
                        overlap.reconcile_open_prs(host, remote, remote.inventory([1, 3]))
                        overlap.reconcile_open_prs(host, remote, remote.inventory(order))
                        before = overlap.read_state(host.state)["active"]
                        self.assertEqual(before["pr:#1|pr:#3|sequence"]["holdApplied"], not external)
                        self.assertFalse(before["pr:#2|pr:#3|block"]["holdApplied"])
                        remote.calls.clear()
                        if retirement == "later-armed":
                            remote.rows[3]["autoMergeRequest"] = {"enabledAt": "2026-10-04T02:00:00Z"}
                        else:
                            remote.rows[1]["autoMergeRequest"] = None
                        overlap.reconcile_open_prs(host, remote, remote.inventory(order))
                        active = overlap.read_state(host.state)["active"]
                        self.assertEqual({key: row["actionTaken"] for key, row in active.items()},
                                         {"pr:#1|pr:#3|sequence": "flag", "pr:#2|pr:#3|block": "block"})
                        self.assertEqual(active["pr:#2|pr:#3|block"]["holdApplied"], not external)
                        self.assertIn({"name": "hold"}, remote.rows[3]["labels"])
                        self.assertEqual(remote.calls, [])
                        overlap.reconcile_open_prs(host, remote, remote.inventory(order))
                        self.assertEqual(remote.calls, [])
                        # Flag-only mode retires the final policy owner without a
                        # disappeared parent, so no rebase request is warranted.
                        os.environ["SYMPHONY_FILE_OVERLAP_GUARD"] = "flag"
                        overlap.reconcile_open_prs(host, remote, remote.inventory(order))
                        delete = ["gh", "api", "-X", "DELETE",
                                  "repos/JovieInc/Jovie/issues/3/labels/hold"]
                        self.assertEqual(remote.calls, [] if external else [delete])
                        expected_labels = [{"name": "hold"}, {"name": "human-owned"}] if external else []
                        self.assertEqual(remote.rows[3]["labels"], expected_labels)
                        remote.calls.clear()
                        overlap.reconcile_open_prs(host, remote, remote.inventory(order))
                        self.assertEqual(remote.calls, [])

    def test_downgrade_and_other_parent_disappearance_share_one_rebase(self):
        for order in ([1, 2, 3], [2, 1, 3]):
            with self.subTest(order=order), tempfile.TemporaryDirectory() as tmp, \
                    patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
                remote = self.make_remote()
                host = SimpleNamespace(state=Path(tmp))
                overlap.reconcile_open_prs(host, remote, remote.inventory(order))
                remote.calls.clear()
                remote.rows[3]["autoMergeRequest"] = {"enabledAt": "2026-10-04T02:00:00Z"}
                overlap.reconcile_open_prs(host, remote, remote.inventory([1, 3]))
                self.assertEqual(remote.calls, [
                    ["gh", "api", "-X", "DELETE", "repos/JovieInc/Jovie/issues/3/labels/hold"],
                    ["gh", "api", "-X", "POST", "repos/JovieInc/Jovie/issues/3/labels",
                     "-f", "labels[]=lane-fix-dequeued"],
                ])
                state = overlap.read_state(host.state)
                self.assertEqual({key: row["actionTaken"] for key, row in state["active"].items()},
                                 {"pr:#1|pr:#3|sequence": "flag"})
                self.assertEqual(state["metrics"]["rebases_caused_by_overlap"], 1)
                remote.calls.clear()
                overlap.reconcile_open_prs(host, remote, remote.inventory([1, 3]))
                self.assertEqual(remote.calls, [])

    def test_final_shared_owner_release_deletes_and_rebases_only_once(self):
        for order in ([1, 2, 3], [2, 1, 3]):
            with self.subTest(order=order), tempfile.TemporaryDirectory() as tmp, \
                    patch.dict(os.environ, {"SYMPHONY_FILE_OVERLAP_GUARD": "1"}):
                remote = self.make_remote()
                host = SimpleNamespace(state=Path(tmp))
                overlap.reconcile_open_prs(host, remote, remote.inventory(order))
                before = overlap.read_state(host.state)["active"]
                self.assertEqual(len(before), 2)
                self.assertTrue(all(row["holdApplied"] for row in before.values()))
                remote.calls.clear()
                overlap.reconcile_open_prs(host, remote, remote.inventory([3]))
                self.assertEqual(remote.calls, [
                    ["gh", "api", "-X", "DELETE", "repos/JovieInc/Jovie/issues/3/labels/hold"],
                    ["gh", "api", "-X", "POST", "repos/JovieInc/Jovie/issues/3/labels",
                     "-f", "labels[]=lane-fix-dequeued"],
                ])
                self.assertEqual(remote.rows[3]["labels"], [{"name": "lane-fix-dequeued"}])
                state = overlap.read_state(host.state)
                self.assertEqual(state["active"], {})
                self.assertEqual(state["metrics"]["rebases_caused_by_overlap"], 1)
                remote.calls.clear()
                overlap.reconcile_open_prs(host, remote, remote.inventory([3]))
                self.assertEqual(remote.calls, [])


if __name__ == "__main__":
    unittest.main()
