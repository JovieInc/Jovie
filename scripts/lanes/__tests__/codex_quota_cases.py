"""Hermetic quota/event regression mixin, shipped with the executor bundle.

The existing Codex test fixture supplies the executor and synthetic snapshots.
"""
import io
import json
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


class CodexQuotaCases:
    def run_pool_failure(self, output, elapsed=0):
        self.reconcile()
        clock = [self.NOW]
        observations, inputs = [], []
        class Prompt(io.StringIO):
            def close(stream):
                if not stream.closed:
                    inputs.append(stream.getvalue())
                super().close()
        def snapshot(name, **_):
            observations.append(name)
            value = self.current_snapshot(clock[0])
            value["account"]["account"].update(email=self.emails[name], planType="pro")
            return value
        def first_wait():
            clock[0] += elapsed
            return 1
        procs = [SimpleNamespace(pid=123, stdin=Prompt(), stdout=io.StringIO(output), wait=first_wait),
                 SimpleNamespace(pid=124, stdin=Prompt(), stdout=io.StringIO("OK\n"), wait=lambda: 0)]
        prompt = Path(self.tmp.name) / "prompt.txt"
        prompt.write_text("continue this exact worktree")
        with patch.object(self.codex.time, "time", side_effect=lambda: clock[0]), \
                patch.object(self.codex, "current_login_available", return_value=True), \
                patch.object(self.codex, "current_subscription_snapshot", side_effect=snapshot), \
                patch.object(self.codex, "maybe_redeem", side_effect=AssertionError("no credit authority")), \
                patch.object(self.codex.time, "sleep", side_effect=AssertionError("no quota polling or rotation sleep")), \
                patch.object(self.codex.subprocess, "Popen", side_effect=procs) as spawn, \
                redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            result = self.codex.run(SimpleNamespace(prompt_file=str(prompt), cwd=self.tmp.name,
                                               model=None, reasoning_effort=None))
        return result, spawn.call_args_list, observations, inputs

    def test_pool_usage_failure_immediately_uses_another_configured_account(self):
        result, calls, observations, inputs = self.run_pool_failure("usage limit. Try again in 1 hour.\n")
        self.assertEqual(result, 0)
        self.assertEqual(len(calls), 2)
        self.assertEqual([c.kwargs["env"]["CODEX_HOME"] for c in calls], list(map(str, self.homes.values())))
        self.assertTrue(all(c.kwargs["cwd"] == self.tmp.name for c in calls))
        self.assertIn("current state of the worktree", inputs[1])
        self.assertIn("continue this exact worktree", inputs[1])
        self.assertEqual(observations, ["current-login", "current-login", "lyb-pro"])
        state = self.codex.read_state()
        event = state["current-login"]["lastObservation"]
        self.assertEqual(event["message"], "Try again in 1 hour")
        self.assertEqual(event["observedAt"], self.NOW)
        self.assertEqual(event["reportedResetAt"], self.NOW + 3600)
        self.assertEqual(event["resetBasis"], "cli-relative-duration")
        self.assertEqual(state["current-login"]["exhaustedUntil"], self.NOW + 3600)
        self.assertEqual(state["current-login"]["subscriptionLedger"]["observationId"], event["id"])

    def test_pool_transient_rate_rotates_without_a_usage_cooldown(self):
        result, calls, _, _ = self.run_pool_failure("error: 429 rate limit. Try again in 2 minutes.\n")
        self.assertEqual((result, len(calls)), (0, 2))
        row = self.codex.read_state()["current-login"]
        self.assertEqual((row["lastKind"], row["exhaustedUntil"]), ("rate", self.NOW + 120))

    def test_quota_event_refreshes_stale_peers_in_the_same_continuation(self):
        result, calls, observations, _ = self.run_pool_failure("usage limit. Try again in 1 hour.\n", elapsed=3601)
        self.assertEqual((result, len(calls)), (0, 2))
        self.assertEqual(observations, ["current-login", "current-login", "lyb-pro", "lyb-pro"])

    def test_terminal_observation_is_consumed_once_without_hourly_delay(self):
        self.reconcile()
        self.execute("lyb-pro", "usage limit. Try again in 2 hours.\n", 1)
        seen = []
        def observe(name):
            seen.append(name)
            return self.snapshot(name)
        self.codex.reconcile(self.NOW, fetch=observe)
        self.assertEqual(seen, ["lyb-pro"])
        state = self.codex.read_state()
        event = state["lyb-pro"]["lastObservation"]
        self.assertEqual(state["lyb-pro"]["subscriptionLedger"]["observationId"], event["id"])
        self.assertEqual(state["lyb-pro"]["exhaustedUntil"], self.NOW + 7200)
        seen.clear()
        self.codex.reconcile(self.NOW, fetch=observe)
        self.assertEqual(seen, [])
        for stamp in (self.NOW - 1, self.NOW + 1):
            with self.subTest(stamp=stamp):
                self.codex.update_state(lambda st: st["lyb-pro"]["lastObservation"].update(id="f" * 32, observedAt=stamp))
                self.codex.reconcile(self.NOW, fetch=observe)
                self.assertEqual(seen, [])

    def test_concurrent_observer_claims_the_event_before_this_observer_stamps(self):
        self.reconcile()
        self.execute("current-login", "usage limit. Try again in 1 hour.\n", 1)
        event_id = self.codex.read_state()["current-login"]["lastObservation"]["id"]
        handle = self.codex.lease("current-login")
        self.assertIsNotNone(handle)
        update = self.codex.update_state
        def competing_stamp(mutator):
            def consume(state):
                state["current-login"]["subscriptionLedger"].update(
                    reconciledAt=self.NOW + 0.1, observationId=event_id,
                    errors={"current-login": "observation-in-progress"})
            update(consume)
            return update(mutator)
        with patch.object(self.codex, "lease", return_value=handle), \
                patch.object(self.codex, "update_state", side_effect=competing_stamp), \
                patch.object(self.codex, "current_subscription_snapshot") as fetch:
            result = self.codex.reconcile_current_subscription(self.NOW, self.codex.LEDGER_CADENCE_S, fetch)
        self.assertFalse(result["reconciled"])
        fetch.assert_not_called()
        row = self.codex.read_state()["current-login"]
        self.assertEqual(row["subscriptionLedger"]["observationId"], event_id)
        self.assertEqual(row["subscriptionLedger"]["reconciledAt"], self.NOW + 0.1)
        self.assertEqual(row["exhaustedUntil"], self.NOW + 3600)

    def test_event_arriving_during_readback_is_not_acknowledged_by_the_older_read(self):
        self.reconcile()
        self.execute("current-login", "usage limit. Try again in 1 hour.\n", 1)
        first_id = self.codex.read_state()["current-login"]["lastObservation"]["id"]
        def observe(name):
            self.execute(name, "usage limit. Try again in 2 hours.\n", 1)
            return self.snapshot(name)
        self.codex.reconcile(self.NOW, fetch=observe)
        row = self.codex.read_state()["current-login"]
        self.assertNotEqual(row["lastObservation"]["id"], first_id)
        self.assertEqual(row["subscriptionLedger"]["observationId"], first_id)
        self.assertEqual(row["exhaustedUntil"], self.NOW + 7200)
        seen = []
        self.codex.reconcile(self.NOW, fetch=lambda name: (seen.append(name), self.snapshot(name))[1])
        self.assertEqual(seen, ["current-login"])
        self.assertEqual(self.codex.read_state()["current-login"]["subscriptionLedger"]["observationId"], row["lastObservation"]["id"])
        seen.clear()
        self.codex.reconcile(self.NOW, fetch=lambda name: (seen.append(name), self.snapshot(name))[1])
        self.assertEqual(seen, [])

    def test_reset_observation_does_not_copy_surrounding_credentials_or_transcript(self):
        self.reconcile()
        self.execute("lyb-pro", "private@example.invalid token=SECRET usage limit. Try again in 3 hours. token=SECRET\n", 1)
        event = self.codex.read_state()["lyb-pro"]["lastObservation"]
        self.assertEqual(event["message"], "Try again in 3 hours")
        self.assertNotIn("SECRET", json.dumps(event))
        self.assertNotIn("private@example", json.dumps(event))

    def test_missing_reset_records_policy_backoff_without_inventing_provider_reset(self):
        self.reconcile()
        self.execute("lyb-pro", "error: 429 Too Many Requests\n", 1)
        event = self.codex.read_state()["lyb-pro"]["lastObservation"]
        self.assertIsNone(event["reportedResetAt"])
        self.assertEqual(event["resetBasis"], "policy-rate-backoff")
        self.assertEqual(event["bankedUntil"], self.NOW + self.codex.RATE_BACKOFF_S)

    def test_auth_observation_never_persists_wildcard_credential_text(self):
        self.reconcile()
        self.execute("lyb-pro", "error: invalid SECRET-VALUE token\n", 1)
        row = self.codex.read_state()["lyb-pro"]
        self.assertEqual(row["lastError"], "invalid credential")
        self.assertNotIn("SECRET-VALUE", json.dumps(row["lastObservation"]))
        self.assertIsNone(row["lastObservation"]["reportedResetAt"])
        self.assertEqual(row["lastObservation"]["resetBasis"], "policy-auth-cooldown")

    def test_failed_event_readback_is_visible_and_does_not_hot_loop_or_clear_the_bank(self):
        self.reconcile()
        self.execute("lyb-pro", "usage limit. Try again in 1 hour.\n", 1)
        event = self.codex.read_state()["lyb-pro"]["lastObservation"]
        def unavailable(name):
            raise TimeoutError("fixture unavailable")
        result = self.codex.reconcile(self.NOW, fetch=unavailable)
        self.assertFalse(result["profiles"]["lyb-pro"]["reconciled"])
        self.assertIn("lyb-pro", result["profiles"]["lyb-pro"]["errors"])
        row = self.codex.read_state()["lyb-pro"]
        self.assertEqual(row["exhaustedUntil"], self.NOW + 3600)
        self.assertEqual(row["lastObservation"], event)
        with patch.object(self.codex, "current_subscription_snapshot", side_effect=AssertionError("duplicate event")):
            self.codex.reconcile(self.NOW)

    def test_later_shorter_failure_keeps_the_longer_bank_and_its_observation_together(self):
        self.reconcile()
        self.execute("current-login", "usage limit. Try again in 2 hours.\n", 1)
        original = self.codex.read_state()["current-login"]["lastObservation"]
        self.execute("current-login", "error: 429 rate limit. Try again in 2 minutes.\n", 1)
        row = self.codex.read_state()["current-login"]
        self.assertEqual(row["exhaustedUntil"], self.NOW + 7200)
        self.assertEqual(row["lastObservation"], original)

    def test_auth_failure_can_use_a_distinct_eligible_account_but_unknown_failure_cannot(self):
        result, calls, _, _ = self.run_pool_failure("error: login required\n")
        self.assertEqual((result, len(calls)), (0, 2))
        self.codex.write_state({})
        result, calls, _, _ = self.run_pool_failure("error: unknown failure\n")
        self.assertEqual((result, len(calls)), (1, 1))

    def test_reset_provenance_distinguishes_explicit_utc_local_clock_and_malformed_reset(self):
        for output, basis, reported in (
                ("usage limit. resets at 2026-11-18T12:30:00Z", "cli-utc-timestamp", True),
                ("usage limit. Try again at 3:15 PM", "cli-clock-local", True),
                ("usage limit. resets at 2026-99-99T12:30:00Z", "policy-usage-cooldown", False)):
            with self.subTest(output=output):
                self.codex.write_state({}); self.reconcile()
                self.execute("lyb-pro", output + "\n", 1)
                event = self.codex.read_state()["lyb-pro"]["lastObservation"]
                self.assertEqual(event["resetBasis"], basis)
                self.assertEqual(event["reportedResetAt"] is not None, reported)

    def test_success_and_early_transcript_reset_decoys_do_not_create_observations(self):
        self.reconcile()
        self.execute("lyb-pro", "usage limit. Try again in 2 hours.\n", 0)
        self.assertNotIn("lastObservation", self.codex.read_state()["lyb-pro"])
        self.execute("lyb-pro", "usage limit. Try again in 2 hours.\n" + "unrelated work\n" * 31, 1)
        self.assertNotIn("lastObservation", self.codex.read_state()["lyb-pro"])

    def test_reset_observation_bounds_a_long_recognized_phrase(self):
        self.reconcile()
        self.execute("lyb-pro", "usage limit. Try again in " + "1 hour " * 150 + " secret=SECRET\n", 1)
        event = self.codex.read_state()["lyb-pro"]["lastObservation"]
        self.assertEqual(len(event["message"]), 512)
        self.assertTrue(event["messageTruncated"])
        self.assertNotIn("SECRET", json.dumps(event))

    def test_later_transient_failure_does_not_inherit_a_quoted_usage_reset(self):
        self.reconcile()
        self.execute("lyb-pro", "quoted usage limit. Try again in 12 hours.\nerror: 429 rate limit. Try again in 2 minutes.\n", 1)
        row = self.codex.read_state()["lyb-pro"]
        self.assertEqual((row["lastKind"], row["exhaustedUntil"]), ("rate", self.NOW + 120))
        self.assertEqual(row["lastObservation"]["message"], "Try again in 2 minutes")

    def test_event_stamp_failure_prevents_readback_and_can_resume_the_same_event(self):
        self.reconcile()
        self.execute("lyb-pro", "usage limit. Try again in 1 hour.\n", 1)
        event = self.codex.read_state()["lyb-pro"]["lastObservation"]
        handle = self.codex.lease("lyb-pro")
        self.assertIsNotNone(handle)
        with patch.object(self.codex, "lease", return_value=handle), \
                patch.object(self.codex, "write_state", side_effect=OSError("fixture storage unavailable")), \
                patch.object(self.codex, "current_subscription_snapshot", side_effect=AssertionError("no unstamped request")) as fetch:
            result = self.codex.reconcile_current_subscription(self.NOW, self.codex.LEDGER_CADENCE_S,
                                                         self.codex.current_subscription_snapshot, "lyb-pro")
        self.assertFalse(result["reconciled"])
        fetch.assert_not_called()
        self.assertTrue(handle.closed)
        self.assertEqual(self.codex.read_state()["lyb-pro"]["lastObservation"], event)
        seen = []
        self.codex.reconcile(self.NOW, fetch=lambda name: (seen.append(name), self.snapshot(name))[1])
        self.assertEqual(seen, ["lyb-pro"])

    def test_natural_reset_refreshes_once_and_failed_refresh_retains_hourly_throttle(self):
        def near_reset(name):
            value=self.snapshot(name)
            if name=="lyb-pro":value["rateLimits"]["rateLimits"]["primary"]["resetsAt"]=self.NOW+30
            return value
        self.codex.reconcile(self.NOW,fetch=near_reset)
        self.assertFalse(self.codex.available("lyb-pro",self.codex.read_state(),self.NOW+31))
        seen=[]
        def refresh(name):seen.append(name);return self.snapshot(name)
        result=self.codex.reconcile(self.NOW+31,fetch=refresh)
        self.assertEqual(seen,["lyb-pro"])
        self.assertTrue(result["profiles"]["lyb-pro"]["reconciled"])
        self.assertTrue(self.codex.available("lyb-pro",self.codex.read_state(),self.NOW+31))
        self.codex.write_state({});self.codex.reconcile(self.NOW,fetch=near_reset)
        seen=[]
        def fail(name):seen.append(name);raise ValueError("unavailable")
        self.codex.reconcile(self.NOW+31,fetch=fail);self.codex.reconcile(self.NOW+32,fetch=fail)
        self.assertEqual(seen,["lyb-pro"])


