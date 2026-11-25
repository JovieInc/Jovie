"""YC YouTube channel catalog and public captions for the YC corpus refresher (JOV-14457).

The channel's public RSS feed lists only the newest 15 uploads. The full upload list
comes from the YouTube Data API when YOUTUBE_DATA_API_KEY is in the lane environment
or in ~/.config/jovie-lanes/youtube.env; without it the catalog reports "needs-key"
and the refresher keeps working from the feed alone.

Captions are read the way a browser reads them: the watch page's published caption
tracks, each fetched only where youtube.com's robots.txt allows the address. There is
no sign-in, token or client spoofing, and no media is downloaded or re-hosted.
Transcripts are kept for internal retrieval only (yc_transcript).
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse

import yc_transcript

UPLOADS_PLAYLIST = "UUcefcZRL2oaA_uBNeo5UOWg"  # uploads playlist of channel UCcefcZRL2oaA_uBNeo5UOWg
PLAYLIST_API = "https://www.googleapis.com/youtube/v3/playlistItems"
CATALOG_TTL_S = 7 * 24 * 60 * 60
MAX_PAGES = 100  # 50 uploads a page
DESCRIPTION_CHARS = 1_000
CAPTION_BUDGET = 150  # caption fetches per run
CAPTION_RETRY_S = 14 * 24 * 60 * 60
CAPTION_DELAY_S = 1.0
FEED_EXCERPT = "Public YC YouTube catalog metadata; transcript was not available from the feed."


def watch_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def api_key(env=None, path: Path | None = None) -> str | None:
    env = os.environ if env is None else env
    if env.get("YOUTUBE_DATA_API_KEY", "").strip():
        return env["YOUTUBE_DATA_API_KEY"].strip()
    path = path or Path.home() / ".config" / "jovie-lanes" / "youtube.env"
    try:
        for line in path.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip().removeprefix("export ").strip() == "YOUTUBE_DATA_API_KEY" and value.strip():
                return value.strip().strip("'\"")
    except OSError:
        pass
    return None


def feed_entry(video_id: str, title: str, author: str, published: str | None, updated: str | None,
               description: str, tags: list[str]) -> dict:
    return {"url": watch_url(video_id), "title": title or "YC video", "author": author or "Y Combinator",
            "publishedAt": published, "updatedAt": updated, "contentType": "video",
            "transcriptProvenance": "unavailable-public-feed-metadata-only", "youtubeId": video_id,
            "excerpt": re.sub(r"\s+", " ", description or "").strip()[:2400] or FEED_EXCERPT,
            "relatedUrls": [], "tags": tags}


def playlist_page_videos(document: str) -> list[dict]:
    """Uploads listed on the public playlist page (about the newest 100), from its ytInitialData."""
    start = document.find("ytInitialData")
    start = document.find("{", start) if start >= 0 else -1
    try:
        data = json.JSONDecoder().raw_decode(document[start:])[0] if start >= 0 else {}
    except ValueError:
        return []
    found, stack = {}, [data]
    while stack:
        node = stack.pop()
        if isinstance(node, list):
            stack.extend(reversed(node))
        elif isinstance(node, dict):
            row = node.get("playlistVideoRenderer")
            if isinstance(row, dict) and row.get("videoId"):
                title = row.get("title") or {}
                text = title.get("simpleText") or "".join(run.get("text", "") for run in title.get("runs") or [])
                found.setdefault(row["videoId"], {"id": row["videoId"], "title": text, "publishedAt": None, "description": ""})
            else:
                stack.extend(reversed(list(node.values())))
    return list(found.values())


def keyless_catalog(previous: dict, fetch, now: float, allowed, robots: dict) -> tuple[list[dict], dict]:
    url = f"https://www.youtube.com/playlist?list={UPLOADS_PLAYLIST}"
    try:
        if not allowed(url, robots, fetch):
            return previous.get("videos", []), {**previous, "status": "needs-key: playlist page robots-denied", "checkedAt": now}
        page = fetch(url, {"Accept-Language": "en-US,en;q=0.9"})
        listed = playlist_page_videos(page["body"]) if page["status"] == 200 else []
    except Exception as error:
        return previous.get("videos", []), {**previous, "status": f"failed: {type(error).__name__}", "checkedAt": now}
    if not listed:
        return previous.get("videos", []), {**previous, "status": "needs-key: playlist page listed nothing", "checkedAt": now}
    merged = {video["id"]: video for video in [*previous.get("videos", []), *listed]}
    return list(merged.values()), {"status": "keyless-newest-100", "fetchedAt": now, "checkedAt": now,
                                   "count": len(merged), "videos": list(merged.values())}


def refresh_catalog(previous: dict, fetch, now: float, key: str | None = None, allowed=None,
                    robots: dict | None = None) -> tuple[list[dict], dict]:
    """Every public upload, re-listed at most weekly. A failure keeps the last good list visible.

    Without a Data API key, the public playlist page gives the newest ~100 uploads; older ones
    load only through YouTube's internal browse API, which robots.txt closes to crawlers."""
    videos = previous.get("videos", [])
    if videos and now - float(previous.get("fetchedAt", 0)) < CATALOG_TTL_S:
        return videos, previous
    if not key:
        if allowed is None:
            return videos, {**previous, "status": "needs-key", "checkedAt": now}
        return keyless_catalog(previous, fetch, now, allowed, robots if robots is not None else {})
    listed, token = [], ""
    try:
        for _ in range(MAX_PAGES):
            query = {"part": "snippet", "playlistId": UPLOADS_PLAYLIST, "maxResults": "50", "key": key}
            if token:
                query["pageToken"] = token
            response = fetch(f"{PLAYLIST_API}?{urllib.parse.urlencode(query)}", {"Accept": "application/json"})
            if response["status"] != 200:
                raise RuntimeError(f"playlistItems returned {response['status']}")
            page = json.loads(response["body"])
            for item in page.get("items", []):
                snippet = item.get("snippet", {})
                video_id = snippet.get("resourceId", {}).get("videoId")
                if video_id and snippet.get("title") not in {"Private video", "Deleted video"}:
                    listed.append({"id": video_id, "title": snippet.get("title", ""),
                                   "publishedAt": snippet.get("publishedAt"),
                                   "description": (snippet.get("description") or "")[:DESCRIPTION_CHARS]})
            token = page.get("nextPageToken") or ""
            if not token:
                break
    except Exception as error:  # the key travels in the query string, so name only the error type
        return videos, {**previous, "status": f"failed: {type(error).__name__}", "checkedAt": now}
    return listed, {"status": "ok", "fetchedAt": now, "checkedAt": now, "count": len(listed), "videos": listed}


def caption_tracks(document: str) -> list[dict]:
    marker = document.find('"captionTracks":')
    start = document.find("[", marker) if marker >= 0 else -1
    depth = 0
    for index in range(max(start, 0), len(document) if start >= 0 else 0):
        depth += {"[": 1, "]": -1}.get(document[index], 0)
        if depth == 0:
            try:
                tracks = json.loads(document[start:index + 1])
            except ValueError:
                return []
            return [track for track in tracks if isinstance(track, dict) and isinstance(track.get("baseUrl"), str)]
    return []


def pick_track(tracks: list[dict]) -> dict | None:
    english = [track for track in tracks if str(track.get("languageCode", "")).startswith("en")]
    manual = [track for track in english if track.get("kind") != "asr" and "kind=asr" not in track["baseUrl"]]
    return (manual or english or tracks or [None])[0]


def json3_text(body: str) -> str:
    events = json.loads(body).get("events", [])
    lines = ("".join(seg.get("utf8", "") for seg in event.get("segs") or []) for event in events)
    return " ".join(line.strip() for line in lines if line.strip())


def captions_due(previous: dict, now: float) -> bool:
    if previous.get("captions") in {None, "fetch-failed", "throttled"}:
        return True
    return previous.get("captions") != "ok" and now - float(previous.get("captionsCheckedAt", 0)) > CAPTION_RETRY_S


def with_captions(source: dict, fetch, allowed, robots: dict, sleep=time.sleep) -> tuple[dict, str]:
    """Return the source with its public transcript and a status for the run's bookkeeping."""
    url = source["url"]
    try:
        if not allowed(url, robots, fetch):
            return source, "robots-denied"
        page = fetch(url, {"Accept-Language": "en-US,en;q=0.9"})
        if page["status"] != 200:
            return source, "fetch-failed"
        track = pick_track(caption_tracks(page["body"]))
        if not track:
            return source, "unavailable"
        track_url = track["baseUrl"] + ("&" if "?" in track["baseUrl"] else "?") + "fmt=json3"
        if urllib.parse.urlparse(track_url).netloc not in {"www.youtube.com", "youtube.com"}:
            return source, "unavailable"
        if not allowed(track_url, robots, fetch):
            return source, "robots-denied"
        sleep(CAPTION_DELAY_S)
        response = fetch(track_url, {"Accept": "application/json"})
        text = yc_transcript.normalize(json3_text(response["body"])) if response["status"] == 200 and response["body"] else ""
    except urllib.error.HTTPError as error:
        return source, "throttled" if error.code == 429 else "fetch-failed"
    except (ValueError, RuntimeError, OSError):
        return source, "fetch-failed"
    if not text:
        return source, "unavailable"
    automatic = track.get("kind") == "asr" or "kind=asr" in track["baseUrl"]
    return {**source, "transcript": text, "excerpt": re.sub(r"\s+", " ", text)[:2400],
            "transcriptProvenance": "youtube-public-auto-captions" if automatic else "youtube-public-captions"}, "ok"
