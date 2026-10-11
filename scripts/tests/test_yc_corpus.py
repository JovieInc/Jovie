"""Deterministic coverage for the bounded YC -> GBrain refresher."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("yc_corpus", ROOT / "scripts/lanes/yc_corpus.py")
yc = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(yc)

LIBRARY_URL = "https://www.ycombinator.com/library/Iq-how-to-talk-to-users"
SITEMAP = f"<urlset><url><loc>{LIBRARY_URL}</loc></url><url><loc>https://www.ycombinator.com/library?categories=Pricing</loc></url></urlset>"
EMPTY_FEED = '<feed xmlns="http://www.w3.org/2005/Atom"></feed>'
LIBRARY_PAGE = '''<html><head>
<meta property="og:title" content="How to talk to users : YC Startup Library | Y Combinator">
<meta name="description" content="Interview current and potential users.">
</head><body>&quot;author&quot;:&quot;Gustaf Alströmer&quot;,
&quot;created_at&quot;:&quot;2023-02-09T22:44:27.000Z&quot;,
&quot;youtube_id&quot;:&quot;z1iF1c8w5Lg&quot;,
&quot;transcript&quot;:&quot;Talk to users about specific past behavior, not hypotheticals.&quot;</body></html>'''


class FakeFetch:
    def __init__(self, youtube_feed=EMPTY_FEED):
        self.calls = []
        self.youtube_feed = youtube_feed

    def __call__(self, url, headers=None):
        self.calls.append((url, headers or {}))
        if url == yc.LIBRARY_SITEMAP:
            body = SITEMAP
        elif url == yc.YOUTUBE_FEED:
            body = self.youtube_feed
        elif url == yc.BLOG_FEED:
            body = EMPTY_FEED
        elif url == LIBRARY_URL:
            body = LIBRARY_PAGE
        elif url in yc.SEEDS:
            body = '<meta property="og:title" content="YC advice"><meta name="description" content="Launch and talk to users">'
        else:
            raise AssertionError(url)
        return {"status": 200, "body": body, "etag": '"v1"', "lastModified": "Mon, 28 Sep 2026 00:00:00 GMT"}


class YcCorpusTest(unittest.TestCase):
    def test_incremental_refresh_writes_provenance_then_skips_unchanged_pages(self):
        fetch = FakeFetch()
        writes = []

        def put(slug, title, body):
            writes.append((slug, title, body))
            return True, None

        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "yc.json"
            first = yc.refresh(state, limit=10, fetch=fetch, put=put, allowed=lambda *_: True,
                               now=1_797_000_000)
            first_writes = len(writes)
            second = yc.refresh(state, limit=10, fetch=fetch, put=put, allowed=lambda *_: True,
                                now=1_797_086_400)
            saved = json.loads(state.read_text())
        self.assertEqual((first["status"], second["status"]), ("ok", "ok"))
        self.assertGreaterEqual(first_writes, len(yc.PLAYBOOKS) + 1)
        self.assertEqual(len(writes), first_writes, "content hashes prevent repeat GBrain writes")
        source = next(body for slug, _, body in writes if '"yc-library-embedded-transcript"' in body)
        self.assertIn('"bounded-source-index"', source)
        self.assertIn('"yc-library-embedded-transcript"', source)
        self.assertIn("link-and-bounded-excerpt", source)
        self.assertIn("source_content_hash", source)
        self.assertIn("Full source material remains at the linked publisher", source)
        playbook = next(body for slug, _, body in writes if slug == yc.PLAYBOOK_PREFIX + "users-first-customers")
        self.assertIn('"derived-playbook"', playbook)
        self.assertIn("## Counterexamples and limits", playbook)
        self.assertEqual(saved["lastRun"]["failures"], [])

    def test_library_transcript_deduplicates_the_same_youtube_catalog_entry(self):
        feed = '''<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
        <entry><yt:videoId>z1iF1c8w5Lg</yt:videoId><title>How to talk to users</title>
        <author><name>Y Combinator</name></author><published>2023-01-01T00:00:00Z</published>
        <updated>2023-01-02T00:00:00Z</updated></entry></feed>'''
        writes = []
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "yc.json"
            yc.refresh(state, limit=10, fetch=FakeFetch(feed),
                       put=lambda slug, title, body: (writes.append((slug, title, body)) or True, None),
                       allowed=lambda *_: True, now=1_797_000_000)
            saved = json.loads(state.read_text())
        video_slug = yc.SOURCE_PREFIX + "z1if1c8w5lg"
        self.assertEqual([slug for slug, _, _ in writes].count(video_slug), 1)
        self.assertEqual(saved["documents"]["https://www.youtube.com/watch?v=z1iF1c8w5Lg"]["status"], "duplicate")

    def test_gbrain_failure_is_visible_and_not_cached_as_success(self):
        fetch = FakeFetch()
        attempts = []

        def fail_put(slug, *_):
            attempts.append(slug)
            return False, "gbrain unavailable"

        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "yc.json"
            result = yc.refresh(state, limit=1, fetch=fetch,
                                put=fail_put,
                                allowed=lambda *_: True, now=1_797_000_000)
            first_attempts = len(attempts)
            yc.refresh(state, limit=1, fetch=fetch, put=fail_put,
                       allowed=lambda *_: True, now=1_797_003_600)
            saved = json.loads(state.read_text())
        self.assertEqual(result["status"], "failed")
        self.assertTrue(any("gbrain unavailable" in failure for failure in result["failures"]))
        self.assertEqual(saved["pageHashes"], {})
        self.assertGreater(len(attempts), first_attempts, "failed puts are retried rather than cached as unchanged")
        self.assertEqual(saved["nextAttemptAt"], 1_797_007_200)

    def test_tick_schedules_once_and_preserves_last_run_visibility(self):
        spawned = []
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            first = yc.tick(state, spawn=lambda args, **kwargs: spawned.append(args), now=100)
            second = yc.tick(state, spawn=lambda args, **kwargs: spawned.append(args), now=101)
        self.assertEqual(first["status"], "scheduled")
        self.assertEqual(second["status"], "current")
        self.assertEqual(len(spawned), 1)
        self.assertEqual(spawned[0][1:3], [str(ROOT / "scripts/lanes/yc_corpus.py"), "refresh"])


class GbrainPutTest(unittest.TestCase):
    """JOV-7715: a put is stored only when the read-back carries the page body."""

    def run_put(self, stored, put=None):
        calls = []

        def run(args, **kw):
            calls.append((args, kw))
            if args[1] == "put":
                if put:
                    raise put
                return subprocess.CompletedProcess(args, 0, "ok", "")
            if isinstance(stored, BaseException):
                raise stored
            return stored
        return yc.gbrain_put("s", "t", "---\ntitle: t\n---\n# T\n\nlast line\n", run=run), calls

    def test_read_back_decides(self):
        ok, calls = self.run_put(subprocess.CompletedProcess([], 0, "# T\n\nlast   line", ""))
        self.assertEqual(ok, (True, None))
        self.assertEqual(calls[0][0], ["gbrain", "put", "s"])
        self.assertIn("last line", calls[0][1]["input"])
        hung, _ = self.run_put(subprocess.CompletedProcess([], 0, "last line", ""),
                               put=subprocess.TimeoutExpired("gbrain", 120))
        self.assertTrue(hung[0])
        self.assertEqual(self.run_put(subprocess.CompletedProcess([], 0, "---\ntitle: t\n---\n", ""))[0],
                         (False, "gbrain read-back missing page body"))
        self.assertFalse(self.run_put(OSError("down"))[0][0])
        self.assertFalse(self.run_put(None, put=OSError("missing"))[0][0])


if __name__ == "__main__":
    unittest.main()
