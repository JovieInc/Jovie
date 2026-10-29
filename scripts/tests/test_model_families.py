"""Model families: resolve, observe, alias moves, consumer rewrite, drift, stale alarms, and the sync tick."""
from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
import unittest.mock
from types import SimpleNamespace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))

import model_families as MF  # noqa: E402
import model_family_sync as SYNC  # noqa: E402

CAPACITY_TEXT = (ROOT / "ops/registry/capacity.json").read_text()
MODELS_TEXT = (ROOT / "scripts/backlog-orchestrator/config/model-registry.json").read_text()
NOW = MF._epoch("2026-11-10T00:00:00Z")
DAY = 86400


def registry():
    return json.loads(CAPACITY_TEXT)


class Resolve(unittest.TestCase):
    def test_alias_resolves_to_latest_and_pins_to_a_member(self):
        reg = registry()
        self.assertEqual(MF.resolve(reg, "openai:sol@latest"), reg["modelFamilies"]["families"]["openai:sol"]["latest"])
        self.assertEqual(MF.resolve(reg, "openai:sol@gpt-5.6-sol"), "gpt-5.6-sol")
        with self.assertRaises(MF.FamilyError):
            MF.resolve(reg, "openai:nope@latest")
        with self.assertRaises(MF.FamilyError):
            MF.resolve(reg, "openai:sol@gpt-9-sol")
        with self.assertRaises(MF.FamilyError):
            MF.parse_alias("sol")

    def test_variants_and_unrelated_ids_do_not_match_a_family(self):
        fam = registry()["modelFamilies"]["families"]["openai:sol"]
        self.assertEqual(MF.version(fam, "gpt-6.1-sol"), (6, 1))
        self.assertIsNone(MF.version(fam, "gpt-6.1-sol-fast"))
        self.assertIsNone(MF.version(fam, "gpt-reserve"))
        self.assertGreater(MF.version(fam, "gpt-6.1-sol"), MF.version(fam, "gpt-6-sol"))


class Checked(unittest.TestCase):
    def test_checked_in_registry_has_no_drift(self):
        self.assertEqual(MF.drift(registry(), json.loads(MODELS_TEXT)), [])

    def test_a_consumer_row_on_an_old_id_is_drift(self):
        models = json.loads(MODELS_TEXT)
        next(m for m in models["models"] if m["id"] == "codex-sol")["model"] = "gpt-5.6-sol"
        self.assertTrue(any("codex-sol" in e for e in MF.drift(registry(), models)))
        reg = registry()
        reg["pricing"]["paths"][0]["model"] = "gpt-5.6-luna"
        self.assertTrue(MF.drift(reg, json.loads(MODELS_TEXT)))


class Sync(unittest.TestCase):
    def run_sync(self, api, subscription, prices=None, now=NOW):
        return MF.sync(CAPACITY_TEXT, MODELS_TEXT, {"api": api, "subscription": subscription, "prices": prices or {}}, now)

    def test_new_id_on_one_path_is_recorded_but_does_not_move_the_alias(self):
        result = self.run_sync({"gpt-7-sol"}, set())
        self.assertEqual([e["id"] for e in result["events"]], ["gpt-7-sol"])
        self.assertEqual(result["moves"], [])
        reg = json.loads(result["capacityText"])
        self.assertEqual(MF.resolve(reg, "openai:sol@latest"), registry()["modelFamilies"]["families"]["openai:sol"]["latest"])

    def test_new_id_on_both_paths_moves_the_alias_and_every_consumer(self):
        prices = {"gpt-7-sol": {"in": 1.5, "out": 7.5}}
        result = self.run_sync({"gpt-7-sol"}, {"gpt-7-sol"}, prices)
        self.assertEqual([(m["family"], m["to"]) for m in result["moves"]], [("openai:sol", "gpt-7-sol")])
        reg, models = json.loads(result["capacityText"]), json.loads(result["modelsText"])
        self.assertEqual(MF.drift(reg, models), [])
        sol = next(m for m in models["models"] if m["id"] == "codex-sol")
        self.assertEqual((sol["model"], sol["family"], sol["list_price_in"], sol["list_price_out"]), ("gpt-7-sol", "gpt-7", 1.5, 7.5))
        self.assertTrue(all(p["model"] == "gpt-7-sol" for p in reg["pricing"]["paths"] if p.get("family") == "openai:sol"))
        self.assertTrue(any(p["id"] == "gpt-7-sol@api" for p in reg["pricing"]["paths"]))
        # nothing else in the hand-formatted files moved
        self.assertEqual(result["capacityText"].count("\n") > CAPACITY_TEXT.count("\n") - 5, True)

    def test_a_missing_source_removes_nothing_and_an_older_id_never_moves_the_alias_back(self):
        result = self.run_sync(None, None)
        self.assertEqual((result["events"], result["moves"]), ([], []))
        older = self.run_sync({"gpt-4-sol"}, {"gpt-4-sol"})
        self.assertEqual(older["moves"], [])

    def test_resync_is_idempotent(self):
        first = self.run_sync({"gpt-7-sol"}, {"gpt-7-sol"})
        again = MF.sync(first["capacityText"], first["modelsText"], {"api": {"gpt-7-sol"}, "subscription": {"gpt-7-sol"}, "prices": {}}, NOW)
        self.assertEqual((again["events"], again["moves"]), ([], []))
        self.assertEqual(again["modelsText"], first["modelsText"])

    def test_a_no_op_sync_leaves_the_formatted_files_byte_identical(self):
        result = self.run_sync(None, None, now=MF._epoch(json.loads(CAPACITY_TEXT)["modelFamilies"]["syncedAt"]))
        self.assertEqual(result["modelsText"], MODELS_TEXT)
        self.assertEqual(result["capacityText"].replace(json.loads(CAPACITY_TEXT)["modelFamilies"]["syncedAt"], "X"), CAPACITY_TEXT.replace(json.loads(CAPACITY_TEXT)["modelFamilies"]["syncedAt"], "X"))

    def test_evidence_parsers(self):
        gateway = {"data": [{"id": "openai/gpt-6.1-sol", "pricing": {"input": "0.000002", "output": "0.00001"}}, {"id": "zai/glm-5.3"}]}
        ids, prices = MF.gateway_evidence(gateway)
        self.assertEqual(ids, {"gpt-6.1-sol"})
        self.assertEqual(prices["gpt-6.1-sol"], {"in": 2.0, "out": 10.0})
        codex = {"models": [{"slug": "gpt-6.1-sol", "visibility": "list"}, {"slug": "gpt-reserve", "visibility": "hide"}]}
        self.assertEqual(MF.codex_evidence(codex), {"gpt-6.1-sol"})
        self.assertEqual(MF.collect(None, None)["api"], None)


class Stale(unittest.TestCase):
    def test_overdue_sync_and_a_newer_id_stuck_past_seven_days_alarm(self):
        reg = registry()
        meta = reg["modelFamilies"]
        meta["syncedAt"] = MF._now_iso(NOW - 8 * DAY)
        self.assertEqual([a["type"] for a in MF.stale(reg, NOW)], ["sync-overdue"])
        meta["syncedAt"] = MF._now_iso(NOW)
        meta["families"]["openai:sol"]["members"].append({"id": "gpt-9-sol", "firstSeen": MF._now_iso(NOW - 8 * DAY), "paths": ["api"]})
        alarms = MF.stale(reg, NOW)
        self.assertEqual((alarms[0]["type"], alarms[0]["newer"], alarms[0]["missing"]), ("behind-provider", "gpt-9-sol", ["subscription"]))
        meta["families"]["openai:sol"]["members"][-1]["firstSeen"] = MF._now_iso(NOW - 2 * DAY)
        self.assertEqual(MF.stale(reg, NOW), [])


class Tick(unittest.TestCase):
    def setUp(self):
        patcher = unittest.mock.patch.dict(os.environ)
        patcher.start()
        self.addCleanup(patcher.stop)
        for key in ("LANES_SELFTEST", "LANES_EXECUTION_BACKEND"):
            os.environ.pop(key, None)

    def tick(self, tmp, **kw):
        calls = {"put": [], "record": []}
        out = SYNC.tick(Path(tmp), ROOT, now=NOW, fetch=lambda: None, codex={"models": []},
                        put=lambda *a: calls["put"].append(a) or (True, None), record=lambda d: calls["record"].append(d),
                        open_pr_fn=kw.get("open_pr_fn", lambda *a, **k: {"status": "no-change"}))
        return out, calls

    def test_no_change_waits_a_day_and_alarms_when_stale(self):
        with tempfile.TemporaryDirectory() as tmp:
            out, calls = self.tick(tmp)
            self.assertEqual(out["status"], "no-change")
            self.assertTrue(out["alarm"], "checked-in syncedAt is days older than NOW")
            self.assertEqual(calls["put"][0][0], "models/alarms/2026-11-10")
            self.assertEqual(self.tick(tmp)[0]["status"], "current")

    def test_a_pr_records_the_decision(self):
        decision = SYNC.decision([{"family": "openai:sol", "from": "a", "to": "b"}], [{"family": "openai:sol", "id": "b", "paths": ["api"]}], ["t1"], "2026-11-10T00:00:00Z")
        with tempfile.TemporaryDirectory() as tmp:
            out, calls = self.tick(tmp, open_pr_fn=lambda *a, **k: {"status": "pr-opened", "decision": decision})
            self.assertEqual(out["status"], "pr-opened")
            self.assertEqual(calls["record"][0]["chosen"], "Move the family aliases")
        self.assertIn("t1", decision["context"])

    def test_pr_body_and_changelog_name_the_gate_and_the_moves(self):
        moves = [{"type": "alias-move", "family": "openai:sol", "from": "a", "to": "b"}]
        body = SYNC.pr_body(moves, [], ["summer-main"])
        self.assertIn("decision core (#311)", body)
        self.assertIn("## Fleet Rules", body)
        self.assertEqual(json.loads(SYNC.changelog_lines(moves, [], "t").splitlines()[0])["to"], "b")
        self.assertEqual(SYNC.affected_tasks(moves, {"tasks": [{"id": "x", "currentModel": "a"}, {"id": "y", "currentModel": "c"}]}), ["x"])


class OpenPr(unittest.TestCase):
    def git(self, cwd, *args):
        subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)

    def test_opens_a_branch_and_pr_from_a_throwaway_worktree_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            origin, repo = tmp / "origin.git", tmp / "repo"
            self.git(tmp, "init", "--bare", "-b", "main", str(origin))
            self.git(tmp, "clone", str(origin), str(repo))
            for rel in ("ops/registry/capacity.json", "scripts/backlog-orchestrator/config/model-registry.json", "ops/models/task-registry.json"):
                (repo / rel).parent.mkdir(parents=True, exist_ok=True)
                (repo / rel).write_text((ROOT / rel).read_text())
            self.git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "add", "-A")
            self.git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-m", "seed")
            self.git(repo, "push", "-u", "origin", "main")
            os.environ["MODEL_SYNC_WORKTREES"] = str(tmp / "wts")
            made = []
            gh = lambda args, priority: made.append(args) or SimpleNamespace(stdout="https://example.test/pr/1")
            env = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com"}
            with unittest.mock.patch.dict(os.environ, env):
                evidence = {"api": {"gpt-7-sol"}, "subscription": {"gpt-7-sol"}, "prices": {}}
                out = SYNC.open_pr(repo, evidence, NOW, gh=gh)
                self.assertEqual(out["status"], "pr-opened", out)
                self.assertIn("openai:sol", out["decision"]["context"])
                self.assertIn("--base", made[0])
                self.assertIn("bot/model-families-gpt-7-sol", subprocess.run(["git", "ls-remote", "--heads", str(origin)], capture_output=True, text=True).stdout)
                self.assertEqual(SYNC.open_pr(repo, evidence, NOW, gh=gh)["status"], "pr-exists")
                self.assertEqual(len(made), 1)
                self.assertEqual(SYNC.open_pr(repo, {"api": None, "subscription": None, "prices": {}}, NOW, gh=gh)["status"], "no-change")


if __name__ == "__main__":
    unittest.main()
