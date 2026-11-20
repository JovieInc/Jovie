"""Registry-only network grants for Hyperagent threads the lane created."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import hyperagent_network as net
import hyperagent_lane as remote


def row(domain, thread="thread-1", kind="network_access", aid=None):
    return {"kind": kind, "approvalId": aid or f"a-{domain}", "threadId": thread, "domain": domain,
            "payload": {"domain": domain}}


class Fake:
    def __init__(self, rows):
        self.rows, self.resolved, self.calls = rows, [], []

    def __call__(self, name, args):
        self.calls.append(name)
        if name == "list_pending_approvals":
            return {"approvals": self.rows}
        if name == "get_pending_approval":
            r = next(x for x in self.rows if x["approvalId"] == args["approvalId"])
            return {"review": {"domain": r["domain"], "reviewToken": "tok"}}
        if name == "resolve_approval":
            self.resolved.append(args)
            return {"outcome": "ok"}
        raise AssertionError(name)


class NetworkGrantTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def grant(self, rows):
        fake = Fake(rows)
        return fake, net.grant_registry_access(fake, "thread-1", "JOV-1", self.dir, clock=lambda: 5)

    def log(self):
        return [json.loads(l) for l in (self.dir / "hyperagent-network-grants.jsonl").read_text().splitlines()]

    def test_only_the_two_registries_are_approved(self):
        fake, n = self.grant([row("registry.npmjs.org"), row("npm.jsr.io"), row("evil.example.com"),
                              row("registry.npmjs.org.evil.com"), row("github.com")])
        self.assertEqual(n, 2)
        self.assertEqual([r["approvalId"] for r in fake.resolved], ["a-registry.npmjs.org", "a-npm.jsr.io"])
        self.assertTrue(all(r["decision"] == "approve" and r["reviewToken"] == "tok" for r in fake.resolved))
        decisions = {e["domain"]: e["decision"] for e in self.log()}
        self.assertEqual(decisions["evil.example.com"], "refused-domain-not-allowed")
        self.assertEqual(decisions["registry.npmjs.org.evil.com"], "refused-domain-not-allowed")

    def test_other_threads_and_kinds_are_never_touched(self):
        fake, n = self.grant([row("registry.npmjs.org", thread="other"), row("registry.npmjs.org", kind="draft_save")])
        self.assertEqual((n, fake.resolved), (0, []))
        self.assertFalse((self.dir / "hyperagent-network-grants.jsonl").exists())

    def test_grant_limit_per_thread(self):
        rows = [row("registry.npmjs.org", aid=f"a{i}") for i in range(net.MAX_GRANTS_PER_THREAD + 2)]
        fake, n = self.grant(rows)
        self.assertEqual(n, net.MAX_GRANTS_PER_THREAD)
        self.assertEqual(self.log()[-1]["decision"], "refused-grant-limit")

    def test_api_failure_never_raises(self):
        def boom(name, args):
            raise RuntimeError("down")
        self.assertEqual(net.grant_registry_access(boom, "thread-1", "JOV-1", self.dir), 0)

    def test_env_blocked_reason_is_distinct(self):
        for text in ("pnpm install failed: ERR_PNPM_FETCH_403", "I could not install dependencies; no PR opened",
                     "The work isn't shippable from this sandbox, not shippable"):
            self.assertEqual(net.missing_pr_reason(text), "remote-env-blocked", text)
        self.assertEqual(net.missing_pr_reason("Done, but forgot the link"), "remote-pr-missing")


class LaneIntegrationTest(unittest.TestCase):
    def run_lane(self, rows, final):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        state = {"approval": True, "n": 0}
        fake = Fake(rows)

        def call(name, args):
            if name == "list_agents":
                return {"agents": [{"id": "agent-1", "executionMode": "auto"}]}
            if name == "create_thread":
                return {"threadId": "thread-1"}
            if name == "get_thread":
                waiting = state["approval"]
                if waiting and any(r["decision"] == "approve" for r in fake.resolved if "decision" in r):
                    state["approval"] = waiting = False
                return {"thread": {"id": "thread-1", "namedAgentId": "agent-1"}, "isRunning": False,
                        "awaitingApproval": waiting, "messages": [{"role": "assistant", "content": final}]}
            return fake(name, args)
        meta = {"agentId": "agent-1", "model": "z-ai/glm-5.3", "repository": "JovieInc/Jovie", "verifiedAt": 1000,
                "expiresAt": 1100, "balanceUsd": 5, "maxCostUsd": 1, "allInCap": True, "currentInstructions": True,
                "executionMode": "auto", "source": "hyperagent-settings-readback", "evidenceSha256": "c" * 64}
        spec = {"model": "z-ai/glm-5.3", "verifiedRemote": meta}
        clock = [1000]

        def pause(s):
            clock[0] += s
        result = remote.run(spec, "JOV-1", "att", "b", "p", Path(tmp.name) / "r.jsonl", call, lambda n: {}, lambda pr: {},
                            timeout=5, clock=lambda: clock[0], pause=pause)
        return result, fake

    def test_lane_approves_registry_then_reports_env_blocked(self):
        result, fake = self.run_lane([row("registry.npmjs.org")], "Install failed with ERR_PNPM_FETCH_403, no PR.")
        self.assertEqual(len(fake.resolved), 1)
        self.assertEqual(result["reasons"], ["remote-env-blocked"])

    def test_lane_holds_for_a_human_on_other_domains(self):
        result, fake = self.run_lane([row("evil.example.com")], "waiting")
        self.assertEqual(fake.resolved, [])
        self.assertEqual(result["reasons"], ["remote-approval-required"])


if __name__ == "__main__":
    unittest.main()
