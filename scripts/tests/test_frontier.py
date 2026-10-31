"""Frontier feed: dedupe, scoring contract, routing gates (trial / needs-tim / reject), staleness, result loop, digest."""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
sys.path.insert(0, str(ROOT / "scripts/signals"))
spec = importlib.util.spec_from_file_location("frontier", ROOT / "scripts/signals/frontier.py")
F = importlib.util.module_from_spec(spec)
sys.modules["frontier"] = F
spec.loader.exec_module(F)
import factory_intake  # noqa: E402

NOW = 1_792_454_400.0  # 2026-10-20T00:00:00Z


def verdict(**kw):
    base = {"relevance": 0.8, "roi": 0.7, "effort": "hours", "spend": "free", "stack": "ci-build", "kind": "tip",
            "scorer": "jev", "costUsd": 0.00002}
    base.update(kw)
    base["priority"] = round(base["relevance"] * base["roi"] / F.EFFORT_COST[base["effort"]], 3)
    return base


def item(n=1, title=None, url=None):
    return {"id": f"frontier:{n}", "url": url or f"https://example.com/post-{n}", "title": title or f"Turbo cache trick {n}",
            "summary": "cut CI 40%", "origin": "last30days:hackernews", "topic": "ci-build-times", "topicStack": "ci-build"}


def jev_body(relevance=0.8, roi=0.7, effort="hours", spend="free", stack="ci-build", kind="tip"):
    return {"model": F.signal_watch.JEV_MODEL, "answers": {
        "relevance": {"noul": relevance}, "roi": {"noul": roi}, "effort": {"choice": effort}, "spend": {"choice": spend},
        "stack": {"choice": stack}, "kind": {"choice": kind}}, "usage": {"input_tokens": 100}}


class Canonical(unittest.TestCase):
    def test_same_page_same_key(self):
        a = F.canonical_url("https://www.Example.com/post/?utm_source=x&ref=y#frag")
        b = F.canonical_url("https://example.com/post")
        self.assertEqual(a, b)

    def test_real_query_params_survive(self):
        self.assertNotEqual(F.canonical_url("https://example.com/p?id=1"), F.canonical_url("https://example.com/p?id=2"))


class Tidy(unittest.TestCase):
    def test_summary_is_plain_and_the_trial_names_a_real_metric(self):
        self.assertEqual(F.tidy("# Title\n\nA  **bold** claim ```code``` here"), "A bold claim here")
        signal = F.factory_signal(F.new_pattern(item(), verdict(), "trial", "o"))
        self.assertIn("minutes from push to required checks green", signal["metric"]["name"])
        self.assertIsNone(factory_intake.validate(signal))


class Decide(unittest.TestCase):
    def test_free_small_scored_is_a_trial(self):
        self.assertEqual(F.decide(verdict(), 0)[0], "trial")

    def test_paid_goes_to_tim_never_a_trial(self):
        self.assertEqual(F.decide(verdict(spend="paid"), 0)[0], "needs-tim")

    def test_unknown_spend_trials_but_the_issue_makes_confirming_free_step_one(self):
        self.assertEqual(F.decide(verdict(spend="unknown"), 0)[0], "trial")
        signal = F.factory_signal(F.new_pattern(item(), verdict(spend="unknown"), "trial", "o"))
        self.assertIn("Confirm first that the trial is free", " ".join(signal["acceptance"]))

    def test_weeks_of_effort_is_a_candidate(self):
        self.assertEqual(F.decide(verdict(effort="weeks"), 0)[0], "candidate")

    def test_low_relevance_and_off_topic_reject_with_reason(self):
        status, reason = F.decide(verdict(relevance=0.2), 0)
        self.assertEqual(status, "rejected")
        self.assertIn("relevance", reason)
        self.assertEqual(F.decide(verdict(stack="none"), 0)[0], "rejected")

    def test_trial_cap(self):
        self.assertEqual(F.decide(verdict(), F.MAX_TRIALS_PER_DAY)[0], "candidate")


class Score(unittest.TestCase):
    def test_jev_contract(self):
        v = F.score_jev(item(), "k", lambda *a, **k: (200, jev_body()))
        self.assertEqual((v["scorer"], v["effort"], v["spend"]), ("jev", "hours", "free"))
        self.assertAlmostEqual(v["priority"], 0.56)

    def test_off_contract_raises(self):
        with self.assertRaises(RuntimeError):
            F.score_jev(item(), "k", lambda *a, **k: (200, jev_body(effort="months")))
        with self.assertRaises(RuntimeError):
            F.score_jev(item(), "k", lambda *a, **k: (500, {}))

    def test_keyword_prefilter_uses_word_boundaries(self):
        topics = F.load_topics()
        self.assertEqual(F.keyword_area({"title": "Turborepo remote cache cut GitHub Actions merge queue time", "summary": ""}, topics), "ci-build")
        self.assertIsNone(F.keyword_area({"title": "A specific celebrity story", "summary": ""}, topics))  # "ci" inside "specific"


class Route(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.reg = F.Registry(self.dir, canon=self.dir / "none.jsonl")

    def tearDown(self):
        self.tmp.cleanup()

    def test_trial_writes_a_valid_factory_signal(self):
        out = F.route([item()], [(item(), verdict())], self.reg, observed="2026-10-20T00:00:00Z", factory_dir=self.dir / "fs")
        self.assertEqual(len(out["trials"]), 1)
        files = list((self.dir / "fs").glob("*.json"))
        self.assertEqual(len(files), 1)
        row = json.loads(files[0].read_text())
        self.assertIsNone(factory_intake.validate(row))
        plan = factory_intake.plan([row])
        self.assertIn("frontier", plan[0]["labels"][-1])
        self.assertIn("shadow mode", plan[0]["description"])

    def test_paid_item_files_nothing(self):
        out = F.route([item()], [(item(), verdict(spend="paid"))], self.reg, observed="o", factory_dir=self.dir / "fs")
        self.assertEqual(len(out["needsTim"]), 1)
        self.assertFalse((self.dir / "fs").exists())

    def test_duplicate_url_and_similar_title_are_dropped(self):
        F.route([item(1)], [(item(1), verdict())], self.reg, observed="o", factory_dir=None)
        out = F.route([item(2)], [(item(2, url="https://www.example.com/post-1/?utm_source=a"), verdict())], self.reg, observed="o", factory_dir=None)
        self.assertEqual(out["duplicates"], 1)
        out = F.route([item(3)], [(item(3, title="Turbo cache trick 1", url="https://other.dev/x"), verdict())], self.reg, observed="o", factory_dir=None)
        self.assertEqual(out["duplicates"], 1)

    def test_registry_round_trips_and_canon_is_read_for_dedupe(self):
        F.route([item(1)], [(item(1), verdict())], self.reg, observed="o", factory_dir=None)
        self.reg.save()
        canon = self.dir / "canon.jsonl"
        canon.write_text(json.dumps({**next(iter(self.reg.machine.values())), "id": "pat-canon", "urlKey": "example.com/zzz"}) + "\n")
        again = F.Registry(self.dir, canon=canon)
        self.assertEqual(len(again.rows), 2)

    def test_stale_after_a_week_without_a_trial(self):
        F.route([item(1)], [(item(1), verdict(effort="weeks"))], self.reg, observed=F.now_iso(NOW - 9 * 86400), factory_dir=None)
        self.assertEqual(F.mark_stale(self.reg, NOW), 1)
        self.assertEqual(next(iter(self.reg.rows.values()))["status"], "stale")

    def test_result_closes_the_loop(self):
        F.route([item(1)], [(item(1), verdict())], self.reg, observed="2026-10-20T00:00:00Z", factory_dir=None)
        pid = next(iter(self.reg.rows))
        done = F.record_result(self.reg, pid, decision="keep", baseline="9.1m", after="6.2m", reason="-32% p50", now=NOW)
        self.assertEqual(done["status"], "adopted")
        self.assertEqual(done["evidence"]["confidence"], "measured-here")
        self.assertEqual(done["trial"]["result"]["after"], "6.2m")
        with self.assertRaises(ValueError):
            F.record_result(self.reg, pid, decision="maybe")


class Run(unittest.TestCase):
    def researcher(self, query, days):
        return [{"title": "Cut CI 40% with Turborepo remote cache", "url": "https://blog.dev/ci?utm_source=hn", "summary": "benchmark", "origin": "last30days:hackernews"},
                {"title": "Vercel sponsors a golf tournament", "url": "https://gossip.example/a", "summary": "", "origin": "last30days:reddit"},
                {"title": "Celebrity gossip", "url": "https://gossip.example/b", "summary": "", "origin": "last30days:reddit"}], "last30days-direct"

    def test_end_to_end_with_fakes(self):
        answers = iter([jev_body(), jev_body(relevance=0.05, roi=0.05, stack="none", kind="other")])
        posted = []
        puts = []
        with tempfile.TemporaryDirectory() as tmp:
            topics = {**F.load_topics(), "topics": F.load_topics()["topics"][:1]}
            result = F.run(Path(tmp), env={"AI_GATEWAY_API_KEY": "k"}, topics=topics, researcher=self.researcher,
                           poster=lambda *a, **k: posted.append(1) or (200, next(answers)),
                           put=lambda slug, title, body: puts.append((slug, body)) or (True, None),
                           canon=Path(tmp) / "none.jsonl", now=NOW)
            self.assertEqual(result["status"], "ok")
            self.assertEqual((result["scored"], len(result["trials"]), result["rejected"]), (2, 1, 1))
            self.assertEqual((result["offTopic"], result["awaitingScore"]), (1, 0))
            self.assertEqual(puts[0][0], "signals/frontier/2026-10-20")
            self.assertIn("Rejected", puts[0][1])
            self.assertTrue((Path(tmp) / "frontier-cost.ndjson").exists())
            self.assertTrue(list((Path(tmp) / "factory-signals").glob("*.json")))
            # a second run sees nothing new: the seen set dedupes both URLs
            again = F.run(Path(tmp), env={"AI_GATEWAY_API_KEY": "k"}, topics=topics, researcher=self.researcher,
                          poster=lambda *a, **k: (200, jev_body()), put=lambda *a: (True, None), canon=Path(tmp) / "none.jsonl", now=NOW + 3600)
            self.assertEqual((again["fresh"], again["scored"], again["awaitingScore"]), (0, 0, 0))

    def test_the_digest_is_the_days_not_the_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            topics = {**F.load_topics(), "topics": F.load_topics()["topics"][:1]}
            pages = []
            put = lambda slug, title, body: pages.append(body) or (True, None)  # noqa: E731
            F.run(Path(tmp), env={"AI_GATEWAY_API_KEY": "k"}, topics=topics, researcher=self.researcher, poster=lambda *a, **k: (200, jev_body()),
                  put=put, canon=Path(tmp) / "none.jsonl", now=NOW)
            second = [{"id": "frontier:z", "url": "https://other.dev/z", "title": "Turborepo cache for GitHub Actions", "summary": "", "origin": "signal-watch:x", "topic": "platform", "topicStack": None}]
            F.run(Path(tmp), env={"AI_GATEWAY_API_KEY": "k"}, topics={**topics, "topics": []}, extra_items=second, researcher=lambda q, d: ([], "x"),
                  poster=lambda *a, **k: (200, jev_body()), put=put, canon=Path(tmp) / "none.jsonl", now=NOW + 600)
            self.assertIn("Turborepo cache for GitHub Actions", pages[-1])
            self.assertIn("Cut CI 40% with Turborepo remote cache", pages[-1])  # the earlier run's finding survives

    def test_no_gateway_key_routes_nothing_and_keeps_items_for_the_next_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            topics = {**F.load_topics(), "topics": F.load_topics()["topics"][:1]}
            result = F.run(Path(tmp), env={}, topics=topics, researcher=self.researcher, put=lambda *a: (True, None),
                           canon=Path(tmp) / "none.jsonl", now=NOW)
            self.assertEqual((result["patterns"], result["trials"], result["scored"]), (0, [], 0))
            self.assertEqual(result["status"], "partial")
            self.assertEqual(result["awaitingScore"], 2)  # the pure-gossip item is off-topic and dropped
            self.assertEqual(len(F.read_pending(Path(tmp))), 2)
            self.assertFalse((Path(tmp) / "patterns.jsonl").read_text().strip())
            # key arrives: the waiting item is scored without a new scan
            later = F.run(Path(tmp), env={"AI_GATEWAY_API_KEY": "k"}, topics={**topics, "topics": []}, researcher=lambda q, d: ([], "x"),
                          poster=lambda *a, **k: (200, jev_body()), put=lambda *a: (True, None), canon=Path(tmp) / "none.jsonl", now=NOW + 3600)
            self.assertEqual((later["scored"], len(later["trials"]), later["awaitingScore"]), (2, 2, 0))  # same canned answer for both; the daily cap of 2 allows both

    def test_jev_failure_leaves_items_waiting_and_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            topics = {**F.load_topics(), "topics": F.load_topics()["topics"][:1]}
            result = F.run(Path(tmp), env={"AI_GATEWAY_API_KEY": "k"}, topics=topics, researcher=self.researcher,
                           poster=lambda *a, **k: (500, {}), put=lambda *a: (True, None), canon=Path(tmp) / "none.jsonl", now=NOW)
            self.assertEqual(result["status"], "partial")
            self.assertEqual((result["scored"], result["awaitingScore"]), (0, 2))

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            topics = {**F.load_topics(), "topics": F.load_topics()["topics"][:1]}
            F.run(Path(tmp), env={}, topics=topics, researcher=self.researcher, put=lambda *a: self.fail("gbrain written"),
                  canon=Path(tmp) / "none.jsonl", now=NOW, dry_run=True)
            self.assertEqual(sorted(p.name for p in Path(tmp).iterdir()), [])


class Topics(unittest.TestCase):
    def test_topics_file_is_valid(self):
        topics = F.load_topics()
        self.assertTrue(all({"id", "query", "stack"} <= set(t) for t in topics["topics"]))
        self.assertTrue(all(__import__("re").fullmatch(r"[A-Za-z0-9_]{1,15}", p["handle"]) for p in topics["people"]))
        self.assertLessEqual(topics["lookbackDays"], 7)


if __name__ == "__main__":
    unittest.main()
