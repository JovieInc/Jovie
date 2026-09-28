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
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

os.environ["LANES_EXECUTION_BACKEND"] = "local-test"
ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("lane_runner", ROOT / "scripts/lanes/lane_runner.py")
lane = importlib.util.module_from_spec(SPEC)
sys.modules["lane_runner"] = lane
SPEC.loader.exec_module(lane)


def issue(identifier="JOV-1", priority=2, created="2026-09-01T00:00:00Z", labels=()):
    return lane.Issue("id-" + identifier, identifier, "Tab indicator collapses", "body", priority, created, list(labels))


class SelectionTest(unittest.TestCase):
    def test_orders_like_symphony_priority_then_age_with_none_last(self):
        now = datetime(2026, 9, 4, tzinfo=timezone.utc).timestamp()
        picked = lane.pick_issue([
            issue("JOV-3", priority=0),
            issue("JOV-2", priority=1, created="2026-09-03T00:00:00Z"),
            issue("JOV-1", priority=1, created="2026-09-02T00:00:00Z"),
        ], {}, now=now)
        self.assertEqual(picked.identifier, "JOV-1")

    def test_newer_urgent_work_stays_ahead_of_work_inside_aging_window(self):
        now = datetime(2026, 9, 3, 12, tzinfo=timezone.utc).timestamp()
        picked = lane.pick_issue([
            issue("JOV-1", priority=1, created="2026-09-03T11:00:00Z"),
            issue("JOV-2", priority=2, created="2026-09-02T13:00:00Z"),
        ], {}, now=now)
        self.assertEqual(picked.identifier, "JOV-1")

    def test_aged_work_eventually_precedes_a_sustained_urgent_stream(self):
        now = datetime(2026, 9, 5, tzinfo=timezone.utc).timestamp()
        picked = lane.pick_issue([
            issue("JOV-1", priority=1, created="2026-09-04T23:00:00Z"),
            issue("JOV-4", priority=4, created="2026-09-01T00:00:00Z"),
        ], {}, now=now)
        self.assertEqual(picked.identifier, "JOV-4")

    def test_unprioritized_work_ages_without_malformed_dates_jumping_the_queue(self):
        now = datetime(2026, 9, 6, tzinfo=timezone.utc).timestamp()
        picked = lane.pick_issue([
            issue("JOV-1", priority=1, created="2026-09-05T23:00:00Z"),
            issue("JOV-0", priority=0, created="2026-09-01T00:00:00Z"),
            issue("JOV-BAD", priority=0, created="not-a-date"),
        ], {}, now=now)
        self.assertEqual(picked.identifier, "JOV-0")

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

    def test_only_codex_guarded_lane_admits_sensitive_work(self):
        sensitive = issue("JOV-9", labels=["infra", lane.SHARED_LABEL])
        self.assertIsNone(lane.pick_issue([sensitive], {}, provider="devin"))
        self.assertEqual(lane.pick_issue([sensitive], {}, provider="codex").identifier, "JOV-9")

    def test_guarded_lane_still_rejects_red_lines(self):
        secret = issue("JOV-9", labels=["infra"])
        secret.title = "Rotate production credentials"
        pricing = issue("JOV-10", labels=["billing"])
        pricing.description = "Change live pricing for annual plans"
        self.assertIsNone(lane.pick_issue([secret, pricing], {}, provider="codex"))


class PromptTest(unittest.TestCase):
    def test_contract_names_branch_issue_and_independent_gate(self):
        prompt = lane.render_prompt(issue("JOV-42"), "devin/jov-42-x", "prior decision: use tokens")
        for needle in ("devin/jov-42-x", "JOV-42", "prior decision: use tokens", "--no-verify",
                       "Do not mark it ready or merge it", "NOT-SHIPPABLE"):
            self.assertIn(needle, prompt)

    def test_contract_forbids_interactive_skill_workflows(self):
        prompt = lane.render_prompt(issue(), "codex/jov-1", "")
        self.assertIn("Never stop to ask", prompt)
        self.assertIn("Do not run gstack", prompt)
        self.assertIn("gh pr create --draft", prompt)

    def test_sensitive_contract_names_guarded_gates_and_red_lines(self):
        prompt = lane.render_prompt(issue(labels=["area:auth"]), "codex/jov-1", "")
        for needle in ("500 lines", "Migration Guard", "security scan", "boundary", "llm-review",
                       "Do not rotate", "live billing pricing"):
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
        self.assertEqual(lane.gate_rules([self.change(".cursor/rules/general.mdc")]), [])

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

    def test_sensitive_diff_uses_the_smaller_review_cap(self):
        changes = [self.change("apps/web/lib/a.ts", 400), self.change("apps/web/lib/a.test.ts", 101)]
        self.assertIn("diff-too-large:501", lane.gate_rules(changes, lane.SENSITIVE_REVIEWABLE_LINES))

    def test_sensitive_review_fails_closed_without_an_explicit_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            host = lane.Host(state=root)
            fake = FakeShell([])
            original = lane.sh
            lane.sh = fake
            try:
                passed, reasons = lane.sensitive_review(host, {"number": 7, "headRefOid": "abc"}, root, None)
            finally:
                lane.sh = original
        self.assertFalse(passed)
        self.assertTrue(reasons[0].startswith("llm-review-failed"))

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
        with tempfile.TemporaryDirectory() as tmp:  # never this host's live gate seats
            return lane.verify_and_land(lane.Host(state=Path(tmp)), issue(), "devin/jov-1", Path("/tmp"), None, self.started)

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
        self.assertEqual(providers["codex"]["reasoningEffort"], "xhigh")
        self.assertIn("xhigh", providers["codex"]["cmd"])
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
        self.issues, self.moves, self.comments, self.triaged = issues, [], [], []

    def create_triage(self, title, description):
        self.triaged.append(title)
        return "triage-id"

    def lane_issues(self, label):
        return self.issues

    def move(self, issue_id, state):
        self.moves.append((issue_id, state))

    def state_of(self, issue_id):
        return getattr(self, "states", {}).get(issue_id, "Todo")

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
        self.real_next = lane.next_provider
        lane.next_provider = lambda *a, **k: None  # no live provider health checks in unit tests
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
        lane.next_provider = self.real_next
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

    def test_an_exhausted_provider_hands_off_to_the_next_lane_on_the_same_worktree(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "landing", "pr": 11, "reasons": []}
        seen = []

        def nxt(host, exclude, providers=None):
            seen.append(set(exclude))
            return ("devin", {"cmd": [sys.executable, "-c", "import os; open('done.txt','w').write(os.getcwd())"]}) \
                if "devin" not in exclude else None
        lane.next_provider = nxt
        receipt = lane.run_issue(self.host, "codex", {"cmd": [sys.executable, "-c", "raise SystemExit(75)"]},
                                 FakeLinear([]), issue("JOV-9"))
        self.assertEqual(receipt["verdict"], "landing")
        self.assertEqual(receipt["handoffs"], [{"from": "codex", "to": "devin", "exit": 75}])
        self.assertEqual(receipt["finishedBy"], "devin")
        self.assertEqual(receipt["agentExit"], 0)
        self.assertEqual(seen[0], {"codex"})
        self.assertTrue(lane.cooling(self.host, "codex"))
        handoff = next((self.host.state / "runs").glob("*.handoff1.prompt.md")).read_text()
        self.assertIn("Do not start over", handoff)
        self.assertIn("ctx", handoff)

    def test_next_provider_takes_the_cheapest_enabled_healthy_uncooled_lane(self):
        providers = {
            "devin": {"health": ["echo", "ok"], "healthy": "ok"},
            "codex": {"health": ["echo", "ok"], "healthy": "ok"},
            "claude": {"health": ["echo", "ok"], "healthy": "ok", "enabled": False},
            "grok": {"health": ["false"], "healthy": "ok"},
            "sakana": {"health": ["echo", "ok"], "healthy": "ok"},
        }
        lane.cool_down(self.host, "codex")
        pick = self.real_next(self.host, {"devin"}, providers)
        self.assertEqual(pick[0], "sakana")  # codex cooling, claude off, grok unhealthy
        self.assertIsNone(self.real_next(self.host, {"devin", "sakana"}, providers))

    def test_handoffs_are_capped_and_then_report_the_provider_error(self):
        lane.verify_and_land = lambda *a, **k: {"verdict": "no-change", "reasons": ["no-pr-and-no-commits"]}
        order = iter(["devin", "claude", "hyperagent"])
        lane.next_provider = lambda host, exclude, providers=None: (next(order), {"cmd": ["false"]})
        receipt = lane.run_issue(self.host, "codex", {"cmd": ["false"]}, FakeLinear([]), issue())
        self.assertEqual(len(receipt["handoffs"]), lane.PROVIDER_HANDOFFS)
        self.assertEqual(receipt["verdict"], "provider-error")

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
                      lane.fix_red_pr, lane.claim_adoptable_pr, lane.lane_prs, lane.adopt_pr, lane.in_flight_issues,
                      lane.fix_candidates, lane.escalate_exhausted, lane.pr_events.queued_prs,
                      lane.pr_events.claim_event_pr, lane.sweep_lane_prs)
        lane.sweep_lane_prs = lambda host, name, linear, now=None: None
        lane.pr_events.queued_prs = lambda module, kinds: []
        lane.pr_events.claim_event_pr = lambda host, module, name, prs: None
        lane.claim_red_pr = lambda host, name, prs=None: None
        lane.claim_adoptable_pr = lambda host, name, prs: None
        lane.lane_prs = lambda name, fields="": []
        lane.in_flight_issues = lambda: frozenset()  # never GitHub from a unit test
        lane.fix_candidates = lambda name: []
        lane.escalate_exhausted = lambda host, prs, linear: None
        self.tmp = tempfile.TemporaryDirectory()
        self.host = lane.Host(state=Path(self.tmp.name), repo=Path(self.tmp.name), linear_env=Path("unused"))
        self.linear = FakeLinear([issue("JOV-3")])
        lane.Linear = lambda env: self.linear
        lane.load_providers = lambda: {"devin": {"label": "devin", "slots": 1, "model": "m", "cmd": ["true"]}}
        self.execs = []
        lane.os.execv = lambda exe, args: self.execs.append(args)

    def tearDown(self):
        (lane.Linear, lane.run_issue, lane.os.execv, lane.load_providers, lane.claim_red_pr,
         lane.fix_red_pr, lane.claim_adoptable_pr, lane.lane_prs, lane.adopt_pr, lane.in_flight_issues,
         lane.fix_candidates, lane.escalate_exhausted, lane.pr_events.queued_prs,
         lane.pr_events.claim_event_pr, lane.sweep_lane_prs) = self.saved
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
        self.assertEqual(self.linear.moves[-1], ("id-JOV-3", "Triage"))
        self.assertEqual(self.execs, [])

    def test_red_prs_are_fixed_before_new_issues_are_claimed(self):
        fixed = []
        lane.claim_red_pr = lambda host, name, prs=None: {"number": 5}
        lane.fix_red_pr = lambda host, name, spec, pr: fixed.append(pr["number"])
        lane.worker(self.host, "devin")
        self.assertEqual((fixed, self.linear.moves), ([5], []))
        self.assertEqual(len(self.execs), 1)

    def test_event_queued_prs_are_fixed_first_and_escalated_once(self):
        fixed, escalated = [], []
        lane.fix_candidates = lambda name: [{"number": 5}, {"number": 6}]
        lane.pr_events.queued_prs = lambda module, kinds: [{"number": 6, "eventKinds": ["red"]}]
        lane.pr_events.claim_event_pr = lambda host, module, name, prs: prs[0]
        lane.claim_red_pr = lambda host, name, prs=None: self.fail("the event queue goes first")
        lane.escalate_exhausted = lambda host, prs, linear: escalated.append(sorted(pr["number"] for pr in prs))
        lane.fix_red_pr = lambda host, name, spec, pr: fixed.append(pr["number"])
        lane.worker(self.host, "devin")
        self.assertEqual((fixed, escalated), ([6], [[5, 6]]))

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

    def test_an_issue_taken_by_another_host_meanwhile_is_not_started(self):
        started = []
        lane.run_issue = lambda *a, **k: started.append(a) or {"verdict": "landing"}
        self.linear.states = {"id-JOV-3": "In Progress"}
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual((self.linear.moves, started), ([], []))

    def test_a_disabled_lane_worker_exits_at_its_next_reexec(self):
        saved = lane.load_providers
        lane.load_providers = lambda: {"devin": {"label": "devin", "slots": 1, "enabled": False}}
        try:
            self.assertEqual(lane.worker(self.host, "devin"), 0)
        finally:
            lane.load_providers = saved
        self.assertFalse(list((self.host.state / "slots").glob("*.lock")) if (self.host.state / "slots").exists() else [])

    def test_unreadable_in_flight_set_claims_nothing(self):
        lane.in_flight_issues = lambda: None
        lane.run_issue = lambda *a: self.fail("an unknown in-flight set must not open a PR")
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(self.linear.moves, [])

    def test_an_issue_with_an_open_pr_is_not_claimed_again(self):
        lane.in_flight_issues = lambda: frozenset({"JOV-3"})
        lane.run_issue = lambda *a: self.fail("duplicate PR for JOV-3")
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(self.linear.moves, [])

    def test_a_lane_over_its_open_pr_budget_claims_nothing_new(self):
        red = [{"number": n, "headRefName": f"devin/jov-{n}-20260927t000000", "isDraft": True} for n in (1, 2)]
        lane.lane_prs = lambda name, fields="": red if fields else []  # slots=1 -> budget 2 non-green
        lane.run_issue = lambda *a: self.fail("over budget: fix/adopt only")
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(self.linear.moves, [])

    def test_busy_slots_and_empty_queue_exit_quietly(self):
        held = lane.Locked(self.host.state / "slots/devin.0.lock", blocking=False)
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        held.release()
        self.linear.issues = []
        self.assertEqual(lane.worker(self.host, "devin"), 0)
        self.assertEqual(self.linear.moves, [])


class RunAgentTest(unittest.TestCase):
    def test_run_agent_kills_the_whole_process_group_on_timeout(self):
        with tempfile.TemporaryDirectory() as tmp, open(Path(tmp) / "log", "w") as log:
            script = Path(tmp) / "agent.sh"
            script.write_text("#!/bin/sh\nsleep 30 &\necho $! > child.pid\nwait\n")
            script.chmod(0o755)
            with self.assertRaises(lane.subprocess.TimeoutExpired):
                lane.run_agent([str(script)], Path(tmp), log, timeout=4)  # generous: CI hosts fork slowly
            child = int((Path(tmp) / "child.pid").read_text())
            for _ in range(20):  # the group kill is asynchronous; give the kernel a moment
                time.sleep(0.1)
                try:
                    os.kill(child, 0)
                except ProcessLookupError:
                    break
            else:
                self.fail("background child of the timed-out agent is still alive")

    def test_run_agent_returns_the_exit_code(self):
        with tempfile.TemporaryDirectory() as tmp, open(Path(tmp) / "log", "w") as log:
            self.assertEqual(lane.run_agent(["sh", "-c", "echo hi; exit 3"], Path(tmp), log, timeout=10).returncode, 3)


class DispatchTest(unittest.TestCase):
    def test_spawns_one_worker_per_slot_of_healthy_enabled_providers_and_prunes(self):
        saved = (lane.load_providers, lane.provider_healthy, lane.subprocess.Popen, lane.sh, lane.doctor.run)
        spawned = []
        lane.load_providers = lambda: {"a": {"slots": 2}, "b": {"slots": 3}, "c": {"slots": 1, "enabled": False}, "d": {"slots": 4}}
        lane.provider_healthy = lambda spec: self.fail("host-scoped-off provider was probed") if spec["slots"] == 4 else spec["slots"] == 2
        lane.subprocess.Popen = lambda args, **kw: spawned.append(args[-1])
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stdout="", stderr="")
        lane.doctor.run = lambda *a, **k: {}
        with tempfile.TemporaryDirectory() as tmp:
            old = Path(tmp) / "worktrees/old"
            old.mkdir(parents=True)
            os.utime(old, (0, 0))
            os.environ["LANES_SLOTS_D"] = "0"  # d is scoped off this host
            try:
                host = lane.Host(state=Path(tmp), repo=Path(tmp))
                self.assertEqual(lane.dispatch(host), 0)
            finally:
                os.environ.pop("LANES_SLOTS_D", None)
                lane.load_providers, lane.provider_healthy, lane.subprocess.Popen, lane.sh, lane.doctor.run = saved
            self.assertFalse(old.exists())
            tick = json.loads((host.state / "tick.json").read_text())
            self.assertEqual((tick["unhealthy"], tick["spawned"], tick["error"]), (["b"], ["a", "a"], None))
        self.assertEqual(spawned, ["a", "a"])

    def test_only_the_best_pr_per_issue_gets_lane_effort(self):
        prs = [
            {"number": 1, "headRefName": "devin/jov-7-20260926t0900", "isDraft": True, "mergeStateStatus": "CLEAN", "headRefOid": "a"},
            {"number": 2, "headRefName": "devin/jov-7-20260926t1000", "isDraft": False, "mergeStateStatus": "DIRTY", "headRefOid": "b"},
            {"number": 3, "headRefName": "codex/jov-7-20260926t1100", "isDraft": True, "mergeStateStatus": "CLEAN", "headRefOid": "c"},
            {"number": 4, "headRefName": "devin/jov-8-20260926t1100", "isDraft": True, "mergeStateStatus": "CLEAN", "headRefOid": "d"},
        ]
        self.assertEqual([pr["number"] for pr in lane.best_per_issue(prs)], [2, 4], "ready outranks drafts even when conflicted")
        drafts = [prs[0], prs[2], prs[3]]
        self.assertEqual([pr["number"] for pr in lane.best_per_issue(drafts)], [3, 4], "newest draft wins")
        # the adopt loop never spends a gate on the losing duplicates
        self.assertEqual(lane.unverified_pr(drafts, {})["number"], 3)
        self.assertEqual(lane.unverified_pr(drafts, {"3": "c"})["number"], 4)
        self.assertIsNone(lane.unverified_pr(drafts, {"3": "c", "4": "d"}))

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

    def test_worktree_removal_kills_its_leftover_processes_first(self):
        fake, real = FakeShell([]), lane.sh
        lane.sh = fake
        try:
            lane.remove_worktree(lane.Host(state=Path("/s"), repo=Path("/r")), Path("/s/worktrees/run-1"))
        finally:
            lane.sh = real
        self.assertEqual(fake.calls, [["pkill", "-f", "/s/worktrees/run-1"],
                                      ["git", "worktree", "remove", "--force", "/s/worktrees/run-1"]])

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
        self.assertIsNone(lane.red_pr([self.pr()], {"5": {"sha": "h1", "count": 1, "at": time.time()}}),
                          "a fix still running on this head holds it")
        self.assertEqual(lane.red_pr([self.pr()], {"5": {"sha": "h1", "count": 1, "at": time.time(),
                                                         "endedAt": time.time()}})["number"], 5,
                         "an attempt that ended without moving the head never parks the PR")
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

    def test_a_pr_merged_before_its_fix_run_is_skipped_not_failed(self):
        real = lane.sh

        def fake(args, cwd=None, timeout=600, env=None, log=None):
            if args[:3] == ["git", "worktree", "add"]:
                return SimpleNamespace(returncode=128, stdout="",
                                       stderr="fatal: invalid reference: origin/devin/jov-1")
            return SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.sh = fake
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                receipt = lane.fix_red_pr(host, "devin", {"cmd": ["true"]}, self.pr())
            finally:
                lane.sh = real
        self.assertEqual(receipt["verdict"], "skipped")
        self.assertIn("invalid reference", receipt["reasons"][0])

    def test_a_lockfile_only_conflict_skips_the_agent_and_re_arms(self):
        real, real_resolve, real_agent = lane.sh, lane.resolve_lockfile_conflict, lane.run_agent
        lane.resolve_lockfile_conflict = lambda worktree, branch, log: True
        lane.run_agent = lambda *a, **k: self.fail("a lockfile-only conflict needs no model")
        calls = []

        def fake(args, cwd=None, timeout=600, env=None, log=None):
            calls.append(args)
            if args[:2] == ["git", "ls-remote"]:
                return SimpleNamespace(returncode=0, stderr="", stdout="h9\trefs/heads/devin/jov-1\n")
            return SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.sh = fake
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                receipt = lane.fix_red_pr(host, "devin", {"cmd": ["true"]},
                                          {**self.pr(), "isDraft": False, "mergeStateStatus": "DIRTY"})
            finally:
                lane.sh, lane.resolve_lockfile_conflict, lane.run_agent = real, real_resolve, real_agent
        self.assertEqual((receipt["verdict"], receipt["resolution"]), ("fix-pushed", "lockfile-regenerated"))
        self.assertNotIn(["pnpm", "install", "--frozen-lockfile", "--prefer-offline"], calls)
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
            broken = lane.sh
            lane.sh = lambda *a, **k: SimpleNamespace(returncode=1, stdout="", stderr="HTTP 502")
            self.assertTrue(lane.claimed_elsewhere(5, "h1", "fix"), "an unreadable claim list fails closed")
            lane.sh = broken
            with tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp))
                draft = {**self.pr(), "isDraft": True}
                self.assertEqual(lane.claim_adoptable_pr(host, "devin", [draft])["number"], 5)
                self.assertTrue(posted and posted[-1].startswith("🤖 lane claim kind=gate sha=h1"))
                comments[:] = [f"🤖 lane claim kind=gate sha=h1 host=other at={lane.now_iso()}"]
                host2 = lane.Host(state=Path(tmp) / "b")
                host2.state.mkdir()
                self.assertIsNone(lane.claim_adoptable_pr(host2, "devin", [draft]))
                self.assertFalse((host2.state / "verified.json").exists(), "a head another host owns is not marked ours")
                comments[:] = []
                self.assertEqual(lane.claim_adoptable_pr(host2, "devin", [draft])["number"], 5, "retried once the claim is gone")
        finally:
            lane.sh = real

    def test_changes_requested_counts_as_red_and_every_repo_pr_is_a_candidate(self):
        human = {**self.pr(number=42), "headRefName": "tim/jov-1-manual", "isDraft": False,
                 "reviewDecision": "CHANGES_REQUESTED", "statusCheckRollup": [{"conclusion": "SUCCESS"}]}
        self.assertEqual(lane.red_pr([human], {})["number"], 42)
        clean = {**human, "reviewDecision": "APPROVED"}
        self.assertIsNone(lane.red_pr([clean], {}))
        real = lane.open_prs_summary
        lane.open_prs_summary = lambda: [{**human, "isCrossRepository": False},
                                         {**human, "number": 43, "isCrossRepository": True},
                                         {**human, "number": 44, "isDraft": True}]
        try:
            self.assertEqual([pr["number"] for pr in lane.repo_prs()], [42], "fork and draft PRs are not candidates")
        finally:
            lane.open_prs_summary = real

    def test_summary_lists_red_prs_without_per_check_rollups(self):
        """2026-09-27: per-check rollups for 45 devin PRs hit GitHub's secondary limit, so the
        lane saw zero red PRs. The aggregate state alone must still mark PRs red or pending."""
        saved = (lane.pr_events.open_prs_state, dict(lane._SUMMARY))
        states = {1: "FAILURE", 2: "PENDING", 3: "SUCCESS", 4: None}
        lane.pr_events.open_prs_state = lambda _lane: [
            {**self.pr(number=n), "headRefName": f"devin/jov-{n}-20260927", "rollup": state} for n, state in states.items()]
        lane._SUMMARY.update(at=0.0, prs=[])
        try:
            prs = lane.lane_prs("devin", providers={"devin": {}})
            self.assertEqual([pr["number"] for pr in prs], [1, 2, 3, 4])
            self.assertEqual(lane.red_pr(prs, {})["number"], 1)
            self.assertIsNone(lane.red_pr([pr for pr in prs if pr["number"] != 1], {}),
                              "pending, green and unchecked heads are not red")
            lane.pr_events.open_prs_state = lambda _lane: self.fail("the summary is cached for a minute")
            self.assertEqual(len(lane.open_prs_summary()), 4)
        finally:
            lane.pr_events.open_prs_state = saved[0]
            lane._SUMMARY.clear()
            lane._SUMMARY.update(saved[1])

    def test_claimed_pr_gets_its_real_checks(self):
        synthetic = {**self.pr(number=8), "statusCheckRollup": [{"name": "rollup", "synthetic": True,
                                                                 "conclusion": "FAILURE"}]}
        real_checks = [{"name": "ci-fast", "conclusion": "FAILURE", "detailsUrl": "https://x/job/9"}]
        saved = lane.sh
        calls = []
        lane.sh = lambda args, **k: calls.append(args) or SimpleNamespace(
            returncode=0, stderr="", stdout=json.dumps({"statusCheckRollup": real_checks}))
        try:
            self.assertEqual(lane.with_checks(synthetic)["statusCheckRollup"], real_checks)
            already = {**synthetic, "statusCheckRollup": real_checks}
            self.assertIs(lane.with_checks(already), already)
        finally:
            lane.sh = saved
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][:4], ["gh", "pr", "view", "8"])

    def test_exhausted_heads_escalate_once_to_triage(self):
        stuck = {**self.pr(number=7), "isDraft": False, "mergeStateStatus": "DIRTY", "title": "stuck one"}
        attempts = {"7": {"sha": "h1", "count": lane.MAX_FIX_ATTEMPTS}}
        self.assertEqual([pr["number"] for pr in lane.exhausted_prs([stuck], attempts)], [7])
        self.assertEqual([pr["number"] for pr in lane.exhausted_prs([{**stuck, "headRefOid": "h2"}], attempts)], [7],
                         "the head the last fix pushed is still stuck: spent attempts escalate, never wait silently")
        green = {**stuck, "headRefOid": "h2", "mergeStateStatus": "CLEAN",
                 "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "SUCCESS"}]}
        self.assertEqual(lane.exhausted_prs([green], attempts), [], "a head that went green is not escalated")
        self.assertEqual(lane.exhausted_prs([stuck], {"7": {**attempts["7"], "escalated": True}}), [])
        real = lane.sh
        posted = []
        lane.sh = lambda args, **k: posted.append(args) or SimpleNamespace(returncode=0, stderr="", stdout="")
        linear = FakeLinear([])
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            (host.state / "fix-attempts.json").write_text(json.dumps(attempts))
            try:
                lane.escalate_exhausted(host, [stuck], linear)
                lane.escalate_exhausted(host, [stuck], linear)
            finally:
                lane.sh = real
            self.assertEqual(linear.triaged, ["Fix loop exhausted: PR #7 stuck one"], "escalated exactly once")
            self.assertEqual(len([p for p in posted if p[:3] == ["gh", "pr", "comment"]]), 1)
            self.assertTrue(json.loads((host.state / "fix-attempts.json").read_text())["7"]["escalated"])

    def test_claim_records_attempt_before_work(self):
        real = lane.open_prs_summary, lane.sh
        lane.open_prs_summary = lambda: [{**self.pr(number=4), "headRefName": "devin/jov-6525-auto-merge-default"},
                                         {**self.pr(), "headRefName": "devin/jov-1-20260925204809"},
                                         {**self.pr(number=6), "headRefName": "claude/x"}]
        # No GitHub from tests: claimed_elsewhere/post_claim would read and comment on real PRs.
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout="[]")
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            try:
                self.assertEqual(lane.claim_red_pr(host, "devin")["number"], 5)
                self.assertIsNone(lane.claim_red_pr(host, "devin"))
            finally:
                lane.open_prs_summary, lane.sh = real
            record = json.loads((host.state / "fix-attempts.json").read_text())["5"]
            self.assertEqual((record["sha"], record["count"], record["lane"]), ("h1", 1, "devin"))
            self.assertAlmostEqual(record["at"], time.time(), delta=60)

    def test_a_head_claimed_elsewhere_is_skipped_not_a_stop(self):
        first, second = {**self.pr(number=4), "headRefName": "devin/jov-4-20260925204809"}, \
            {**self.pr(), "headRefName": "devin/jov-1-20260925204809"}
        saved = (lane.claimed_elsewhere, lane.post_claim)
        lane.claimed_elsewhere = lambda number, sha, kind: number == 4
        lane.post_claim = lambda *a, **k: None
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            try:
                self.assertEqual(lane.claim_red_pr(host, "devin", [first, second])["number"], 5)
                drafts = [{**pr, "isDraft": True} for pr in (first, second)]
                self.assertEqual(lane.claim_adoptable_pr(host, "devin", drafts)["number"], 5)
            finally:
                lane.claimed_elsewhere, lane.post_claim = saved
            self.assertNotIn("4", json.loads((host.state / "fix-attempts.json").read_text()))

    def test_unverified_drafts_are_adopted_once_per_head(self):
        draft = {**self.pr(), "isDraft": True, "headRefName": "hyperagent/jov-6438-20260925t213221"}
        ready = {**self.pr(number=9), "isDraft": False}
        self.assertEqual(lane.unverified_pr([ready, draft], {})["number"], 5)
        self.assertIsNone(lane.unverified_pr([draft], {"5": "h1"}))
        saved = (lane.claimed_elsewhere, lane.post_claim)
        lane.claimed_elsewhere, lane.post_claim = (lambda *a, **k: False), (lambda *a, **k: None)  # no GitHub in CI
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            try:
                self.assertEqual(lane.claim_adoptable_pr(host, "hyperagent", [draft])["number"], 5)
                self.assertIsNone(lane.claim_adoptable_pr(host, "hyperagent", [draft]))
            finally:
                lane.claimed_elsewhere, lane.post_claim = saved

    def test_adopt_gates_the_pr_head_and_leaves_a_receipt(self):
        real_sh, real_gate = lane.sh, lane.gate_pr
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.gate_pr = lambda host, pr, worktree, log, **kwargs: {
            "verdict": "landing", "pr": pr["number"], "reasons": []
        }
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            try:
                receipt = lane.adopt_pr(host, "hyperagent", self.pr())
            finally:
                lane.sh, lane.gate_pr = real_sh, real_gate
            self.assertEqual((receipt["kind"], receipt["verdict"]), ("adopt", "landing"))

    def test_a_timed_out_adopt_is_not_counted_as_verified(self):
        real_sh, real_gate = lane.sh, lane.gate_pr
        lane.sh = lambda *a, **k: SimpleNamespace(returncode=0, stderr="", stdout="")  # claim list reads as empty
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
    def test_non_pushing_fix_runs_the_configured_second_attempt(self):
        real, real_excerpt = lane.sh, lane.failure_excerpt
        def fake(args, cwd=None, timeout=600, env=None, log=None):
            if args[:2] == ["git", "ls-remote"]:
                return SimpleNamespace(returncode=0, stderr="", stdout="h1\trefs/heads/devin/jov-1\n")
            if args[:3] == ["git", "worktree", "add"]:
                Path(args[-2]).mkdir(parents=True)
            return SimpleNamespace(returncode=0, stderr="", stdout="")
        lane.sh, lane.failure_excerpt = fake, lambda pr: "err"
        self.addCleanup(lambda: (setattr(lane, "sh", real), setattr(lane, "failure_excerpt", real_excerpt)))
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            first = lane.fix_red_pr(host, "devin", {"cmd": ["true"]}, self.pr())
            second = lane.fix_red_pr(host, "codex", {"cmd": ["true"]}, self.pr())
        self.assertEqual((first["execution"]["terminalState"], first["execution"]["retryDecision"],
                          second["verdict"], second["execution"]["attempt"]), (None, "retry", "fix-no-change", 2))

    def test_non_lockfile_conflict_preserves_the_second_agent_attempt(self):
        real_sh, real_excerpt, real_resolve = lane.sh, lane.failure_excerpt, lane.resolve_lockfile_conflict

        def fake(args, cwd=None, timeout=600, env=None, log=None):
            if args[:2] == ["git", "ls-remote"]:
                return SimpleNamespace(returncode=0, stderr="", stdout="h1\trefs/heads/devin/jov-1\n")
            if args[:3] == ["git", "worktree", "add"]:
                Path(args[-2]).mkdir(parents=True)
            return SimpleNamespace(returncode=0, stderr="", stdout="")

        lane.sh, lane.failure_excerpt = fake, lambda pr: "err"
        lane.resolve_lockfile_conflict = lambda worktree, branch, log: False
        self.addCleanup(lambda: (setattr(lane, "sh", real_sh),
                                 setattr(lane, "failure_excerpt", real_excerpt),
                                 setattr(lane, "resolve_lockfile_conflict", real_resolve)))
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            dirty = {**self.pr(), "mergeStateStatus": "DIRTY"}
            first = lane.fix_red_pr(host, "devin", {"cmd": ["true"]}, dirty)
            second = lane.fix_red_pr(host, "codex", {"cmd": ["true"]}, dirty)
        self.assertEqual((first["execution"]["retryDecision"], second["execution"]["attempt"],
                          second["execution"]["terminalState"]), ("retry", 2, "quarantined"))

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
            for rel in [*files, *map(Path, lane.LANE_TESTS), *map(Path, lane.RELEASE_EXTRAS)]:
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
                self.assertTrue((current.parent / "promotion-loss-metrics.mjs").exists())  # HUD PROMOTION line
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


class OnePrPerIssueTest(unittest.TestCase):
    """JOV-6833: one open PR per Linear key; slots count open non-green PRs."""
    NOW = 1_800_000_000

    def pr(self, number, issue="jov-7", draft=True, state="BLOCKED", pushed_ago=0, lane_name="devin"):
        return {"number": number, "headRefName": f"{lane_name}/{issue}-20260927t0{number:05d}", "isDraft": draft,
                "mergeStateStatus": state, "url": f"u{number}", "pushedAgo": pushed_ago}

    def test_in_flight_reads_branches_and_markers_and_fails_closed(self):
        saved = lane.sh
        try:
            lane.sh = lambda args, **k: SimpleNamespace(returncode=0, stderr="", stdout=json.dumps([
                {"headRefName": "devin/jov-12-20260927t101010", "body": ""},
                {"headRefName": "feat/anything", "body": "<!-- linear-issue-id:JOV-34 -->"},
                {"headRefName": "fix/x", "body": "mentions JOV-56 only"}]))
            self.assertEqual(lane.in_flight_issues(), frozenset({"JOV-12", "JOV-34"}))
            lane.sh = lambda args, **k: SimpleNamespace(returncode=1, stdout="", stderr="rate limited")
            self.assertIsNone(lane.in_flight_issues())
        finally:
            lane.sh = saved

    def test_budget_counts_only_own_non_green_prs(self):
        prs = [self.pr(1), self.pr(2, draft=False, state="CLEAN"), self.pr(3, lane_name="codex")]
        self.assertFalse(lane.over_budget("devin", prs, slots=1))
        self.assertTrue(lane.over_budget("devin", prs + [self.pr(4, issue="jov-8")], slots=1))

    def test_sweep_supersedes_duplicates_and_closes_stale_red_drafts(self):
        day = lane.STALE_DRAFT_S
        prs = [self.pr(1), self.pr(2, draft=False, state="CLEAN"),          # jov-7: keep the green one
               self.pr(3, issue="jov-8", pushed_ago=day + 1),                # stale red draft
               self.pr(4, issue="jov-9", pushed_ago=day - 60),               # recent: keep
               self.pr(5, issue="jov-10", draft=False, pushed_ago=day * 3)]  # ready PRs are not stale
        pushes = {pr["number"]: self.NOW - pr.pop("pushedAgo") for pr in prs}
        superseded, stale = lane.sweep_plan(prs, self.NOW, pushes)
        self.assertEqual([(pr["number"], keep) for pr, keep in superseded], [(1, 2)])
        self.assertEqual([pr["number"] for pr in stale], [3])

    def test_sweep_closes_moves_only_owned_issues_and_is_throttled(self):
        saved = (lane.sh, lane.lane_prs)
        calls = []
        stale_at = datetime.fromtimestamp(self.NOW - lane.STALE_DRAFT_S * 2, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        def fake_sh(args, **k):
            calls.append(args)
            out = f"3 {stale_at}\n4 {stale_at}\n1 {stale_at}" if args[:3] == ["gh", "api", "graphql"] else ""
            return SimpleNamespace(returncode=0, stdout=out, stderr="")
        lane.sh = fake_sh
        lane.lane_prs = lambda name, fields="": [self.pr(1), self.pr(2),
                                                   self.pr(3, issue="jov-8", pushed_ago=lane.STALE_DRAFT_S * 2),
                                                   self.pr(4, issue="jov-9", pushed_ago=lane.STALE_DRAFT_S * 2)]
        linear = FakeLinear([])
        linear.states = {"JOV-8": "In Progress", "JOV-9": "Done"}
        try:
            with tempfile.TemporaryDirectory() as tmp:
                host = lane.Host(state=Path(tmp), repo=Path(tmp), linear_env=Path("unused"))
                lane.sweep_lane_prs(host, "devin", linear, now=self.NOW)
                lane.sweep_lane_prs(host, "devin", linear, now=self.NOW + 60)  # throttled: no-op
        finally:
            lane.sh, lane.lane_prs = saved
        closed = [args[3] for args in calls if args[:3] == ["gh", "pr", "close"]]
        self.assertEqual(closed, ["1", "3", "4"])
        self.assertIn("superseded by #2", next(a for a in calls if a[:3] == ["gh", "pr", "close"])[-1])
        self.assertEqual(linear.moves, [("JOV-8", "Todo")])


class LockfileConflictTest(unittest.TestCase):
    """JOV-6837: a lockfile-only conflict is resolved without a model; anything else is not."""

    def git(self, *args, cwd):
        return subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", *args], cwd=cwd,
                              check=True, capture_output=True, text=True).stdout.strip()

    def repo(self, tmp: Path, pr_changes: dict):
        origin, work = tmp / "origin.git", tmp / "work"
        self.git("init", "-q", "--bare", "-b", "main", str(origin), cwd=tmp)
        self.git("clone", "-q", str(origin), str(work), cwd=tmp)
        for name, text in {"package.json": "{}\n", "pnpm-lock.yaml": "base\n", "a.ts": "a\n"}.items():
            (work / name).write_text(text)
        self.git("add", "-A", cwd=work)
        self.git("commit", "-qm", "base", cwd=work)
        self.git("push", "-q", "origin", "HEAD:main", cwd=work)
        self.git("checkout", "-q", "-b", "devin/jov-1-20260927", cwd=work)
        for name, text in pr_changes.items():
            (work / name).write_text(text)
        self.git("commit", "-qam", "pr", cwd=work)
        self.git("push", "-q", "origin", "HEAD:devin/jov-1-20260927", cwd=work)
        self.git("checkout", "-q", "main", cwd=work)
        (work / "pnpm-lock.yaml").write_text("main\n")
        (work / "a.ts").write_text("main\n")
        self.git("commit", "-qam", "main moves", cwd=work)
        self.git("push", "-q", "origin", "HEAD:main", cwd=work)
        self.git("checkout", "-q", "devin/jov-1-20260927", cwd=work)
        self.git("fetch", "-q", "origin", cwd=work)
        return origin, work

    def run_resolve(self, work: Path):
        real, calls = lane.sh, []

        def sh(args, cwd=None, timeout=600, env=None, log=None, stream=False):
            calls.append(args)
            if args[:2] == ["pnpm", "install"]:
                (Path(cwd) / "pnpm-lock.yaml").write_text("regenerated\n")
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            return real(args, cwd=cwd, timeout=timeout, env=env)
        lane.sh = sh
        try:
            with open(os.devnull, "w") as log:
                env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                       "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
                saved = dict(os.environ)
                os.environ.update(env)
                try:
                    return lane.resolve_lockfile_conflict(work, "devin/jov-1-20260927", log), calls
                finally:
                    os.environ.clear()
                    os.environ.update(saved)
        finally:
            lane.sh = real

    def test_lockfile_only_conflict_is_regenerated_and_pushed(self):
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {"pnpm-lock.yaml": "pr\n"})
            ok, calls = self.run_resolve(work)
            self.assertTrue(ok)
            self.assertIn(["pnpm", "install", "--lockfile-only", "--ignore-scripts"], calls)
            pushed = self.git("show", "devin/jov-1-20260927:pnpm-lock.yaml", cwd=origin)
            self.assertEqual(pushed, "regenerated")
            self.assertEqual(self.git("show", "devin/jov-1-20260927:a.ts", cwd=origin), "main")

    def test_a_source_conflict_is_left_to_the_agent_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {"pnpm-lock.yaml": "pr\n", "a.ts": "pr\n"})
            before = self.git("rev-parse", "devin/jov-1-20260927", cwd=origin)
            ok, calls = self.run_resolve(work)
            self.assertFalse(ok)
            self.assertNotIn(["pnpm", "install", "--lockfile-only", "--ignore-scripts"], calls)
            self.assertFalse((work / ".git" / "MERGE_HEAD").exists(), "merge aborted")
            self.assertEqual(self.git("rev-parse", "devin/jov-1-20260927", cwd=origin), before)
