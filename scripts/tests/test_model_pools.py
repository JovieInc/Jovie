"""Model pools: Anthropic models run on the Claude subscription or Hyperagent only (scripts/lanes/model_pools.py)."""
from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import model_pool_guard as guard  # noqa: E402
import model_pools as pools  # noqa: E402
import outcome_escalation  # noqa: E402
import remediation  # noqa: E402

TABLE = pools.load()
NOW = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc).timestamp()
CLAUDE_CMD = ["python3", "{here}/claude_lane.py", "run", "--model", "{model}", "--prompt-file", "{prompt_file}"]


def claude_lane(**extra):
    return {"tier": 2, "model": "claude-opus-5-5", "accountClass": "claude-subscription", "cmd": CLAUDE_CMD,
            "routes": [{"model": "claude-opus-5-5", "capability": "frontier", "costClass": "subscription", "cost": 3}],
            **extra}


def hyperagent_lane(model="claude-opus-5-5", **extra):
    return {"tier": 3, "model": model, "accountClass": "hyperagent-credits",
            "cmd": ["hyperagent", "--model", model, "-p", "{prompt}"],
            "routes": [{"model": model, "capability": "frontier", "costClass": "subsidized", "cost": 3.5}], **extra}


class TableTest(unittest.TestCase):
    def test_anthropic_ids_in_every_catalog_spelling(self):
        for model in ("claude-opus-5-5", "anthropic/claude-sonnet-5", "fable-5.1", "claude-fable-5-2",
                      "us.anthropic.claude-haiku-4-5", "Opus 5.5", "claude-haiku-4-5"):
            self.assertTrue(pools.is_anthropic(model, TABLE), model)
        for model in ("z-ai/glm-5.3", "gpt-6.1-sol", "grok-4.7", "moonshotai/kimi-k3", "astra", "swe-2-medium",
                      "codex-default", "", None, 7):
            self.assertFalse(pools.is_anthropic(model, TABLE), model)

    def test_only_subscription_and_hyperagent_may_run_anthropic(self):
        allowed = {name for name, row in TABLE["pools"].items() if row["anthropic"] == "allowed"}
        self.assertEqual(allowed, {"claude-subscription", "hyperagent"})
        self.assertIsNone(pools.verdict("claude-opus-5-5", "claude-subscription", TABLE))
        self.assertIsNone(pools.verdict("fable-5.1", "hyperagent", TABLE))
        self.assertIn("Vercel AI Gateway", pools.verdict("anthropic/claude-opus-5.5", "vercel-ai-gateway", TABLE))
        self.assertIn("Metered Anthropic API key", pools.verdict("claude-haiku-4-5", "anthropic-api", TABLE))
        self.assertIn("undeclared pool", pools.verdict("claude-opus-5-5", None, TABLE))
        self.assertIn("undeclared pool", pools.verdict("claude-opus-5-5", "somewhere-new", TABLE))
        for pool in ("codex-subscription", "grok-subscription", "devin-free", "kimi"):
            self.assertIn("may not run on", pools.verdict("claude-opus-5-5", pool, TABLE))

    def test_other_models_keep_their_routes(self):
        for pool in ("vercel-ai-gateway", "anthropic-api", None, "anything"):
            self.assertIsNone(pools.verdict("zai/glm-5.3-flash", pool, TABLE))

    def test_unreadable_table_refuses_every_anthropic_route(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(pools.load(Path(tmp) / "missing.json"), {})
            (Path(tmp) / "bad.json").write_text('{"schema": "other"}')
            self.assertEqual(pools.load(Path(tmp) / "bad.json"), {})
        self.assertIn("unreadable", pools.verdict("claude-opus-5-5", "claude-subscription", {}))
        self.assertIsNone(pools.verdict("z-ai/glm-5.3", "hyperagent", {}))
        self.assertTrue(pools.is_anthropic("claude-x", {"anthropic": {"idPattern": "("}}))

    def test_tier_names_the_same_model_across_catalogs(self):
        self.assertEqual(pools.tier("claude-opus-5-5", TABLE), pools.tier("anthropic/claude-opus-5.5", TABLE))
        self.assertEqual(pools.tier("fable-5.1", TABLE), "fable")
        self.assertEqual(pools.tier("claude-3", TABLE), "claude")
        self.assertIsNone(pools.tier("grok-4.7", TABLE))

    def test_real_lanes_resolve_to_their_pools(self):
        providers = json.loads((ROOT / "scripts/lanes/providers.json").read_text())
        self.assertEqual(pools.pool_for_lane(providers["claude"], TABLE), "claude-subscription")
        self.assertEqual(pools.pool_for_lane(providers["hyperagent"], TABLE), "hyperagent")
        self.assertEqual({name: pools.pool_for_lane(spec, TABLE) for name, spec in providers.items()}, {
            "devin": "devin-free", "codex": "codex-subscription", "claude": "claude-subscription",
            "hyperagent": "hyperagent", "grok": "grok-subscription", "kimi": "kimi"})  # every fleet lane has a pool
        self.assertIsNone(pools.pool_for_lane({"cmd": ["new-cli"]}, TABLE))
        self.assertIsNone(pools.pool_for_lane(None, TABLE))


class RuntimeGuardTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def refusals(self):
        path = self.state / "runs" / pools.REFUSALS_FILE
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def test_allowed_commands_pass_and_name_their_pool(self):
        self.assertEqual(pools.command_guard(["python3", "/release/claude_lane.py", "run", "--model", "claude-opus-5-5"],
                                             table=TABLE, state_dir=self.state), "claude-subscription")
        self.assertEqual(pools.command_guard(["hyperagent", "execute", "--model=fable-5.1", "-p", "x"],
                                             table=TABLE, state_dir=self.state), "hyperagent")
        self.assertEqual(self.refusals(), [])

    def test_non_anthropic_commands_are_not_governed(self):
        for cmd in (["grok", "-m", "grok-4.7", "--prompt-file", "p"], ["devin", "-p", "--model", "swe-2-medium"],
                    ["hyperagent", "--model", "z-ai/glm-5.3", "-p", "fix the claude opus sonnet lane"], ["git", "status"], []):
            self.assertIsNone(pools.command_guard(cmd, table=TABLE, state_dir=self.state))
        self.assertEqual(self.refusals(), [])

    def test_anthropic_model_outside_an_allowed_pool_is_refused_and_recorded(self):
        for cmd in (["claude", "-p", "--model", "claude-opus-5-5"],  # raw binary: no credential scrub
                    ["fx", "ask", "--model", "anthropic/claude-opus-5.5", "--", "hi"],
                    ["grok", "-m", "claude-sonnet-5-5"], ["python3", "codex_lane.py", "run", "--model=claude-fable-5-2"]):
            with self.assertRaises(pools.ModelPoolRefused) as caught:
                pools.command_guard(cmd, table=TABLE, state_dir=self.state)
            self.assertRegex(str(caught.exception), "undeclared pool|may not run on|declared executor")
        rows = self.refusals()
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0]["schema"], pools.REFUSAL_SCHEMA)
        self.assertEqual((rows[0]["model"], rows[0]["site"], rows[0]["pool"]), ("claude-opus-5-5", "command:claude", None))

    def test_every_model_selection_form_is_read(self):
        for cmd in (["grok", "-m=claude-sonnet-5-5"], ["grok", "-m", "claude-sonnet-5-5"], ["grok", "--model", "claude-opus-5-5"],
                    ["grok", "--model=claude-opus-5-5"], ["codex", "exec", "-c", 'model="claude-opus-5-5"'],
                    ["codex", "exec", "--config=model=claude-opus-5-5"], ["env", "CODEX_LANE_MODEL=claude-haiku-5", "python3", "codex_lane.py", "run"]):
            with self.subTest(cmd=cmd), self.assertRaises(pools.ModelPoolRefused):
                pools.command_guard(cmd, table=TABLE, state_dir=self.state)
        with self.assertRaises(pools.ModelPoolRefused):  # the lane reads its model from the environment
            pools.command_guard(["python3", "codex_lane.py", "run"], env={"CODEX_LANE_MODEL": "claude-fable-5-2"}, table=TABLE, state_dir=self.state)
        self.assertIsNone(pools.command_guard(["python3", "codex_lane.py", "run"], env={"CODEX_LANE_MODEL": "gpt-6", "ANTHROPIC_MODEL": "claude-opus-5-5"},
                                              table=TABLE, state_dir=self.state))
        self.assertEqual(pools.command_guard(["hyperagent", "run"], env={"HYPERAGENT_MODEL": "fable-5.1"}, table=TABLE, state_dir=self.state), "hyperagent")
        self.assertIsNone(pools.command_guard(["python3", "-m", "pytest", "-m=slow"], table=TABLE, state_dir=self.state))

    def test_non_agent_commands_are_not_read_for_models(self):
        # run_agent also runs gate commands (`lane_runner gate-command -- ...`): their -m and -c are not model flags.
        for cmd in (["git", "commit", "-m", "fix claude routing"], ["git", "-c", "model=opus", "commit", "-m=claude"],
                    ["python3", "-m", "pytest", "-m", "sonnet"], ["pnpm", "exec", "vitest", "-m"], ["gh", "pr", "create", "--model"]):
            with self.subTest(cmd=cmd):
                self.assertIsNone(pools.command_guard(cmd, env={"CODEX_LANE_MODEL": "claude-opus-5-5"}, table=TABLE, state_dir=self.state))
        self.assertEqual(self.refusals(), [])
        with self.assertRaises(pools.ModelPoolRefused):  # an explicit long-form Anthropic id is still refused anywhere
            pools.command_guard(["fx", "ask", "--model=anthropic/claude-opus-5.5"], table=TABLE, state_dir=self.state)
        with self.assertRaises(pools.ModelPoolRefused):  # and a configured lane command is an agent whatever its name
            pools.command_guard(["fx", "-m", "claude-opus-5-5"], agent=True, table=TABLE, state_dir=self.state)

    def test_an_unresolved_model_fails_closed(self):
        # A raw Anthropic CLI picks its own default model, and a model flag with no value hides the choice.
        for cmd in (["claude", "-p", "hi"], ["/usr/local/bin/claude"], ["grok", "--model"], ["kimi", "-m="], ["codex", "exec", "--model", ""]):
            with self.subTest(cmd=cmd), self.assertRaises(pools.ModelPoolRefused) as caught:
                pools.command_guard(cmd, table=TABLE, state_dir=self.state)
            self.assertRegex(str(caught.exception), "cannot be resolved|declared executor")
        self.assertEqual(len(self.refusals()), 5)
        self.assertIsNone(pools.command_guard(["hyperagent", "--model"], table=TABLE, state_dir=self.state))  # allowed pool either way

    def test_unreadable_table_refuses_at_runtime(self):
        with self.assertRaises(pools.ModelPoolRefused):
            pools.command_guard(["hyperagent", "--model", "fable-5.1"], table={}, state_dir=self.state)

    def test_refusal_survives_an_unwritable_ledger(self):
        blocker = self.state / "file"
        blocker.write_text("x")
        with redirect_stderr(io.StringIO()) as err:
            row = pools.refusal("claude-opus-5-5", "vercel-ai-gateway", site="t", table=TABLE, state_dir=blocker)
        self.assertIn("may not run", row["reason"])
        self.assertIn("refusal not recorded", err.getvalue())
        self.assertIsNone(pools.refusal("zai/glm-5.3", "vercel-ai-gateway", site="t", table=TABLE, state_dir=self.state))

    def test_run_agent_refuses_before_any_process_starts(self):
        import lane_runner
        with patch.dict("os.environ", {"LANES_STATE": str(self.state)}), \
                patch.object(lane_runner.subprocess, "Popen") as popen:
            with self.assertRaises(pools.ModelPoolRefused):
                lane_runner.run_agent(["fx", "ask", "--model", "anthropic/claude-opus-5.5"], self.state, None, 5)
        popen.assert_not_called()
        self.assertEqual(self.refusals()[0]["site"], "command:fx")

    def test_gateway_judge_refuses_an_anthropic_model_without_spend(self):
        def fail(*_args, **_kwargs):
            raise AssertionError("the Gateway must not be called")
        with patch.dict("os.environ", {"LANES_STATE": str(self.state), "AI_GATEWAY_API_KEY": "test-key"}), \
                patch.object(outcome_escalation, "_gateway_request", fail):
            result = outcome_escalation.gateway_judge("q", "anthropic/claude-opus-5.5", urlopen=fail)
        self.assertEqual(result["ran"], False)
        self.assertTrue(result["result"].startswith("refused: Anthropic model"))
        self.assertEqual(self.refusals()[0]["site"], "outcome-escalation:gateway-judge")

    def test_receipt_names_the_pool(self):
        self.assertEqual(pools.receipt(claude_lane(), table=TABLE),
                         {"schema": "jovie.model-pool-receipt/v1", "pool": "claude-subscription", "anthropic": True})
        self.assertEqual(pools.receipt({"model": "grok-4.7", "cmd": ["grok"]}, {"rule": "x"}, TABLE),
                         {"schema": "jovie.model-pool-receipt/v1", "pool": "grok-subscription", "anthropic": False,
                          "balance": {"rule": "x"}})


class BalanceTest(unittest.TestCase):
    REGISTRY = {"providers": [{"id": "hyperagent", "accounts": [
        {"id": "founding-500", "credits": {"expiresAt": "2027-06-01T00:00:00Z"}}, "junk"]}]}

    def test_claude_window_expiry_comes_from_the_local_run_ledger(self):
        # An idle lane has no open window, so nothing is about to be lost: no expiry is made up.
        idle = {"pool": "claude-subscription", "expiresAt": None, "basis": "claude-lane-window-not-open"}
        self.assertEqual(pools.pool_expiry("claude-subscription", NOW, claude_state={}), idle)
        self.assertEqual(pools.pool_expiry("claude-subscription", NOW, claude_state={"runs": [{"at": NOW - 9 * 3600}]}), idle)
        opened = pools.pool_expiry("claude-subscription", NOW, claude_state={
            "runs": [{"at": NOW - 4 * 3600}, {"at": NOW - 60}, {"at": NOW - 9 * 3600}, {"at": "bad"}, "junk"]})
        self.assertEqual((opened["expiresAt"], opened["basis"]), ("2026-11-11T13:00:00Z", "claude-lane-window-open"))

    def test_an_idle_claude_window_never_outranks_a_pool_with_a_real_expiry(self):
        rows = [{"lane": "claude", "pool": "claude-subscription", "expiry": pools.pool_expiry("claude-subscription", NOW, claude_state={})},
                {"lane": "hyperagent", "pool": "hyperagent", "expiry": pools.pool_expiry("hyperagent", NOW, registry=self.REGISTRY)}]
        self.assertEqual(pools.choose(rows)[0]["lane"], "hyperagent")
        rows[0]["expiry"] = pools.pool_expiry("claude-subscription", NOW, claude_state={"runs": [{"at": NOW - 3600}]})
        self.assertEqual(pools.choose(rows)[0]["lane"], "claude")  # an open window (4h left) is lost before midnight UTC

    def test_hyperagent_expiry_is_the_daily_cap_day_then_the_credit_expiry(self):
        seen = pools.pool_expiry("hyperagent", NOW, registry=self.REGISTRY)
        self.assertEqual(seen, {"pool": "hyperagent", "expiresAt": "2026-11-12T00:00:00Z",
                                "basis": "hyperagent-daily-cap-utc-day+credit-expiry",
                                "creditsExpireAt": "2027-06-01T00:00:00Z"})
        last_day = datetime(2027, 5, 31, 23, 30, tzinfo=timezone.utc).timestamp()
        self.assertEqual(pools.pool_expiry("hyperagent", last_day, registry=self.REGISTRY)["expiresAt"], "2027-06-01T00:00:00Z")
        self.assertEqual(pools.pool_expiry("hyperagent", NOW)["basis"], "hyperagent-daily-cap-utc-day")

    def test_a_pool_without_expiry_data_says_so_and_sorts_last(self):
        self.assertEqual(pools.pool_expiry("codex", NOW), {"pool": "codex", "expiresAt": None, "basis": "no-expiry-data"})
        chosen, record = pools.choose([
            {"lane": "x", "model": "m", "pool": "codex", "expiry": pools.pool_expiry("codex", NOW)},
            {"lane": "h", "model": "m", "pool": "hyperagent", "expiry": pools.pool_expiry("hyperagent", NOW)}])
        self.assertEqual(chosen["lane"], "h")
        self.assertEqual([row["lane"] for row in record["considered"]], ["h", "x"])
        self.assertEqual(pools.choose([]), (None, {"rule": "earliest-expiry", "chosenPool": None, "considered": []}))

    def route(self, providers, now, claude_state=None, availability=None):
        availability = availability or (lambda _lane, _route: {"ok": True, "why": "ok", "pressure": 0})
        decision = remediation.route_issue(
            {"identifier": "JOV-1", "title": "merge queue admission", "description": "", "labels": ["route:frontier"]},
            providers, {"frontier": {"labels": ["route:frontier"]}}, pools.guarded(availability, providers, TABLE))
        return pools.balanced(decision, providers, lambda lane: pools.pool_expiry(
            pools.pool_for_lane(providers[lane], TABLE), now, claude_state=claude_state, registry=self.REGISTRY), TABLE)

    def test_router_takes_the_pool_that_expires_first(self):
        providers = {"claude": claude_lane(), "hyperagent": hyperagent_lane()}
        idle = self.route(providers, NOW)
        self.assertEqual((idle["chosen"]["lane"], idle["pool"]["considered"][-1]["basis"]),
                         ("hyperagent", "claude-lane-window-not-open"))  # no open window, nothing to lose on Claude
        midday = self.route(providers, NOW, claude_state={"runs": [{"at": NOW - 3600}]})
        self.assertEqual(midday["chosen"]["lane"], "claude")  # the open 5h window ends before the UTC day does
        self.assertEqual(midday["pool"]["rule"], "earliest-expiry")
        self.assertEqual(midday["pool"]["chosenPool"], "claude-subscription")
        self.assertEqual([row["pool"] for row in midday["pool"]["considered"]], ["claude-subscription", "hyperagent"])
        late = self.route(providers, datetime(2026, 11, 11, 22, 0, tzinfo=timezone.utc).timestamp())
        self.assertEqual((late["chosen"]["lane"], late["chosen"]["costClass"], late["chosen"]["alias"]),
                         ("hyperagent", "subsidized", None))  # the day's Hyperagent runs are lost at 00:00 UTC
        self.assertEqual(late["pool"]["chosenPool"], "hyperagent")
        self.assertIn("pool hyperagent expires first (was claude/claude-opus-5-5)", late["rationale"])

    def test_a_moved_choice_records_the_metrics_of_the_lane_that_runs(self):
        providers = {"claude": claude_lane(), "hyperagent": hyperagent_lane()}
        late = datetime(2026, 11, 11, 22, 0, tzinfo=timezone.utc).timestamp()
        moved = self.route(providers, late, claude_state={"runs": [{"at": late - 60}]}, availability=lambda lane, _route: {
            "ok": True, "why": "ok", "pressure": 0.4 if lane == "hyperagent" else 0.1})
        ran = next(row for row in moved["candidates"] if row["lane"] == "hyperagent")
        self.assertEqual(moved["chosen"]["lane"], "hyperagent")
        for key in ("cost", "pressure", "paceAdjust", "effectiveCost", "capability", "model"):
            self.assertEqual(moved["chosen"][key], ran[key], key)
        self.assertNotEqual(moved["chosen"]["effectiveCost"], moved["candidates"][0]["effectiveCost"])  # not the first pick's

    def test_an_exhausted_pool_hands_the_run_to_the_other(self):
        providers = {"claude": claude_lane(), "hyperagent": hyperagent_lane()}
        banked = self.route(providers, NOW, availability=lambda lane, _route: {
            "ok": lane != "claude", "why": "banked:usage" if lane == "claude" else "ok", "pressure": 0})
        self.assertEqual(banked["chosen"]["lane"], "hyperagent")
        self.assertEqual(banked["pool"]["rule"], "single-pool")

    def test_a_forbidden_route_is_never_chosen(self):
        gateway = {"tier": 0, "model": "anthropic/claude-opus-5.5", "accountClass": "vercel-ai-gateway",
                   "cmd": ["fx", "ask", "--model", "anthropic/claude-opus-5.5"],
                   "routes": [{"model": "anthropic/claude-opus-5.5", "capability": "frontier", "costClass": "api", "cost": 0.1}]}
        decision = self.route({"gateway": gateway, "claude": claude_lane()}, NOW)
        self.assertEqual(decision["chosen"]["lane"], "claude")
        refused = next(row for row in decision["candidates"] if row["lane"] == "gateway")
        self.assertEqual((refused["available"], refused["why"]), (False, "model-pool-refused"))
        held = self.route({"gateway": gateway}, NOW)
        self.assertIsNone(held["chosen"])
        self.assertNotIn("pool", held)

    def test_lane_runner_applies_the_balancer_and_the_receipt_keeps_the_choice(self):
        import lane_runner
        from types import SimpleNamespace
        providers = {"claude": claude_lane(), "hyperagent": hyperagent_lane()}
        decision = remediation.route_issue(
            {"identifier": "JOV-2", "title": "merge queue", "description": "", "labels": ["route:frontier"]}, providers,
            {"frontier": {"labels": ["route:frontier"]}}, lambda _lane, _route: {"ok": True, "why": "ok", "pressure": 0})
        with tempfile.TemporaryDirectory() as tmp:
            routed = lane_runner.pool_routed(SimpleNamespace(state=Path(tmp)), decision, providers)
        self.assertEqual(routed["pool"]["rule"], "earliest-expiry")
        self.assertIn(routed["pool"]["chosenPool"], ("claude-subscription", "hyperagent"))
        spec = {**providers[routed["chosen"]["lane"]], "route": routed}
        self.assertEqual(pools.receipt(spec, routed["pool"], TABLE)["balance"]["chosenPool"], routed["pool"]["chosenPool"])
        self.assertEqual(pools.receipt(spec, routed["pool"], TABLE)["pool"], routed["pool"]["chosenPool"])

    FLEET = {"providers": [
        {"id": "openai-codex", "accounts": [
            {"id": "a", "quota": {"resetsAt": "2026-10-30T17:41:29Z"}},  # snapshot already past: not a reading
            {"id": "b", "quota": {"resetsAt": "2026-11-13T00:00:00Z"}},
            {"id": "lapsed", "status": "lapsed", "quota": {"resetsAt": "2026-11-11T13:00:00Z"}}]},
        {"id": "xai-grok", "accounts": [{"id": "g", "quota": {"resetsAt": "2026-11-12T06:00:00Z"}}]},
        {"id": "kimi", "accounts": [{"id": "k", "status": "unverified"}]}]}

    def test_every_fleet_pool_reads_its_reset_from_existing_data_or_says_none(self):
        live = {"accounts": {"openai-codex/a": {"quota": {"resetsAt": "2026-11-11T20:00:00Z"}}}}
        self.assertEqual(pools.pool_expiry("codex-subscription", NOW, registry=self.FLEET, table=TABLE)["expiresAt"],
                         "2026-11-13T00:00:00Z")
        self.assertEqual(pools.pool_expiry("codex-subscription", NOW, registry=self.FLEET, live=live, table=TABLE),
                         {"pool": "codex-subscription", "expiresAt": "2026-11-11T20:00:00Z", "basis": "registry-quota-reset"})
        self.assertEqual(pools.pool_expiry("codex-subscription", NOW, registry={}, table=TABLE)["basis"], "no-fresh-reset-reading")
        self.assertEqual(pools.pool_expiry("grok-subscription", NOW, registry=self.FLEET, table=TABLE)["expiresAt"],
                         "2026-11-12T06:00:00Z")
        self.assertEqual(pools.pool_expiry("kimi", NOW, registry=self.FLEET, table=TABLE)["basis"], "no-expiry-data")
        self.assertEqual(pools.pool_expiry("vercel-ai-gateway", NOW, table=TABLE)["expiresAt"], None)
        open_window = {"freeOnly": {"stopBefore": "2026-11-20T07:00:00Z"}}
        self.assertEqual(pools.pool_expiry("devin-free", NOW, spec=open_window, table=TABLE),
                         {"pool": "devin-free", "expiresAt": "2026-11-20T07:00:00Z", "basis": "lane-free-window"})
        real = json.loads((ROOT / "scripts/lanes/providers.json").read_text())["devin"]
        self.assertEqual(pools.pool_expiry("devin-free", NOW, spec=real, table=TABLE)["basis"], "free-window-ended")
        self.assertEqual(pools.pool_expiry("devin-free", NOW, spec={}, table=TABLE)["basis"], "no-expiry-data")

    def test_expiry_first_applies_across_pools_within_a_capability_class(self):
        providers = {
            "devin": {"tier": 0, "model": "swe-2-medium", "cmd": ["devin", "-p", "--model", "swe-2-medium"],
                      "routes": [{"model": "swe-2-medium", "capability": "standard", "costClass": "free", "cost": 0}]},
            "hyperagent": {"tier": 3, "model": "z-ai/glm-5.3", "accountClass": "hyperagent-credits",
                           "cmd": ["hyperagent", "--model", "z-ai/glm-5.3"],
                           "routes": [{"model": "z-ai/glm-5.3", "capability": "standard", "costClass": "subsidized", "cost": 1}]},
            "grok": {"tier": 4, "model": "grok-4.7", "cmd": ["grok", "-m", "grok-4.7"],
                     "routes": [{"model": "grok-4.7", "capability": "standard", "costClass": "subscription", "cost": 2}]},
            "codex": {"tier": 1, "model": "codex-default", "accountClass": "chatgpt-oauth",
                      "cmd": ["python3", "codex_lane.py", "run"],
                      "routes": [{"model": "codex-default", "capability": "frontier", "costClass": "subscription", "cost": 3.5}]}}

        def route(pressure=None, registry=self.FLEET):
            decision = remediation.route_issue(
                {"identifier": "JOV-3", "title": "fix a typo", "description": "", "labels": []}, providers, {},
                lambda lane, _route: {"ok": True, "why": "ok", "pressure": (pressure or {}).get(lane, 0)})
            return pools.balanced(decision, providers, lambda lane: pools.pool_expiry(
                pools.pool_for_lane(providers[lane], TABLE), NOW, registry=registry, spec=providers[lane], table=TABLE), TABLE)

        first = route()
        self.assertEqual(first["chosen"]["lane"], "hyperagent")  # UTC day cap ends before Grok's weekly reset
        self.assertEqual([(row["lane"], row["basis"]) for row in first["pool"]["considered"]], [
            ("hyperagent", "hyperagent-daily-cap-utc-day"), ("grok", "registry-quota-reset"), ("devin", "no-expiry-data")])
        self.assertNotIn("codex", [row["lane"] for row in first["pool"]["considered"]])  # frontier is another class
        spent = route({"hyperagent": 1.0})  # at its soft cap: nothing unused left to lose
        self.assertEqual(spent["chosen"]["lane"], "grok")
        none_known = route(registry={"providers": []}, pressure={"hyperagent": 1.0})
        self.assertEqual(none_known["chosen"]["lane"], "devin")  # no reading anywhere: the cost order stands
        self.assertNotIn("pool", none_known)

    def test_utilization_summarises_runs_and_busy_time_per_pool(self):
        providers = {"claude": claude_lane(slots=2, quota={"softRuns": 12, "windowS": 18000}),
                     "hyperagent": hyperagent_lane("z-ai/glm-5.3", slots=1, quota={"softRuns": 24, "windowS": 86400}),
                     "kimi": {"enabled": False, "cmd": ["kimi", "--model", "kimi-code/k3"]},
                     "local": {"slots": 1, "cmd": ["new-cli"]}, "junk": "x"}
        at = lambda hours: datetime.fromtimestamp(NOW - hours * 3600, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
        receipts = [{"provider": "claude", "startedAt": at(1), "agentSeconds": 1800},
                    {"provider": "claude", "startedAt": at(2), "agentSeconds": 600},
                    {"provider": "claude", "startedAt": at(30), "agentSeconds": 999},  # outside the window
                    {"provider": "hyperagent", "startedAt": at(3)}, {"provider": "local", "startedAt": at(1), "agentSeconds": -5},
                    {"provider": "gone", "startedAt": at(1)}, {"provider": "claude"}, "junk"]
        report = pools.utilization(receipts, providers, NOW, table=TABLE,
                                   expiry_of=lambda lane: pools.pool_expiry(pools.pool_for_lane(providers[lane], TABLE), NOW, table=TABLE))
        self.assertEqual((report["schema"], report["windowS"], report["at"]), (pools.UTILIZATION_SCHEMA, 86400, "2026-11-11T12:00:00Z"))
        by = {row["pool"]: row for row in report["pools"]}
        self.assertEqual(sorted(by), ["claude-subscription", "hyperagent", "kimi", "undeclared:local"])
        claude = by["claude-subscription"]
        self.assertEqual((claude["runs"], claude["busySeconds"], claude["slots"], claude["capacityBusySeconds"]), (2, 2400, 2, 172800))
        self.assertEqual((claude["softRuns"], claude["runShare"], claude["busyShare"]), (57.6, 0.035, 0.014))
        self.assertEqual(claude["expiry"]["basis"], "claude-lane-window-not-open")
        self.assertEqual((by["hyperagent"]["runs"], by["hyperagent"]["runShare"], by["hyperagent"]["busyShare"]), (1, 0.042, 0.0))
        self.assertEqual((by["kimi"]["slots"], by["kimi"]["busyShare"], by["kimi"]["runShare"]), (0, None, None))
        self.assertEqual((by["undeclared:local"]["runs"], by["undeclared:local"]["busySeconds"]), (1, 0))
        self.assertNotIn("expiry", by["undeclared:local"])

    def test_utilization_command_reads_the_host_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.assertEqual(pools.utilization_report(state, now=NOW)["pools"][0]["runs"], 0)  # no ledger yet
            (state / "runs").mkdir()
            (state / "runs/ledger.jsonl").write_text(
                json.dumps({"provider": "claude", "startedAt": "2026-11-11T11:00:00Z", "agentSeconds": 60}) + "\nnot json\n[1]\n")
            (state / "claude-quota.json").write_text(json.dumps({"runs": [{"at": NOW - 3600}]}))
            report = pools.utilization_report(state, now=NOW)
            by = {row["pool"]: row for row in report["pools"]}
            self.assertEqual(sorted(by), sorted(name for name, row in TABLE["pools"].items() if row.get("executors")))
            self.assertEqual((by["claude-subscription"]["runs"], by["claude-subscription"]["busySeconds"]), (1, 60))
            self.assertEqual(by["claude-subscription"]["expiry"]["expiresAt"], "2026-11-11T16:00:00Z")
            self.assertGreater(by["claude-subscription"]["softRuns"], 0)  # the cap comes from ops/registry/capacity.json
            with redirect_stdout(io.StringIO()) as out:
                self.assertEqual(pools.main(["utilization", "--state", tmp, "--window-hours", "1", "--write"]), 0)
            self.assertEqual(json.loads(out.getvalue())["windowS"], 3600)
            self.assertEqual(json.loads((state / "model-pool-utilization.json").read_text())["schema"], pools.UTILIZATION_SCHEMA)

    def test_non_anthropic_decisions_are_unchanged(self):
        providers = {"grok": {"tier": 1, "model": "grok-4.7", "cmd": ["grok", "-m", "grok-4.7"],
                              "routes": [{"model": "grok-4.7", "capability": "frontier", "cost": 1}]}}
        decision = self.route(providers, NOW)
        self.assertEqual(decision["chosen"]["lane"], "grok")
        self.assertNotIn("pool", decision)


if __name__ == "__main__":
    unittest.main()
