"""Deterministic coverage for the YC channel catalog and public captions (JOV-14457)."""
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("yc_corpus", ROOT / "scripts/lanes/yc_corpus.py")
yc = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(yc)
yt = yc.yc_youtube

EMPTY_FEED = '<feed xmlns="http://www.w3.org/2005/Atom"></feed>'
TRACK = "https://www.youtube.com/api/timedtext?v=abc123&lang=en"
ASR_TRACK = "https://www.youtube.com/api/timedtext?v=abc123&lang=en&kind=asr"
WATCH = ('<script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":'
         + json.dumps([{"baseUrl": ASR_TRACK, "languageCode": "en", "kind": "asr"},
                       {"baseUrl": TRACK, "languageCode": "en"}]) + '}}};</script>')
JSON3 = json.dumps({"events": [{"segs": [{"utf8": "Pick a hard problem."}]}, {"tStartMs": 1},
                               {"segs": [{"utf8": "Then "}, {"utf8": "talk to users."}]}]})


def playlist_page(items, token=None):
    page = {"items": [{"snippet": {"title": title, "publishedAt": "2024-01-01T00:00:00Z", "description": "About " + title,
                                   "resourceId": {"videoId": video_id}}} for video_id, title in items]}
    return json.dumps({**page, **({"nextPageToken": token} if token else {})})


class Fetch:
    def __init__(self, routes):
        self.routes, self.calls = routes, []

    def __call__(self, url, headers=None):
        self.calls.append(url)
        for prefix, response in self.routes.items():
            if url.startswith(prefix):
                if isinstance(response, Exception):
                    raise response
                return {"status": 200, "body": response, "etag": None, "lastModified": None}
        raise AssertionError(url)


class CatalogTest(unittest.TestCase):
    def test_no_key_reports_needs_key_and_fetches_nothing(self):
        fetch = Fetch({})
        videos, state = yt.refresh_catalog({}, fetch, 1_000.0, None)
        self.assertEqual((videos, state["status"], fetch.calls), ([], "needs-key", []))

    def test_lists_every_upload_across_pages_then_caches_for_a_week(self):
        first = playlist_page([("a1", "Startup School: pricing"), ("p0", "Private video")], token="T2")
        second = playlist_page([("b2", "Lightcone: hiring")])
        pages = iter([first, second])
        calls = []

        def paged(url, headers=None):
            calls.append(url)
            return {"status": 200, "body": next(pages)}

        videos, state = yt.refresh_catalog({}, paged, 1_000.0, "k")
        self.assertEqual([video["id"] for video in videos], ["a1", "b2"])
        self.assertIn("pageToken=T2", calls[1])
        self.assertEqual((state["status"], state["count"]), ("ok", 2))
        again, cached = yt.refresh_catalog(state, Fetch({}), 1_000.0 + 3600, "k")
        self.assertEqual((again, cached), (videos, state))

    def test_failure_keeps_the_last_list_and_never_echoes_the_key(self):
        previous = {"videos": [{"id": "a1", "title": "Old"}], "fetchedAt": 0}
        fetch = Fetch({yt.PLAYLIST_API: urllib.error.HTTPError("u", 403, "Forbidden", None, None)})
        videos, state = yt.refresh_catalog(previous, fetch, yt.CATALOG_TTL_S + 1, "secret-key")
        self.assertEqual(videos, previous["videos"])
        self.assertEqual(state["status"], "failed: HTTPError")
        self.assertNotIn("secret-key", json.dumps(state))


    def test_without_a_key_the_public_playlist_page_lists_the_newest_uploads(self):
        data = {"contents": {"twoColumnBrowseResultsRenderer": {"tabs": [{"tabRenderer": {"content": {"items": [
            {"playlistVideoRenderer": {"videoId": "n1", "title": {"runs": [{"text": "Lightcone: "}, {"text": "AI agents"}]}}},
            {"playlistVideoRenderer": {"videoId": "n2", "title": {"simpleText": "Startup School: launch"}}},
            {"playlistVideoRenderer": {"videoId": "n1", "title": {"simpleText": "dupe"}}}]}}}]}}}
        page = f"<script>var ytInitialData = {json.dumps(data)};</script>"
        url = f"https://www.youtube.com/playlist?list={yt.UPLOADS_PLAYLIST}"
        previous = {"videos": [{"id": "old", "title": "Older upload"}], "fetchedAt": 0}
        videos, state = yt.refresh_catalog(previous, Fetch({url: page}), yt.CATALOG_TTL_S + 1, None,
                                           lambda *_: True, {})
        self.assertEqual([(video["id"], video["title"]) for video in videos],
                         [("old", "Older upload"), ("n1", "Lightcone: AI agents"), ("n2", "Startup School: launch")])
        self.assertEqual(state["status"], "keyless-newest-100")
        denied = Fetch({})
        _, state = yt.refresh_catalog({}, denied, 1.0, None, lambda *_: False, {})
        self.assertEqual((state["status"], denied.calls), ("needs-key: playlist page robots-denied", []))


class CaptionTest(unittest.TestCase):
    source = yt.feed_entry("abc123", "YC talk", "Y Combinator", None, None, "", ["startup-operations"])

    def test_prefers_the_published_track_and_keeps_the_whole_text(self):
        fetch = Fetch({yt.watch_url("abc123"): WATCH, TRACK + "&fmt=json3": JSON3})
        source, status = yt.with_captions(self.source, fetch, lambda *_: True, {}, sleep=lambda _: None)
        self.assertEqual(status, "ok")
        self.assertEqual(source["transcript"], "Pick a hard problem. Then talk to users.")
        self.assertEqual(source["transcriptProvenance"], "youtube-public-captions")

    def test_robots_denial_of_the_track_stops_before_fetching_it(self):
        fetch = Fetch({yt.watch_url("abc123"): WATCH})
        _, status = yt.with_captions(self.source, fetch, lambda url, *_: "timedtext" not in url, {}, sleep=lambda _: None)
        self.assertEqual((status, fetch.calls), ("robots-denied", [yt.watch_url("abc123")]))

    def test_missing_tracks_and_throttling_are_reported_not_raised(self):
        none = Fetch({yt.watch_url("abc123"): "<html>no captions</html>"})
        self.assertEqual(yt.with_captions(self.source, none, lambda *_: True, {})[1], "unavailable")
        throttled = Fetch({yt.watch_url("abc123"): urllib.error.HTTPError("u", 429, "Too Many", None, None)})
        self.assertEqual(yt.with_captions(self.source, throttled, lambda *_: True, {})[1], "throttled")

    def test_api_key_comes_from_env_or_the_lane_config_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "youtube.env"
            path.write_text("# lane key\nexport YOUTUBE_DATA_API_KEY='from-file'\n")
            self.assertEqual(yt.api_key({}, path), "from-file")
            self.assertEqual(yt.api_key({"YOUTUBE_DATA_API_KEY": " env "}, path), "env")
            self.assertIsNone(yt.api_key({}, Path(tmp) / "missing.env"))


class RefreshWithChannelTest(unittest.TestCase):
    def routes(self, extra=None):
        return {yc.LIBRARY_SITEMAP: "<urlset></urlset>", yc.YOUTUBE_FEED: EMPTY_FEED, yc.BLOG_FEED: EMPTY_FEED,
                **{seed: '<meta property="og:title" content="YC advice">' for seed in yc.SEEDS},
                yt.PLAYLIST_API: playlist_page([("abc123", "Startup School: talk to users")]), **(extra or {})}

    def run_refresh(self, fetch, allowed=lambda *_: True, limit=40):
        writes = []
        with tempfile.TemporaryDirectory() as tmp, patch.object(yt.time, "sleep", lambda _: None):
            state = Path(tmp) / "yc.json"
            result = yc.refresh(state, limit=limit, fetch=fetch, allowed=allowed, now=1_797_000_000,
                                put=lambda slug, title, body: (writes.append((slug, body)) or True, None),
                                youtube_key="k")
            return result, writes, json.loads(state.read_text())

    def test_channel_video_is_written_once_with_its_public_transcript(self):
        fetch = Fetch(self.routes({yt.watch_url("abc123"): WATCH, TRACK + "&fmt=json3": JSON3}))
        result, writes, state = self.run_refresh(fetch)
        page = next(body for slug, body in writes if slug == yc.SOURCE_PREFIX + "abc123")
        self.assertEqual(result["status"], "ok")
        self.assertIn("## Transcript\n\nPick a hard problem. Then talk to users.", page)
        self.assertIn('"youtube-public-captions"', page)
        self.assertEqual(state["documents"][yt.watch_url("abc123")]["captions"], "ok")
        self.assertEqual(state["youtubeCatalog"]["count"], 1)

    def test_robots_denied_captions_still_index_metadata_and_stop_asking(self):
        fetch = Fetch(self.routes())
        _, writes, state = self.run_refresh(fetch, allowed=lambda url, *_: "youtube.com" not in url)
        page = next(body for slug, body in writes if slug == yc.SOURCE_PREFIX + "abc123")
        self.assertIn("About Startup School: talk to users", page)
        self.assertEqual(state["documents"][yt.watch_url("abc123")]["captions"], "robots-denied")
        self.assertNotIn(yt.watch_url("abc123"), fetch.calls)

    def test_without_caption_budget_new_videos_wait_for_a_later_run(self):
        fetch = Fetch(self.routes())
        with patch.object(yt, "CAPTION_BUDGET", 0):
            _, writes, state = self.run_refresh(fetch)
        self.assertNotIn(yc.SOURCE_PREFIX + "abc123", [slug for slug, _ in writes])
        self.assertNotIn(yt.watch_url("abc123"), state["documents"])


if __name__ == "__main__":
    unittest.main()
