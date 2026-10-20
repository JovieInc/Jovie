"""Market signal watcher: conditional polling, diffing, bookmarks, Jev budget, gbrain pages and signed Summer cards."""
from __future__ import annotations

import base64
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
spec = importlib.util.spec_from_file_location("signal_watch", ROOT / "scripts/signals/signal_watch.py")
W = importlib.util.module_from_spec(spec)
sys.modules["signal_watch"] = W
spec.loader.exec_module(W)

NOW = 1_792_454_400.0  # 2026-10-20T00:00:00Z

RSS = """<?xml version="1.0"?><rss version="2.0"><channel><title>Vercel</title>
<item><title>Queues GA</title><link>https://vercel.com/changelog/queues</link><guid>q</guid><description>&lt;p&gt;Durable queues&lt;/p&gt;</description></item>
<item><title>Old thing</title><link>https://vercel.com/changelog/old</link><guid>o</guid></item>
</channel></rss>"""
ATOM = """<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><id>tag:1</id><title>v2</title><link rel="alternate" href="https://github.com/x/releases/v2"/><content type="html">Fixes</content></entry>
<entry><id>tag:0</id><title>v2-alpha.1</title><link href="https://github.com/x/releases/v2a"/></entry>
</feed>"""
LINKS = """<html><body><a href="/news/claude-new-thing"><img/></a><a href="/news/claude-new-thing">Claude new thing</a>
<a href="/news/product">Product</a><a href="/careers">Jobs</a><script>var a='<a href="/news/x-y">'</script></body></html>"""
HEADINGS = """<html><body><h2>October</h2><h3 id="grok-voice-3">Grok Voice 3.0</h3><p>Lower latency voice.</p>
<h3 id="tts">TTS deprecation</h3><p>Old model retires.</p><h2>September</h2><h3 id="x">X</h3></body></html>"""
ARTICLE = """<html><head><title>T</title><meta property="og:title" content="Linked article"/>
<meta name="description" content="What the article says."/></head><body><p>A long first paragraph about the linked thing in detail.</p></body></html>"""


def source(**overrides):
    return {"id": "vercel-changelog", "name": "Vercel changelog", "category": "platform", "kind": "feed",
            "url": "https://vercel.com/atom", **overrides}


class Fetcher:
    def __init__(self, pages):
        self.pages, self.calls = pages, []

    def __call__(self, url, headers=None, timeout=30):
        self.calls.append((url, dict(headers or {})))
        page = self.pages.get(url)
        if callable(page):
            return page(headers or {})
        if page is None:
            return {"status": 404, "body": "", "url": url, "etag": None, "lastModified": None}
        return {"status": 200, "body": page, "url": url, "etag": '"e1"', "lastModified": "Mon, 20 Oct 2026 00:00:00 GMT"}


def jev_answer(action="adopt", worth=0.8, surface="product", priority="artist-profile-offer", p=0.9):
    probabilities = {name: 0.0 for name in W.ACTIONS}
    probabilities[action] = p
    return {"model": W.JEV_MODEL, "usage": {"input_tokens": 500, "output_tokens": 60},
            "provider_metadata": {"gateway": {"cost": "0.000021"}},
            "answers": {"action": {"type": "choice", "choice": action, "confidence": p, "probabilities": probabilities},
                        "surface": {"type": "choice", "choice": surface, "confidence": 0.9, "probabilities": {surface: 0.9}},
                        "priority": {"type": "choice", "choice": priority, "confidence": 0.9, "probabilities": {priority: 0.9}},
                        "worth": {"type": "noul", "noul": worth}}}


class Poster:
    """Jev answers by title keyword; Summer answers 202 unless told otherwise."""

    def __init__(self, verdicts=None, summer_status=202):
        self.verdicts, self.summer_status, self.calls = verdicts or {}, summer_status, []

    def __call__(self, url, body, headers, timeout=30):
        self.calls.append((url, body, headers))
        if url == W.JEV_URL:
            for keyword, answer in self.verdicts.items():
                if keyword in body["state"]:
                    return 200, answer
            return 200, jev_answer("ignore", 0.05)
        return self.summer_status, {"ok": self.summer_status == 202, "status": "opened"}


class Brain:
    def __init__(self):
        self.pages = {}

    def __call__(self, slug, title, body):
        self.pages[slug] = body
        return True, None


class ParseTests(unittest.TestCase):
    def test_rss_and_atom_entries(self):
        rss = W.parse_feed(RSS)
        self.assertEqual([entry["id"] for entry in rss], ["q", "o"])
        self.assertEqual(rss[0]["summary"], "Durable queues")
        atom = W.parse_feed(ATOM)
        self.assertEqual(atom[0], {"id": "tag:1", "title": "v2", "url": "https://github.com/x/releases/v2",
                                   "published": "", "summary": "Fixes"})

    def test_feed_refuses_entity_declarations(self):
        with self.assertRaises(ValueError):
            W.parse_feed('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><rss/>')

    def test_html_links_dedupe_and_keep_descriptive_text(self):
        entries = W.html_link_entries(LINKS, "https://www.anthropic.com/news", r"^/news/[a-z0-9]+(?:-[a-z0-9]+)+$")
        self.assertEqual(entries, [{"id": "https://www.anthropic.com/news/claude-new-thing", "title": "Claude new thing",
                                    "url": "https://www.anthropic.com/news/claude-new-thing", "published": "", "summary": ""}])

    def test_html_headings_with_following_text(self):
        entries = W.html_heading_entries(HEADINGS, "https://docs.x.ai/notes", 3)
        self.assertEqual([entry["title"] for entry in entries], ["Grok Voice 3.0", "TTS deprecation", "X"])
        self.assertEqual(entries[0]["url"], "https://docs.x.ai/notes#grok-voice-3")
        self.assertIn("Lower latency voice", entries[0]["summary"])
        self.assertNotIn("Old model", entries[0]["summary"])

    def test_sources_file_is_valid(self):
        sources = W.load_sources()
        self.assertGreaterEqual(len(sources), 15)
        categories = {item["category"] for item in sources}
        self.assertEqual(categories, {"ai-lab", "platform", "competitor"})


class PollTests(unittest.TestCase):
    def test_first_sight_keeps_newest_then_only_new_entries_with_conditional_get(self):
        state = {}
        fetcher = Fetcher({"https://vercel.com/atom": RSS})
        items, failures = W.poll_sources(state, [source()], fetcher, NOW)
        self.assertEqual(failures, [])
        self.assertEqual([item["title"] for item in items], ["Queues GA", "Old thing"])
        # Unchanged: 304 via the stored validators.
        fetcher.pages["https://vercel.com/atom"] = lambda headers: {"status": 304, "body": "", "url": "", "etag": None, "lastModified": None}
        items, _ = W.poll_sources(state, [source()], fetcher, NOW)
        self.assertEqual(items, [])
        self.assertEqual(fetcher.calls[-1][1], {"If-None-Match": '"e1"', "If-Modified-Since": "Mon, 20 Oct 2026 00:00:00 GMT"})
        # A new entry appears.
        fetcher.pages["https://vercel.com/atom"] = RSS.replace("<item>", "<item><title>Brand new</title><guid>n</guid></item><item>", 1)
        items, _ = W.poll_sources(state, [source()], fetcher, NOW)
        self.assertEqual([item["title"] for item in items], ["Brand new"])
        self.assertTrue(items[0]["id"].startswith("changelog:vercel-changelog:"))

    def test_skip_title_and_failures_are_isolated(self):
        state = {}
        fetcher = Fetcher({"https://github.com/x.atom": ATOM})
        items, failures = W.poll_sources(state, [source(id="codex", url="https://github.com/x.atom", skipTitle="alpha"),
                                                 source(id="gone", url="https://gone.example/feed")], fetcher, NOW)
        self.assertEqual([item["title"] for item in items], ["v2"])
        self.assertEqual(len(failures), 1)
        self.assertEqual(state["feeds"]["gone"]["status"], "failed")

    def test_html_link_entries_read_the_article_description(self):
        fetcher = Fetcher({"https://www.anthropic.com/news": LINKS,
                           "https://www.anthropic.com/news/claude-new-thing": ARTICLE})
        items, _ = W.poll_sources({}, [source(id="anthropic-news", kind="html-links", url="https://www.anthropic.com/news",
                                              pattern=r"^/news/[a-z0-9]+(?:-[a-z0-9]+)+$")], fetcher, NOW)
        self.assertEqual(items[0]["title"], "Linked article")
        self.assertIn("What the article says.", items[0]["summary"])


class BookmarkTests(unittest.TestCase):
    def test_inbox_dedupes_by_seen_ids_and_enriches_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            inbox = Path(tmp)
            (inbox / "a.json").write_text(json.dumps([
                {"id": "2112241006104244584", "author": "michellechen", "text": "introducing clairic", "links": ["https://t.co/abc"]},
                {"id": "not-a-tweet"},
                {"id": "2112130582226378886", "author": "DavidKPiano", "text": "state machines for agents"}]))
            candidates, files = W.bookmarks_from_inbox(inbox)
            self.assertEqual([item["tweetId"] for item in candidates], ["2112241006104244584", "2112130582226378886"])
            self.assertEqual(files, [inbox / "a.json"])
        state = {"bookmarks": {"seen": ["2112130582226378886"]}}
        fresh = W.new_bookmarks(state, candidates)
        self.assertEqual([item["tweetId"] for item in fresh], ["2112241006104244584"])
        self.assertEqual(state["bookmarks"]["sinceId"], "2112241006104244584")
        item = W.enrich_bookmark(fresh[0], Fetcher({"https://t.co/abc": ARTICLE}))
        self.assertEqual(item["linked"]["title"], "Linked article")
        self.assertIn("What the article says.", item["summary"])

    def test_composio_is_skipped_without_credentials_and_parses_bookmarks(self):
        self.assertEqual(W.bookmarks_from_composio({}), [])
        def poster(url, body, headers, timeout=30):
            self.assertTrue(url.endswith("/tools/execute/TWITTER_BOOKMARKS_BY_USER"))
            self.assertEqual(body["connected_account_id"], "ca_1")
            return 200, {"successful": True, "data": {"data": [
                {"id": "2110400343301382614", "author_id": "9", "text": "Expand Fetch",
                 "entities": {"urls": [{"expanded_url": "https://expand.dev/fetch"}, {"expanded_url": "https://x.com/a/status/1"}]}}],
                "includes": {"users": [{"id": "9", "username": "TimSuchanek"}]}, "meta": {}}}
        items = W.bookmarks_from_composio({"SIGNALS_COMPOSIO_API_KEY": "k", "SIGNALS_COMPOSIO_X_ACCOUNT": "ca_1"}, poster)
        self.assertEqual(items[0]["author"], "TimSuchanek")
        self.assertEqual(items[0]["links"], ["https://expand.dev/fetch"])

    def test_composio_failure_raises(self):
        with self.assertRaises(RuntimeError):
            W.bookmarks_from_composio({"SIGNALS_COMPOSIO_API_KEY": "k", "SIGNALS_COMPOSIO_X_ACCOUNT": "ca"},
                                      lambda *a, **k: (200, {"successful": False, "error": "no connected account"}))


class ClassifyTests(unittest.TestCase):
    def test_classify_reads_typed_answers_and_cost(self):
        verdict = W.classify({"sourceName": "s", "category": "c", "title": "t", "summary": "x"}, "key",
                             lambda url, body, headers, timeout=30: (200, jev_answer()))
        self.assertEqual(verdict["action"], "adopt")
        self.assertAlmostEqual(verdict["costUsd"], 0.000021)
        self.assertTrue(W.card_worthy(verdict))
        self.assertFalse(W.card_worthy({**verdict, "action": "ignore"}))
        self.assertFalse(W.card_worthy({**verdict, "score": 0.3}))
        self.assertFalse(W.card_worthy({**verdict, "actionP": 0.3}))

    def test_classify_rejects_off_contract_answers(self):
        bad = jev_answer()
        bad["answers"]["action"]["choice"] = "steal"
        with self.assertRaises(RuntimeError):
            W.classify({"sourceName": "s", "category": "c", "title": "t"}, "k", lambda *a, **k: (200, bad))
        with self.assertRaises(RuntimeError):
            W.classify({"sourceName": "s", "category": "c", "title": "t"}, "k", lambda *a, **k: (402, {}))


class RunTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.inbox = self.dir / "inbox"
        self.inbox.mkdir()
        # An ephemeral Ed25519 pair from node, which CI and Gem both have.
        keys = subprocess.run(["node", "-e", "const c=require('node:crypto');const k=c.generateKeyPairSync('ed25519');"
                               "process.stdout.write(JSON.stringify({pem:k.privateKey.export({type:'pkcs8',format:'pem'}),"
                               "pub:k.publicKey.export({type:'spki',format:'pem'})}))"],
                              capture_output=True, text=True, check=True, timeout=20)
        pair = json.loads(keys.stdout)
        pem, self.public_pem = pair["pem"], pair["pub"]
        self.summer = {"origin": "https://summer.example", "keyId": "gem-outcome", "pem": pem}

    def tearDown(self):
        self.tmp.cleanup()

    def run_once(self, poster, brain, env=None, **kwargs):
        fetcher = Fetcher({"https://vercel.com/atom": RSS, "https://t.co/abc": ARTICLE})
        kwargs.setdefault("triage", lambda since: {"status": "ok", "since": since})
        return W.run(self.dir / "state.json", env={"AI_GATEWAY_API_KEY": "k", **(env or {})}, sources=[source()],
                     inbox=self.inbox, fetcher=fetcher, poster=poster, put=brain, summer=self.summer, now=NOW, **kwargs)

    def test_end_to_end_stores_everything_and_sends_signed_capped_cards(self):
        (self.inbox / "x.json").write_text(json.dumps([
            {"id": "2112241006104244584", "author": "michellechen", "text": "introducing clairic", "links": ["https://t.co/abc"]},
            {"id": "2112130582226378886", "author": "DavidKPiano", "text": "state machines for agents"}]))
        poster = Poster({"Queues GA": jev_answer("adopt", 0.9), "clairic": jev_answer("borrow", 0.7),
                         "state machines": jev_answer("borrow", 0.65)})
        brain = Brain()
        result = self.run_once(poster, brain, env={"SIGNALS_CARDS_PER_DAY": "2"})
        self.assertEqual((result["changelogNew"], result["bookmarksNew"], result["classified"]), (2, 2, 4))
        self.assertEqual(result["stored"], 4)
        self.assertIn("signals/x-bookmarks/2112241006104244584", brain.pages)
        self.assertIn("signals/digest/2026-10-20", brain.pages)
        self.assertIn("**card**", brain.pages["signals/digest/2026-10-20"])
        page = brain.pages["signals/x-bookmarks/2112241006104244584"]
        self.assertIn('verdict: "borrow"', page)
        self.assertIn("## Linked content", page)
        self.assertEqual(len(result["cardsQueued"]), 2)  # capped at 2; best scores first
        self.assertEqual(result["delivery"]["delivered"], 2)
        self.assertAlmostEqual(result["jevSpentTodayUsd"], 4 * 0.000021)
        self.assertFalse((self.inbox / "x.json").exists())
        pushes = [call for call in poster.calls if call[0].startswith("https://summer.example")]
        self.assertEqual(pushes[0][0], "https://summer.example" + W.SUMMER_ROUTE)
        body = pushes[0][1]
        self.assertEqual((body["action"], body["schema"]), ("adopt", W.SUMMER_SCHEMA))
        unsigned = {key: value for key, value in body.items() if key != "signature"}
        message = f"{W.SUMMER_SCHEMA}\0{W.capacity_limit.canonical(unsigned)}"
        verified = subprocess.run(["node", "-e", "const c=require('node:crypto');let d='';process.stdin.on('data',x=>d+=x).on('end',()=>{"
                                   "const j=JSON.parse(d);process.stdout.write(String(c.verify(null,Buffer.from(j.m,'base64'),"
                                   "j.pub,Buffer.from(j.s,'base64url'))))})"],
                                  input=json.dumps({"m": base64.b64encode(message.encode()).decode(), "pub": self.public_pem,
                                                    "s": body["signature"].removeprefix("ed25519=")}),
                                  capture_output=True, text=True, check=True, timeout=20)
        self.assertEqual(verified.stdout, "true")
        # Second run: nothing new, nothing re-sent.
        again = self.run_once(poster, brain)
        self.assertEqual((again["changelogNew"], again["bookmarksNew"], again["cardsQueued"]), (0, 0, []))

    def test_budget_exhaustion_keeps_items_pending_and_unclassified_pages(self):
        brain = Brain()
        result = self.run_once(Poster(), brain, env={"SIGNALS_JEV_DAILY_BUDGET_USD": "0"})
        self.assertEqual((result["classified"], result["pending"], result["stored"]), (0, 2, 2))
        self.assertTrue(all("unclassified" in body for slug, body in brain.pages.items() if "changelog" in slug))
        later = W.run(self.dir / "state.json", env={"AI_GATEWAY_API_KEY": "k"}, sources=[source()], inbox=self.inbox,
                      fetcher=Fetcher({"https://vercel.com/atom": lambda h: {"status": 304, "body": "", "url": "",
                                                                              "etag": None, "lastModified": None}}),
                      poster=Poster(), put=brain, summer=self.summer, now=NOW + 7200,
                      triage=lambda since: {"status": "ok"})
        self.assertEqual((later["classified"], later["pending"]), (2, 0))

    def test_failed_gbrain_writes_stay_pending_with_their_verdict(self):
        poster = Poster({"Queues GA": jev_answer("adopt", 0.9)})
        down = lambda slug, title, body: (False, "FileNotFoundError: gbrain")
        result = self.run_once(poster, down)
        self.assertEqual((result["status"], result["stored"], result["pending"], result["cardsQueued"]), ("failed", 0, 2, []))
        self.assertEqual(result["verdicts"]["adopt"], 1)
        self.assertEqual(result["top"][0]["title"], "Queues GA")
        jev_calls = sum(1 for call in poster.calls if call[0] == W.JEV_URL)
        brain = Brain()
        later = W.run(self.dir / "state.json", env={"AI_GATEWAY_API_KEY": "k"}, sources=[source()], inbox=self.inbox,
                      fetcher=Fetcher({"https://vercel.com/atom": lambda h: {"status": 304, "body": "", "url": "",
                                                                              "etag": None, "lastModified": None}}),
                      poster=poster, put=brain, summer=self.summer, now=NOW + 3600,
                      triage=lambda since: {"status": "ok"})
        self.assertEqual((later["status"], later["stored"], later["pending"], later["classified"]), ("ok", 2, 0, 0))
        self.assertEqual(sum(1 for call in poster.calls if call[0] == W.JEV_URL), jev_calls)
        self.assertEqual(len(later["cardsQueued"]), 1)

    def test_store_bound_lands_card_candidates_first_and_keeps_the_rest(self):
        original = W.MAX_STORE_PER_RUN
        W.MAX_STORE_PER_RUN = 1
        try:
            brain = Brain()
            result = self.run_once(Poster({"Old thing": jev_answer("clone", 0.9)}), brain)
        finally:
            W.MAX_STORE_PER_RUN = original
        self.assertEqual((result["stored"], result["pending"]), (1, 1))
        self.assertEqual([slug for slug in brain.pages if "changelog" in slug], ["signals/changelog/vercel-changelog/65c74c15a686"])
        self.assertEqual(len(result["cardsQueued"]), 1)
        state = json.loads((self.dir / "state.json").read_text())
        self.assertEqual(state["pending"][0]["title"], "Queues GA")
        self.assertEqual(state["pending"][0]["verdict"]["action"], "ignore")

    def test_triage_runs_after_stored_pages_and_fails_open(self):
        result = self.run_once(Poster(), Brain())
        self.assertEqual(result["triage"], {"status": "ok", "since": "2026-10-20T00:00:00Z"})
        self.assertEqual(W.triage_signals("x", runner=lambda *a, **k: (_ for _ in ()).throw(FileNotFoundError())),
                         {"status": "unavailable", "error": "FileNotFoundError"})
        done = subprocess.CompletedProcess([], 0, '{"scanned": 4, "actionable": 1, "reviews": [{"signal": "s"}]}', "")
        self.assertEqual(W.triage_signals("x", runner=lambda *a, **k: done),
                         {"status": "ok", "scanned": 4, "actionable": 1, "reviews": 1})
        self.assertEqual(W.triage_signals("x", runner=lambda *a, **k: subprocess.CompletedProcess([], 2, "", "")),
                         {"status": "failed", "exit": 2})
        original = W.shutil.which
        W.shutil.which = lambda name: None
        try:
            self.assertEqual(W.triage_signals("x"), {"status": "not-installed"})
        finally:
            W.shutil.which = original

    def test_undeployed_summer_route_keeps_cards_in_outbox(self):
        poster = Poster({"Queues GA": jev_answer("adopt", 0.9)}, summer_status=404)
        result = self.run_once(poster, Brain())
        self.assertEqual((result["delivery"]["delivered"], result["delivery"]["kept"]), (0, 1))
        state = json.loads((self.dir / "state.json").read_text())
        self.assertEqual(len(state["outbox"]), 1)
        poster.summer_status = 202
        delivered = W.deliver(state, self.summer, poster, NOW + 60)
        self.assertEqual(delivered["delivered"], 1)
        self.assertEqual(state["outbox"], [])

    def test_unconfigured_summer_and_dry_run(self):
        result = W.run(self.dir / "s.json", env={}, sources=[source()], inbox=self.inbox,
                       fetcher=Fetcher({"https://vercel.com/atom": RSS}), poster=Poster(), put=Brain(), summer=None,
                       now=NOW, dry_run=True)
        self.assertEqual((result["changelogNew"], result["classified"], result["stored"]), (2, 0, 0))
        self.assertFalse((self.dir / "s.json").exists())
        state = {"outbox": [{"queuedAt": NOW, "body": {}}]}
        self.assertEqual(W.deliver(state, None, Poster(), NOW)["statuses"], ["summer-unconfigured"])

    def test_tick_schedules_at_most_once_per_interval(self):
        spawned = []
        first = W.tick(self.dir, spawn=lambda *a, **k: spawned.append((a, k)), now=NOW, environ={"AI_GATEWAY_API_KEY": "k"})
        second = W.tick(self.dir, spawn=lambda *a, **k: spawned.append((a, k)), now=NOW + 60, environ={})
        self.assertEqual((first["status"], second["status"], len(spawned)), ("scheduled", "current", 1))
        self.assertEqual(spawned[0][0][0][-3:], ["run", "--state", str(self.dir / "signal-watch.json")])
        self.assertFalse(first["viaDoppler"])

    def test_tick_wraps_the_run_in_scoped_doppler_without_a_gateway_key(self):
        spawned = []
        original = W.shutil.which
        W.shutil.which = lambda name: "/usr/bin/doppler"
        try:
            result = W.tick(self.dir, spawn=lambda *a, **k: spawned.append((a, k)), now=NOW,
                            environ={"SIGNALS_DOPPLER_DIR": str(self.dir)})
        finally:
            W.shutil.which = original
        self.assertTrue(result["viaDoppler"])
        self.assertEqual(spawned[0][0][0][:3], ["doppler", "run", "--"])
        self.assertEqual(spawned[0][1]["cwd"], str(self.dir))


if __name__ == "__main__":
    unittest.main()
