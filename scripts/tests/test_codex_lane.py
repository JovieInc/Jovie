"""Regression tests for scripts/lanes/codex_lane.py (Codex accounts as a shipping lane).

Run with:
    python3 -m unittest scripts/tests/test_codex_lane.py -v
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("codex_lane", ROOT / "scripts/lanes/codex_lane.py")
codex = importlib.util.module_from_spec(SPEC)
sys.modules["codex_lane"] = codex
SPEC.loader.exec_module(codex)


def profile(root: Path, name: str, kind: str = "chatgpt") -> None:
    home = root / name
    home.mkdir(parents=True)
    auth = {"tokens": {"access_token": "t", "id_token": "i"}} if kind == "chatgpt" else {"OPENAI_API_KEY": "sk"}
    (home / "auth.json").write_text(json.dumps(auth))


def rate_snapshot(now=1_000_000, credits=None, secondary=True) -> dict:
    limits = {"planType": "pro", "primary": {"usedPercent": 50, "resetsAt": now + 7200, "windowDurationMins": 10080}}
    if secondary: limits["secondary"] = {"usedPercent": 80, "resetsAt": now + 3600, "windowDurationMins": 300}
    return {"account": {"account": {"type": "chatgpt", "planType": "pro"}},
            "rateLimits": {"rateLimits": limits, "rateLimitResetCredits": credits},
            "messages": {"messages": []}}


class Isolated(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.saved = (codex.ACCOUNTS_ROOT, codex.STATE)
        codex.ACCOUNTS_ROOT = root / "accounts"
        codex.STATE = root / "state" / "codex-accounts.json"
        profile(codex.ACCOUNTS_ROOT, "alpha")
        profile(codex.ACCOUNTS_ROOT, "beta")
        profile(codex.ACCOUNTS_ROOT, "openrouter", kind="apikey")
        (codex.ACCOUNTS_ROOT / "locks").mkdir()

    def tearDown(self):
        codex.ACCOUNTS_ROOT, codex.STATE = self.saved
        self.tmp.cleanup()


class AccountsTest(Isolated):
    def test_only_chatgpt_profiles_are_accounts(self):
        self.assertEqual(codex.accounts(), ["alpha", "beta"])

    def test_pick_is_least_recently_used_and_skips_exhausted(self):
        now = 1_000_000.0
        state = {"alpha": {"lastUsed": now - 10}, "beta": {"lastUsed": now - 100}}
        name, handle = codex.pick(state, now)
        self.assertEqual(name, "beta")
        handle.close()
        state["beta"]["exhaustedUntil"] = now + 3600
        name, handle = codex.pick(state, now)
        self.assertEqual(name, "alpha")
        handle.close()
        state["alpha"]["exhaustedUntil"] = now + 60
        self.assertEqual(codex.pick(state, now), (None, None))
        self.assertEqual(codex.pick(state, now + 61)[0], "alpha")

    def test_leases_are_exclusive_while_held(self):
        name, first = codex.pick({}, 1.0)
        second_name, second = codex.pick({}, 1.0)
        self.assertNotEqual(name, second_name)
        third = codex.pick({}, 1.0)
        self.assertEqual(third, (None, None))
        first.close()
        second.close()
        again, handle = codex.pick({}, 1.0)
        self.assertIsNotNone(again)
        handle.close()


class CurrentLoginTest(Isolated):
    def setUp(self):
        super().setUp()
        self.root = Path(self.tmp.name)
        self.cli = self.root / "codex"
        self.env = patch.dict(os.environ, {
            "CODEX_LANE_AUTH_MODE": "current-login", "CODEX_LANE_CLI": str(self.cli),
            "CODEX_HOME": str(self.root / "existing-login"), "OPENAI_API_KEY": "must-not-reach-child",
            "OPENAI_BASE_URL": "https://unavailable.invalid", "CODEX_API_KEY": "must-not-reach-child",
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def fake_cli(self, output="OK", code=0, auth="Logged in using ChatGPT", auth_code=0):
        self.cli.write_text(
            f"#!{sys.executable}\nimport json,os,sys\nfrom pathlib import Path\n"
            f"root=Path({str(self.root)!r})\n"
            f"if sys.argv[1:]==['login','status']:\n print({auth!r}); sys.exit({auth_code})\n"
            "if '--approve-for-me' in sys.argv:\n print(\"error: unexpected argument '--approve-for-me' found\"); sys.exit(2)\n"
            "assert not any(k in os.environ for k in ['OPENAI_API_KEY','OPENAI_BASE_URL','CODEX_API_KEY'])\n"
            "assert os.environ['CODEX_HOME'].endswith('existing-login')\n"
            "(root/'launch.json').write_text(json.dumps(sys.argv))\n"
            f"sys.stdin.read(); print({output!r}); sys.exit({code})\n")
        self.cli.chmod(0o700)

    def invoke(self):
        prompt = self.root / "prompt.txt"
        prompt.write_text("Implement the assigned issue")
        return codex.run(SimpleNamespace(prompt_file=str(prompt), receipt_file=str(self.root / "receipt.jsonl"),
                                        cwd=str(self.root), model=None, reasoning_effort="high"))

    def test_existing_cli_login_without_opening_credentials_or_scanning_profiles(self):
        self.fake_cli()
        with patch.object(Path, "glob", side_effect=AssertionError("profile discovery")):
            self.assertEqual(codex.accounts(), ["current-login"])
        self.assertEqual(self.invoke(), 0)
        argv = json.loads((self.root / "launch.json").read_text())
        self.assertIn('forced_login_method="chatgpt"', argv)
        self.assertIn('model_provider="openai"', argv)
        self.assertEqual(argv[argv.index('--sandbox') + 1], 'workspace-write')
        self.assertIn('approval_policy="on-request"', argv)
        self.assertIn('approvals_reviewer="auto_review"', argv)
        self.assertNotIn("--approve-for-me", argv)
        self.assertNotIn('approval_policy="never"', argv)
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", argv)
        self.assertEqual([json.loads(row)["account"] for row in (self.root / "receipt.jsonl").read_text().splitlines()],
                         ["current-login", "current-login"])

    def test_missing_broken_api_or_unknown_login_never_launches_inference(self):
        for auth, code in [("Logged in using an API key", 0), ("unknown", 0), ("Logged in using ChatGPT", 1)]:
            with self.subTest(auth=auth, code=code):
                self.fake_cli(auth=auth, auth_code=code)
                self.assertEqual(self.invoke(), codex.NO_ACCOUNT_EXIT)
                self.assertFalse((self.root / "launch.json").exists())
        self.cli.unlink()
        self.assertEqual(codex.accounts(), [])

    def test_auth_probe_timeout_fails_closed(self):
        with patch.object(codex.subprocess, "run", side_effect=codex.subprocess.TimeoutExpired("codex", 10)):
            self.assertEqual(codex.accounts(), [])

    def test_one_exclusive_lease_and_no_duplicate_launch(self):
        self.fake_cli()
        name, handle = codex.pick({}, time.time())
        self.assertEqual(name, "current-login")
        try:
            self.assertEqual(self.invoke(), codex.NO_ACCOUNT_EXIT)
            self.assertFalse((self.root / "launch.json").exists())
        finally:
            handle.close()
        self.assertEqual(self.invoke(), 0)

    def test_limit_banks_single_login_without_rotation_or_credit_redemption(self):
        self.fake_cli("You've hit your usage limit. Try again in 2 hours.", 1)
        with patch.object(codex, "maybe_redeem", side_effect=AssertionError("credit redemption")), \
                patch.object(codex.time, "sleep", side_effect=AssertionError("rotation")):
            self.assertEqual(self.invoke(), codex.NO_ACCOUNT_EXIT)
        state = codex.read_state()
        self.assertEqual(list(state), ["current-login"])
        self.assertEqual(state["current-login"]["lastKind"], "limit")
        self.assertEqual(state["current-login"]["runs"], 1)
        self.assertEqual(self.invoke(), codex.NO_ACCOUNT_EXIT)
        self.assertEqual(codex.read_state()["current-login"]["runs"], 1)
        name, handle = codex.pick(state, state["current-login"]["exhaustedUntil"] + 1)
        self.assertEqual(name, "current-login")
        handle.close()

    def test_rate_and_auth_failures_release_lease_and_bank_without_retry(self):
        for output, kind in [("error: 429 Too Many Requests", "rate"), ("error: login required", "auth")]:
            with self.subTest(kind=kind):
                codex.write_state({})
                self.fake_cli(output, 1)
                self.assertEqual(self.invoke(), codex.NO_ACCOUNT_EXIT)
                self.assertEqual(codex.read_state()["current-login"]["lastKind"], kind)
                handle = codex.lease("current-login")
                self.assertIsNotNone(handle)
                handle.close()

    def test_reconciliation_never_contacts_credit_or_coordinator_services(self):
        with patch.object(codex, "app_server_calls", side_effect=AssertionError("app server")):
            self.assertEqual(codex.reconcile(fetch=lambda _: self.fail("quota service")),
                             {"reconciled": False, "reason": "current-login-cli-only"})


class ClassifyTest(unittest.TestCase):
    def test_limit_message_banks_the_account_until_the_reported_reset(self):
        now = 1_000_000.0
        kind, until = codex.classify("...\nYou've hit your usage limit. Try again in 2 hours 30 minutes.\n", 1, now)
        self.assertEqual((kind, until), ("limit", now + 9000))

    def test_limit_without_a_reset_uses_the_default_cooldown(self):
        kind, until = codex.classify("error: usage limit reached", 1, 5.0)
        self.assertEqual((kind, until), ("limit", 5.0 + codex.DEFAULT_COOLDOWN_S))
        # A burst rate limit backs off briefly instead of banking the account for hours.
        self.assertEqual(codex.classify("error: rate limit exceeded", 1, 5.0), ("rate", 5.0 + codex.RATE_BACKOFF_S))

    def test_auth_failures_bank_for_a_day_and_success_clears(self):
        kind, until = codex.classify("codex: not logged in", 1, 0.0)
        self.assertEqual((kind, until), ("auth", 86400.0))
        self.assertEqual(codex.classify("codex\nOK\ntokens used\n12", 0, 0.0), ("ok", None))
        self.assertEqual(codex.classify("boom", 3, 0.0), ("error", None))

    def test_successful_run_that_mentions_rate_limits_is_not_exhausted(self):
        transcript = "reading rate-limiter.test.ts\nexpect 429 Too Many Requests\nquota fallback\n" + "work\n" * 40 + "Done."
        self.assertEqual(codex.classify(transcript, 0, 0.0), ("ok", None))

    def test_limit_text_early_in_a_failed_run_is_not_the_failure(self):
        transcript = "handles 429 retries\n" + "step\n" * 40 + "error: stream disconnected"
        self.assertEqual(codex.classify(transcript, 1, 0.0), ("error", None))

    def test_reset_clock_times_roll_to_the_next_occurrence(self):
        now = 1_000_000.0
        until = codex.parse_reset("Try again at 2026-09-27T01:00:00Z", now)
        self.assertEqual(until, 1790470800.0)
        soon = codex.parse_reset("try again at 11:59 PM", now)
        self.assertGreater(soon, now)
        self.assertLess(soon - now, 86400)


class LedgerTest(Isolated):
    def test_announcements_keep_immediate_and_banked_promises_independent(self):
        cases = [("We reset your rate limits now.", (True, False)),
            ("You receive one banked reset credit per day.", (False, True)),
            ("We reset rate limits now and granted a reset credit.", (True, True)),
            ("We did not reset rate limits and no reset credit was granted.", (False, False)),
            ("If needed, we may reset rate limits and could grant a reset credit.", (False, False)),
            ("Last month we reset rate limits and granted a reset credit.", (False, False)),
        ]
        for index, (body, expected) in enumerate(cases):
            with self.subTest(body=body):
                parsed = codex.parse_announcement({"messageId": str(index), "messageBody": body})
                self.assertEqual((parsed["immediateReset"], parsed["bankedCreditGrant"]), expected)
        self.assertIsNone(codex.parse_announcement({"messageBody": "reset"}))
        message = {"messageId": "same", "messageBody": "A banked reset credit was granted."}
        fresh, seen = codex.announcement_evidence([message, message])
        self.assertEqual((len(fresh), codex.announcement_evidence([message], seen)[0]), (1, []))
    def test_capacity_lease_models_lifecycle_expiry_and_unknowns_without_assumptions(self):
        now = 1_000_000
        evidence = {"observedSustainableThroughputPerHour": 25, "observedConcurrency": 2,
                    "throughputObservedAt": now, "throughputConfidence": "observed"}
        expected = [({}, 3600), ({"canceledAtPeriodEnd": True, "subscriptionEndAt": now + 1200}, 1200),
                    ({"paymentFailure": True, "graceEndsAt": now + 900}, 900),
                    ({"accessLossAt": now + 60}, 60)]
        for lifecycle, unavailable in expected:
            lease = codex.build_capacity_lease("alpha", rate_snapshot(now), {**evidence, **lifecycle}, now)
            self.assertEqual((lease["timeToUnavailabilityS"], lease["throughput"]["estimatedDrainTimeS"]), (unavailable, 1440))
        summary = {"availableCount": 2, "credits": [
            {"id": "never", "status": "available", "resetType": "codexRateLimits", "grantedAt": now, "expiresAt": None},
            {"id": "soon", "status": "available", "resetType": "codexRateLimits", "grantedAt": now, "expiresAt": now + 500}]}
        lease = codex.build_capacity_lease("alpha", rate_snapshot(now, summary),
                                           {**evidence, "promotionalCredits": [{"id": "promo", "hardCap": 5, "expiresAt": now + 300}]}, now)
        deadlines = {row["id"]: row["redemptionDeadline"] for row in lease["credits"]["details"]}
        self.assertEqual(deadlines, {"never": None, "soon": now + 500, "promo": now + 300})
        unknown = codex.build_capacity_lease("alpha", {"rateLimits": {"rateLimits": {}}, "messages": {}}, {}, now)
        self.assertIsNone(unknown["timeToUnavailabilityS"])
        self.assertEqual(unknown["sources"]["lifecycle"]["reconciliation"], "unknown")
    def test_redemption_requires_terminal_lock_fresh_drain_and_usable_runway(self):
        now = 1_000_000
        credits = {"availableCount": 3, "credits": [
            {"id": "late", "status": "available", "resetType": "codexRateLimits", "grantedAt": 1, "expiresAt": now + 900},
            {"id": "early", "status": "available", "resetType": "codexRateLimits", "grantedAt": 2, "expiresAt": now + 300},
            {"id": "wrong", "status": "available", "resetType": "other", "grantedAt": 0, "expiresAt": now + 1}]}
        rates = rate_snapshot(now, credits)["rateLimits"]
        lifecycle = {"observedSustainableThroughputPerHour": 200, "observedConcurrency": 1,
                     "throughputObservedAt": now}
        decision = codex.redemption_decision("alpha", {"type": "terminal_limit"}, rates, lifecycle, True, True, now)
        self.assertEqual(decision["credit"]["id"], "early")
        self.assertIsNone(codex.select_reset_credit({"rateLimitResetCredits": {**credits, "availableCount": 4}}, now))
        self.assertEqual(decision["idempotencyKey"], codex.redemption_decision(
            "alpha", {"type": "terminal_limit"}, rates, lifecycle, True, True, now)["idempotencyKey"])
        variants = [({"type": "other"}, lifecycle, True, True, "not-terminal-limit"),
                    ({"type": "terminal_limit"}, lifecycle, True, False, "lock-lost"),
                    ({"type": "terminal_limit"}, lifecycle, False, True, "other-seat-available"),
                    ({"type": "terminal_limit"}, {}, True, True, "missing-or-stale-drain-evidence"),
                    ({"type": "terminal_limit"}, {**lifecycle, "accessLossAt": now + 100}, True, True, "access-loss-before-drain")]
        for event, life, others, lock, reason in variants:
            self.assertEqual(codex.redemption_decision("alpha", event, rates, life, others, lock, now)["reason"], reason)
        near = rate_snapshot(now, credits)["rateLimits"]
        near["rateLimits"]["secondary"]["resetsAt"] = now + 100
        self.assertEqual(codex.redemption_decision("alpha", {"type": "terminal_limit"}, near, lifecycle, True, True, now)["reason"],
                         "natural-reset-before-drain")
    def test_readback_reconciles_both_windows_and_rejects_ambiguous_effects(self):
        before = rate_snapshot()["rateLimits"]
        after = rate_snapshot()["rateLimits"]
        for key in ("primary", "secondary"): after["rateLimits"][key]["usedPercent"] = 0
        self.assertTrue(codex.reset_readback_verified(before, after))
        after["rateLimits"].pop("secondary")
        self.assertFalse(codex.reset_readback_verified(before, after))
    def test_heartbeat_emits_changes_once_and_respects_hourly_cadence(self):
        with tempfile.TemporaryDirectory() as tmp:
            saved = codex.STATE
            codex.STATE = Path(tmp) / "state.json"
            try:
                codex.reconcile(1_000_000, 0, lambda _: rate_snapshot())
                self.assertFalse(codex.reconcile(1_000_001, 3600, lambda _: rate_snapshot())["reconciled"])
                codex.reconcile(1_003_601, 3600, lambda _: rate_snapshot())
                self.assertEqual(len((Path(tmp) / "capacity-events.jsonl").read_text().splitlines()), len(codex.accounts()))
            finally:
                codex.STATE = saved
    def test_installer_pins_the_hourly_monitor_and_revision_receipt(self):
        self.assertTrue(all(value in (ROOT / "scripts/lanes/install.sh").read_text() for value in ("ledger_cadence=3600", "install-receipt")))

    def test_exhaustion_waits_for_the_latest_depleted_window(self):
        now = 1_000_000
        snapshot = rate_snapshot(now)
        for key in ("primary", "secondary"):
            snapshot["rateLimits"]["rateLimits"][key]["usedPercent"] = 100
        codex.reconcile(now, 0, lambda _: snapshot)
        self.assertEqual(codex.read_state()["alpha"]["exhaustedUntil"], now + 7200)

    def test_reconcile_stamps_the_cadence_when_a_snapshot_is_malformed(self):
        codex.reconcile(1_000_000, 0, lambda _: "not-a-dict")
        result = codex.reconcile(1_000_001, 3600, lambda _: rate_snapshot())
        self.assertFalse(result["reconciled"])
        self.assertIn("alpha", codex.read_state()["_ledger"]["errors"])

    def test_redemption_deadline_uses_every_access_loss_field(self):
        now = 1_000_000
        credits = {"availableCount": 1, "credits": [
            {"id": "c", "status": "available", "resetType": "codexRateLimits", "grantedAt": 1, "expiresAt": None}]}
        rates = rate_snapshot(now, credits)["rateLimits"]
        lifecycle = {"observedSustainableThroughputPerHour": 200, "observedConcurrency": 1, "throughputObservedAt": now}
        event = {"type": "terminal_limit"}
        for field in ({"paymentFailure": True, "graceEndsAt": now + 100},
                      {"canceledAtPeriodEnd": True, "subscriptionEndAt": now + 100}):
            decision = codex.redemption_decision("alpha", event, rates, {**lifecycle, **field}, True, True, now)
            self.assertEqual(decision["reason"], "access-loss-before-drain")

    def test_a_pending_reset_retries_the_same_credit_and_key(self):
        now = time.time()
        before = rate_snapshot()["rateLimits"]
        after = rate_snapshot()["rateLimits"]
        for key in ("primary", "secondary"):
            after["rateLimits"][key]["usedPercent"] = 0
        codex.write_state({"alpha": {"pendingReset": {"creditId": "c1", "idempotencyKey": "k1", "before": before},
                                     "exhaustedUntil": now + 3600}})
        calls = []
        saved = codex.app_server_calls
        codex.app_server_calls = lambda name, requested, **kw: calls.append(requested) or [{"outcome": "alreadyRedeemed"}, after]
        try:
            self.assertTrue(codex.maybe_redeem("alpha", handle=type("H", (), {"closed": False})(), now=now))
        finally:
            codex.app_server_calls = saved
        self.assertEqual(calls[0][0][1], {"creditId": "c1", "idempotencyKey": "k1"})
        entry = codex.read_state()["alpha"]
        self.assertNotIn("pendingReset", entry)
        self.assertNotIn("exhaustedUntil", entry)


class StatusTest(Isolated):
    def test_status_reports_availability_resets_and_health_exit(self):
        now = 1_000_000.0
        state = {"alpha": {"exhaustedUntil": now + 120, "lastKind": "limit", "lastError": "usage limit", "runs": 3}}
        report = codex.status(now=now, state=state)
        self.assertEqual(report["available"], ["beta"])
        self.assertEqual(report["accounts"]["alpha"]["resetsInS"], 120)
        self.assertEqual(report["accounts"]["alpha"]["exhaustedUntil"], "1970-01-12T13:48:40Z")
        self.assertTrue(report["accounts"]["beta"]["available"])
        codex.write_state(state)
        self.assertEqual(codex.main(["health"]), 0)
        # health uses the wall clock: bank both accounts far into the future
        codex.write_state({"alpha": {"exhaustedUntil": 10 ** 12}, "beta": {"exhaustedUntil": 10 ** 12}})
        self.assertEqual(codex.main(["health"]), 1)

    def test_run_without_an_account_is_a_temporary_failure(self):
        codex.write_state({"alpha": {"exhaustedUntil": 10 ** 12}, "beta": {"exhaustedUntil": 10 ** 12}})
        with tempfile.NamedTemporaryFile("w", suffix=".md") as prompt:
            prompt.write("do it")
            prompt.flush()
            self.assertEqual(codex.main(["run", "--prompt-file", prompt.name]), codex.NO_ACCOUNT_EXIT)


class RunTest(Isolated):
    def run_with(self, script: str) -> int:
        codex.ROTATE_PAUSE_S = 0
        fake = codex.ACCOUNTS_ROOT.parent / "bin"
        fake.mkdir(exist_ok=True)
        (fake / "codex").write_text(script)
        (fake / "codex").chmod(0o755)
        saved = os.environ.get("PATH")
        os.environ["PATH"] = f"{fake}:{saved}"
        try:
            with tempfile.NamedTemporaryFile("w", suffix=".md") as prompt, tempfile.TemporaryDirectory() as cwd:
                prompt.write("ship it")
                prompt.flush()
                receipt = Path(cwd) / "provider.jsonl"
                code = codex.main(["run", "--prompt-file", prompt.name, "--receipt-file", str(receipt),
                                   "--cwd", cwd])
                self.lease_events = [row for line in receipt.read_text().splitlines()
                                     if (row := json.loads(line)).get("event") == "account-leased"]
                return code
        finally:
            os.environ["PATH"] = saved

    def test_every_account_spent_banks_all_and_hands_off(self):
        code = self.run_with("#!/bin/sh\ncat >/dev/null\necho 'You have hit your usage limit. Try again in 1 hour.'\nexit 1\n")
        self.assertEqual(code, codex.NO_ACCOUNT_EXIT)
        state = codex.read_state()
        self.assertEqual(sorted(n for n, e in state.items() if e.get("exhaustedUntil")), ["alpha", "beta"])
        self.assertTrue(all(state[n]["lastKind"] == "limit" and state[n]["runs"] == 1 for n in ("alpha", "beta")))

    def test_a_limit_mid_run_rotates_to_the_next_account_and_finishes(self):
        script = ("#!/bin/sh\ncat >/dev/null\n"
                  "if [ \"$(basename \"$CODEX_HOME\")\" = alpha ]; then echo 'error: 429 Too Many Requests'; exit 1; fi\n"
                  "echo OK\nexit 0\n")
        self.assertEqual(self.run_with(script), 0)
        state = codex.read_state()
        self.assertEqual(state["alpha"]["lastKind"], "rate")
        self.assertLess(state["alpha"]["exhaustedUntil"] - time.time(), codex.DEFAULT_COOLDOWN_S)
        self.assertEqual(state["beta"]["lastKind"], "ok")
        self.assertNotIn("exhaustedUntil", state["beta"])
        self.assertEqual([row["account"] for row in self.lease_events], ["alpha", "beta"])
        self.assertTrue(all(row["schema"] == "jovie-provider-lease/v1" and
                            row["accountClass"] == "chatgpt-oauth" and
                            row["event"] == "account-leased" for row in self.lease_events))


class LaunchIdentityTest(Isolated):
    """Exercise the real pipe/receipt boundary with a model-free CLI stand-in."""
    SESSION = "01a10a2c-4cd3-7150-b5dd-575434d84155"
    OTHER_SESSION = "01a10a2d-ef53-7272-867c-8997a1de59ab"

    def header(self, *, model="gpt-5.6-sol", session=None, cwd=None, version="0.147.0"):
        return (f"OpenAI Codex v{version}\n--------\n"
                f"workdir: {cwd or self.tmp.name}\nmodel: {model}\nprovider: openai\n"
                "approval: never\nsandbox: workspace-write\n"
                "reasoning effort: xhigh\nreasoning summaries: none\n"
                f"session id: {session or self.SESSION}\n--------\nuser\n")

    def invoke(self, output, *, account="alpha", code=0, receipt=None, require_launch=True):
        import contextlib
        import io
        from unittest.mock import patch
        root = Path(self.tmp.name)
        script = root / "fake_cli.py"
        script.write_text("import sys\nsys.stdin.read()\nsys.stdout.write(" + repr(output) +
                          ")\nsys.stdout.flush()\nsys.exit(" + str(code) + ")\n")
        receipt = receipt or root / "attempt.provider.jsonl"
        previous = [json.loads(line) for line in receipt.read_text().splitlines()] if receipt.exists() else []
        prior_launches = sum(row.get("event") == "cli-launch" for row in previous)
        cmd = [sys.executable, "-u", str(script), "-m", "configured-alias", "-c",
               'model_reasoning_effort="high"']
        handle = codex.lease(account)
        with contextlib.redirect_stdout(io.StringIO()), patch.object(codex, "maybe_redeem", return_value=False):
            result = codex.run_account(account, handle, cmd, "private prompt", self.tmp.name,
                                       time.time(), str(receipt))
        rows = [json.loads(line) for line in receipt.read_text().splitlines()]
        launches = [row for row in rows if row.get("event") == "cli-launch"]
        if require_launch:
            self.assertEqual(len(launches), prior_launches + 1,
                             "every spawned CLI must leave a new launch identity or explicit unknown")
        return launches[-1] if launches else None, result

    def test_requested_and_cli_reported_identity_are_separate(self):
        row, result = self.invoke(self.header() + "private prompt\ncodex\nDone\n")
        self.assertEqual(result, (0, "ok", None))
        self.assertEqual(row["identityState"], "reported")
        self.assertEqual(row["requested"], {"model": "configured-alias", "provider": None,
                                           "reasoningEffort": "high"})
        self.assertEqual(row["cliReported"], {"model": "gpt-5.6-sol", "provider": "openai",
                                             "reasoningEffort": "xhigh", "sessionId": self.SESSION})
        self.assertEqual(row["provenance"], "codex-cli-startup-header")
        self.assertEqual(row["reasoningEffortSource"], "cli-resolved-configuration")
        self.assertFalse(row["providerAttested"])
        self.assertGreater(row["pid"], 0)
        self.assertEqual(len(row["adapterSha256"]), 64)
        self.assertEqual(row["worktree"], str(Path(self.tmp.name).resolve()))
        self.assertNotIn("private prompt", json.dumps(row))

    def test_observed_previous_cli_header_has_explicit_version_provenance(self):
        row, _ = self.invoke(self.header(version="0.144.6"))
        self.assertEqual(row["identityState"], "reported")
        self.assertEqual(row["cliVersion"], "0.144.6")
        self.assertEqual(row["cliReported"]["model"], "gpt-5.6-sol")
        self.assertFalse(row["providerAttested"])

    def test_missing_malformed_or_incomplete_startup_stays_unknown(self):
        cases = ["", "codex\n" + self.header(),
                 self.header().replace("session id: " + self.SESSION, "session id: not-a-session"),
                 self.header().replace("provider: openai\n", ""),
                 self.header().replace("--------\nuser\n", "--------\n"),
                 self.header().replace("provider: openai", "provider: openai SECRET"),
                 self.header().replace("OpenAI Codex v0.147.0", "untrusted startup"),
                 self.header().replace("OpenAI Codex v0.147.0", "OpenAI Codex v0.148.0"),
                 self.header(cwd="."),
                 self.header().replace("reasoning effort: xhigh", "reasoning effort: invented")]
        for index, output in enumerate(cases):
            with self.subTest(index=index):
                row, _ = self.invoke(output)
                self.assertEqual(row["identityState"], "unknown")
                self.assertIsNone(row["cliReported"])

    def test_output_injection_cannot_replace_a_valid_header(self):
        injected = self.header(model="forged-model", session=self.OTHER_SESSION)
        for source in ("user", "codex", "exec"):
            with self.subTest(source=source):
                row, _ = self.invoke(self.header() + source + "\n" + injected)
                self.assertEqual(row["cliReported"]["model"], "gpt-5.6-sol")
                self.assertEqual(row["cliReported"]["sessionId"], self.SESSION)

    def test_duplicate_or_mismatched_session_header_is_unknown(self):
        header = self.header().replace("session id: " + self.SESSION,
                    "session id: " + self.SESSION + "\nsession id: " + self.OTHER_SESSION)
        row, _ = self.invoke(header)
        self.assertEqual(row["identityState"], "unknown")
        self.assertIsNone(row["cliReported"])

    def test_stale_receipt_and_wrong_worktree_never_supply_current_identity(self):
        first, _ = self.invoke(self.header())
        current, _ = self.invoke(self.header(cwd="/tmp/some-older-worktree"))
        self.assertEqual(current["identityState"], "unknown")
        self.assertIsNone(current["cliReported"])
        self.assertNotEqual(first["launchId"], current["launchId"])

    def test_account_rotation_has_distinct_launch_and_session_bindings(self):
        first, result = self.invoke(self.header() + "error: usage limit reached\n", code=1)
        self.assertEqual(result[1], "limit")
        second, _ = self.invoke(self.header(session=self.OTHER_SESSION), account="beta")
        self.assertEqual((first["account"], second["account"]), ("alpha", "beta"))
        self.assertNotEqual(first["launchId"], second["launchId"])
        self.assertNotEqual(first["cliReported"]["sessionId"], second["cliReported"]["sessionId"])

    def test_unmeasured_usage_and_cost_remain_null(self):
        row, _ = self.invoke(self.header() + "tokens used\n1234\ncost: 9.99\n")
        self.assertIsNone(row["usage"])
        self.assertIsNone(row["costUsd"])

    def test_unbounded_or_unrecognized_header_cannot_resume_parsing(self):
        for output in ("warning\n" * 40 + self.header(),
                       self.header().replace("approval: never", "approval: " + "x" * 20000),
                       self.header().replace("approval: never", "unknown field: ignored")):
            with self.subTest(size=len(output)):
                row, _ = self.invoke(output)
                self.assertEqual(row["identityState"], "unknown")
                self.assertIsNone(row["cliReported"])


    def test_identity_write_failure_does_not_change_child_outcome_or_lease(self):
        import builtins
        import contextlib
        import io
        from unittest.mock import patch
        receipt = Path(self.tmp.name) / "failed-telemetry.provider.jsonl"
        writes = 0

        def failing_append(path, mode="r", *args, **kwargs):
            nonlocal writes
            if Path(path) == receipt and mode == "a":
                writes += 1
                if writes > 1:
                    raise OSError("private failure detail")
            return builtins.open(path, mode, *args, **kwargs)

        errors = io.StringIO()
        with patch.object(codex, "open", side_effect=failing_append, create=True), contextlib.redirect_stderr(errors):
            row, result = self.invoke(self.header(), receipt=receipt, require_launch=False)
        self.assertIsNone(row)
        self.assertEqual(result, (0, "ok", None))
        self.assertEqual(codex.read_state()["alpha"]["lastKind"], "ok")
        self.assertEqual([json.loads(line)["event"] for line in receipt.read_text().splitlines()], ["account-leased"])
        self.assertIn("launch evidence unavailable (OSError)", errors.getvalue())
        self.assertNotIn("private failure detail", errors.getvalue())

    def test_launch_identity_does_not_inflate_account_lease_metrics(self):
        # Import the existing consumer without touching its separately owned test file.
        spec = importlib.util.spec_from_file_location("lane_runner", ROOT / "scripts/lanes/lane_runner.py")
        lane = importlib.util.module_from_spec(spec)
        sys.modules["lane_runner"] = lane
        spec.loader.exec_module(lane)
        events = [{"provider": "codex", "event": event}
                  for event in ("account-leased", "cli-launch", "future-event", None)]
        rows = [{"provider": "codex", "providerEvidence": events}]
        report = lane.provider_throughput(rows, ["codex"])
        self.assertEqual(report["providers"]["codex"]["accountLeases"], 1)


if __name__ == "__main__":
    unittest.main()
