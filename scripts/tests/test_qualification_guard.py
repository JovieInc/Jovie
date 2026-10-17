"""Synthetic repositories only; no production fixture/module is imported."""
from dataclasses import replace
import hashlib
import io
import json
from contextlib import redirect_stdout
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch, Mock
import sys
from types import SimpleNamespace, ModuleType
from contextlib import ExitStack
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))

import qualification_guard as guard
from qualification_guard import CheckoutHeld, SafetyPolicy, checked_checkout


class GuardContractTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="qualification-guard-fixture-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.repo = self.root / "candidate"
        self.repo.mkdir()
        self.home = self.root / "fake-home"
        self.home.mkdir()
        self.env = {**os.environ, "HOME": str(self.home), "GIT_CONFIG_GLOBAL": os.devnull,
                    "GIT_CONFIG_SYSTEM": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
                    "GIT_TERMINAL_PROMPT": "0"}
        for k in list(self.env):
            if k.startswith("GIT_") and k not in {"GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_NOSYSTEM", "GIT_TERMINAL_PROMPT"}:
                self.env.pop(k)
        self.fixture = self.repo / "scripts/tests/test_disk_guard.py"
        self.fixture.parent.mkdir(parents=True)
        self.fixture.write_text("# synthetic unsafe marker; never executed\n")
        (self.repo / "other.txt").write_text("one\n")
        self.git("init", "--quiet")
        self.old = self.commit("synthetic old tree")
        self.safe_bytes = b"# synthetic isolated fixture marker; never executed\n"
        self.fixture.write_bytes(self.safe_bytes)
        self.safe = self.commit("synthetic isolation floor")
        self.policy = SafetyPolicy(self.safe, "scripts/tests/test_disk_guard.py",
                                   hashlib.sha256(self.safe_bytes).hexdigest())
        self.sentinels = []
        for name in ["symphony-elixir-workspaces", "symphony-workspaces", "fake-absolute-worktrees"]:
            p = self.home / name / "operator-work" / "uncommitted.txt"
            p.parent.mkdir(parents=True)
            p.write_bytes(b"operator-owned sentinel\n")
            self.sentinels.append(p)
        self.calls = []

    def tearDown(self):
        for p in self.sentinels:
            self.assertEqual(p.read_bytes(), b"operator-owned sentinel\n")

    def git(self, *args):
        r = subprocess.run(["git", "-c", "core.hooksPath=" + os.devnull,
                            "-c", "user.name=Fixture Author", "-c", "user.email=fixture@example.invalid",
                            "-c", "commit.gpgSign=false", "-C", str(self.repo), *args],
                           env=self.env, capture_output=True, check=True, timeout=10)
        return r.stdout.decode().strip()

    def commit(self, message):
        self.git("add", ".")
        self.git("commit", "--quiet", "-m", message)
        return self.git("rev-parse", "HEAD")

    def run_git(self, cmd, **kwargs):
        self.calls.append(cmd)
        kwargs["env"] = {**kwargs["env"], "HOME": str(self.home)}
        return subprocess.run(cmd, **kwargs)

    def check(self, head=None, policy=None, run=None):
        return checked_checkout(self.repo, head or self.safe, policy or self.policy, run=run or self.run_git)

    def test_exact_safe_floor_passes(self):
        self.assertEqual(self.check()["head"], self.safe)

    def test_safe_descendant_with_unchanged_fixture_passes(self):
        (self.repo / "other.txt").write_text("two\n")
        head = self.commit("independent synthetic source change")
        self.assertEqual(self.check(head)["head"], head)

    def test_old_checkout_rejected_even_with_safe_origin_main(self):
        self.git("update-ref", "refs/remotes/origin/main", self.safe)
        self.git("checkout", "--quiet", "--detach", self.old)
        with self.assertRaises(CheckoutHeld):
            self.check(self.old)

    def test_safe_installed_release_cannot_authorize_old_checkout(self):
        (self.root / "installed-safe-release.txt").write_text(self.safe)
        self.git("checkout", "--quiet", "--detach", self.old)
        with self.assertRaises(CheckoutHeld):
            self.check(self.old)

    def test_ancestor_floor_alone_cannot_allow_fixture_revert(self):
        self.fixture.write_text("# synthetic unsafe marker; never executed\n")
        head = self.commit("synthetic fixture revert after safety floor")
        with self.assertRaisesRegex(CheckoutHeld, "fixture-not-reviewed"):
            self.check(head)

    def test_missing_safety_object_holds(self):
        with self.assertRaises(CheckoutHeld):
            self.check(policy=replace(self.policy, required_commit="a" * 40))

    def test_reviewed_bytes_in_unrelated_history_still_hold(self):
        self.git("checkout", "--quiet", "--orphan", "unreviewed-history")
        self.git("commit", "--quiet", "-m", "synthetic unrelated root with copied fixture")
        head = self.git("rev-parse", "HEAD")
        with self.assertRaises(CheckoutHeld):
            self.check(head)

    def test_wrong_expected_head_holds(self):
        with self.assertRaisesRegex(CheckoutHeld, "head-mismatch"):
            self.check(self.old)

    def test_unstaged_fixture_change_holds(self):
        self.fixture.write_text("# synthetic unstaged change\n")
        with self.assertRaisesRegex(CheckoutHeld, "fixture-worktree-mismatch"):
            self.check()

    def test_staged_fixture_change_holds(self):
        self.fixture.write_text("# synthetic staged change\n")
        self.git("add", "scripts/tests/test_disk_guard.py")
        with self.assertRaisesRegex(CheckoutHeld, "fixture-index-mismatch"):
            self.check()

    def test_fixture_symlink_holds_without_touching_target(self):
        target = self.home / "outside-fixture.txt"
        target.write_bytes(self.safe_bytes)
        self.fixture.unlink()
        self.fixture.symlink_to(target)
        with self.assertRaisesRegex(CheckoutHeld, "fixture-path-unsafe"):
            self.check()
        self.assertEqual(target.read_bytes(), self.safe_bytes)

    def test_committed_symlink_fixture_holds(self):
        self.fixture.unlink()
        self.fixture.symlink_to("unread-target")
        head = self.commit("synthetic symlink fixture")
        with self.assertRaisesRegex(CheckoutHeld, "fixture-not-regular"):
            self.check(head)

    def test_checkout_symlink_holds(self):
        alias = self.root / "candidate-alias"
        alias.symlink_to(self.repo, target_is_directory=True)
        with self.assertRaisesRegex(CheckoutHeld, "noncanonical-checkout"):
            checked_checkout(alias, self.safe, self.policy, run=self.run_git)

    def test_deleted_fixture_holds(self):
        self.fixture.unlink()
        with self.assertRaisesRegex(CheckoutHeld, "fixture-unreadable"):
            self.check()

    def test_git_timeout_holds_before_runner_import(self):
        def unavailable(cmd, **kwargs):
            raise subprocess.TimeoutExpired(cmd, 15)
        with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "_load_runner") as loader:
            with patch.object(guard, "check", side_effect=lambda repo, head: guard.checked_checkout(repo, head, self.policy, run=unavailable)):
                with self.assertRaisesRegex(CheckoutHeld, "git-observation-unavailable"):
                    guard.load_checked_runner(self.repo, self.safe)
            loader.assert_not_called()

    def test_git_error_128_holds(self):
        def failed(cmd, **kwargs):
            if "cat-file" in cmd:
                return subprocess.CompletedProcess(cmd, 128, b"", b"synthetic observation failure")
            return self.run_git(cmd, **kwargs)
        with self.assertRaisesRegex(CheckoutHeld, "git-check-failed:cat-file:128"):
            self.check(run=failed)

    def test_head_change_during_guard_holds(self):
        reads = 0
        def changed(cmd, **kwargs):
            nonlocal reads
            if cmd[-3:] == ["rev-parse", "--verify", "HEAD^{commit}"]:
                reads += 1
                if reads == 2:
                    return subprocess.CompletedProcess(cmd, 0, (self.old + "\n").encode(), b"")
            return self.run_git(cmd, **kwargs)
        with self.assertRaisesRegex(CheckoutHeld, "head-changed-during-check"):
            self.check(run=changed)

    def test_environment_skip_flags_do_not_bypass_guard(self):
        self.git("checkout", "--quiet", "--detach", self.old)
        with patch.dict(os.environ, {"LANES_SELFTEST": "1", "SKIP_CHECKS": "1", "JOVIE_SKIP_SAFETY": "1"}):
            with self.assertRaises(CheckoutHeld):
                self.check(self.old)

    def test_exact_entry_point_rejects_old_tree_before_runner_import(self):
        self.git("checkout", "--quiet", "--detach", self.old)
        with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "_load_runner") as loader:
            with self.assertRaises(CheckoutHeld):
                guard.load_checked_runner(self.repo, self.old)
            loader.assert_not_called()

    def test_safe_entry_point_imports_only_after_preflight(self):
        runner = object()
        with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "_load_runner", return_value=runner) as loader:
            actual, proof = guard.load_checked_runner(self.repo, self.safe)
            self.assertIs(actual, runner)
            self.assertEqual(proof["head"], self.safe)
            loader.assert_called_once_with(self.repo)

    def test_candidate_runner_and_hook_cannot_touch_operator_sentinel(self):
        sentinel = self.sentinels[0]
        (self.repo / "scripts/lanes").mkdir()
        (self.repo / "scripts/lanes/lane_runner.py").write_text(
            "from pathlib import Path\nPath(" + repr(str(sentinel)) + ").write_text('TOUCHED')\n")
        (self.repo / ".husky").mkdir()
        (self.repo / ".husky/pre-push").write_text("exit 99\n")
        self.git("checkout", "--quiet", "--detach", self.old)
        with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "_load_runner") as loader:
            with self.assertRaises(CheckoutHeld):
                guard.load_checked_runner(self.repo, self.old)
            loader.assert_not_called()
        self.assertEqual(sentinel.read_bytes(), b"operator-owned sentinel\n")

    def test_check_cli_unsafe_result_precedes_runner_import(self):
        self.git("checkout", "--quiet", "--detach", self.old)
        output = io.StringIO()
        with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "_load_runner") as loader:
            with redirect_stdout(output):
                rc = guard.main(["--repo", str(self.repo), "--head", self.old])
            loader.assert_not_called()
        self.assertEqual(rc, 2)
        self.assertFalse(json.loads(output.getvalue())["safe"])

    def test_check_cli_safe_result_is_observation_only(self):
        output = io.StringIO()
        with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "_load_runner") as loader:
            with redirect_stdout(output):
                rc = guard.main(["--repo", str(self.repo), "--head", self.safe])
            loader.assert_not_called()
        proof = json.loads(output.getvalue())
        self.assertEqual(rc, 0)
        self.assertTrue(proof["safe"])
        self.assertEqual(proof["head"], self.safe)

    def test_safe_entry_point_loads_trusted_sibling_not_candidate_runner(self):
        sentinel = self.sentinels[0]
        candidate = self.repo / "scripts/lanes/lane_runner.py"
        candidate.parent.mkdir()
        candidate.write_text("from pathlib import Path\nPath(" + repr(str(sentinel)) + ").write_text('TOUCHED')\n")
        trusted = self.root / "trusted-release"
        trusted.mkdir()
        (trusted / "lane_runner.py").write_text("source = 'trusted-sibling'\n")
        prior = sys.modules.get("qualification_lane_runner")
        old_path = list(sys.path)
        try:
            with patch.dict(sys.modules), patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "HERE", trusted):
                sys.modules.pop("lane_runner", None)
                runner, proof = guard.load_checked_runner(self.repo, self.safe)
            self.assertEqual(runner.source, "trusted-sibling")
            self.assertEqual(proof["head"], self.safe)
            self.assertEqual(sentinel.read_bytes(), b"operator-owned sentinel\n")
        finally:
            sys.path[:] = old_path
            if prior is None:
                sys.modules.pop("qualification_lane_runner", None)
            else:
                sys.modules["qualification_lane_runner"] = prior

    def _import_fixture(self, source):
        trusted = self.root / "trusted-import" / "runtime"
        trusted.mkdir(parents=True)
        (trusted / "lane_runner.py").write_text(source)
        old_path = list(sys.path)
        before = {name: sys.modules.get(name) for name in
                  ("qualification_lane_runner", "qualification_fixture_dependency", "lane_runner")}
        sys.modules.pop("lane_runner", None)
        def restore():
            sys.path[:] = old_path
            for name, module in before.items():
                if module is None:
                    sys.modules.pop(name, None)
                else:
                    sys.modules[name] = module
        self.addCleanup(restore)
        return trusted

    def test_trusted_loader_cannot_fall_back_to_candidate_dependency(self):
        name = "qualification_fixture_dependency"
        trusted = self._import_fixture("import " + name + "\n")
        candidate_modules = self.repo / "candidate-modules"
        candidate_modules.mkdir()
        (candidate_modules / (name + ".py")).write_text(
            "from pathlib import Path\nPath(" + repr(str(self.sentinels[0])) + ").write_text('TOUCHED')\n")
        sys.path.insert(0, str(candidate_modules))
        with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "HERE", trusted):
            with self.assertRaisesRegex(CheckoutHeld, "trusted-runner-unavailable"):
                guard.load_checked_runner(self.repo, self.safe)

    def test_trusted_loader_rejects_cached_candidate_file_and_namespace(self):
        name = "qualification_fixture_dependency"
        trusted = self._import_fixture("import " + name + "\n" + name + ".touch()\n")
        for kind in ("file", "namespace"):
            with self.subTest(kind=kind):
                cached = ModuleType(name)
                if kind == "file":
                    cached.__file__ = str(self.repo / (name + ".py"))
                else:
                    cached.__path__ = [str(self.repo / name)]
                cached.touch = lambda: self.sentinels[0].write_text("TOUCHED")
                sys.modules[name] = cached
                with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "HERE", trusted):
                    with self.assertRaisesRegex(CheckoutHeld, "cached-candidate-module"):
                        guard.load_checked_runner(self.repo, self.safe)

    def test_trusted_loader_rejects_cached_sibling_from_another_release(self):
        name = "qualification_fixture_dependency"
        trusted = self._import_fixture("import " + name + "\n" + name + ".touch()\n")
        (trusted / (name + ".py")).write_text("def touch(): pass\n")
        cached = ModuleType(name)
        cached.__file__ = str(self.root / "old-release" / (name + ".py"))
        cached.touch = lambda: self.sentinels[0].write_text("TOUCHED")
        sys.modules[name] = cached
        with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "HERE", trusted):
            with self.assertRaisesRegex(CheckoutHeld, "cached-release-module-mismatch"):
                guard.load_checked_runner(self.repo, self.safe)

    def test_trusted_loader_rejects_cached_runner_from_another_release(self):
        trusted = self._import_fixture("source = 'trusted'\n")
        cached = ModuleType("lane_runner")
        cached.__file__ = str(self.root / "old-release/lane_runner.py")
        sys.modules["lane_runner"] = cached
        with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "HERE", trusted):
            with self.assertRaisesRegex(CheckoutHeld, "cached-release-module-mismatch:lane_runner"):
                guard.load_checked_runner(self.repo, self.safe)

    def test_trusted_loader_retains_quarantine_for_lazy_imports(self):
        name = "qualification_fixture_dependency"
        trusted = self._import_fixture("def later():\n    import " + name + "\n")
        candidate_modules = self.repo / "candidate-modules"
        candidate_modules.mkdir()
        (candidate_modules / (name + ".py")).write_text(
            "from pathlib import Path\nPath(" + repr(str(self.sentinels[0])) + ").write_text('TOUCHED')\n")
        sys.path.insert(0, str(candidate_modules))
        with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "HERE", trusted):
            runner, _proof = guard.load_checked_runner(self.repo, self.safe)
            with self.assertRaises(ModuleNotFoundError):
                runner.later()
        self.assertNotIn(str(candidate_modules), sys.path)

    def test_trusted_loader_allows_release_sibling_and_standard_library(self):
        name = "qualification_fixture_dependency"
        trusted = self._import_fixture("import fractions\nimport " + name + "\nanswer = " + name + ".answer\n")
        (trusted / (name + ".py")).write_text("answer = 42\n")
        with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "HERE", trusted):
            runner, _proof = guard.load_checked_runner(self.repo, self.safe)
        self.assertEqual(runner.answer, 42)
        self.assertEqual(Path(sys.modules[name].__file__).resolve(), trusted / (name + ".py"))

    def test_trusted_runner_symlink_cannot_point_into_candidate(self):
        trusted = self._import_fixture("# replaced below with synthetic symlink\n")
        target = self.repo / "untrusted_runner.py"
        target.write_text("from pathlib import Path\nPath(" + repr(str(self.sentinels[0])) + ").write_text('TOUCHED')\n")
        (trusted / "lane_runner.py").unlink()
        (trusted / "lane_runner.py").symlink_to(target)
        with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "HERE", trusted):
            with self.assertRaisesRegex(CheckoutHeld, "trusted-runner-from-candidate"):
                guard.load_checked_runner(self.repo, self.safe)

    def test_missing_trusted_runner_holds(self):
        trusted = self.root / "missing-release"
        trusted.mkdir()
        old_path = list(sys.path)
        try:
            with patch.object(guard, "DEFAULT_POLICY", self.policy), patch.object(guard, "HERE", trusted):
                with self.assertRaisesRegex(CheckoutHeld, "trusted-runner-unavailable"):
                    guard.load_checked_runner(self.repo, self.safe)
        finally:
            sys.path[:] = old_path

    def test_unverifiable_observation_is_a_hold(self):
        with patch.object(guard, "checked_checkout", side_effect=ValueError("malformed synthetic git response")):
            with self.assertRaisesRegex(CheckoutHeld, "checkout-observation-unverifiable"):
                guard.check(self.repo, self.safe)

    def test_missing_promisor_object_holds_without_invoking_remote_helper(self):
        (self.repo / "other.txt").write_text("safe descendant\n")
        head = self.commit("synthetic safe descendant before removing floor object")
        helper_bin = self.home / "bin"
        helper_bin.mkdir()
        helper = helper_bin / "git-remote-qualification-fixture"
        helper.write_text("#!/bin/sh\nprintf lazy-fetch-executed > '" + str(self.sentinels[0]) + "'\nexit 1\n")
        helper.chmod(0o755)
        self.git("config", "remote.fixture.url", "qualification-fixture::never-network")
        self.git("config", "remote.fixture.promisor", "true")
        self.git("config", "protocol.qualification-fixture.allow", "always")
        obj = self.repo / ".git/objects" / self.safe[:2] / self.safe[2:]
        self.assertTrue(obj.is_file(), "synthetic fixture must have loose floor object")
        obj.unlink()
        with patch.dict(os.environ, {"PATH": str(helper_bin) + os.pathsep + os.environ["PATH"]}):
            with self.assertRaises(CheckoutHeld):
                self.check(head)

    def test_inherited_alternate_index_cannot_hide_unsafe_staging(self):
        real_index = Path(self.git("rev-parse", "--path-format=absolute", "--git-path", "index"))
        safe_index = self.root / "alternate-safe-index"
        safe_index.write_bytes(real_index.read_bytes())
        self.fixture.write_text("# synthetic staged unsafe bytes\n")
        self.git("add", "scripts/tests/test_disk_guard.py")
        self.fixture.write_bytes(self.safe_bytes)
        with patch.dict(os.environ, {"GIT_INDEX_FILE": str(safe_index)}):
            with self.assertRaisesRegex(CheckoutHeld, "fixture-index-mismatch"):
                self.check()
        self.assertIn("scripts/tests/test_disk_guard.py", self.git("diff", "--cached", "--name-only"))

    def test_local_legacy_graft_cannot_invent_safety_ancestry(self):
        self.git("checkout", "--quiet", "--orphan", "unreviewed-grafted-history")
        self.git("commit", "--quiet", "-m", "synthetic unrelated tree")
        head = self.git("rev-parse", "HEAD")
        graft = Path(self.git("rev-parse", "--path-format=absolute", "--git-path", "info/grafts"))
        graft.parent.mkdir(exist_ok=True)
        graft.write_text(head + " " + self.safe + "\n")
        with self.assertRaises(CheckoutHeld):
            self.check(head)
        self.assertEqual(graft.read_text(), head + " " + self.safe + "\n")

    def _native_gate_fixture(self, head, *, mutate_at_seat=False, unavailable=False):
        import lane_runner as lane
        state = self.root / "native-fixture-state"
        state.mkdir()
        host = SimpleNamespace(state=state, gate_timeout=5)
        pr = {"number": 7, "headRefOid": head, "headRefName": "synthetic/fixture", "state": "OPEN"}
        claim = SimpleNamespace(pr=pr, lock=Mock(held=True))
        command = ["synthetic", "candidate-command"]
        calls = []
        seat = Mock()
        def shell(args, **kwargs):
            calls.append(args)
            return SimpleNamespace(returncode=0, stdout=head if args == ["git", "rev-parse", "HEAD"] else "", stderr="")
        def acquire(_host):
            if mutate_at_seat:
                self.fixture.write_text("# synthetic isolation lost while queued\n")
            return seat, 12
        with ExitStack() as stack:
            stack.enter_context(patch.object(guard, "DEFAULT_POLICY", self.policy))
            for name, value in [("publication_revocation", None), ("require_fix_target", pr),
                                ("terminal_gate", None), ("gate_deferral", None),
                                ("gate_assessment", ([], None)), ("check_commands", [command]),
                                ("require_gate_command_authority", None)]:
                stack.enter_context(patch.object(lane, name, return_value=value))
            stack.enter_context(patch.object(lane, "sh", side_effect=shell))
            slot = stack.enter_context(patch.object(lane, "gate_slot", side_effect=acquire))
            publish = stack.enter_context(patch.object(lane, "publish_verified"))
            if unavailable:
                stack.enter_context(patch.object(guard, "check", side_effect=CheckoutHeld("synthetic-unverifiable")))
            result = lane.gate_pr(host, pr, self.repo, None, claim=claim)
            publish.assert_not_called()
        self.assertFalse((state / "verified.json").exists())
        self.assertNotIn("gateResult", result)
        self.assertNotIn(command, calls)
        return result, slot, seat

    def _checkout_hook(self):
        target = self.sentinels[0]
        hook = Path(self.git("rev-parse", "--absolute-git-dir")) / "hooks/post-checkout"
        hook.parent.mkdir(exist_ok=True)
        hook.write_text("#!/bin/sh\nprintf hook-executed > '" + str(target) + "'\n")
        hook.chmod(0o755)
        self.git("config", "core.hooksPath", str(hook.parent))
        return hook

    def test_prepare_rejects_unsafe_target_before_checkout_hook(self):
        self._checkout_hook()
        with patch.object(guard, "DEFAULT_POLICY", self.policy):
            with self.assertRaises(CheckoutHeld):
                guard.prepare_checkout(self.repo, self.old)
        self.assertEqual(self.git("rev-parse", "HEAD"), self.safe)

    def test_prepare_safe_target_suppresses_checkout_hook(self):
        self._checkout_hook()
        with patch.object(guard, "DEFAULT_POLICY", self.policy):
            self.assertEqual(guard.prepare_checkout(self.repo, self.safe)["head"], self.safe)

    def test_prepare_refuses_unverifiable_checkout_filter_without_execution(self):
        self.git("config", "filter.fixture.smudge", "echo filter-executed > '" + str(self.sentinels[0]) + "'")
        with patch.object(guard, "DEFAULT_POLICY", self.policy):
            with self.assertRaisesRegex(CheckoutHeld, "filter-isolation-unverifiable"):
                guard.prepare_checkout(self.repo, self.safe)

    def test_prepare_refuses_clean_only_filter_without_touching_operator_file(self):
        (self.repo / ".gitattributes").write_text("other.txt filter=fixture\n")
        first = self.commit("synthetic attribute with no configured driver")
        (self.repo / "other.txt").write_text("two\n")
        second = self.commit("synthetic target content")
        self.git("checkout", "--quiet", "--detach", first)
        self.git("config", "filter.fixture.clean", "printf clean-filter-executed > '" + str(self.sentinels[0]) + "'; cat")
        (self.repo / "other.txt").write_text("one\n")
        with patch.object(guard, "DEFAULT_POLICY", self.policy):
            with self.assertRaisesRegex(CheckoutHeld, "filter-isolation-unverifiable"):
                guard.prepare_checkout(self.repo, second)
        self.assertEqual(self.git("rev-parse", "HEAD"), first)

    def test_prepare_git_failure_holds(self):
        with patch.object(guard, "DEFAULT_POLICY", self.policy), \
                patch.object(guard.subprocess, "run", side_effect=subprocess.TimeoutExpired("git", 15)):
            with self.assertRaisesRegex(CheckoutHeld, "preparation-unverifiable"):
                guard.prepare_checkout(self.repo, self.safe)

    def test_native_unsafe_target_cannot_run_checkout_hook(self):
        self._checkout_hook()
        result, slot, _seat = self._native_gate_fixture(self.old)
        self.assertEqual((result["verdict"], result["stage"]), ("gate-deferred", "before-gate-checks"))
        self.assertEqual(self.git("rev-parse", "HEAD"), self.safe)
        slot.assert_not_called()

    def test_native_entry_rejects_unsafe_checkout_before_test_seat(self):
        self.git("checkout", "--quiet", "--detach", self.old)
        result, slot, _seat = self._native_gate_fixture(self.old)
        self.assertEqual((result["verdict"], result["stage"]), ("gate-deferred", "before-gate-checks"))
        self.assertTrue(result["reasons"][0].startswith("qualification-safety:"))
        slot.assert_not_called()

    def test_native_entry_rejects_unverifiable_checkout_before_test_seat(self):
        result, slot, _seat = self._native_gate_fixture(self.safe, unavailable=True)
        self.assertEqual((result["verdict"], result["stage"]), ("gate-deferred", "before-gate-checks"))
        slot.assert_not_called()

    def test_native_entry_rechecks_protected_bytes_after_seat_wait(self):
        result, slot, seat = self._native_gate_fixture(self.safe, mutate_at_seat=True)
        self.assertEqual((result["verdict"], result["stage"]), ("gate-deferred", "before-gate-command"))
        slot.assert_called_once()
        seat.release.assert_called_once_with()

    def test_gate_policy_digest_binds_guard_implementation(self):
        import lane_runner as lane
        before = lane.gate_policy_digest()
        real_read = Path.read_bytes
        guard_path = Path(guard.__file__)
        def changed(path):
            raw = real_read(path)
            return raw + b"\n# synthetic guard-policy change\n" if path == guard_path else raw
        with patch.object(Path, "read_bytes", changed):
            self.assertNotEqual(lane.gate_policy_digest(), before)

    def test_policy_path_traversal_holds(self):
        with self.assertRaisesRegex(CheckoutHeld, "invalid-fixture-path"):
            self.check(policy=replace(self.policy, fixture_path="../outside.py"))


if __name__ == "__main__":
    unittest.main()
