"""Tests peeled from scripts/tests/test_lane_runner.py so that file stays within the size-500 baseline."""
from __future__ import annotations

import importlib
import sys
import unittest
from pathlib import Path

_root = Path(__file__).resolve().parents[2]
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))
_src = importlib.import_module("scripts.tests.test_lane_runner")


def _bind_source_names() -> None:
    for name, value in vars(_src).items():
        if name.startswith("__"):
            continue
        if isinstance(value, type) and issubclass(value, unittest.TestCase):
            continue
        globals().setdefault(name, value)


_bind_source_names()
del _bind_source_names


def setUpModule() -> None:
    start = getattr(_src, "setUpModule", None)
    if start is not None:
        start()


def tearDownModule() -> None:
    stop = getattr(_src, "tearDownModule", None)
    if stop is not None:
        stop()
class WorktreeHostGateTest(unittest.TestCase):
    """JOV-10172: a host that may not create lane worktrees holds every checkout path,
    without charging an execution attempt or consuming a fix label."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.state = Path(tmp.name).resolve() / "state"
        self.host = lane.Host(state=self.state, repo=Path(tmp.name).resolve() / "repo")
        # The module import sets LANES_EXECUTION_BACKEND=local-test, which makes every
        # host primary (the self-test fixture); these tests need the production policy.
        env = patch.dict(os.environ, {"LANES_EXECUTION_BACKEND": "", "LANES_SELFTEST": ""})
        env.start()
        self.addCleanup(env.stop)

    def ledger(self):
        return [json.loads(line) for line in (self.state / "runs/ledger.jsonl").read_text().splitlines()]

    def test_run_issue_holds_on_a_non_worktree_host_without_charging_an_attempt(self):
        with patch.object(lane, "HOST", "mac"), patch.dict(os.environ, {"LANES_WORKTREE_HOSTS": "gem"}):
            receipt = lane.run_issue(self.host, "codex", {"cmd": ["true"]}, FakeLinear([]), issue("JOV-72"))
        self.assertEqual(receipt["verdict"], "worktree-host-held")
        self.assertEqual(receipt["reasons"], ["worktree-host-not-allowed:mac"])
        self.assertEqual(receipt["result"]["verdict"], "worktree-host-held")
        self.assertFalse((self.state / "runs/execution-attempts.jsonl").exists(),
                         "a host-held run must not charge an execution attempt")
        self.assertEqual(self.ledger()[-1]["verdict"], "worktree-host-held")

    def test_run_issue_holds_a_fallback_host_at_its_cap(self):
        listing = "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /w1\ndetached\n\nworktree /w2\ndetached\n"

        def fake_sh(args, **kwargs):
            if "worktree" in args and "list" in args:
                return SimpleNamespace(returncode=0, stdout=listing, stderr="")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch.object(lane, "HOST", "mac"), patch.object(lane, "sh", fake_sh), \
                patch.dict(os.environ, {"LANES_WORKTREE_HOSTS": "gem,mac", "LANES_MAX_WORKTREES": "2"}):
            receipt = lane.run_issue(self.host, "codex", {"cmd": ["true"]}, FakeLinear([]), issue("JOV-72"))
        self.assertEqual(receipt["verdict"], "worktree-host-held")
        self.assertEqual(receipt["reasons"], ["worktree-cap:2/2"])
        self.assertFalse((self.state / "runs/execution-attempts.jsonl").exists())

    def test_run_issue_charges_nothing_when_the_count_is_unreadable_on_a_fallback_host(self):
        def fake_sh(args, **kwargs):
            if "worktree" in args and "list" in args:
                return SimpleNamespace(returncode=128, stdout="", stderr="not a repo")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch.object(lane, "HOST", "mac"), patch.object(lane, "sh", fake_sh), \
                patch.dict(os.environ, {"LANES_WORKTREE_HOSTS": "gem,mac"}):
            receipt = lane.run_issue(self.host, "codex", {"cmd": ["true"]}, FakeLinear([]), issue("JOV-72"))
        self.assertEqual(receipt["verdict"], "worktree-host-held")
        self.assertEqual(receipt["reasons"], ["worktree-count-unavailable"])

    def test_worker_skips_a_checkout_lane_on_a_non_worktree_host(self):
        providers = {"codex": {"enabled": True, "slots": 1}, "hyperagent": {"enabled": True, "slots": 1, "repairs": False}}
        with patch.object(lane, "HOST", "mac"), patch.dict(os.environ, {"LANES_WORKTREE_HOSTS": "gem"}), \
                patch.object(lane, "load_providers", return_value=providers):
            self.assertEqual(lane.worker(self.host, "codex"), 0)

    def test_fix_red_and_adopt_return_the_pr_untouched_on_a_non_worktree_host(self):
        pr = {"number": 4, "headRefName": "codex/x", "headRefOid": "a" * 40}
        with patch.object(lane, "HOST", "mac"), patch.dict(os.environ, {"LANES_WORKTREE_HOSTS": "gem"}):
            fix = lane._fix_red_pr(self.host, "codex", {"cmd": ["true"]}, pr)
            adopt = lane._adopt_pr(self.host, "codex", pr, SimpleNamespace())
        for receipt in (fix, adopt):
            self.assertEqual(receipt["verdict"], "worktree-host-held")
            self.assertEqual(receipt["reasons"], ["worktree-host-not-allowed:mac"])
        self.assertEqual([row["verdict"] for row in self.ledger()],
                         ["worktree-host-held", "worktree-host-held"])
        self.assertFalse((self.state / "worktrees").exists(), "no checkout was made")

    def test_fix_red_and_adopt_hold_a_fallback_host_at_its_cap(self):
        listing = "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /w1\ndetached\n\nworktree /w2\ndetached\n"
        pr = {"number": 5, "headRefName": "codex/y", "headRefOid": "b" * 40}

        def fake_sh(args, **kwargs):
            if "worktree" in args and "list" in args:
                return SimpleNamespace(returncode=0, stdout=listing, stderr="")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch.object(lane, "HOST", "mac"), patch.object(lane, "sh", fake_sh), \
                patch.dict(os.environ, {"LANES_WORKTREE_HOSTS": "gem,mac", "LANES_MAX_WORKTREES": "2"}):
            fix = lane._fix_red_pr(self.host, "codex", {"cmd": ["true"]}, pr)
            adopt = lane._adopt_pr(self.host, "codex", pr, SimpleNamespace())
            acted = lane.deterministic_conflict_pass(self.host, [])
        for receipt in (fix, adopt):
            self.assertEqual(receipt["verdict"], "worktree-host-held")
            self.assertEqual(receipt["reasons"], ["worktree-cap:2/2"])
        self.assertEqual(acted, [])
        self.assertFalse((self.state / "worktrees").exists(), "no checkout was made")

    def test_worker_lets_a_remote_lane_past_the_gate_on_a_non_worktree_host(self):
        providers = {"hyperagent": {"enabled": True, "slots": 0, "repairs": False}}
        reserved = patch.object(lane, "reserved_binding_pass", return_value=7)
        reserved.start()
        self.addCleanup(reserved.stop)
        with patch.object(lane, "HOST", "mac"), patch.dict(os.environ, {"LANES_WORKTREE_HOSTS": "gem"}), \
                patch.object(lane, "load_providers", return_value=providers):
            # slots 0 routes through reserved_binding_pass, which proves worker() got past
            # the worktree gate: a checkout lane would have returned 0 before any of this.
            self.assertEqual(lane.worker(self.host, "hyperagent"), 7)

    def test_deterministic_conflict_pass_never_checks_out_on_a_non_worktree_host(self):
        with patch.object(lane, "HOST", "mac"), patch.dict(os.environ, {"LANES_WORKTREE_HOSTS": "gem"}), \
                patch.object(lane, "sh", Mock(side_effect=AssertionError("no git should run"))):
            self.assertEqual(lane.deterministic_conflict_pass(self.host, []), [])

def _drop_inherited_tests() -> None:
    for value in list(globals().values()):
        if not isinstance(value, type) or not issubclass(value, unittest.TestCase):
            continue
        for name in dir(value):
            if name.startswith("test_") and name not in vars(value):
                setattr(value, name, None)


_drop_inherited_tests()
del _drop_inherited_tests
