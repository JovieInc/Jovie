"""Regression tests for scripts/lanes/lane_runner.py (provider-agnostic shipping lanes).

Run with:
    python3 -m pytest scripts/tests/test_lane_runner.py -v
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("lane_runner", ROOT / "scripts/lanes/lane_runner.py")
lane = importlib.util.module_from_spec(SPEC)
sys.modules["lane_runner"] = lane
SPEC.loader.exec_module(lane)


def issue(identifier="JOV-1", priority=2, created="2026-09-01T00:00:00Z", labels=()):
    return lane.Issue("id-" + identifier, identifier, "Tab indicator collapses", "body", priority, created, list(labels))


class SelectionTest(unittest.TestCase):
    def test_orders_like_symphony_priority_then_age_with_none_last(self):
        picked = lane.pick_issue([
            issue("JOV-3", priority=0),
            issue("JOV-2", priority=1, created="2026-09-03T00:00:00Z"),
            issue("JOV-1", priority=1, created="2026-09-02T00:00:00Z"),
        ], {})
        self.assertEqual(picked.identifier, "JOV-1")

    def test_skips_excluded_and_exhausted_work_but_drains_the_shared_pool(self):
        picked = lane.pick_issue([
            issue("JOV-1", labels=["no-symphony"]),
            issue("JOV-2", labels=["Area:Auth"]),
            issue("JOV-3", labels=[lane.SHARED_LABEL]),
            issue("JOV-4", priority=1),
        ], {"JOV-4": 3})
        self.assertEqual(picked.identifier, "JOV-3")

    def test_issues_with_an_open_lane_pr_anywhere_are_skipped(self):
        picked = lane.pick_issue([issue("JOV-1", priority=1), issue("JOV-2", priority=2)], {},
                                 in_flight=frozenset({"JOV-1"}))
        self.assertEqual(picked.identifier, "JOV-2")
        self.assertIsNone(lane.pick_issue([issue("JOV-1")], {}, in_flight=frozenset({"jov-1"})))

    def test_lane_branches_name_their_issue_and_lane(self):
        found = lane.LANE_BRANCH.match("codex/jov-6544-20260926t123210")
        self.assertEqual((found.group("lane"), found.group("issue")), ("codex", "jov-6544"))
        self.assertIsNone(lane.LANE_BRANCH.match("tim/jov-6544-fix"))
        self.assertIsNone(lane.LANE_BRANCH.match("devin/other-work"))

    def test_recent_failures_back_off_before_retry(self):
        failures = {"JOV-1": {"count": 1, "at": 1000.0}}
        self.assertIsNone(lane.pick_issue([issue("JOV-1")], failures, now=1000.0 + 60))
        self.assertEqual(lane.pick_issue([issue("JOV-1")], failures, now=1000.0 + 1801).identifier, "JOV-1")
        self.assertIsNone(lane.pick_issue([issue("JOV-9", labels=["infra"])], {}))


class PromptTest(unittest.TestCase):
    def test_contract_names_branch_issue_and_independent_gate(self):
        prompt = lane.render_prompt(issue("JOV-42"), "devin/jov-42-x", "prior decision: use tokens")
        for needle in ("devin/jov-42-x", "JOV-42", "prior decision: use tokens", "--no-verify",
                       "Do not mark it ready or merge it", "NOT-SHIPPABLE"):
            self.assertIn(needle, prompt)

    def test_reports_missing_gbrain_instead_of_inventing_context(self):
        self.assertIn("GBrain unavailable", lane.render_prompt(issue(), "b", ""))

    def test_context_pack_is_bounded_and_fails_soft(self):
        ok = lambda *a, **k: SimpleNamespace(returncode=0, stdout="x" * 9000)
        self.assertEqual(len(lane.context_pack(issue(), run=ok)), 4000)
        empty = lambda *a, **k: SimpleNamespace(returncode=0, stdout="0 results. clean miss")
        self.assertEqual(lane.context_pack(issue(), run=empty), "")

        def boom(*a, **k):
            raise OSError("no gbrain")
        self.assertEqual(lane.context_pack(issue(), run=boom), "")


class GateTest(unittest.TestCase):
    def change(self, path, added=10, deleted=0):
        return lane.Change(path, added, deleted)

    def test_empty_diff_fails(self):
        self.assertEqual(lane.gate_rules([]), ["empty-diff"])

    def test_code_needs_a_test_but_docs_do_not(self):
        self.assertEqual(lane.gate_rules([self.change("apps/web/lib/a.ts")]), ["code-change-without-test"])
        self.assertEqual(lane.gate_rules([self.change("apps/web/lib/a.ts"),
                                          self.change("apps/web/lib/a.test.ts")]), [])
        self.assertEqual(lane.gate_rules([self.change("docs/agents.md")]), [])

    def test_xcode_tests_directory_counts_as_test(self):
        changes = [self.change("apps/ios/Jovie/Core/ChatRepository.swift"),
                   self.change("apps/ios/JovieTests/ChatRepositoryTests.swift")]
        self.assertEqual(lane.gate_rules(changes), [])
        self.assertEqual(lane.gate_rules([self.change("apps/ios/Jovie/Core/A.swift")]),
                         ["code-change-without-test"])

    def test_secrets_lockfile_and_size_guards(self):
        self.assertIn("secret-like-file-changed", lane.gate_rules([self.change("apps/web/.env.local")]))
        self.assertIn("lockfile-without-manifest", lane.gate_rules([self.change("pnpm-lock.yaml")]))
        big = [self.change("apps/web/lib/a.ts", 1400, 200), self.change("apps/web/lib/a.test.ts")]
        self.assertIn("diff-too-large:1610", lane.gate_rules(big))

    def test_generated_snapshots_do_not_count_toward_size(self):
        changes = [self.change("apps/web/drizzle/migrations/meta/0108_snapshot.json", 37716),
                   self.change("apps/web/lib/profile/catalog.ts", 112),
                   self.change("apps/web/lib/profile/catalog.test.ts", 180)]
        self.assertEqual(lane.gate_rules(changes), [])

    def test_numstat_parsing_handles_binary(self):
        changes = lane.parse_numstat("3\t1\ta.ts\n-\t-\timg.png\nnoise\n")
        self.assertEqual([(c.path, c.added, c.deleted) for c in changes], [("a.ts", 3, 1), ("img.png", 0, 0)])

    def test_code_changes_run_the_one_canonical_gate(self):
        self.assertEqual(lane.check_commands(["apps/web/lib/a.ts", "docs/readme.md"]), [lane.CANONICAL_GATE])
        self.assertEqual(lane.check_commands(["docs/readme.md"]), [])

    @unittest.skipUnless((ROOT / "scripts/automation-verify.sh").exists(), "release copy has no repo gates")
    def test_canonical_gate_carries_the_ci_component_contract(self):
        self.assertIn("affected)", (ROOT / lane.CANONICAL_GATE[1]).read_text())
        self.assertIn("component-ship-gate", (ROOT / "scripts/automation-verify.sh").read_text())


class FakeShell:
    """Canned `sh` so the verify/land path runs without GitHub."""
    def __init__(self, prs, numstat="3\t0\tapps/web/lib/a.ts\n2\t0\tapps/web/lib/a.test.ts\n", ahead="0",
                 failing=()):
        self.prs, self.numstat, self.ahead, self.failing, self.calls = prs, numstat, ahead, failing, []

    def __call__(self, args, cwd=None, timeout=600, env=None, log=None, stream=False):
        self.calls.append(args)
        out, code = "", 0
        if any(token in args for token in getattr(self, "hanging", ())):
            raise subprocess.TimeoutExpired(args, timeout)
        if args[:3] == ["gh", "pr", "list"]:
            out = json.dumps(self.prs)
        elif args[:2] == ["git", "diff"]:
            out = self.numstat
        elif args[:2] == ["git", "rev-list"]:
            out = self.ahead
        elif any(token in args for token in self.failing):
            code = 1
        return SimpleNamespace(returncode=code, stdout=out, stderr="")


class VerifyAndLandTest(unittest.TestCase):
    def setUp(self):
        self.real = lane.sh
        self.started = datetime(2026, 9, 25, 21, 0, tzinfo=timezone.utc).timestamp()
        self.pr = {"number": 7, "headRefName": "devin/jov-1", "headRefOid": "abc", "url": "u",
                   "createdAt": "2026-09-25T21:05:00Z", "isDraft": True}

    def tearDown(self):
        lane.sh = self.real

    def run_gate(self, fake):
        lane.sh = fake
        return lane.verify_and_land(lane.Host(), issue(), "devin/jov-1", Path("/tmp"), None, self.started)

    def test_green_diff_is_marked_ready_and_queued(self):
        fake = FakeShell([self.pr])
        result = self.run_gate(fake)
        self.assertEqual(result["verdict"], "landing")
        self.assertIn(["gh", "pr", "ready", "7", "--repo", lane.REPO_SLUG], fake.calls)
        self.assertIn(["gh", "pr", "merge", "7", "--repo", lane.REPO_SLUG, "--auto"], fake.calls)

    def test_failing_check_holds_the_pr_as_draft(self):
        fake = FakeShell([self.pr], failing=("scripts/hooks/pre-push-gate.sh",))
        result = self.run_gate(fake)
        self.assertEqual(result["verdict"], "held")
        self.assertTrue(any(r.startswith("check-failed") for r in result["reasons"]))
        self.assertFalse(any(call[:3] == ["gh", "pr", "ready"] for call in fake.calls))

    def test_gate_timeout_is_transient_until_it_repeats(self):
        fake = FakeShell([self.pr])
        fake.hanging = ("scripts/hooks/pre-push-gate.sh",)
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            lane.sh = fake
            verdicts = [lane.gate_pr(host, self.pr, Path("/tmp"), None)["verdict"]
                        for _ in range(lane.MAX_GATE_TIMEOUTS)]
        self.assertEqual(verdicts, ["gate-timeout"] * (lane.MAX_GATE_TIMEOUTS - 1) + ["held"])
        self.assertFalse(any(call[:3] == ["gh", "pr", "ready"] for call in fake.calls))
        # every attempt released its gate seat, so the seat is free again
        seat = lane.Locked(host.state / "slots" / "gate.0.lock", blocking=False)
        self.assertTrue(seat.held)
        seat.release()

    def test_a_new_head_resets_the_timeout_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            self.assertEqual(lane.gate_timeouts(host, self.pr, change=1), 1)
            self.assertEqual(lane.gate_timeouts(host, self.pr, change=1), 2)
            self.assertEqual(lane.gate_timeouts(host, {**self.pr, "headRefOid": "new"}), 0)

    def test_older_prs_for_the_same_issue_are_ignored(self):
        stale = {**self.pr, "createdAt": "2026-09-20T00:00:00Z"}
        self.assertEqual(self.run_gate(FakeShell([stale]))["verdict"], "no-change")

    def test_pr_creation_failure_does_not_loop(self):
        result = self.run_gate(FakeShell([], ahead="2"))
        self.assertEqual(result, {"verdict": "failed", "reasons": ["pr-create-failed"]})


class ProviderAndLockTest(unittest.TestCase):
    def test_provider_specs_are_complete_and_devin_stays_free(self):
        providers = lane.load_providers()
        for name, spec in providers.items():
            self.assertEqual(spec["label"], name)
            self.assertTrue(any("{prompt" in arg for arg in spec["cmd"]), name)
            self.assertTrue(spec["health"])
        self.assertTrue(providers["devin"]["model"].startswith("swe-2"))
        # Tim 2026-09-26: Devin and Codex are the shipping lanes; every other lane stays off.
        enabled = {name for name, spec in providers.items() if spec.get("enabled", True)}
        self.assertTrue(enabled <= {"devin", "codex"}, enabled)
        self.assertIn("devin", enabled)
        # Every lane run is a fresh worktree; Devin refuses untrusted dirs unless told not to.
        cmd = providers["devin"]["cmd"]
        self.assertEqual(cmd[cmd.index("--respect-workspace-trust") + 1], "false")

    def test_template_substitutes_prompt(self):
        self.assertEqual(lane.template(["x", "{prompt_file}"], {"prompt": "p", "prompt_file": "/f"}), ["x", "/f"])

    def test_slot_lock_is_exclusive_and_released(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "slot.lock"
            first = lane.Locked(path, blocking=False)
            self.assertTrue(first.held)
            self.assertFalse(lane.Locked(path, blocking=False).held)
            first.release()
            self.assertTrue(lane.Locked(path, blocking=False).held)

    def test_needs_update_only_on_a_new_tree(self):
        self.assertTrue(lane.needs_update(None, "t1"))
        self.assertFalse(lane.needs_update("t1", "t1"))
        self.assertFalse(lane.needs_update("t1", ""))


class FakeLinear:
    def __init__(self, issues):
        self.issues, self.moves, self.comments = issues, [], []

    def lane_issues(self, label):
        return self.issues

    def move(self, issue_id, state):
        self.moves.append((issue_id, state))

    def comment(self, issue_id, body):
        self.comments.append((issue_id, body))


class LinearClientTest(unittest.TestCase):
    def test_reads_key_and_maps_lane_issues(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / "linear.env"
            env.write_text('export LINEAR_API_KEY="lin_api_x"\n')
            client = lane.Linear(env)
            self.assertEqual(client.key, "lin_api_x")
            payload = {"data": {"issues": {"nodes": [{
                "id": "i1", "identifier": "JOV-5", "title": "t", "description": None, "priority": 2,
                "createdAt": "2026-09-01T00:00:00Z", "labels": {"nodes": [{"name": "devin"}]}}]}}}
            real = lane.urllib.request.urlopen

            class Response:
                def __init__(self, body):
                    self.body = body

                def __enter__(self):
                    return self

                def __exit__(self, *exc):
                    return False

                def read(self):
                    return json.dumps(self.body).encode()

            seen = []

            def capture(request, timeout):
                seen.append(json.loads(request.data))
                return Response(payload)
            lane.urllib.request.urlopen = capture
            try:
                [found] = client.lane_issues("devin")
                self.assertEqual(seen[0]["variables"]["labels"], ["devin", lane.SHARED_LABEL])
                self.assertEqual((found.identifier, found.description, found.labels), ("JOV-5", "", ["devin"]))
                lane.urllib.request.urlopen = lambda request, timeout: Response({"errors": [{"message": "nope"}]})
                with self.assertRaises(RuntimeError):
                    client.gql("q", {})
            finally:
                lane.urllib.request.urlopen = real

    def test_missing_key_is_a_clear_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / "linear.env"
            env.write_text("OTHER=1\n")
            with self.assertRaises(SystemExit):
                lane.Linear(env)


class RunIssueTest(unittest.TestCase):
    def setUp(self):
        self.real_sh, self.real_verify, self.real_pack = lane.sh, lane.verify_and_land, lane.context_pack
        lane.context_pack = lambda issue: "ctx"
        self.tmp = tempfile.TemporaryDirectory()
        self.host = lane.Host(state=Path(self.tmp.name), repo=Path(self.tmp.name))

        def fake_sh(args, cwd=None, timeout=600, env=None, log=None):
            if args[:3] == ["git", "worktree", "add"]:
                Path(args[-2]).mkdir(parents=True)
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        lane.sh = fake_sh

    def tearDown(self):
        lane.sh, lane.verify_and_land, lane.context_pack = self.real_sh, self.real_verify, self.real_pack
        self.tmp.cleanup()

    def ledger(self):
        return [json.loads(line) for line in (self.host.state / "runs/ledger.jsonl").read_text().splitlines()]

    def test_success_writes_prompt_log_and_receipt(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "landing", "pr": 9, "reasons": []}
        receipt = lane.run_issue(self.host, "devin", {"cmd": ["true"], "model": "swe-2-medium"},
                                 FakeLinear([]), issue("JOV-8"))
        self.assertEqual((receipt["verdict"], receipt["agentExit"], receipt["pr"]), ("landing", 0, 9))
        self.assertEqual(self.ledger()[0]["runId"], receipt["runId"])
        prompt = next((self.host.state / "runs").glob("*.prompt.md")).read_text()
        self.assertIn("ctx", prompt)

    def test_agent_that_never_worked_is_a_provider_error(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "no-change", "reasons": ["no-pr-and-no-commits"]}
        receipt = lane.run_issue(self.host, "hyperagent", {"cmd": ["false"]}, FakeLinear([]), issue())
        self.assertEqual((receipt["verdict"], receipt["reasons"]), ("provider-error", ["agent-exit:1"]))

    def test_explicit_decline_becomes_not_shippable(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "no-change", "reasons": ["no-pr-and-no-commits"]}
        spec = {"cmd": [sys.executable, "-c", "print('NOT-SHIPPABLE: already fixed on main by #18196')"]}
        receipt = lane.run_issue(self.host, "claude", spec, FakeLinear([]), issue())
        self.assertEqual(receipt["verdict"], "not-shippable")
        self.assertEqual(receipt["reasons"], ["already fixed on main by #18196"])

    def test_a_crashing_harness_still_leaves_a_failed_receipt(self):
        def crash(*a, **k):
            raise ValueError("gh down")
        lane.verify_and_land = crash
        receipt = lane.run_issue(self.host, "devin", {"cmd": ["true"]}, FakeLinear([]), issue())
        self.assertEqual(receipt["verdict"], "failed")
        self.assertIn("harness-error:ValueError", receipt["reasons"][0])
        self.assertEqual(len(self.ledger()), 1)


class WorkerTest(unittest.TestCase):
    def setUp(self):
        self.saved = (lane.Linear, lane.run_issue, lane.os.execv, lane.load_providers, lane.claim_red_pr,
                      lane.fix_red_pr, lane.claim_adoptable_pr, lane.lane_prs, lane.adopt_pr)
        lane.claim_red_pr = lambda host, name, prs=None: None
        lane.claim_adoptable_pr = lambda host, name, prs: None
        lane.lane_prs = lambda name: []
        self.tmp = tempfile.TemporaryDirectory()
        self.host = lane.Host(state=Path(self.tmp.name), repo=Path(self.tmp.name), linear_env=Path("unused"))
        self.linear = FakeLinear([issue("JOV-3")])
        lane.Linear = lambda env: self.linear
        lane.load_providers = lambda: {"devin": {"label": "devin", "slots": 1, "model": "m", "cmd": ["true"]}}
        self.execs = []
        lane.os.execv = lambda exe, args: self.execs.append(args)

    def tearDown(self):
        (lane.Linear, lane.run_issue, lane.os.execv, lane.load_providers, lane.claim_red_pr,
         lane.fix_red_pr, lane.claim_adoptable_pr, lane.lane_prs, lane.adopt_pr) = self.saved
        self.tmp.cleanup()

    def test_landing_claims_comments_and_pulls_the_next_issue(self):
        lane.run_issue = lambda *a: {"verdict": "landing", "prUrl": "u"}
        lane.worker(self.host, "devin")
        self.assertEqual(self.linear.moves, [("id-JOV-3", "In Progress")])
        self.assertIn("passed the lane gate", self.linear.comments[-1][1])
        self.assertEqual(self.execs[0][-3:], ["worker", "--provider", "devin"])

    def test_failures_retry_then_return_to_triage(self):
        lane.run_issue = lambda *a: {"verdict": "held", "reasons": ["code-change-without-test"]}
        for _ in range(3):
            lane.worker(self.host, "devin")
            failures = json.loads((self.host.state / "failures.json").read_text())
            failures["JOV-3"]["at"] = 0  # skip the retry backoff between attempts
            (self.host.state / "failures.json").write_text(json.dumps(failures))
        self.assertEqual([m[1] for m in self.linear.moves if m[1] != "In Progress"], ["Todo", "Todo", "Triage"])
        self.assertEqual(json.loads((self.host.state / "failures.json").read_text())["JOV-3"]["count"], 3)

    def test_not_shippable_goes_to_triage_without_a_failure(self):
        lane.run_issue = lambda *a: {"verdict": "not-shippable", "reasons": ["already fixed"]}
        lane.worker(self.host, "devin")
        self.assertEqual(self.linear.moves[-1], ("id-JOV-3", "Triage"))
        self.assertFalse((self.host.state / "failures.json").exists())
        self.assertEqual(len(self.execs), 1)

    def test_provider_error_cools_the_lane_without_charging_the_issue(self):
        lane.run_issue = lambda *a: {"verdict": "provider-error", "reasons": ["agent-exit:2"]}
        self.assertEqual(lane.worker(self.host, "devin"), 1)
        self.assertTrue(lane.cooling(self.host, "devin"))
        self.assertFalse((self.host.state / "failures.json").exists())
        self.assertEqual(self.linear.moves[-1], ("id-JOV-3", "Todo"))
        self.assertEqual(self.execs, [])

    def test_red_prs_are_fixed_before_new_issues_are_claimed(self):
        fixed = []
        lane.claim_red_pr = lambda host, name, prs=None: {"number": 5}
        lane.fix_red_pr = lambda host, name, spec, pr: fixed.append(pr["number"])
        lane.worker(self.host, "devin")
        self.assertEqual((fixed, self.linear.moves), ([5], []))
        self.assertEqual(len(self.execs), 1)

    def test_late_remote_drafts_are_adopted_and_gated(self):
        adopted = []
        lane.claim_adoptable_pr = lambda host, name, prs: {"number": 8}
        lane.adopt_pr = lambda host, name, pr: adopted.append(pr["number"])
        lane.worker(self.host, "devin")
        self.assertEqual((adopted, self.linear.moves), ([8], []))

    def test_a_held_pr_keeps_its_issue_instead_of_retrying_a_new_pr(self):
        lane.run_issue = lambda *a: {"verdict": "held", "pr": 7, "prUrl": "u", "reasons": ["check-failed:x"]}
        lane.worker(self.host, "devin")
        self.assertEqual(self.linear.moves, [("id-JOV-3", "In Progress")])
        self.assertIn("will fix it on that branch", self.linear.comments[-1][1])
        self.assertFalse((self.host.state / "failures.json").exists())

    def test_busy_slots_and_empty_queue_exit_quietly(self):
        held = lane.Locked(self.host.state / "slots/devin.0.lock", blocking=False)
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        held.release()
        self.linear.issues = []
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(self.linear.moves, [])


class DispatchTest(unittest.TestCase):
    def test_spawns_one_worker_per_slot_of_healthy_enabled_providers_and_prunes(self):
        saved = (lane.load_providers, lane.provider_healthy, lane.subprocess.Popen, lane.sh, lane.doctor.run)
        spawned = []
        lane.load_providers = lambda: {"a": {"slots": 2}, "b": {"slots": 3}, "c": {"slots": 1, "enabled": False}}
        lane.provider_healthy = lambda spec: spec["slots"] == 2
        lane.subprocess.Popen = lambda args, **kw: spawned.append(args[-1])
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stdout="", stderr="")
        lane.doctor.run = lambda *a, **k: {}
        with tempfile.TemporaryDirectory() as tmp:
            old = Path(tmp) / "worktrees/old"
            old.mkdir(parents=True)
            os.utime(old, (0, 0))
            try:
                host = lane.Host(state=Path(tmp), repo=Path(tmp))
                self.assertEqual(lane.dispatch(host), 0)
            finally:
                lane.load_providers, lane.provider_healthy, lane.subprocess.Popen, lane.sh, lane.doctor.run = saved
            self.assertFalse(old.exists())
            tick = json.loads((host.state / "tick.json").read_text())
            self.assertEqual((tick["unhealthy"], tick["spawned"], tick["error"]), (["b"], ["a", "a"], None))
        self.assertEqual(spawned, ["a", "a"])

    def test_a_crashing_tick_leaves_its_error_for_the_doctor(self):
        saved = (lane.ensure_full_history, lane.doctor.run)
        lane.ensure_full_history = lambda host: (_ for _ in ()).throw(RuntimeError("git exploded"))
        lane.doctor.run = lambda *a, **k: {}
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                self.assertEqual(lane.dispatch(host), 1)
            finally:
                lane.ensure_full_history, lane.doctor.run = saved
            self.assertIn("git exploded", json.loads((host.state / "tick.json").read_text())["error"])

    def test_prune_survives_a_worktree_removed_mid_scan(self):
        real = lane.sh
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stdout="", stderr="")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "worktrees"
            (root / "gone").mkdir(parents=True)
            real_iterdir = Path.iterdir

            def vanishing(self):
                entries = list(real_iterdir(self))
                for entry in entries:
                    if entry.name == "gone":
                        entry.rmdir()
                return iter(entries)
            Path.iterdir = vanishing
            try:
                lane.prune_worktrees(lane.Host(state=Path(tmp), repo=Path(tmp)))
            finally:
                Path.iterdir, lane.sh = real_iterdir, real

    def test_shallow_clones_are_unshallowed_before_gating(self):
        calls = []

        def fake(args, cwd=None, timeout=600, env=None, log=None):
            calls.append(args)
            out = "true\n" if args[:2] == ["git", "rev-parse"] else ""
            return SimpleNamespace(returncode=0, stderr="", stdout=out)
        real = lane.sh
        lane.sh = fake
        try:
            lane.ensure_full_history(lane.Host(repo=Path("/tmp")))
        finally:
            lane.sh = real
        self.assertIn(["git", "fetch", "-q", "--unshallow", "origin"], calls)

    def test_health_check_matches_output_and_survives_missing_binaries(self):
        ok = [sys.executable, "-c", "print('Logged in (via Devin).')"]
        self.assertTrue(lane.provider_healthy({"health": ok, "healthy": "Logged in"}))
        self.assertFalse(lane.provider_healthy({"health": ok, "healthy": "Not logged"}))
        self.assertFalse(lane.provider_healthy({"health": ["/nonexistent/binary"]}))


class FixRedTest(unittest.TestCase):
    def pr(self, number=5, sha="h1", checks=None):
        return {"number": number, "title": "t", "headRefName": "devin/jov-1", "headRefOid": sha,
                "statusCheckRollup": checks if checks is not None else [
                    {"name": "ci-fast (remaining)", "status": "COMPLETED", "conclusion": "FAILURE",
                     "detailsUrl": "https://github.com/x/actions/runs/1/job/42"}]}

    def test_red_pr_waits_for_settled_checks_and_caps_attempts(self):
        pending = self.pr(checks=[{"status": "IN_PROGRESS"}, {"conclusion": "FAILURE"}])
        green = self.pr(checks=[{"status": "COMPLETED", "conclusion": "SUCCESS"}])
        self.assertIsNone(lane.red_pr([pending, green], {}))
        self.assertEqual(lane.red_pr([self.pr()], {})["number"], 5)
        self.assertIsNone(lane.red_pr([self.pr()], {"5": {"sha": "h1", "count": 1}}))
        self.assertIsNone(lane.red_pr([self.pr(sha="h2")], {"5": {"sha": "h1", "count": 2}}))
        self.assertEqual(lane.red_pr([self.pr(sha="h2")], {"5": {"sha": "h1", "count": 1}})["number"], 5)

    def test_gate_held_prs_go_to_the_fix_loop_with_the_gate_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            lane.record_held(host, 5, "h1", ["check-failed:pnpm", "[component-ship-gate] FAIL - needs stories"])
            green = self.pr(checks=[{"status": "IN_PROGRESS"}])
            real = lane.sh
            lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout="")
            try:
                claimed = lane.claim_red_pr(host, "devin", [{**green, "headRefName": "devin/jov-1-20260925204809"}])
            finally:
                lane.sh = real
            self.assertEqual(claimed["number"], 5)
            self.assertIn("component-ship-gate", lane.render_fix_prompt(claimed, ""))
            moved = {**green, "headRefOid": "h2", "headRefName": "devin/jov-1-20260925204809"}
            self.assertIsNone(lane.red_pr([moved], {}, json.loads((host.state / "held.json").read_text())))

    def test_merge_conflicts_count_as_stuck_even_with_green_checks(self):
        dirty = {**self.pr(checks=[{"status": "COMPLETED", "conclusion": "SUCCESS"}]),
                 "mergeStateStatus": "DIRTY"}
        self.assertEqual(lane.red_pr([dirty], {})["number"], 5)
        prompt = lane.render_fix_prompt(dirty, "")
        self.assertIn("conflicts with main", prompt)
        self.assertIn("renumber yours", prompt)

    def test_a_pushed_fix_re_arms_auto_merge_for_ready_prs(self):
        real, real_excerpt = lane.sh, lane.failure_excerpt
        lane.failure_excerpt = lambda pr: ""
        calls = []

        def fake(args, cwd=None, timeout=600, env=None, log=None):
            calls.append(args)
            if args[:2] == ["git", "ls-remote"]:
                return SimpleNamespace(returncode=0, stderr="", stdout="h9\trefs/heads/devin/jov-1\n")
            if args[:3] == ["git", "worktree", "add"]:
                Path(args[-2]).mkdir(parents=True)
            return SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.sh = fake
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                lane.fix_red_pr(host, "devin", {"cmd": ["true"]}, {**self.pr(), "isDraft": False})
            finally:
                lane.sh, lane.failure_excerpt = real, real_excerpt
        self.assertIn(["gh", "pr", "merge", "5", "--repo", lane.REPO_SLUG, "--auto"], calls)

    def test_excerpt_keeps_failing_lines_and_prompt_forbids_new_prs(self):
        real = lane.sh
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout=(
            "job\tstep\tall good\njob\tstep\t[component-ship-gate] FAIL - needs stories\n"))
        try:
            excerpt = lane.failure_excerpt(self.pr())
        finally:
            lane.sh = real
        self.assertIn("component-ship-gate] FAIL", excerpt)
        self.assertNotIn("all good", excerpt)
        prompt = lane.render_fix_prompt(self.pr(), excerpt)
        self.assertIn("Do not open a new PR", prompt)
        self.assertIn("devin/jov-1", prompt)

    def test_claims_are_visible_across_hosts_through_the_pr(self):
        real = lane.sh
        posted, comments = [], []

        def fake(args, cwd=None, timeout=600, env=None, log=None, stream=False):
            if args[:2] == ["gh", "api"]:
                return SimpleNamespace(returncode=0, stdout="\n".join(comments), stderr="")
            if args[:3] == ["gh", "pr", "comment"]:
                posted.append(args[-1])
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        lane.sh = fake
        try:
            self.assertFalse(lane.claimed_elsewhere(5, "h1", "fix"))
            comments.append(f"🤖 lane claim kind=fix sha=h1 host=other at={lane.now_iso()}")
            self.assertTrue(lane.claimed_elsewhere(5, "h1", "fix"))
            self.assertFalse(lane.claimed_elsewhere(5, "h1", "gate"))
            self.assertFalse(lane.claimed_elsewhere(5, "h2", "fix"))
            comments[:] = [f"🤖 lane claim kind=fix sha=h1 host={lane.HOST} at={lane.now_iso()}"]
            self.assertFalse(lane.claimed_elsewhere(5, "h1", "fix"), "our own claim never blocks us")
            comments[:] = ["🤖 lane claim kind=fix sha=h1 host=other at=2020-01-01T00:00:00Z"]
            self.assertFalse(lane.claimed_elsewhere(5, "h1", "fix"), "stale claims expire")
            with tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp))
                draft = {**self.pr(), "isDraft": True}
                self.assertEqual(lane.claim_adoptable_pr(host, "devin", [draft])["number"], 5)
                self.assertTrue(posted and posted[-1].startswith("🤖 lane claim kind=gate sha=h1"))
                comments[:] = [f"🤖 lane claim kind=gate sha=h1 host=other at={lane.now_iso()}"]
                host2 = lane.Host(state=Path(tmp) / "b")
                host2.state.mkdir()
                self.assertIsNone(lane.claim_adoptable_pr(host2, "devin", [draft]))
                self.assertIsNone(lane.claim_adoptable_pr(host2, "devin", [draft]), "not retried locally")
        finally:
            lane.sh = real

    def test_claim_records_attempt_before_work(self):
        real = lane.sh
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout=json.dumps(
            [{**self.pr(number=4), "headRefName": "devin/jov-6525-auto-merge-default"},
             {**self.pr(), "headRefName": "devin/jov-1-20260925204809"},
             {**self.pr(number=6), "headRefName": "claude/x"}]))
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            try:
                self.assertEqual(lane.claim_red_pr(host, "devin")["number"], 5)
                self.assertIsNone(lane.claim_red_pr(host, "devin"))
            finally:
                lane.sh = real
            self.assertEqual(json.loads((host.state / "fix-attempts.json").read_text()),
                             {"5": {"sha": "h1", "count": 1}})

    def test_unverified_drafts_are_adopted_once_per_head(self):
        draft = {**self.pr(), "isDraft": True, "headRefName": "hyperagent/jov-6438-20260925t213221"}
        ready = {**self.pr(number=9), "isDraft": False}
        self.assertEqual(lane.unverified_pr([ready, draft], {})["number"], 5)
        self.assertIsNone(lane.unverified_pr([draft], {"5": "h1"}))
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            self.assertEqual(lane.claim_adoptable_pr(host, "hyperagent", [draft])["number"], 5)
            self.assertIsNone(lane.claim_adoptable_pr(host, "hyperagent", [draft]))

    def test_adopt_gates_the_pr_head_and_leaves_a_receipt(self):
        real_sh, real_gate = lane.sh, lane.gate_pr
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.gate_pr = lambda host, pr, worktree, log: {"verdict": "landing", "pr": pr["number"], "reasons": []}
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                receipt = lane.adopt_pr(host, "hyperagent", self.pr())
            finally:
                lane.sh, lane.gate_pr = real_sh, real_gate
            self.assertEqual((receipt["kind"], receipt["verdict"]), ("adopt", "landing"))

    def test_a_timed_out_adopt_is_not_counted_as_verified(self):
        real_sh, real_gate = lane.sh, lane.gate_pr
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.gate_pr = lambda host, pr, worktree, log: {"verdict": "gate-timeout", "pr": pr["number"],
                                                        "reasons": ["gate-timeout:2400s:x1"]}
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                draft = {**self.pr(), "isDraft": True}
                claimed = lane.claim_adoptable_pr(host, "devin", [draft])
                self.assertEqual(claimed["number"], 5)
                lane.adopt_pr(host, "devin", claimed)
                self.assertEqual(json.loads((host.state / "verified.json").read_text()), {})
                self.assertEqual(lane.claim_adoptable_pr(host, "devin", [draft])["number"], 5)
            finally:
                lane.sh, lane.gate_pr = real_sh, real_gate

    def test_fix_run_reports_a_pushed_head_and_leaves_a_receipt(self):
        real, real_excerpt = lane.sh, lane.failure_excerpt
        lane.failure_excerpt = lambda pr: "err"

        def fake(args, cwd=None, timeout=600, env=None, log=None):
            if args[:2] == ["git", "ls-remote"]:
                return SimpleNamespace(returncode=0, stderr="", stdout="h2\trefs/heads/devin/jov-1\n")
            if args[:3] == ["git", "worktree", "add"]:
                Path(args[-2]).mkdir(parents=True)
            return SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.sh = fake
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                receipt = lane.fix_red_pr(host, "devin", {"cmd": ["true"]}, self.pr())
            finally:
                lane.sh, lane.failure_excerpt = real, real_excerpt
            self.assertEqual((receipt["verdict"], receipt["headAfter"]), ("fix-pushed", "h2"))
            self.assertIn("fix-red", (host.state / "runs/ledger.jsonl").read_text())



@unittest.skipIf(os.environ.get("LANES_SELFTEST") == "1", "running inside a release self-test")
class UpdateTest(unittest.TestCase):
    def git(self, *args, cwd):
        subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)

    def test_update_installs_tested_release_and_only_moves_the_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            origin, clone = tmp / "origin.git", tmp / "clone"
            self.git("init", "-q", "--bare", "-b", "main", str(origin), cwd=tmp)
            self.git("clone", "-q", str(origin), str(clone), cwd=tmp)
            files = [p.relative_to(ROOT) for p in (ROOT / "scripts/lanes").iterdir() if p.is_file()]
            for rel in [*files, *map(Path, lane.LANE_TESTS)]:
                (clone / rel).parent.mkdir(parents=True, exist_ok=True)
                (clone / rel).write_text((ROOT / rel).read_text())
            self.git("add", "-A", cwd=clone)
            self.git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "lanes", cwd=clone)
            self.git("push", "-q", "origin", "HEAD:main", cwd=clone)
            host = lane.Host(state=tmp / "state", repo=clone)
            old_env = os.environ.get("LANES_SELFTEST")
            os.environ["LANES_SELFTEST"] = "1"
            try:
                self.assertEqual(lane.update(host), 0)
                current = (host.state / "current").resolve()
                self.assertTrue((current / "lane_runner.py").exists())
                # A running worker's release is never removed or rewritten by a no-op update.
                self.assertEqual(lane.update(host), 0)
                self.assertEqual((host.state / "current").resolve(), current)
            finally:
                if old_env is None:
                    os.environ.pop("LANES_SELFTEST", None)
                else:
                    os.environ["LANES_SELFTEST"] = old_env


class RequeueTest(unittest.TestCase):
    def test_a_failed_enqueue_is_retried_until_queued_and_dropped_when_the_head_moves(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            path = host.state / "requeue.json"
            path.write_text(json.dumps({"5": "h1", "6": "h1", "7": "h1"}))
            calls = []
            def fake_sh(cmd, **kwargs):
                calls.append(cmd)
                # PR 6 is still rate-limited; everything else enqueues.
                return SimpleNamespace(returncode=1 if cmd[1:4] == ["pr", "merge", "6"] else 0, stdout="", stderr="")
            real, lane.sh = lane.sh, fake_sh
            try:
                lane.requeue_verified(host, [{"number": 5, "headRefOid": "h1"}, {"number": 6, "headRefOid": "h1"},
                                             {"number": 7, "headRefOid": "h2"}])
            finally:
                lane.sh = real
            self.assertEqual(json.loads(path.read_text()), {"6": "h1"})
            self.assertNotIn("7", [c[3] for c in calls])
            self.assertIn(["gh", "pr", "merge", "5", "--repo", lane.REPO_SLUG, "--auto"], calls)


if __name__ == "__main__":
    unittest.main()
