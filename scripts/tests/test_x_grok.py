"""Internal-only X source through the Grok CLI: provenance checks, ledger admission and failure handling."""
from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("x_grok", ROOT / "scripts/signals/x_grok.py")
X = importlib.util.module_from_spec(spec)
spec.loader.exec_module(X)
from apiclient.store import MemoryLedgerStore  # noqa: E402

REAL = {"handle": "AnthropicAI", "postId": "2112579251555721573", "createdAt": "Tue, 20 Oct 2026 16:18:38 GMT",
        "text": "New on our Science Blog", "links": ["https://www.anthropic.com/research/x", "https://x.com/a/status/1"]}
# What grok printed before the real answer on 2026-10-21: an invented id whose snowflake time is April 2026.
INVENTED = {"handle": "AnthropicAI", "postId": "2047690000000000001", "createdAt": "2026-10-20T18:00:00.000Z",
            "text": "Example post text from search result.", "links": []}


def cli_output(*objects, cost=0.07, structured=None):
    result = {"text": "".join(json.dumps(o) for o in objects), "stopReason": "end_turn", "num_turns": 1,
              "total_cost_usd": cost, "structuredOutput": structured, "structuredOutputError": None}
    return json.dumps(result)


class Clock:
    def __init__(self):
        self.ms = 1_792_540_800_000

    def __call__(self):
        self.ms += 1000
        return self.ms


class VerifiedPostsTests(unittest.TestCase):
    def test_invented_ids_wrong_handles_and_duplicates_are_dropped(self):
        result = json.loads(cli_output({"posts": [INVENTED]}, {"posts": [REAL, REAL, {**REAL, "handle": "someoneelse",
                                                                                       "postId": "2112579251555721574"}]}))
        posts = X.verified_posts(result, ["AnthropicAI"], [])
        self.assertEqual([post["id"] for post in posts], ["2112579251555721573"])
        self.assertEqual(posts[0]["createdAt"], "2026-10-20T16:18:38Z")
        self.assertEqual(posts[0]["links"], ["https://www.anthropic.com/research/x"])
        self.assertEqual(posts[0]["url"], "https://x.com/AnthropicAI/status/2112579251555721573")

    def test_structured_output_and_queries_accept_any_author(self):
        other = {**REAL, "handle": "someone"}
        result = json.loads(cli_output(structured={"posts": [other]}))
        self.assertEqual(len(X.verified_posts(result, ["AnthropicAI"], [])), 0)
        self.assertEqual(len(X.verified_posts(result, ["AnthropicAI"], ["agent state machines"])), 1)

    def test_prompt_builds_one_query_per_search(self):
        prompt = X.build_prompt(["AnthropicAI", "xai"], ["link in bio"], "2026-10-19", 20)
        self.assertIn('"(from:AnthropicAI OR from:xai) -filter:replies -filter:retweets since:2026-10-19" limit 20', prompt)
        self.assertIn('"link in bio since:2026-10-19"', prompt)


class SearchPostsTests(unittest.TestCase):
    def test_ok_call_is_admitted_through_the_ledger(self):
        store, seen = MemoryLedgerStore(), []

        def run(argv, env):
            seen.append(argv)
            return 0, cli_output({"posts": [REAL]}), ""
        out = X.search_posts(["AnthropicAI"], [], "2026-10-19", env={}, run=run, store=store, now=Clock())
        self.assertEqual((out["status"], len(out["posts"]), out["costUsd"]), ("ok", 1, 0.07))
        argv = seen[0]
        self.assertEqual(argv[argv.index("--tools") + 1], "x_search")
        self.assertEqual(argv[argv.index("--deny") + 1], "mcp__*")
        ledger = store.transact(X.PROVIDER, lambda led: json.loads(json.dumps(led)))
        self.assertIn(X.CREDENTIAL, json.dumps(ledger))

    def test_rate_limits_open_the_breaker_and_later_calls_defer(self):
        store, clock, calls = MemoryLedgerStore(), Clock(), []

        def limited(argv, env):
            calls.append(1)
            return 1, "", "HTTP 429 Too Many Requests"
        first = X.search_posts(["xai"], [], "2026-10-19", env={}, run=limited, store=store, now=clock, log=lambda line: None)
        self.assertEqual(first["status"], "failed")
        outcomes = [X.search_posts(["xai"], [], "2026-10-19", env={}, run=limited, store=store, now=clock,
                                   log=lambda line: None)["status"] for _ in range(6)]
        self.assertIn("deferred", outcomes)
        self.assertLess(len(calls), 7)

    def test_missing_binary_and_unparseable_output_fail_cleanly(self):
        missing = X.search_posts(["xai"], [], "2026-10-19", env={}, run=lambda argv, env: (127, "", "OSError"),
                                 store=MemoryLedgerStore(), now=Clock())
        self.assertEqual(missing["status"], "failed")
        garbage = X.search_posts(["xai"], [], "2026-10-19", env={}, run=lambda argv, env: (0, "not json", ""),
                                 store=MemoryLedgerStore(), now=Clock())
        self.assertEqual(garbage["status"], "failed")


if __name__ == "__main__":
    unittest.main()
