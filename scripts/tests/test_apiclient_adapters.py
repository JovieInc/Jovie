"""Python API client adapters against the fake provider: GitHub, Linear, legacy bridges, gh, status."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from apiclient import __main__ as cli  # noqa: E402
from apiclient.client import ApiClient, ApiError  # noqa: E402
from apiclient.fake import FakeClock, FakeProvider  # noqa: E402
from apiclient.gh import gh_shape, run_gh, split_included  # noqa: E402
from apiclient.github import GitHubClient, pull_request_field  # noqa: E402
from apiclient.legacy import GithubBudgetHooks  # noqa: E402
from apiclient.linear import LinearClient, issue_field, linear_scope  # noqa: E402
from apiclient.store import FileLedgerStore, MemoryLedgerStore  # noqa: E402

GH = "https://api.github.com"


def quiet(_event):
    return None


class Harness:
    def __init__(self, style="github", store=None, clock=None, **extra):
        self.clock = clock or FakeClock()
        self.fake = FakeProvider(style, self.clock)
        self.events = []
        provider = {"github": "github", "linear": "linear"}.get(style, "vercel")
        self.store = store or MemoryLedgerStore()
        self.client = ApiClient(provider, "cred-a", store=self.store, transport=self.fake, now=self.clock.read,
                                sleep=self.clock.sleep, random=lambda: 0.5, log=self.events.append, **extra)


def tmp(test: unittest.TestCase) -> Path:
    path = Path(tempfile.mkdtemp(prefix="apiclient-"))
    test.addCleanup(shutil.rmtree, path, True)
    return path


class AdapterTest(unittest.TestCase):
    def github(self, handler=None, **extra):
        clock = FakeClock()
        fake = FakeProvider("github", clock, handler=handler)
        client = GitHubClient("t", credential="app-installation:1", store=MemoryLedgerStore(), transport=fake,
                              now=clock.read, sleep=clock.sleep, log=quiet, **extra)
        return clock, fake, client

    def test_github_batches_pr_reads_in_chunks_of_50(self):
        def handler(req):
            aliases = [a.split(":")[0][1:] for a in json.loads(req["body"])["query"].split() if a.startswith("k")]
            return {"body": {"data": {f"k{j}": None if j == "0" else {"n": int(j)} for j in aliases}}}

        _, fake, gh = self.github(handler)
        prs = gh.batch([str(i + 1) for i in range(120)], pull_request_field("JovieInc", "Jovie", "number"))
        self.assertEqual((len(fake.calls), len(prs)), (3, 120))
        self.assertIsNone(prs["1"])

    def test_github_paginates_and_reuses_etags(self):
        def handler(req):
            page = int((req["query"].split("page=") + ["1"])[1] or 1)
            headers = {"link": f'<{GH}/repos/o/r/pulls?page={page + 1}>; rel="next"'} if page < 2 else {}
            return {"body": [{"page": page}], "headers": headers}

        _, fake, gh = self.github(handler)
        self.assertEqual(gh.paginate("repos/o/r/pulls"), [{"page": 1}, {"page": 2}])
        gh.paginate("repos/o/r/pulls", priority="poll")
        self.assertEqual([c["status"] for c in fake.calls], [200, 200, 304, 304])

    def test_github_budget_file_is_read_and_written(self):
        root = tmp(self)
        clock = FakeClock()
        path = root / "github-budget.json"
        path.write_text(json.dumps({"remaining": 100, "resetAt": clock.now // 1000 + 600, "observedAt": clock.now / 1000}))
        fake = FakeProvider("github", clock)
        gh = GitHubClient("t", store=MemoryLedgerStore(), transport=fake, now=clock.read, sleep=clock.sleep,
                          log=quiet, hooks=GithubBudgetHooks(root))
        with self.assertRaises(ApiError):
            gh.graphql("{ a }", priority="poll")
        self.assertEqual(fake.calls, [])
        gh.graphql("{ a }", priority="merge")
        written = json.loads(path.read_text())
        self.assertEqual(written["remaining"], fake.budget("graphql")["remaining"])
        self.assertEqual(written["resetAt"], fake.budget("graphql")["resetAt"] // 1000)

    def linear(self, root, handler=None):
        clock = FakeClock()
        fake = FakeProvider("linear", clock, handler=handler)
        n = [0]

        def authorization(rejected=None):
            n[0] += 1
            return f"Bearer {n[0]}"

        client = LinearClient("linear-app:client-1", authorization, legacy_state_root=root, store=MemoryLedgerStore(),
                              transport=fake, now=clock.read, sleep=clock.sleep, log=quiet)
        return clock, fake, client

    def test_linear_publishes_cooldown_and_budget_projection(self):
        root = tmp(self)
        _, fake, client = self.linear(root)
        client.graphql("{ viewer { id } }")
        snapshot = json.loads((root / "api-budget.json").read_text())
        self.assertEqual((snapshot["schema"], snapshot["limit"]), (1, 5000))
        self.assertEqual(snapshot["dimensions"]["complexity"]["limit"], 3_000_000)
        fake.set_remaining("requests", 0)
        with self.assertRaises(ApiError):
            client.graphql("{ viewer { id } }", max_wait_ms=0)
        records = os.listdir(root / "linear-cooldown" / linear_scope("linear-app:client-1"))
        self.assertEqual(len(records), 1)

    def test_linear_honors_foreign_cooldown_without_network(self):
        root = tmp(self)
        clock, fake, client = self.linear(root)
        directory = root / "linear-cooldown" / client.scope
        directory.mkdir(parents=True)
        (directory / f"{clock.now + 60_000}-00000000-0000-0000-0000-000000000000.json").write_text('{"schema":1}')
        with self.assertRaises(ApiError):
            client.graphql("{ a }", priority="poll")
        with self.assertRaises(ApiError) as caught:
            client.graphql("{ a }", max_wait_ms=0)
        self.assertEqual(caught.exception.kind, "budget")
        self.assertEqual(fake.calls, [])

    def test_linear_reminted_after_401_and_batches(self):
        def handler(req):
            if req["headers"].get("authorization") == "Bearer 1":
                return {"status": 401, "body": {"errors": [{"message": "expired"}]}}
            count = json.loads(req["body"])["query"].count(": issue(")
            return {"body": {"data": {f"k{j}": {"identifier": f"JOV-{j}"} for j in range(count)}}}

        _, fake, client = self.linear(tmp(self), handler)
        issues = client.batch(["JOV-1", "JOV-2", "JOV-1"], issue_field("identifier"))
        self.assertEqual(len(issues), 2)
        self.assertEqual(len(fake.calls), 2)

    def test_lanes_scope_matches(self):
        import hashlib
        expected = hashlib.sha256(b"https://api.linear.app/graphql\0lin_key").hexdigest()
        self.assertEqual(linear_scope("lin_key"), expected)


class GhTest(unittest.TestCase):
    def test_shape_and_include_parsing(self):
        self.assertEqual(gh_shape(["api", "repos/o/r/pulls"]), {"resource": "core", "write": False, "idempotent": True})
        self.assertTrue(gh_shape(["api", "-X", "PATCH", "repos/o/r/pulls/1", "-f", "state=closed"])["write"])
        self.assertTrue(gh_shape(["api", "repos/o/r/issues/1/comments", "-f", "body=x"])["write"])
        self.assertEqual(gh_shape(["api", "-X", "GET", "search/issues", "-f", "q=x"])["resource"], "search")
        self.assertTrue(gh_shape(["api", "graphql", "-f", "query=mutation { x }"])["write"])
        self.assertFalse(gh_shape(["pr", "list"])["write"])
        self.assertTrue(gh_shape(["pr", "merge", "1"])["write"])
        self.assertEqual(split_included('HTTP/2.0 200 OK\nX-Ratelimit-Remaining: 7\n\n{"a":1}'),
                         ({"x-ratelimit-remaining": "7"}, '{"a":1}'))
        self.assertIsNone(split_included('{"a":1}'))

    def test_secondary_retry_then_poll_deferred_below_reserve(self):
        clock = FakeClock()
        start = clock.now
        replies = [(1, "", "gh: You have exceeded a secondary rate limit (HTTP 403)"),
                   (0, f"HTTP/2.0 200 OK\nX-Ratelimit-Limit: 1000\nX-Ratelimit-Remaining: 200\n"
                       f"X-Ratelimit-Reset: {clock.now // 1000 + 900}\nX-Ratelimit-Resource: core\n\n[]", "")]
        seen = []

        def run(args, env):
            seen.append(args)
            return replies.pop(0) if replies else (0, "[]", "")

        base = dict(store=MemoryLedgerStore(), credential="c", run=run, now=clock.read, sleep=clock.sleep,
                    random=lambda: 0, log=quiet)
        first = run_gh(["api", "repos/o/r/pulls"], priority="merge", **base)
        self.assertEqual((first["code"], first["stdout"], first["deferred"]), (0, "[]", False))
        self.assertEqual(seen[0][:2], ["api", "--include"])
        self.assertGreaterEqual(clock.now - start, 60_000)
        poll = run_gh(["api", "repos/o/r/pulls"], priority="poll", **base)
        self.assertEqual((poll["code"], poll["deferred"]), (75, True))

    def test_real_failures_pass_through_once(self):
        calls = []

        def run(args, env):
            calls.append(args)
            return 1, "", "GraphQL: Could not resolve to a PullRequest with the number of 9."

        clock = FakeClock()
        result = run_gh(["pr", "view", "9"], store=MemoryLedgerStore(), credential="c", run=run, now=clock.read,
                        sleep=clock.sleep, log=quiet)
        self.assertEqual((result["code"], result["deferred"], len(calls)), (1, False, 1))


class StatusTest(unittest.TestCase):
    def test_summary_and_cross_language_read(self):
        root = tmp(self)
        clock = FakeClock(int(time.time() * 1000))
        h = Harness(store=FileLedgerStore(root, clock.read), clock=clock)
        h.client.request(f"{GH}/repos/o/r")
        summary = cli.status(h.store, clock.now)
        cred = summary["providers"]["github"]["credentials"]["cred-a"]
        self.assertEqual(cred["buckets"]["core"]["remaining"], 4999)
        self.assertEqual(cred["breaker"], {"state": "closed", "openUntil": None, "reason": ""})
        self.assertEqual(cred["usage"]["default"]["attempts"], 1)
        self.assertIn("github cred-a breaker=closed core 4999/5000", cli.text(summary))
        cli_ts = ROOT / "packages/api-client/cli.ts"
        if not shutil.which("node") or not cli_ts.exists():
            self.skipTest("node or the TS client is unavailable")
        out = subprocess.run(["node", str(cli_ts), "status", "--json"],
                             env={**os.environ, "JOVIE_API_STATE_DIR": str(root)}, capture_output=True, text=True,
                             check=True)
        from_ts = json.loads(out.stdout)["providers"]["github"]["credentials"]["cred-a"]
        self.assertEqual(from_ts["buckets"], cred["buckets"])
        self.assertEqual(from_ts["usage"], cred["usage"])

    def test_cli_usage_errors(self):
        self.assertEqual(cli.main(["bogus"]), 2)
        self.assertEqual(cli.main(["gh", "--priority", "urgent", "--", "pr", "list"]), 2)


if __name__ == "__main__":
    unittest.main()
