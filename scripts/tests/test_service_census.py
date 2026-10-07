"""Service ownership proof keeps unrelated coding running and unknown owners held."""
import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("service_census", Path(__file__).resolve().parents[1] /
                                            "lanes/service_census.py")
census = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(census)


class CensusTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.base = Path(tmp.name).resolve()
        self.state, self.repo = self.base / "state", self.base / "repo"
        self.before, self.after, self.arguments, self.files = {}, {}, {}, {}
        self.add(10, "Python", parent=20)
        self.add(20, "codex", parent=1)
        self.add(30, "node", parent=20)

    def add(self, pid, tool, *, parent=1, cwd=None, arguments=None, writable=()):
        row = {"parent": parent, "started": ("Wed", "Oct", "7", "04:00:00", "2026"),
               "tool": tool}
        self.before[pid], self.after[pid] = dict(row), dict(row)
        self.arguments[pid] = arguments or tool
        self.files[pid] = {"cwd": cwd or self.base / "independent", "writable": list(writable)}

    def check(self, **kwargs):
        return census.classify(self.before, self.after, self.arguments, self.files,
                               state=self.state, repo=self.repo, owner_pid=10, **kwargs)

    def test_own_codex_ancestor_and_unrelated_tools_keep_running(self):
        result = self.check()
        self.assertEqual(result["productiveOwners"], 0)
        self.assertEqual(result["unrelatedProcesses"], 2)
        self.assertEqual(self.after[10]["parent"], 20)

    def test_reparented_unknown_tool_in_affected_worktree_holds(self):
        self.add(40, "unknown-helper", cwd=self.state / "worktrees/repair", parent=1)
        with self.assertRaisesRegex(census.CensusHeld, "affected-working-directory"):
            self.check()

    def test_configured_repo_owner_holds_without_mutating_it(self):
        self.add(40, "git", cwd=self.repo)
        with self.assertRaises(census.CensusHeld):
            self.check()

    def test_compound_service_command_and_old_entrypoint_hold(self):
        for command in (f"bash -c exec python3 {self.state}/current/lane_runner.py dispatch",
                        "python3 /other/checkout/scripts/lanes/lane_runner.py worker"):
            with self.subTest(command=command):
                self.add(40, "Python", arguments=command)
                with self.assertRaises(census.CensusHeld):
                    self.check()

    def test_reparented_tool_with_writable_scheduler_state_holds(self):
        self.add(40, "codex", writable=[self.state / "runs/old/agent.log"])
        with self.assertRaisesRegex(census.CensusHeld, "writable-affected-resource"):
            self.check()

    def test_writable_repo_and_unknown_relevant_access_hold(self):
        self.add(40, "node", writable=[self.repo / "scripts/source.py"])
        with self.assertRaises(census.CensusHeld):
            self.check()
        self.files[40]["writable"] = []
        self.files[40]["unknownAccess"] = [self.state / "runs/log"]
        with self.assertRaisesRegex(census.CensusHeld, "access unknown"):
            self.check()

    def test_legacy_worktree_and_exact_pool_scope_hold_other_repo_disjoint(self):
        legacy, pool = self.base / "legacy", self.base / "cache/worktree-pool/abc"
        self.add(40, "node", cwd=legacy)
        with self.assertRaises(census.CensusHeld):
            self.check(extra_roots=(legacy, pool))
        self.files[40]["cwd"] = pool / "slot"
        with self.assertRaises(census.CensusHeld):
            self.check(extra_roots=(legacy, pool))
        self.files[40]["cwd"] = pool.parent / "other-repository/slot"
        self.assertEqual(self.check(extra_roots=(legacy, pool))["unrelatedProcesses"], 3)

    def test_same_live_identity_with_changed_paths_arguments_or_access_holds(self):
        for field in ("cwd", "writable", "unknownAccess", "arguments"):
            final_files = {pid: dict(info) for pid, info in self.files.items()}
            final_args = dict(self.arguments)
            if field == "arguments":
                final_args[20] = f"codex {self.state}"
            else:
                final_files[20][field] = self.state if field == "cwd" else [self.state / "log"]
            with self.subTest(field=field), self.assertRaisesRegex(census.CensusHeld, "paths or access changed"):
                self.check(final_arguments=final_args, final_files=final_files)

    def test_affected_descendant_outside_paths_holds(self):
        self.add(40, "Python", cwd=self.state)
        self.add(50, "node", parent=40)
        with self.assertRaisesRegex(census.CensusHeld, "affected-descendant"):
            self.check()

    def test_orphan_legacy_secondary_repository_worktree_mutation_holds(self):
        for verb in ("remove --force", "prune", "add", "repair", "move", "lock", "unlock"):
            self.add(40, "git", parent=1, cwd=self.base / "secondary",
                     arguments=f"git -C {self.base}/secondary worktree {verb} /private/tmp/jovie-old")
            with self.subTest(verb=verb), self.assertRaisesRegex(census.CensusHeld,
                                                                "unattributed-worktree-mutation"):
                self.check()
        self.arguments[40] = f"git -C {self.base}/secondary worktree list --porcelain"
        self.assertEqual(self.check()["productiveOwners"], 0)

    def test_exact_service_pid_and_its_disjoint_descendant_hold(self):
        with self.assertRaisesRegex(census.CensusHeld, "service-controller"):
            self.check(service_pids=(20,))

    def test_same_prefix_sibling_is_disjoint(self):
        self.add(40, "codex", cwd=Path(str(self.repo) + "-other"),
                 arguments="codex " + str(self.state) + "-other")
        self.assertEqual(self.check()["unrelatedProcesses"], 3)

    def test_alias_dot_segment_and_relative_command_paths_hold(self):
        self.state.mkdir()
        alias = self.base / "alias"
        alias.symlink_to(self.state, target_is_directory=True)
        for command in (f"python {alias}/current/lane_runner.py",
                        f"python {self.state}/../state/current/lane_runner.py",
                        "python ../alias/current/lane_runner.py"):
            self.add(40, "Python", cwd=self.base / "independent", arguments=command)
            with self.subTest(command=command), self.assertRaises(census.CensusHeld):
                self.check()

    def test_ambiguous_spaced_alias_productive_entrypoint_holds(self):
        self.state.mkdir()
        alias = self.base / "alias state"
        alias.symlink_to(self.state, target_is_directory=True)
        for entry in ("lane_runner", "worktree_sweep", "worktree_pool", "disk_guard",
                      "codex_lane", "claude_lane", "reason_lane", "hyperagent_lane",
                      "yc_corpus", "autoscale"):
            self.add(40, "Python", arguments=f"python3 {alias}/current/{entry}.py worker")
            with self.subTest(entry=entry), self.assertRaisesRegex(census.CensusHeld,
                                                                  "productive-entrypoint"):
                self.check()

    def test_live_missing_cwd_or_arguments_stays_held(self):
        for inventory in (self.files, self.arguments):
            saved = inventory.pop(20)
            with self.assertRaisesRegex(census.CensusHeld, "incomplete"):
                self.check()
            inventory[20] = saved

    def test_pid_reuse_reparenting_and_new_process_stay_held(self):
        for field, value in (("started", ("new",)), ("parent", 9), ("tool", "git")):
            old = self.after[20][field]
            self.after[20][field] = value
            with self.assertRaisesRegex(census.CensusHeld, "identity changed"):
                self.check()
            self.after[20][field] = old
        self.add(40, "node")
        self.before.pop(40)
        with self.assertRaises(census.CensusHeld):
            self.check()

    def test_exited_process_is_not_stale_ownership(self):
        self.add(40, "git", cwd=self.state)
        self.after.pop(40)
        self.assertEqual(self.check()["productiveOwners"], 0)

    def test_observation_pid_cannot_hide_reused_productive_tool(self):
        with self.assertRaisesRegex(census.CensusHeld, "observation process identity"):
            self.check(observers=((20, self.before[20]),))

    def test_observer_generation_changes_hold_even_same_ps_name(self):
        self.add(40, "ps", parent=10)
        expected = dict(self.before[40])
        self.after[40]["started"] = ("new",)
        with self.assertRaisesRegex(census.CensusHeld, "observation process identity changed"):
            self.check(observers=((40, expected),))


class ParserTest(unittest.TestCase):
    def result(self, stdout, *, returncode=0, stderr=""):
        return SimpleNamespace(stdout=stdout, stderr=stderr, returncode=returncode)

    def test_public_inventory_preserves_start_identity_and_spaced_executable(self):
        rows = census.process_rows(self.result(
            "20 1 S Wed Oct 7 04:00:00 2026 /Applications/Some App/Contents/node\n"
            "21 1 Z Wed Oct 7 04:00:00 2026 zombie\n"))
        self.assertEqual(rows[20]["tool"], "node")
        self.assertEqual(rows[20]["started"], ("Wed", "Oct", "7", "04:00:00", "2026"))
        self.assertNotIn(21, rows)

    def test_open_files_distinguish_readonly_from_writable_state(self):
        rows = census.file_rows(self.result("p20\nfcwd\nn/tmp\nf1\naw\nn/tmp/state/log\n"
                                            "f2\nar\nn/tmp/state/readonly\nf3\nau\nn/tmp/state/lock\n"))
        self.assertEqual(rows[20]["cwd"], Path("/tmp").resolve())
        self.assertEqual(rows[20]["writable"], [Path("/tmp/state/log").resolve(),
                                              Path("/tmp/state/lock").resolve()])

    def test_malformed_unreadable_and_duplicate_observations_hold(self):
        cases = ((census.process_rows, self.result("")),
                 (census.process_rows, self.result("20 invalid")),
                 (census.argument_rows, self.result("20 node\n20 codex\n")),
                 (census.argument_rows, self.result("20")),
                 (census.file_rows, self.result("n/tmp")),
                 (census.file_rows, self.result("p20\nfcwd\nn/tmp\nfcwd\nn/tmp\n")),
                 (census.file_rows, self.result("p20\nqbad")),
                 (census.file_rows, self.result("", returncode=1)),
                 (census.process_rows, self.result("20 1 S Wed Oct 7 04:00:00 2026 node", stderr="denied")))
        for parser, result in cases:
            with self.subTest(parser=parser.__name__, stdout=result.stdout), self.assertRaises(census.CensusHeld):
                parser(result)


class ObservationTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.base = Path(tmp.name).resolve()
        self.state, self.repo = self.base / "state", self.base / "repo"
        (self.state / "runs").mkdir(parents=True)
        self.ledger = self.state / "runs/ledger.jsonl"
        self.ledger.write_text("")

    def test_observation_excludes_only_its_exact_observers_and_keeps_caller(self):
        process = "20 1 S Wed Oct 7 04:00:00 2026 codex\n"
        first = SimpleNamespace(returncode=0, stderr="", observation_pid=101,
                                stdout=process + "101 10 R Wed Oct 7 04:00:00 2026 ps\n")
        args = SimpleNamespace(returncode=0, stderr="", observation_pid=102,
                               stdout="20 codex independent\n")
        files = SimpleNamespace(returncode=0, stderr="", observation_pid=103,
                                stdout="p20\nfcwd\nn/independent\nf1\naw\nn/independent/log\n")
        last = SimpleNamespace(returncode=0, stderr="", observation_pid=104,
                               stdout=process + "104 10 R Wed Oct 7 04:00:00 2026 ps\n")
        results = iter((first, args, files, args, files, last))
        commands = []
        def run(argv, **kwargs):
            commands.append(argv)
            self.assertEqual(kwargs["timeout"], 15)
            if argv[0] == "git":
                return SimpleNamespace(returncode=0, stderr="", stdout=(str(self.repo / ".git") + "\n"
                    if "rev-parse" in argv else f"worktree {self.repo}\0HEAD abc\0\0"))
            return next(results)
        result = census.observe(self.state, self.repo, run=run, owner_pid=10)
        self.assertEqual(result["examinedProcesses"], 1)
        self.assertEqual(result["productiveOwners"], 0)
        self.assertEqual([cmd[0] for cmd in commands],
                         ["git", "git", "ps", "ps", "lsof", "ps", "lsof", "ps", "git", "git"])
        self.assertFalse(any("environ" in value for cmd in commands for value in cmd))

    def resource_reader(self, argv):
        common = self.repo / ".git"
        linked = (self.repo, self.base / "manual", self.base / "legacy")
        return SimpleNamespace(returncode=0, stderr="", stdout=str(common) + "\n"
            if "rev-parse" in argv else "".join(f"worktree {p}\0HEAD abc\0\0" for p in linked))

    def test_resource_catalog_scopes_exact_pool_and_receipted_legacy_only(self):
        legacy = self.base / "legacy"
        self.ledger.write_text(json.dumps({"runId": "run", "provider": "codex",
                                          "worktree": str(legacy)}) + "\n")
        cache = self.base / "cache"
        expected_pool = cache / "worktree-pool" / hashlib.sha1(
            str(self.repo / ".git").encode()).hexdigest()[:12]
        roots = census.resource_roots(self.state, self.repo, cache, self.resource_reader)
        self.assertEqual(set(roots), {expected_pool, legacy})
        self.assertNotIn(self.base / "manual", roots)

    def test_unknown_or_malformed_legacy_ownership_holds(self):
        for contents in ("invalid-json", "[]", json.dumps({"runId": "run", "provider": "codex",
                                                         "worktree": "relative"})):
            self.ledger.write_text(contents)
            with self.subTest(contents=contents), self.assertRaises(census.CensusHeld):
                census.resource_roots(self.state, self.repo, self.base / "cache", self.resource_reader)
        self.ledger.unlink()
        with self.assertRaisesRegex(census.CensusHeld, "ledger unavailable"):
            census.resource_roots(self.state, self.repo, self.base / "cache", self.resource_reader)

    def test_default_observer_tracks_and_reaps_only_its_own_timed_out_command(self):
        process = SimpleNamespace(pid=101, returncode=0)
        process.communicate = unittest.mock.Mock(side_effect=[
            census.subprocess.TimeoutExpired(["ps"], 15), ("", "")])
        process.kill = unittest.mock.Mock()
        with patch.object(census.subprocess, "Popen") as popen:
            popen.return_value.__enter__.return_value = process
            with self.assertRaises(census.subprocess.TimeoutExpired):
                census.observe("/state", "/repo")
        process.kill.assert_called_once_with()
        self.assertEqual(process.communicate.call_count, 2)


if __name__ == "__main__":
    unittest.main()
