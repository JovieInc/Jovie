"""Hermetic tests for the time-leverage system (no network, no real transcripts, own temp store)."""
from __future__ import annotations

import json
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from timewaste import agent_waste, cli, collect_tim, proposals, store, taxonomy  # noqa: E402

NOW = 1_800_000_000.0


class Classify(unittest.TestCase):
    def test_seed_classes(self):
        cases = {
            "fill me in on where we are": "status_ask",
            "summer should run this, execution on gem": "re_explanation",
            "this looks like slop, misaligned": "slop_flag",
            "is this a bug or is the number right?": "verify_ask",
            "yes": "approval",
            "why hasn't it merged": "chase_stalled",
            "the price should be $300": "spend_legal",
            "ship the data stuff for marketing pages": "delegation",
        }
        for text, want in cases.items():
            self.assertEqual(taxonomy.classify(text), want, text)

    def test_long_message_is_not_a_status_ask(self):
        self.assertNotEqual(taxonomy.classify("status " + "x " * 400), "status_ask")

    def test_classes(self):
        self.assertEqual(taxonomy.cls_of("taste_call"), taxonomy.HUMAN_ONLY)
        self.assertEqual(taxonomy.cls_of("status_ask"), taxonomy.AUTOMATABLE)
        self.assertEqual(taxonomy.cls_of("delegation"), taxonomy.STEERING)


class Minutes(unittest.TestCase):
    def test_measured_wins_when_plausible_else_heuristic(self):
        self.assertEqual(taxonomy.minutes_for("taste_call", 100, 1.5), (1.5, True))
        minutes, measured = taxonomy.minutes_for("taste_call", 100, 90)  # away
        self.assertFalse(measured)
        self.assertEqual(minutes, taxonomy.heuristic_minutes("taste_call", 100))

    def test_paste_is_capped(self):
        self.assertEqual(taxonomy.heuristic_minutes("delegation", 10**6), taxonomy.heuristic_minutes("delegation", taxonomy.CHAR_CAP))

    def test_trim_overlap(self):
        ev = [{"ts": 1000.0, "minutes": 2.0, "category": "a"}, {"ts": 1060.0, "minutes": 2.0, "category": "b"}]
        out = taxonomy.trim_overlap(ev)
        self.assertEqual(out[0]["minutes"], 2.0)
        self.assertEqual(out[1]["minutes"], 1.0)

    def test_summary_north_star(self):
        ev = [{"category": "taste_call", "minutes": 3.0}, {"category": "status_ask", "minutes": 1.0}]
        s = taxonomy.summarize(ev)
        self.assertEqual(s["humanOnlyPct"], 75.0)
        self.assertIsNone(taxonomy.summarize([])["humanOnlyPct"])


class Transcripts(unittest.TestCase):
    def test_only_typed_prompts_count_and_no_text_is_stored(self):
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "p"
            proj.mkdir()
            rows = [
                {"type": "assistant", "timestamp": "2027-01-15T08:00:00Z", "message": {"content": [{"type": "text", "text": "done"}]}},
                {"type": "user", "timestamp": "2027-01-15T08:01:00Z", "entrypoint": "cli", "message": {"content": "fill me in please SECRETWORD"}},
                {"type": "user", "timestamp": "2027-01-15T08:02:00Z", "entrypoint": "sdk-cli", "message": {"content": "agent prompt"}},
                {"type": "user", "timestamp": "2027-01-15T08:03:00Z", "entrypoint": "cli", "isMeta": True, "message": {"content": "meta"}},
                {"type": "user", "timestamp": "2027-01-15T08:04:00Z", "entrypoint": "cli", "message": {"content": "<task-notification>x</task-notification>"}},
                {"type": "assistant", "timestamp": "2027-01-15T08:04:05Z", "message": {"content": [{"type": "text", "text": "no change"}]}},
            ]
            (proj / "s.jsonl").write_text("\n".join(json.dumps(r) for r in rows))
            events, wake = collect_tim.collect_transcripts(0.0, Path(d))
            self.assertEqual([e["category"] for e in events], ["status_ask"])
            self.assertTrue(events[0]["measured"])
            self.assertEqual(wake, {"notifications": 1, "noOpWakes": 1})
            self.assertNotIn("SECRETWORD", json.dumps(events))


class GitHub(unittest.TestCase):
    def test_bursts_dropped_and_comment_text_not_stored(self):
        feed = [
            {"type": "PullRequestReviewEvent", "created_at": "2027-01-15T08:00:00Z", "repo": {"name": "o/r"}, "payload": {}},
            {"type": "PullRequestReviewEvent", "created_at": "2027-01-15T08:00:02Z", "repo": {"name": "o/r"}, "payload": {}},
            {"type": "IssueCommentEvent", "created_at": "2027-01-15T08:10:00Z", "repo": {"name": "o/r"}, "payload": {"comment": {"body": "yes SECRETWORD"}}},
        ]
        fetch = lambda args: feed if "events" in args[1] else {"login": "t"}
        events, meta = collect_tim.collect_github(0.0, fetch=fetch)
        self.assertEqual(meta["burstsDropped"], 1)
        self.assertEqual([e["category"] for e in events], ["github_review", "approval"])
        self.assertNotIn("SECRETWORD", json.dumps(events))


class Linear(unittest.TestCase):
    def test_batches_are_agents_isolated_is_tim(self):
        gql = lambda q, v: {"viewer": {"createdIssues": {"nodes": [
            {"createdAt": "2027-01-15T08:00:00Z"}, {"createdAt": "2027-01-15T08:00:01Z"},
            {"createdAt": "2027-01-15T12:00:00Z"}]}, "assignedIssues": {"nodes": []}}}
        events, _ = collect_tim.collect_linear(0.0, graphql=gql)
        self.assertEqual(len(events), 1)

    def test_no_credential_is_unavailable_not_zero(self):
        import os
        os.environ.pop("LINEAR_API_KEY", None)
        self.assertFalse(collect_tim.collect_linear(0.0)[1]["available"])


class Cards(unittest.TestCase):
    def test_default_resolution_costs_nothing(self):
        cards = [
            {"status": "approved", "kind": "taste", "createdAt": "2027-01-15T08:00:00Z", "decidedAt": "2027-01-15T10:00:00Z", "resolution": "founder"},
            {"status": "rejected", "kind": "spend", "createdAt": "2027-01-15T08:00:00Z", "decidedAt": "2027-01-17T08:00:00Z", "resolution": "default"},
        ]
        events, meta = collect_tim.collect_cards(0.0, cards)
        self.assertEqual(len(events), 1)
        self.assertEqual(meta["defaulted"], 1)
        self.assertEqual(meta["timeToDecideHoursP50"], 2.0)


class AgentWaste(unittest.TestCase):
    def test_ci_rework_counts_extra_rounds(self):
        def pr(n, rounds):
            return {"number": n, "mergedAt": "2027-01-15T08:00:00Z", "commits": {"nodes": [
                {"commit": {"checkSuites": {"nodes": [{"workflowRun": {"workflow": {"name": "Source Validation"}}}]}}}] * rounds}}
        fetch = lambda args: {"data": {"repository": {"pullRequests": {"nodes": [pr(1, 1), pr(2, 6)]}}}}
        out = agent_waste.ci_rework(0.0, fetch)
        self.assertEqual((out["prs"], out["reworkRounds"], out["prsOver3Rounds"]), (2, 5, 1))

    def test_duplicates_need_a_closed_unmerged_twin(self):
        rows = [
            {"number": 1, "title": "fix JOV-1", "headRefName": "a", "state": "CLOSED", "createdAt": "2027-01-15T08:00:00Z", "mergedAt": None},
            {"number": 2, "title": "fix JOV-1 again", "headRefName": "b", "state": "MERGED", "createdAt": "2027-01-15T09:00:00Z", "mergedAt": "2027-01-15T10:00:00Z"},
            {"number": 3, "title": "JOV-2", "headRefName": "c", "state": "MERGED", "createdAt": "2027-01-15T09:00:00Z", "mergedAt": "2027-01-15T10:00:00Z"},
        ]
        out = agent_waste.duplicate_work(0.0, lambda a: rows)
        self.assertEqual((out["builtTwice"], out["closedUnmerged"]), (1, 1))

    def test_outage_is_unavailable_not_zero(self):
        def boom(args):
            raise RuntimeError("x")
        self.assertFalse(agent_waste.ci_rework(0.0, boom)["available"])
        self.assertFalse(agent_waste.lane_state(0.0, None)["available"])

    def test_lane_state_reads_ledger_idle_and_alarms(self):
        with tempfile.TemporaryDirectory() as d:
            state = Path(d)
            (state / "runs").mkdir()
            (state / "runs/ledger.jsonl").write_text("\n".join(json.dumps(r) for r in [
                {"verdict": "failed", "endedAt": "2027-01-15T08:00:00Z", "agentSeconds": 3600},
                {"verdict": "fix-pushed", "endedAt": "2027-01-15T08:00:00Z", "agentSeconds": 1800},
                {"verdict": "gate-deferred", "endedAt": "2027-01-15T08:00:00Z"}]))
            (state / "idle-exits.jsonl").write_text(json.dumps({"at": 1_800_000_000, "reason": "none-eligible"}))
            (state / "host-alarms.jsonl").write_text(json.dumps({"at": "2027-01-15T08:00:00Z", "kind": "host-memory-pressure"}))
            out = agent_waste.lane_state(0.0, state)
            self.assertEqual((out["stalledOrFailed"], out["stalledAgentHours"], out["idleWakes"], out["hostAlarms"]), (1, 1.0, 1, 1))


def snapshot():
    return {"observedAt": NOW, "windowDays": 7, "week": "2027-W03",
            "tim": {"totalMinutes": 100, "humanOnlyMinutes": 30, "humanOnlyPct": 30.0, "categories": [
                {"id": "status_ask", "label": "Status ask", "class": "automatable", "minutes": 40.0, "events": 10},
                {"id": "taste_call", "label": "Taste call", "class": "human_only", "minutes": 30.0, "events": 20}]},
            "agent": {"ci": {"agentHours": 8.0, "reworkRounds": 20, "roundsP95": 4, "prsOver3Rounds": 2},
                      "wakes": {"agentHours": 10.0, "noOpWakes": 500, "notifications": 600},
                      "queue": {"failedShare": 0.3}, "lanes": {"available": False}, "wastedAgentHours": 18.0}}


class Proposals(unittest.TestCase):
    def test_ranking_prefers_cheap_big_savings_and_hides_empty(self):
        ranked = proposals.rank(snapshot())
        ids = [p["id"] for p in ranked]
        self.assertEqual(ids[0], "agent-noop-wakes")
        self.assertNotIn("tim-slop-gates", ids)
        self.assertEqual(ranked[0]["owner"], "Summer")
        self.assertTrue(all(p["evidence"] and p["estimate"] for p in ranked))

    def test_thresholds(self):
        hit = {h["id"] for h in proposals.crossed(snapshot())}
        self.assertTrue({"tim-category-leak", "tim-human-only-low", "agent-ci-rework", "agent-noop-wakes", "agent-queue-failures"} <= hit)

    def test_evaluate_reopens_when_not_shrunk(self):
        state = {"agent-noop-wakes": {"issue": "JOV-1", "shippedAt": NOW - 10 * 86400, "baseline": 10.0},
                 "tim-status-ask": {"issue": "JOV-2", "shippedAt": NOW - 10 * 86400, "baseline": 100.0},
                 "agent-ci-rework": {"issue": "JOV-3", "shippedAt": NOW - 1 * 86400, "baseline": 8.0}}
        verdicts = {v["id"]: v["verdict"] for v in proposals.evaluate(state, snapshot(), NOW)}
        self.assertEqual(verdicts, {"agent-noop-wakes": "reopen", "tim-status-ask": "worked"})


class Surface(unittest.TestCase):
    def test_public_aggregate_has_no_free_text_beyond_labels(self):
        snap = snapshot()
        agg = cli.surface(snap, proposals.rank(snap))
        self.assertEqual(agg["schema"], "time-leverage/v1")
        self.assertEqual(len(agg["proposals"]), 3)
        lines = cli.brief_lines(agg)
        self.assertIn("30% human-only", lines[0])

    def test_store_is_private_and_replaces_per_source(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            store.replace_events("a", [{"ts": 1.0, "category": "x", "minutes": 1}], base)
            store.replace_events("a", [{"ts": 2.0, "category": "y", "minutes": 1}], base)
            self.assertEqual([e["category"] for e in store.load_events(base)], ["y"])
            self.assertEqual((base / "events-a.jsonl").stat().st_mode & 0o077, 0)


if __name__ == "__main__":
    unittest.main()
