"""CI guard for model pools: the real config passes, planted offenders fail (scripts/lanes/model_pool_guard.py)."""
from __future__ import annotations

import copy
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_model_pools as shared  # noqa: E402  (table and lane fixtures)

guard, pools = shared.guard, shared.pools
ROOT, TABLE, claude_lane, hyperagent_lane = shared.ROOT, shared.TABLE, shared.claude_lane, shared.hyperagent_lane


def repo(tmp: Path, table=None, **files) -> Path:
    """A minimal checkout: the real table (or an override) plus the given config files."""
    table = copy.deepcopy(TABLE if table is None else table)
    table["exceptions"] = table.get("exceptions") if "exceptions" in files.pop("_keep", ()) else []
    defaults = {"scripts/lanes/providers.json": {"claude": claude_lane()}, "scripts/lanes/routing.json": {},
                "scripts/lanes/reason.json": {}, "scripts/hyperagent/models.json": {"models": {"fable-5.1": {}}},
                "scripts/backlog-orchestrator/config/model-registry.json": {}, "ops/models/task-registry.json": {},
                "ops/registry/capacity.json": {}, "scripts/lanes/model-pools.json": table}
    for name, value in {**defaults, **files}.items():
        target = tmp / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value if isinstance(value, str) else json.dumps(value))
    return tmp


class GuardTest(unittest.TestCase):
    def check(self, **files):
        with tempfile.TemporaryDirectory() as tmp:
            return guard.scan(repo(Path(tmp), **files))

    def rules(self, **files):
        return sorted({row["rule"] for row in self.check(**files)})

    def test_the_real_config_passes(self):
        self.assertEqual(guard.scan(ROOT), [])
        with redirect_stdout(io.StringIO()) as out:
            self.assertEqual(pools.main(["check", "--root", str(ROOT)]), 0)
        self.assertIn("every Anthropic route is on an allowed pool", out.getvalue())

    def test_the_exception_list_is_exactly_the_known_three(self):
        # Adding an exception is a decision for Tim, not a way to get green: change this list with it.
        self.assertEqual(sorted((row["path"], row["rule"]) for row in TABLE["exceptions"]), [
            (".github/workflows/pen-draft.yml", "metered-anthropic-credential"),
            ("ops/agents/summer-improvement-loop/claude-lock.json", "metered-anthropic-host"),
            ("ops/models/task-registry.json", "anthropic-on-forbidden-pool")])

    def test_a_clean_minimal_checkout_passes(self):
        self.assertEqual(self.check(), [])

    def test_planted_gateway_lane_fails_with_a_fix(self):
        planted = {"claude": claude_lane(), "cheap-opus": {
            "model": "anthropic/claude-opus-5.5", "accountClass": "vercel-ai-gateway",
            "cmd": ["fx", "ask", "--model", "anthropic/claude-opus-5.5", "--", "{prompt}"],
            "routes": [{"model": "anthropic/claude-opus-5.5", "capability": "frontier", "costClass": "api", "cost": 1}]}}
        with tempfile.TemporaryDirectory() as tmp, redirect_stderr(io.StringIO()) as err:
            code = pools.main(["check", "--root", str(repo(Path(tmp), **{"scripts/lanes/providers.json": planted}))])
        self.assertEqual(code, 1)
        self.assertIn("FAIL scripts/lanes/providers.json [anthropic-on-forbidden-pool]", err.getvalue())
        self.assertIn("fix: Anthropic model anthropic/claude-opus-5.5 may not run on Vercel AI Gateway", err.getvalue())

    def test_planted_lane_shapes(self):
        cases = {
            "raw claude binary": {"claude": claude_lane(cmd=["claude", "-p", "--model", "claude-opus-5-5"])},
            "anthropic on another lane": {"grok": {"model": "claude-sonnet-5-5", "cmd": ["grok", "-m", "claude-sonnet-5-5"]}},
            "disabled lane still counts": {"kimi": {"enabled": False, "model": "kimi", "cmd": ["kimi", "--model", "claude-haiku-4-5"]}},
        }
        for name, providers in cases.items():
            with self.subTest(name):
                self.assertEqual(self.rules(**{"scripts/lanes/providers.json": providers}), ["anthropic-on-forbidden-pool"])
        self.assertEqual(self.rules(**{"scripts/lanes/providers.json": {"claude": claude_lane(accountClass="chatgpt-oauth")}}),
                         ["anthropic-on-forbidden-pool", "anthropic-pool-mismatch"])
        metered = claude_lane()
        metered["routes"][0]["costClass"] = "api"
        self.assertEqual(self.rules(**{"scripts/lanes/providers.json": {"claude": metered}}), ["anthropic-pool-mismatch"])
        self.assertEqual(self.check(**{"scripts/lanes/providers.json": {"hyperagent": hyperagent_lane("fable-5.1")}}), [])

    def test_planted_registry_rows_fail(self):
        for path, data in {
            "ops/registry/capacity.json": {"pricing": {"paths": [{"id": "opus@api:gateway", "model": "claude-opus-5-5",
                                                                  "accessPath": "api", "provider": "vercel-ai-gateway"}]}},
            "ops/models/task-registry.json": {"tasks": [{"id": "t", "currentModel": "zai/glm-5.3", "channel": "gateway-allowlist",
                                                         "alsoRoutes": ["anthropic/claude-sonnet-5"]}]},
            "scripts/backlog-orchestrator/config/model-registry.json": {"models": [
                {"id": "anthropic/claude-opus-5.5", "channel": "gateway", "pool": "vercel-gateway"}]},
            "scripts/lanes/reason.json": {"judgmentProposer": {"model": "claude-opus-5-5",
                                                                "cmd": ["fx", "ask", "--model", "claude-opus-5-5"]}},
        }.items():
            with self.subTest(path):
                rows = self.check(**{path: data})
                self.assertTrue(rows and all(row["rule"] == "anthropic-on-forbidden-pool" and row["path"] == path for row in rows), rows)
        allowed = {"tasks": [{"id": "copy-judge", "currentModel": "anthropic/claude-opus-5.5", "channel": "subscription-claude"},
                             {"id": "summer", "currentModel": "zai/glm-5.3-flash", "channel": "gateway-allowlist",
                              "candidates": ["claude-haiku-5-5"]}]}
        self.assertEqual(self.check(**{"ops/models/task-registry.json": allowed}), [])

    def test_planted_workflow_and_source_lines_fail(self):
        self.assertEqual(self.rules(**{".github/workflows/new.yml": "env:\n  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n"}),
                         ["metered-anthropic-credential"])
        self.assertEqual(self.rules(**{".github/actions/a/action.yml": "with:\n  anthropic_api_key: x\n"}),
                         ["metered-anthropic-credential"])
        self.assertEqual(self.rules(**{".github/workflows/new.yml": "run: fx ask --model anthropic/claude-fable-5.2 hi\n"}),
                         ["anthropic-gateway-model"])
        self.assertEqual(self.rules(**{".github/workflows/new.yml": "run: curl https://api.anthropic.com/v1/messages\n"}),
                         ["metered-anthropic-host"])
        self.assertEqual(self.rules(**{"scripts/lanes/new_lane.py": 'URL = "https://api.anthropic.com/v1/messages"\n'}),
                         ["metered-anthropic-host"])
        self.assertEqual(self.rules(**{"scripts/hyperagent/x.py":
                                       'call("https://ai-gateway.vercel.sh/v1", model="anthropic/claude-opus-5.5")\n'}),
                         ["anthropic-gateway-model"])
        clean = {".github/workflows/ok.yml": "# ANTHROPIC_API_KEY is never set here\nuses: anthropics/claude-code-action@abc\n",
                 "scripts/lanes/ok.py": '# api.anthropic.com is forbidden\nAPI_CREDENTIALS = ("ANTHROPIC_API_KEY",)\n'
                                        'GATEWAY = "https://ai-gateway.vercel.sh/v1/models"\n'}
        self.assertEqual(self.check(**clean), [])

    def test_exceptions_only_shrink(self):
        table = copy.deepcopy(TABLE)
        workflow = {".github/workflows/pen-draft.yml": "env:\n  ANTHROPIC_API_KEY: x\n", "_keep": ("exceptions",)}
        table["exceptions"] = [row for row in TABLE["exceptions"] if row["path"].endswith("pen-draft.yml")]
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(guard.scan(repo(Path(tmp), table, **dict(workflow))), [])
        with tempfile.TemporaryDirectory() as tmp:  # the offender is gone: the exception must go too
            stale = guard.scan(repo(Path(tmp), table, **{**workflow, ".github/workflows/pen-draft.yml": "env: {}\n"}))
        self.assertEqual([row["rule"] for row in stale], ["stale-exception"])
        table["exceptions"] = [{"path": ".github/workflows/pen-draft.yml", "rule": "metered-anthropic-credential"}]
        with tempfile.TemporaryDirectory() as tmp:
            bare = guard.scan(repo(Path(tmp), table, **dict(workflow)))
        self.assertEqual([row["rule"] for row in bare], ["exception-incomplete"])

    def test_missing_table_or_config_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual([row["rule"] for row in guard.scan(Path(tmp))], ["table-unreadable"])
        with tempfile.TemporaryDirectory() as tmp:
            root = repo(Path(tmp))
            (root / "scripts/lanes/providers.json").write_text("{")
            self.assertEqual([row["rule"] for row in guard.scan(root)], ["config-unreadable"])

    def test_config_commands_fail_closed_like_the_runner(self):
        for cmd in (["claude", "-p", "--prompt-file", "{prompt_file}"], ["grok", "-m=claude-sonnet-5-5"], ["fx", "--model"]):
            with self.subTest(cmd=cmd), tempfile.TemporaryDirectory() as tmp:
                found = guard.scan(repo(Path(tmp), **{"scripts/lanes/providers.json": {"x": {"cmd": cmd}}}))
                self.assertEqual([row["rule"] for row in found], ["anthropic-on-forbidden-pool"])

    def test_a_partial_checkout_is_judged_on_the_files_it_has(self):
        # The trusted guard also scans trees without most config (a scripts-only base, source admission
        # fixtures): absent files route nothing, a present offender or broken file still fails.
        with tempfile.TemporaryDirectory() as tmp, patch.object(Path, "cwd", return_value=Path(tmp)):
            with redirect_stdout(io.StringIO()):
                self.assertEqual(pools.main(["check"]), 0)
            target = Path(tmp) / "scripts/lanes/providers.json"
            target.parent.mkdir(parents=True)
            target.write_text(json.dumps({"claude": {**claude_lane(), "accountClass": "gateway"}}))
            self.assertTrue(guard.scan(Path(tmp), TABLE))
            target.write_text("{")
            self.assertEqual([row["rule"] for row in guard.scan(Path(tmp), TABLE)], ["config-unreadable"])

    def test_explain_command(self):
        with redirect_stdout(io.StringIO()) as out:
            self.assertEqual(pools.main(["explain", "claude-opus-5-5", "hyperagent"]), 0)
            self.assertEqual(pools.main(["explain", "claude-opus-5-5", "vercel-ai-gateway"]), 1)
        self.assertIn("allowed: claude-opus-5-5 on hyperagent", out.getvalue())


if __name__ == "__main__":
    unittest.main()
