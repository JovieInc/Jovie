"""Board intake: the lanes claim codex board work, hand it to lanes intake, close on verified outcomes."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import board_intake as bi  # noqa: E402

NOW = 1_800_000_000.0


def task(tid, **extra):
    base = {"id": tid, "type": "task", "status": "open", "poster": "summer", "assignee": "codex", "caps": ["code"],
            "title": "t", "body": "", "postedAt": (NOW - 600) * 1000}
    base.update(extra)
    return base


class FakeHub:
    def __init__(self, tasks=()):
        self.tasks = {t["id"]: dict(t) for t in tasks}
        self.calls = []

    def __call__(self, method, path, body=None):
        self.calls.append((method, path, body))
        if path.startswith("/v1/board?"):
            return {"ok": True, "tasks": [t for t in self.tasks.values() if t["status"] == "open"]}
        if path == "/v1/board/claim":
            t = self.tasks.get(body["id"])
            if not t or t["status"] != "open":
                return {"ok": False, "claimed": False}
            t["status"] = "claimed"
            return {"ok": True, "claimed": True}
        if path == "/v1/board/done":
            self.tasks[body["id"]]["status"] = body["status"]
            return {"ok": True}
        return {"ok": True}

    def ops(self, op):
        return [c[2] for c in self.calls if c[1] == f"/v1/board/{op}"]


class FakeLinear:
    def __init__(self, states=None):
        self.states = states or {}
        self.moved, self.created, self.filed = [], [], {}

    def gql(self, query, variables):
        if "issues(first:1" in query:
            hit = [{"identifier": i} for marker, i in self.filed.items() if marker in variables["q"]]
            return {"issues": {"nodes": hit}}
        if "issueCreate" in query:
            self.created.append(variables["i"])
            ident = f"JOV-{9000 + len(self.filed)}"
            self.filed[variables["i"]["title"].split(" ")[0]] = ident
            return {"issueCreate": {"issue": {"id": "new", "identifier": ident}}}
        if "teams(" in query:
            return {"teams": {"nodes": [{"id": "team", "states": {"nodes": [{"id": "todo", "name": "Todo"}]},
                                         "labels": {"nodes": [{"id": "l1", "name": "symphony"}]}}]}}
        name, kind = self.states.get(variables["id"], ("Backlog", "backlog"))
        return {"issue": {"id": "uuid-" + variables["id"], "identifier": variables["id"], "state": {"name": name, "type": kind}}}

    def move(self, issue_id, state):
        self.moved.append((issue_id, state))


def gh_with(states, calls=None):
    def gh(args, priority="default"):
        if calls is not None:
            calls.append(args)
        if args[:2] == ["pr", "merge"]:
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        query = args[-1]
        nodes = {}
        for n, s in states.items():
            if f"pullRequest(number:{n})" not in query:
                continue
            state, merge_state, auto = (s, None, False) if isinstance(s, str) else s
            nodes[f"p{n}"] = {"state": state, "mergeCommit": {"oid": "abc"} if state == "MERGED" else None,
                              "mergeStateStatus": merge_state, "autoMergeRequest": {"enabledAt": "x"} if auto else None}
        return SimpleNamespace(returncode=0, stdout=json.dumps({"data": {"repository": nodes}}), stderr="")
    return gh


class PolicyTest(unittest.TestCase):
    def test_classify_maps_stall_detector_and_goal_tasks(self):
        self.assertEqual(bi.classify(task("stall-jovie-23744-e4ddc31-a2")),
                         {"kind": "pr", "repo": "JovieInc/Jovie", "number": 23744})
        self.assertEqual(bi.classify(task("jov-10167-c2-e1")), {"kind": "linear", "identifier": "JOV-10167"})
        self.assertEqual(bi.classify(task("goal-mq-merge-rate-2026110203")), {"kind": "goal"})

    def test_eligibility_is_codex_or_unassigned_code_ops_from_trusted_posters(self):
        self.assertTrue(bi.eligible(task("a")))
        self.assertTrue(bi.eligible(task("b", assignee=None, caps=["code", "ops"])))
        self.assertFalse(bi.eligible(task("c", assignee="claude")))
        self.assertFalse(bi.eligible(task("d", assignee=None, caps=["code", "design"])))
        self.assertFalse(bi.eligible(task("e", assignee=None, caps=[])))
        self.assertFalse(bi.eligible(task("f", poster="grokbot")))
        self.assertFalse(bi.eligible(task("g", type="question")))

    def test_goal_prompt_carries_definition_of_done_and_verification(self):
        body = bi.goal_prompt(task("goal-x", title="Merge throughput low", body="green PRs not reaching queue"))
        for needle in ("## Definition of done", "## Verification", "pr:open", "--no-verify", "host gate",
                       "green PRs not reaching queue", "quoted data"):
            self.assertIn(needle, body)

    def test_goal_key_strips_the_hourly_suffix(self):
        self.assertEqual(bi.goal_key(task("goal-mq-merge-rate-2026110203")), "goal-mq-merge-rate")
        self.assertEqual(bi.goal_key(task("prod-stale-staged-alias-gate-20261101")), "prod-stale-staged-alias-gate")

    def test_metrics_report_pickup_work_success_and_rate(self):
        rows = [{"event": "claimed", "postedEpoch": NOW - 100, "claimedEpoch": NOW - 40},
                {"event": "done", "claimedEpoch": NOW - 40, "closedEpoch": NOW},
                {"event": "failed", "claimedEpoch": NOW - 80, "closedEpoch": NOW}]
        m = bi.metrics(rows, NOW)
        self.assertEqual((m["claimed"], m["done"], m["failed"], m["successRate"]), (1, 1, 1, 0.5))
        self.assertEqual(m["pickupS"]["p50"], 60.0)


class TickTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def run_tick(self, hub, linear, gh=None, now=NOW):
        return bi.tick(self.state, linear, now=now, call=hub, gh=gh or gh_with({}))

    def test_claims_hands_off_and_records_claim_latency(self):
        hub = FakeHub([task("stall-jovie-1-aaaaaaa-a1"), task("jov-10167"), task("goal-x"),
                       task("other", assignee="claude")])
        linear = FakeLinear()
        receipt = self.run_tick(hub, linear)
        self.assertEqual(sorted(receipt["claimed"]), ["goal-x", "jov-10167", "stall-jovie-1-aaaaaaa-a1"])
        self.assertEqual(linear.moved, [("uuid-JOV-10167", "Todo")])
        self.assertEqual(linear.created[0]["stateId"], "todo")
        self.assertIn("## Definition of done", linear.created[0]["description"])
        self.assertEqual(hub.ops("caps"), [{"caps": ["code", "ops"]}])
        rows = [json.loads(l) for l in (self.state / "runs/board-intake.jsonl").read_text().splitlines()]
        self.assertTrue(all(r["claimedEpoch"] - r["postedEpoch"] == 600 for r in rows))

    def test_hourly_reposts_of_one_goal_share_one_issue(self):
        hub = FakeHub([task("goal-mq-merge-rate-2026110201"), task("goal-mq-merge-rate-2026110202")])
        linear = FakeLinear()
        self.run_tick(hub, linear)
        self.assertEqual(len(linear.created), 1)
        held = json.loads((self.state / "board-intake.json").read_text())["tasks"]
        self.assertEqual(len({row["issue"] for row in held.values()}), 1)

    def test_merged_pr_closes_done_with_sha_and_closed_pr_fails(self):
        hub = FakeHub([task("stall-jovie-1-aaaaaaa-a1"), task("stall-jovie-2-bbbbbbb-a1")])
        self.run_tick(hub, FakeLinear())
        self.run_tick(hub, FakeLinear(), gh=gh_with({1: "MERGED", 2: "CLOSED"}), now=NOW + 60)
        done = {d["id"]: d for d in hub.ops("done")}
        self.assertEqual(done["stall-jovie-1-aaaaaaa-a1"]["status"], "done")
        self.assertIn("merged abc", done["stall-jovie-1-aaaaaaa-a1"]["result"])
        self.assertEqual(done["stall-jovie-2-bbbbbbb-a1"]["status"], "failed")

    def test_linear_completion_closes_done_and_open_pr_only_renews(self):
        hub = FakeHub([task("jov-5"), task("stall-jovie-3-ccccccc-a1")])
        self.run_tick(hub, FakeLinear())
        self.run_tick(hub, FakeLinear({"JOV-5": ("Done", "completed")}), gh=gh_with({3: "OPEN"}),
                      now=NOW + bi.RENEW_S + 1)
        self.assertEqual([d["id"] for d in hub.ops("done")], ["jov-5"])
        self.assertTrue(any(u.get("leaseSec") == bi.LEASE_S and u["id"] == "stall-jovie-3-ccccccc-a1"
                            for u in hub.ops("update")))

    def test_no_verified_outcome_within_sla_fails_so_the_ladder_escalates(self):
        hub = FakeHub([task("stall-jovie-4-ddddddd-a1")])
        self.run_tick(hub, FakeLinear())
        self.run_tick(hub, FakeLinear(), gh=gh_with({4: "OPEN"}), now=NOW + bi.PROGRESS_SLA_S + 1)
        (done,) = hub.ops("done")
        self.assertEqual(done["status"], "failed")
        self.assertIn("escalate", done["result"])

    def test_stuck_prs_are_claimed_before_older_detector_and_goal_backlog(self):
        old = (NOW - 7 * 86400) * 1000
        hub = FakeHub([task(f"jov-{n}", postedAt=old + n) for n in range(1, 7)] + [task("goal-y", postedAt=old)]
                      + [task("stall-jovie-9-aaaaaaa-a1"), task("stall-jovie-8-bbbbbbb-a2")])
        receipt = self.run_tick(hub, FakeLinear())
        self.assertEqual(receipt["claimed"][:2], ["stall-jovie-9-aaaaaaa-a1", "stall-jovie-8-bbbbbbb-a2"])
        self.assertEqual(len(receipt["claimed"]), bi.MAX_CLAIMS_PER_TICK)
        self.assertNotIn("goal-y", receipt["claimed"])

    def test_a_green_pr_with_auto_merge_off_is_enqueued_once(self):
        hub = FakeHub([task("stall-jovie-7-ccccccc-a1")])
        self.run_tick(hub, FakeLinear())
        calls = []
        green = gh_with({7: ("OPEN", "CLEAN", False)}, calls)
        receipt = self.run_tick(hub, FakeLinear(), gh=green, now=NOW + 60)
        self.assertEqual(receipt["enqueued"], ["https://github.com/JovieInc/Jovie/pull/7"])
        self.assertIn(["pr", "merge", "7", "--repo", "JovieInc/Jovie", "--auto"], calls)
        calls.clear()
        self.run_tick(hub, FakeLinear(), gh=green, now=NOW + 120)
        self.assertFalse(any(c[:2] == ["pr", "merge"] for c in calls))

    def test_hub_outage_keeps_held_tasks_and_never_raises(self):
        hub = FakeHub([task("stall-jovie-5-eeeeeee-a1")])
        self.run_tick(hub, FakeLinear())

        def down(method, path, body=None):
            return {"ok": False, "transport": "URLError: eof"}
        receipt = bi.tick(self.state, FakeLinear(), now=NOW + 120, call=down, gh=gh_with({5: "MERGED"}))
        self.assertEqual(receipt["held"], 1)
        self.assertEqual(receipt["claimed"], [])

    def test_claim_lost_to_another_agent_is_skipped(self):
        hub = FakeHub([task("stall-jovie-6-fffffff-a1")])
        hub.tasks["stall-jovie-6-fffffff-a1"]["status"] = "open"
        original = hub.__call__

        def racing(method, path, body=None):
            if path == "/v1/board/claim":
                return {"ok": True, "claimed": False}
            return original(method, path, body)
        receipt = bi.tick(self.state, FakeLinear(), now=NOW, call=racing, gh=gh_with({}))
        self.assertEqual(receipt["claimed"], [])


if __name__ == "__main__":
    unittest.main()
