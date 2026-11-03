import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "swarm"))
import pr_remediation_swarm as swarm  # noqa: E402


class SwarmPolicyTest(unittest.TestCase):
    def test_sensitive_paths_route_to_the_codex_ladder(self):
        for path in ("apps/web/lib/auth/session.ts", "apps/web/lib/billing/plans.ts", "apps/web/drizzle/0042_x.sql",
                     ".github/workflows/ci.yml", "scripts/lanes/lane_runner.py", ".env.example", "canon/README.md"):
            self.assertTrue(swarm.SENSITIVE.search(path), path)
        for path in ("apps/web/components/Button.tsx", "docs/README.md", "scripts/ci-fast-lanes.mjs"):
            self.assertFalse(swarm.SENSITIVE.search(path), path)

    def _gate(self, failures, pending, log, *, sensitive=False, agent="true", receipts=None):
        import types, tempfile
        calls = {"claim": 0, "rerun": 0}
        saved = {k: getattr(swarm, k) for k in ("latest_failures", "job_log_tail", "receipts_for", "take_claim", "finish_plan", "rerun_failed")}
        swarm.latest_failures = lambda sha: (failures, pending)
        swarm.job_log_tail = lambda run: log
        swarm.receipts_for = lambda n, sha, key: receipts or {"fp": 0, "sha": 0}
        swarm.take_claim = lambda plan, n: calls.__setitem__("claim", calls["claim"] + 1)
        swarm.rerun_failed = lambda f: calls.__setitem__("rerun", calls["rerun"] + 1)
        swarm.finish_plan = lambda plan, a: 0
        try:
            with tempfile.TemporaryDirectory() as d:
                a = types.SimpleNamespace(agent=agent, log=str(Path(d) / "l.log"))
                plan = {"pr": 9, "sha": "abc", "sensitive": sensitive}
                swarm.prepare_red(a, plan, {"mergeable_state": "blocked"})
                return plan, calls
        finally:
            for k, v in saved.items():
                setattr(swarm, k, v)

    def test_gate_skips_for_free_and_only_claims_real_work(self):
        red = [{"name": "Source Validation", "conclusion": "failure", "id": 1}]
        err = "AssertionError: expected 1 to equal 2\n  at scripts/foo.test.mjs:12:3"
        plan, c = self._gate([], False, "")
        self.assertEqual((plan["reason"], c["claim"]), ("no-failing-checks", 0))
        plan, c = self._gate(red, True, err)
        self.assertEqual((plan["reason"], c["claim"]), ("ci-running", 0))
        plan, c = self._gate(red, False, "Post job cleanup.\nnothing useful")
        self.assertEqual((plan["reason"], c["claim"]), ("no-concrete-error", 0))
        plan, c = self._gate(red, False, err, sensitive=True)
        self.assertEqual((plan["reason"], c["claim"]), ("sensitive-paths->codex", 0))
        plan, c = self._gate(red, False, err, agent="false")
        self.assertEqual((plan["reason"], c["claim"]), ("model-budget-closed", 0))
        plan, c = self._gate(red, False, err, receipts={"fp": 0, "sha": 1})
        self.assertEqual((plan["reason"], c["claim"]), ("already-handled-sha", 0))
        plan, c = self._gate(red, False, err)
        self.assertEqual((plan["action"], c["claim"]), ("agent", 1))
        plan, c = self._gate(red, False, "API rate limit exceeded for installation\n::error::x")
        self.assertEqual((plan["fix"], c["claim"], c["rerun"]), ("rerun-failed-jobs", 1, 1))
        plan, c = self._gate(red, False, "generated workflow DAG is stale; run pnpm ci:topology:write\n::error::x")
        self.assertEqual((plan["action"], plan["regen"], c["claim"]), ("regen", "pnpm ci:topology:write", 1))

    def test_launch_shepherd_prs_are_excluded(self):
        self.assertTrue({23495, 23519} <= swarm.EXCLUDED)

    def test_summarize_counts_outcomes_cost_and_calls(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "a.jsonl").write_text("\n".join(json.dumps(r) for r in (
                {"outcome": "agent-fixed", "costUsd": 0.012, "calls": 7},
                {"outcome": "gave-up", "costUsd": 0.03, "calls": 6})) + "\n")
            class A: pass
            a = A(); a.dir = str(d); a.out = str(d / "o.md")
            swarm.cmd_summarize(a)
            text = (d / "o.md").read_text()
            self.assertIn("attempts=2 reds=2 reds-pushed-or-rerun=1 conflicts=0 conflicts-cleared=0 behind=0 behind-updated=0 blocked-credits=0 cost=$0.0420 api_calls=13", text)

    def test_unreadable_ledger_fails_closed_for_model_but_not_for_deterministic(self):
        modes = {1: "red", 2: "conflict", 3: "red"}
        matrix = swarm.plan_matrix(modes, limit=10, by_quota=10, spent_cents=None, daily_cap_usd=5, attempt_cap_usd=0.1)
        self.assertEqual([m["pr"] for m in matrix], [1, 2, 3])  # $0 actions still dispatch
        self.assertFalse(any(m["agent"] for m in matrix))
        reached = swarm.plan_matrix(modes, limit=10, by_quota=10, spent_cents=500, daily_cap_usd=5, attempt_cap_usd=0.1)
        self.assertFalse(any(m["agent"] for m in reached))
        some = swarm.plan_matrix(modes, limit=10, by_quota=10, spent_cents=480, daily_cap_usd=5, attempt_cap_usd=0.1)
        self.assertEqual([m["agent"] for m in some], [True, True, False])  # 20c left = 2 attempts

    def test_no_gateway_credit_closes_model_slots_but_not_deterministic_actions(self):
        modes = {1: "red", 2: "conflict"}
        m = swarm.plan_matrix(modes, limit=10, by_quota=10, spent_cents=0, daily_cap_usd=5, attempt_cap_usd=0.1, credits_ok=False)
        self.assertEqual([x["pr"] for x in m], [1, 2])
        self.assertFalse(any(x["agent"] for x in m))
        self.assertFalse(swarm.credits_available("https://example.invalid/v1", ""))

    def test_relay_mode_skips_the_credit_probe_and_prices_at_list(self):
        import os
        os.environ["SWARM_CREDIT_PROBE"] = "off"
        try:
            self.assertTrue(swarm.credits_available("https://relay.invalid/v1", "k"))
            self.assertFalse(swarm.credits_available("https://relay.invalid/v1", ""))
        finally:
            del os.environ["SWARM_CREDIT_PROBE"]

    def test_credit_text_is_recognised_as_blocked_credits(self):
        for line in ('{"error":{"code":"insufficient_funds"}}', "Payment Required", '{"status": 402}'):
            self.assertTrue(swarm.CREDIT_TEXT.search(line), line)
        self.assertFalse(swarm.CREDIT_TEXT.search('{"type":"step-finish","tokens":{"input":402}}'))

    def test_day_spend_returns_none_when_the_read_fails(self):
        def boom(*args, **kwargs):
            raise RuntimeError("gh: HTTP 502")
        original = swarm.gh_json
        swarm.gh_json = boom
        try:
            self.assertIsNone(swarm.day_spend_cents("swarm-ledger"))
        finally:
            swarm.gh_json = original

    def test_day_spend_sums_todays_ledger_comments_once_per_run(self):
        today = swarm.iso()[:10]
        rows = [{"user": {"login": "jovie-bot[bot]"}, "body": f"🤖 swarm-ledger run=1 cents=7 at={today}T01:00:00Z"},
                {"user": {"login": "jovie-bot[bot]"}, "body": f"🤖 swarm-ledger run=1 cents=7 at={today}T01:00:01Z"},  # retried write, same run
                {"user": {"login": "jovie-bot[bot]"}, "body": f"🤖 swarm-ledger run=2 cents=5 at={today}T02:00:00Z"},
                {"user": {"login": "someone"}, "body": f"🤖 swarm-ledger run=3 cents=900 at={today}T03:00:00Z"},
                {"user": {"login": "jovie-bot[bot]"}, "body": "unrelated comment"}]
        original = swarm.gh_json
        swarm.gh_json = lambda *a, **k: rows
        try:
            self.assertEqual(swarm.day_spend_cents("23528"), 12)
            self.assertIsNone(swarm.day_spend_cents(""))  # no ledger configured: closed
        finally:
            swarm.gh_json = original

    def test_relay_requests_carry_a_user_agent_cloudflare_accepts(self):
        # urllib's default UA gets Cloudflare error 1010 from workers.dev before the Worker runs.
        src = Path(swarm.__file__).read_text()
        self.assertEqual(src.count('"User-Agent": "jovie-pr-remediation-swarm/1"'), 2)

    def test_behind_prs_are_paced_and_exclude_red_forks_and_held(self):
        def node(n, state="BEHIND", fork=False, roll="SUCCESS", labels=()):
            return {"number": n, "mergeStateStatus": state, "isCrossRepository": fork,
                    "labels": {"nodes": [{"name": l} for l in labels]},
                    "commits": {"nodes": [{"commit": {"statusCheckRollup": {"state": roll}}}]}}
        nodes = [node(1), node(2, state="DIRTY"), node(3, fork=True), node(4, roll="FAILURE"), node(5, labels=("hold",)),
                 *[node(10 + i) for i in range(20)]]
        page = {"data": {"repository": {"pullRequests": {"pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": nodes}}}}
        original = swarm.gh_json
        swarm.gh_json = lambda *a, **k: page
        try:
            got = swarm.behind_prs(10)
            self.assertEqual(got, [1] + list(range(10, 19)))  # 10 per run, only clean BEHIND same-repo PRs
            self.assertEqual(swarm.behind_prs(0), [])
        finally:
            swarm.gh_json = original

    def test_model_context_is_the_error_plus_the_named_files_and_bounded(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "scripts").mkdir()
            (Path(d) / "scripts/foo.mjs").write_text("x" * 40_000)
            (Path(d) / "scripts/bar.mjs").write_text("y" * 40_000)
            (Path(d) / "scripts/baz.mjs").write_text("z" * 40_000)
            out = swarm.named_files("Error in scripts/foo.mjs:3 and scripts/bar.mjs and scripts/baz.mjs and missing/nope.ts", d)
            self.assertIn("--- scripts/foo.mjs ---", out)
            self.assertNotIn("nope.ts", out)
            self.assertLessEqual(len(out), swarm.CONTEXT_CHARS + 500)
            self.assertEqual(swarm.named_files("Error in apps/web/lib/auth/session.ts", d), "(none of the named files exist in the checkout)")

    def test_gate_needs_a_concrete_error_and_flags_regen_from_a_fixed_table(self):
        self.assertFalse(swarm.concrete_error("cleanup line\nPost job cleanup.\n--- tail ---\nAssertionError in tail"))
        self.assertTrue(swarm.concrete_error("AssertionError: expected 1\n--- tail ---\nx"))
        self.assertFalse(swarm.concrete_error(""))
        joined = "generated workflow DAG is stale; run pnpm ci:topology:write"
        self.assertEqual(next(c for _, p, c in swarm.REGEN if p.search(joined)), "pnpm ci:topology:write")

    def test_summary_reports_gate_skip_rate_and_alarms_on_cost_per_greened(self):
        import contextlib, io, tempfile
        rows = [{"outcome": "skipped", "reason": "no-failing-checks", "calls": 3},
                {"outcome": "skipped", "reason": "no-concrete-error", "calls": 4},
                {"outcome": "gave-up", "model": "m", "costUsd": 0.2, "calls": 9},
                {"outcome": "agent-fixed", "model": "m", "costUsd": 0.05, "calls": 9}]
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "a.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")
            class A: pass
            a = A(); a.dir = tmp; a.out = str(Path(tmp) / "o.md")
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                swarm.cmd_summarize(a)
            text = Path(a.out).read_text()
            self.assertIn("gate-skipped=2/4 (50%)", text)
            self.assertIn("usd-per-greened=$0.2500", text)
            self.assertIn("::warning title=swarm cost per greened PR", buf.getvalue())

    def test_log_fetch_retries_with_allow_escape_sequences_when_gh_asks(self):
        calls = []
        def fake(args, **kw):
            calls.append(list(args))
            if "--allow-escape-sequences" in args:
                return swarm._Result({"code": 0, "stdout": "\x1b[31mlog\x1b[0m", "stderr": ""})
            return swarm._Result({"code": 1, "stdout": "", "stderr": "the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway"})
        original = swarm.gh
        swarm.gh = fake
        try:
            out = swarm.fetch_job_log(7)
            self.assertEqual((out.returncode, len(calls)), (0, 2))
            calls.clear()
            swarm.gh = lambda args, **kw: (calls.append(args), swarm._Result({"code": 1, "stdout": "", "stderr": "gh: HTTP 404"}))[1]
            self.assertEqual((swarm.fetch_job_log(7).returncode, len(calls)), (1, 1))  # no retry for other errors
        finally:
            swarm.gh = original

    def test_smoke_fails_loudly_on_an_empty_log_and_passes_on_a_real_one(self):
        import contextlib, io
        saved = (swarm.gh_json, swarm.fetch_job_log, swarm.gh_version)
        swarm.gh_version = lambda: "2.93.0"
        def jsons(args, **kw):
            return {"workflow_runs": [{"id": 1, "conclusion": "success"}]} if "/runs?" in args[1] else {"jobs": [{"id": 5, "name": "x", "conclusion": "success", "started_at": "t"}]}
        swarm.gh_json = jsons
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                swarm.fetch_job_log = lambda j: swarm._Result({"code": 0, "stdout": "log", "stderr": ""})
                self.assertEqual(swarm.cmd_smoke(None), 0)
                swarm.fetch_job_log = lambda j: swarm._Result({"code": 1, "stdout": "", "stderr": "escape sequences"})
                self.assertEqual(swarm.cmd_smoke(None), 1)
                swarm.fetch_job_log = lambda j: swarm._Result({"code": 0, "stdout": "", "stderr": ""})
                self.assertEqual(swarm.cmd_smoke(None), 1)  # rc 0 but empty is still a failure
                swarm.gh_version = lambda: "2.10.0"
                self.assertEqual(swarm.cmd_smoke(None), 1)  # below the supported minimum
        finally:
            swarm.gh_json, swarm.fetch_job_log, swarm.gh_version = saved

    def test_smoke_reaches_a_readable_log_past_a_starved_recent_window(self):
        # 2026-10-29 run 40936622218: at this repo's run rate the 20 newest completed runs can all be
        # skipped/cancelled event handlers, so the old 20-run window gave up while a readable log was
        # one run deeper. The scan must reach it without weakening the loud failure.
        import contextlib, io
        saved = (swarm.gh_json, swarm.fetch_job_log, swarm.gh_version)
        swarm.gh_version = lambda: "2.103.2"
        skipped = [{"id": i, "conclusion": "skipped"} for i in range(40, 20, -1)]  # 20 newest, all skipped
        def jsons(args, **kw):
            if "/runs?" in args[1]:
                n = int(re.search(r"per_page=(\d+)", args[1]).group(1))  # the API slices, so must the fake
                return {"workflow_runs": (skipped + [{"id": 7, "conclusion": "success"}])[:n]}
            return {"jobs": [{"id": 5, "name": "x", "conclusion": "success", "started_at": "t"}]}
        swarm.gh_json = jsons
        try:
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                swarm.fetch_job_log = lambda j: swarm._Result({"code": 0, "stdout": "log", "stderr": ""})
                self.assertEqual(swarm.cmd_smoke(None), 0)
            self.assertIn("smoke job 5", buf.getvalue())
        finally:
            swarm.gh_json, swarm.fetch_job_log, swarm.gh_version = saved

    def test_smoke_starved_scan_still_fails_loudly_with_diagnostics(self):
        import contextlib, io
        saved = (swarm.gh_json, swarm.fetch_job_log, swarm.gh_version)
        swarm.gh_version = lambda: "2.103.2"
        def jsons(args, **kw):
            return ({"workflow_runs": [{"id": 1, "conclusion": "skipped"}, {"id": 2, "conclusion": "cancelled"},
                                       {"id": 3, "conclusion": "success"}, {"id": 4, "conclusion": "success"}]}
                    if "/runs?" in args[1] else {"jobs": []})
        swarm.gh_json = jsons
        try:
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(swarm.cmd_smoke(None), 1)
            out = buf.getvalue()
            self.assertIn("no readable completed job log to smoke-test the log fetch", out)
            self.assertIn("eligible_jobs=0", out)   # the scan, not the fetch, found nothing
            self.assertIn('"success": 2', out)      # conclusions breakdown for the next reader
        finally:
            swarm.gh_json, swarm.fetch_job_log, swarm.gh_version = saved

    def test_claim_format_matches_the_lanes_parser(self):
        body = f"🤖 lane claim kind=fix sha=abc host={swarm.HOST} at={swarm.iso()}"
        fields = dict(p.split("=", 1) for p in body.split()[3:] if "=" in p)
        self.assertEqual((fields["kind"], fields["sha"], fields["host"]), ("fix", "abc", "gha-swarm"))


if __name__ == "__main__":
    unittest.main()
