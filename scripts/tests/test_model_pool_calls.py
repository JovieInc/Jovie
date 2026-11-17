"""Model-pool check for direct model API calls: apiclient, the PR remediation swarm, the outcome judge."""
from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts/lanes"))
sys.path.insert(0, str(ROOT / "scripts/swarm"))
import model_pool_calls as calls  # noqa: E402
import model_pools as pools  # noqa: E402
import pr_remediation_swarm as swarm  # noqa: E402
from apiclient.client import ApiClient  # noqa: E402
from apiclient.store import MemoryLedgerStore  # noqa: E402

TABLE = pools.load()
GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions"


class RequestGateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name)

    def refused(self, url, body, **extra):
        return calls.request_refusal(url, body, site="test", table=TABLE, state_dir=self.state, **extra)

    def test_hosts_map_to_pools(self):
        self.assertEqual(calls.pool_for_url(GATEWAY, TABLE), "vercel-ai-gateway")
        self.assertEqual(calls.pool_for_url("https://api.anthropic.com/v1/messages", TABLE), "anthropic-api")
        self.assertEqual(calls.pool_for_url("https://eu.ai-gateway.vercel.sh/v1", TABLE), "vercel-ai-gateway")
        self.assertIsNone(calls.pool_for_url("https://api.github.com/graphql", TABLE))
        self.assertIsNone(calls.pool_for_url("https://notai-gateway.vercel.sh.example.com/v1", TABLE))

    def test_the_model_is_read_from_any_body_shape(self):
        self.assertEqual(calls.request_model({"model": "zai/glm-5.3"}), "zai/glm-5.3")
        self.assertEqual(calls.request_model(b'{"model": "anthropic/claude-opus-5.5"}'), "anthropic/claude-opus-5.5")
        self.assertEqual(calls.request_model('{"model": "claude-haiku-5", broken'), "claude-haiku-5")
        for body in (None, "", "not json", '{"model": ""', {"model": 7}, {"input": "x"}, ["model"]):
            self.assertIsNone(calls.request_model(body))

    def test_anthropic_on_a_forbidden_host_is_refused_and_recorded(self):
        for url, body in ((GATEWAY, {"model": "anthropic/claude-fable-5.2"}), (GATEWAY, '{"model":"anthropic/claude-haiku-5", bad'),
                          ("https://api.anthropic.com/v1/messages", {"model": "claude-opus-5-5"})):
            self.assertRegex(self.refused(url, body)["reason"], "may not run on")
        rows = [json.loads(line) for line in (self.state / "runs" / pools.REFUSALS_FILE).read_text().splitlines()]
        self.assertEqual([(row["pool"], row["site"]) for row in rows],
                         [("vercel-ai-gateway", "test"), ("vercel-ai-gateway", "test"), ("anthropic-api", "test")])
        with self.assertRaises(pools.ModelPoolRefused):
            calls.assert_request(GATEWAY, {"model": "anthropic/claude-opus-5.5"}, site="test", table=TABLE, state_dir=self.state)

    def test_other_models_and_other_hosts_pass(self):
        self.assertIsNone(self.refused(GATEWAY, {"model": "zai/glm-5.3-flash", "messages": [{"content": "fix the claude opus lane"}]}))
        self.assertIsNone(self.refused(GATEWAY.replace("chat/completions", "models"), None))
        self.assertIsNone(self.refused("https://api.github.com/repos/x/y/issues", {"model": "claude-opus-5-5", "title": "t"}))
        self.assertIsNone(calls.assert_request(GATEWAY, {"model": "openai/gpt-6.1-sol"}, site="test", table=TABLE, state_dir=self.state))
        self.assertFalse((self.state / "runs").exists())

    def test_it_fails_closed(self):
        self.assertIn("cannot be resolved", self.refused(GATEWAY, {"messages": []})["reason"])
        self.assertIn("never called", self.refused("https://api.anthropic.com/v1/messages", {"model": "not-a-known-id"})["reason"])
        # A caller that knows it is sending a model request: an unknown relay is an undeclared pool.
        self.assertIn("undeclared pool", self.refused("https://relay.example.com/v1", {"model": "claude-sonnet-5-5"}, strict=True)["reason"])
        self.assertIsNone(self.refused("https://relay.example.com/v1", {"model": "zai/glm-5.3"}, strict=True))
        # An unreadable table refuses every Anthropic model, whatever the host.
        self.assertIn("unreadable", calls.request_refusal("https://x.example.com", {"model": "claude-opus-5-5"}, site="t", table={},
                                                          state_dir=self.state)["reason"])


class CallerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = patch.dict("os.environ", {"LANES_STATE": self.tmp.name})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_apiclient_refuses_before_the_transport(self):
        sent = []

        def transport(*args):
            sent.append(args)
            return 200, {}, "{}"
        client = ApiClient("ai-gateway", "key", store=MemoryLedgerStore(), transport=transport, log=lambda _event: None)
        with self.assertRaises(pools.ModelPoolRefused):
            client.request(GATEWAY, method="POST", body={"model": "anthropic/claude-fable-5.2", "messages": []}, priority="report")
        self.assertEqual(sent, [])
        self.assertIsNone(client.state())  # nothing was reserved
        row = json.loads((Path(self.tmp.name) / "runs" / pools.REFUSALS_FILE).read_text())
        self.assertEqual((row["site"], row["pool"], row["model"]), ("apiclient:ai-gateway", "vercel-ai-gateway", "anthropic/claude-fable-5.2"))
        client.request(GATEWAY, method="POST", body={"model": "openai/gpt-6.1-sol", "messages": []}, priority="report")
        self.assertEqual(len(sent), 1)

    def test_the_swarm_never_picks_an_anthropic_candidate(self):
        catalog = {"data": [{"id": "anthropic/claude-haiku-5", "pricing": {"input": "0.000001", "output": "0.000005"}},
                            {"id": "zai/glm-5.3-flash", "pricing": {"input": "0.0000001", "output": "0.0000004"}}]}
        with patch("urllib.request.urlopen", side_effect=lambda *_a, **_k: io.BytesIO(json.dumps(catalog).encode())):
            base = "https://ai-gateway.vercel.sh/v1"
            self.assertEqual(swarm.pick_model(base, "k", ["anthropic/claude-haiku-5", "zai/glm-5.3-flash"])[0], "zai/glm-5.3-flash")
            for refused_base in (base, "https://relay.example.com/v1"):  # SWARM_BASE_URL relay included
                with self.assertRaises(SystemExit):
                    swarm.pick_model(refused_base, "k", ["anthropic/claude-haiku-5"])
        rows = (Path(self.tmp.name) / "runs" / pools.REFUSALS_FILE).read_text().splitlines()
        self.assertEqual([json.loads(row)["site"] for row in rows], ["pr-remediation-swarm"] * 3)


if __name__ == "__main__":
    unittest.main()
