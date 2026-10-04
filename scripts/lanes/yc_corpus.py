#!/usr/bin/env python3
"""Incrementally index public YC prior art into the existing GBrain store.

The refresher discovers the YC Library sitemap, relevant YC blog entries, and
the public YC YouTube feed. It stores provenance plus a bounded excerpt, never a
full mirrored article/transcript. A daily lane tick starts one bounded refresh;
content hashes prevent unchanged pages from being written or re-embedded.
"""
from __future__ import annotations

import argparse
import hashlib
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET

SCHEMA = "jovie.gbrain.external-prior-art/v1"
STATE_SCHEMA = "jovie.yc-corpus-refresh/v1"
SOURCE_PREFIX = "knowledge/external/yc/source/"
PLAYBOOK_PREFIX = "knowledge/external/yc/playbook/"
LIBRARY_SITEMAP = "https://www.ycombinator.com/library/sitemap.xml"
BLOG_FEED = "https://www.ycombinator.com/blog/posts.atom"
YOUTUBE_FEED = "https://www.youtube.com/feeds/videos.xml?channel_id=UCcefcZRL2oaA_uBNeo5UOWg"
DEFAULT_LIMIT = 40
REFRESH_INTERVAL_S = 24 * 60 * 60
EXCERPT_CHARS = 2400
USER_AGENT = "JovieKnowledgeBot/1.0 (+https://jov.ie)"

SEEDS = ("https://www.ycombinator.com/blog/startup-library",
         "https://www.ycombinator.com/blog/ycs-essential-startup-advice",
         "https://www.ycombinator.com/blog/startup-school-videos")

TOPICS = {
    "product-market-fit-retention": ("product market fit", "retention", "cohort"),
    "users-first-customers": ("talk to users", "first customer", "don't scale", "don’t scale"),
    "launch-mvp": ("launch", "minimum viable product", " mvp"),
    "pricing-unit-economics": ("pricing", "unit economics", "business model"),
    "growth-scaling": ("growth", "scaling", "scale your"),
    "founder-focus": ("focus", "priorit", "founder time", "fake work"),
    "hiring-team": ("hiring", "hire", "team growth"),
    "fundraising-runway": ("fundraising", "fundraise", "runway", "burn rate"),
    "b2b-sales": ("b2b", "enterprise sales", "outbound sales", "sales playbook"),
    "metrics-weekly-growth": ("metric", " kpi", "weekly growth"),
    "failure-modes": ("fail", "mistake", "time-waster", "distraction"),
}

PLAYBOOKS = (
    ("product-market-fit-retention", "Product-market fit and retention",
     "Growth is downstream of a product users repeatedly want.",
     "Use when retention is weak or growth is being proposed before durable pull is visible.",
     "Cohort shape, frequency, and market dynamics differ; current customer behavior overrides generic thresholds.",
     ("https://www.ycombinator.com/library/5z-the-real-product-market-fit", "https://www.ycombinator.com/library/LV-how-to-improve-cohort-retention"),
     "Which Jovie cohorts retain, why do they return, and what observed pull contradicts the generic pattern?"),
    ("users-first-customers", "Talk to users and win first customers",
     "Founders learn fastest through direct user contact and manual first-customer work.",
     "Use before automating acquisition or scaling a channel with little customer evidence.",
     "Regulated, safety-sensitive, or high-volume products may constrain manual delivery.",
     ("https://www.ycombinator.com/library/Iq-how-to-talk-to-users", "https://www.ycombinator.com/library/Ip-how-to-get-your-first-customers"),
     "Which artists have a burning problem, what did they do rather than say, and what can Jovie deliver manually?"),
    ("launch-mvp", "Launch timing and MVP scope",
     "Launch a small quantum of utility, then iterate from real use instead of polishing in isolation.",
     "Use when scope or launch timing is driven by completeness rather than a testable customer outcome.",
     "Trust, legal, payment, privacy, and irreversible-reputation surfaces need their real safety bar before launch.",
     ("https://www.ycombinator.com/library/Io-how-to-build-an-mvp", "https://www.ycombinator.com/library/Ir-the-best-way-to-launch-your-startup"),
     "What is Jovie's smallest safe useful outcome, who will use it now, and what must be true before exposure?"),
    ("pricing-unit-economics", "Pricing and unit economics",
     "Price against delivered value and verify that growth does not amplify structurally bad economics.",
     "Use before discounting, changing packaging, or buying growth.",
     "Willingness to pay, marginal costs, and strategic learning can justify temporary deviations when measured.",
     ("https://www.ycombinator.com/library/6h-startup-pricing-101", "https://www.ycombinator.com/blog/ycs-essential-startup-advice"),
     "What value does Jovie measurably create, what does one served artist cost, and which assumption lacks evidence?"),
    ("growth-scaling", "Growth versus premature scaling",
     "Scale only after users want the product; otherwise growth magnifies churn and waste.",
     "Use before headcount, infrastructure, or paid acquisition intended to accelerate demand.",
     "Capacity bottlenecks can require narrow anticipatory investment when demand evidence and rollback are explicit.",
     ("https://www.ycombinator.com/library/4p-before-growing-your-startup", "https://www.ycombinator.com/library/8s-startup-growth"),
     "Is Jovie demand- or capacity-constrained, which retention evidence proves it, and what would scaling amplify?"),
    ("founder-focus", "Founder time allocation and focus",
     "Early founders should concentrate on building, users, and the one or two metrics that express progress.",
     "Use when meetings, partnerships, frameworks, or parallel initiatives compete with the bottleneck.",
     "Fundraising can be survival-critical; phase and runway can override a generic build-only bias.",
     ("https://www.ycombinator.com/blog/ycs-essential-startup-advice", "https://www.ycombinator.com/library/8p-how-to-prioritize-features"),
     "What is Jovie's current bottleneck, which founder action changes it, and what higher-value work would be displaced?"),
    ("hiring-team", "Hiring and team growth",
     "Stay small before product pull; hire against a demonstrated bottleneck with unusually strong early people.",
     "Use before adding a role because workload feels broad or a candidate happens to be available.",
     "Runway, key-person risk, or a scarce capability can justify an earlier hire when the causal path is explicit.",
     ("https://www.ycombinator.com/library/4H-how-to-hire-your-first-engineer", "https://www.ycombinator.com/library/J2-inside-the-group-partner-lounge-don-t-make-these-hiring-mistakes"),
     "Which proven Jovie bottleneck needs a person, why can't automation or focus solve it, and what is the runway cost?"),
    ("fundraising-runway", "Fundraising and runway",
     "Run a focused raise, understand burn and dilution, then return attention to customers and product.",
     "Use when runway or financing is on the critical path.",
     "Jovie's phase-dependent capital canon governs when survival conflicts with generic investor-process advice.",
     ("https://www.ycombinator.com/library/4A-a-guide-to-seed-fundraising", "https://www.ycombinator.com/library/9k-how-to-calculate-burn-rate-runway-and-growth-rate"),
     "What is Jovie's verified runway, amount needed, clean-close probability, dilution, and founder-time cost?"),
    ("b2b-sales", "B2B sales and customer concentration",
     "Founder-led sales should discover a repeatable painful problem before a scaled sales organization.",
     "Use for outbound, enterprise deals, sales hiring, and concentration risk.",
     "A concentrated design partner can be rational when learning, revenue quality, dependency, and exit conditions are explicit.",
     ("https://www.ycombinator.com/library/LF-enterprise-sales-for-founders", "https://www.ycombinator.com/library/3O-why-big-deals-are-bad-for-startups"),
     "Is the buyer's pain urgent, can Jovie repeat the sale, and how much roadmap or revenue depends on one account?"),
    ("metrics-weekly-growth", "Metrics and weekly growth",
     "Choose a small number of outcome metrics and review movement weekly rather than rewarding activity.",
     "Use when priorities lack an explicit measurable customer or company outcome.",
     "Long-cycle or low-frequency products need leading indicators without confusing them for final outcomes.",
     ("https://www.ycombinator.com/library/9i-how-to-choose-a-metric-and-set-your-kpi", "https://www.ycombinator.com/library/KR-key-startup-metrics"),
     "Which Jovie metric best represents user value now, what moved it this week, and which metric is merely activity?"),
    ("failure-modes", "Founder failure modes and time-wasters",
     "Startups more often lose focus, cofounder alignment, or learning velocity than lose to a competitor.",
     "Use when work is status-driven, competitor-reactive, or detached from users and the bottleneck.",
     "Competitive, legal, security, or platform threats become material when current evidence says they do.",
     ("https://www.ycombinator.com/library/9u-why-do-startups-fail", "https://www.ycombinator.com/library/5l-how-not-to-fail"),
     "What evidence makes this real work for Jovie, what user learning results, and what failure mode are we avoiding?"),
)


def now_iso(now: float | None = None) -> str:
    return datetime.fromtimestamp(now or time.time(), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def compact(text: str, limit: int = EXCERPT_CHARS) -> str:
    return re.sub(r"\s+", " ", html.unescape(text or "")).strip()[:limit]


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def slug_token(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80] or content_hash(text)[:16]


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "nav", "header", "footer", "noscript"}:
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style", "nav", "header", "footer", "noscript"} and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def embedded_value(document: str, key: str) -> str | None:
    decoded = html.unescape(document)
    match = re.search(rf'"{re.escape(key)}":"((?:\\.|[^"\\])*)"', decoded)
    if not match:
        return None
    try:
        return json.loads(f'"{match.group(1)}"')
    except json.JSONDecodeError:
        return compact(match.group(1), 10_000)


def meta_value(document: str, key: str) -> str | None:
    patterns = (
        rf'<meta[^>]+(?:name|property)=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']+)',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:name|property)=["\']{re.escape(key)}["\']',
    )
    for pattern in patterns:
        match = re.search(pattern, document, re.I)
        if match:
            return compact(match.group(1), 1000)
    return None


def classify_topics(text: str) -> list[str]:
    lowered = text.lower()
    return [name for name, terms in TOPICS.items() if any(term in lowered for term in terms)] or ["startup-operations"]


def parse_html_source(url: str, document: str, retrieved_at: str) -> dict:
    scope = document
    if "/library/" in url:
        decoded = html.unescape(document)
        marker = decoded.find(f'"slug":"{urllib.parse.urlparse(url).path.rsplit("/", 1)[-1]}"')
        if marker >= 0:
            scope = decoded[marker:]
    title = meta_value(document, "og:title") or embedded_value(scope, "title") or "YC source"
    title = re.sub(r"\s*:\s*YC Startup Library.*$", "", title).strip()
    author = embedded_value(scope, "author") or meta_value(document, "author") or "Y Combinator"
    published = embedded_value(scope, "created_at") or meta_value(document, "article:published_time")
    youtube_id = embedded_value(scope, "youtube_id")
    transcript = embedded_value(scope, "transcript")
    extractor = TextExtractor()
    extractor.feed(document)
    fallback = meta_value(document, "description") or " ".join(extractor.parts)
    excerpt = compact(transcript or fallback)
    kind = "video" if youtube_id else ("library-article" if "/library/" in url else "blog-article")
    related = [f"https://www.youtube.com/watch?v={youtube_id}"] if youtube_id else []
    return {"url": url, "title": title, "author": author, "publishedAt": published,
            "updatedAt": None, "retrievedAt": retrieved_at, "contentType": kind,
            "transcriptProvenance": "yc-library-embedded-transcript" if transcript else "none",
            "youtubeId": youtube_id, "excerpt": excerpt, "relatedUrls": related,
            "tags": classify_topics(f"{title} {fallback[:2000]}")}


def render_source(source: dict) -> tuple[str, str, str]:
    identity = source.get("youtubeId") or urllib.parse.urlparse(source["url"]).path.rsplit("/", 1)[-1]
    slug = SOURCE_PREFIX + slug_token(identity or source["url"])
    stable_source = {key: value for key, value in source.items() if key != "retrievedAt"}
    values = {
        "schema": SCHEMA, "type": "external-prior-art-source", "record_kind": "bounded-source-index",
        "source_url": source["url"],
        "title": source["title"], "author_speaker": source["author"],
        "published_at": source.get("publishedAt") or "unknown", "updated_at": source.get("updatedAt") or "unknown",
        "retrieved_at": source["retrievedAt"], "content_type": source["contentType"],
        "transcript_provenance": source["transcriptProvenance"],
        "tags": ["yc", "external-prior-art", *source["tags"]], "topic_tags": source["tags"],
        "source_content_hash": content_hash(json.dumps(stable_source, sort_keys=True, ensure_ascii=False)),
        "copyright_storage": "link-and-bounded-excerpt",
    }
    frontmatter = "\n".join(f"{key}: {json.dumps(value, ensure_ascii=False)}" for key, value in values.items())
    links = [source["url"], *source.get("relatedUrls", [])]
    body = (f"---\n{frontmatter}\n---\n\n# {source['title']}\n\n## Provenance\n\n" +
            "\n".join(f"- {link}" for link in dict.fromkeys(links)) +
            f"\n\n## Bounded source excerpt\n\n{source['excerpt']}\n\n" +
            "Full source material remains at the linked publisher; this page is a bounded retrieval index.\n")
    return slug, source["title"], body


def render_playbook(item: tuple) -> tuple[str, str, str]:
    key, title, pattern, conditions, limits, sources, questions = item
    metadata = {"schema": SCHEMA, "type": "external-prior-art-playbook", "record_kind": "derived-playbook",
                "source_owner": "Y Combinator", "compiled_at": "2026-09-29",
                "tags": ["yc", "external-prior-art", key], "topic_tags": [key],
                "confidence": "medium", "source_urls": list(sources)}
    frontmatter = "\n".join(f"{name}: {json.dumps(value, ensure_ascii=False)}" for name, value in metadata.items())
    body = (f"---\n{frontmatter}\n---\n\n# {title}\n\n## Problem pattern\n\n{pattern}\n\n"
            f"## Applicability\n\n{conditions}\n\n## Counterexamples and limits\n\n{limits}\n\n"
            "## Source evidence\n\n" + "\n".join(f"- {source}" for source in sources) +
            f"\n\n## Jovie-specific questions\n\n{questions}\n\n"
            "This is a Jovie-derived playbook, not verbatim YC source material or unquestionable policy.\n")
    return PLAYBOOK_PREFIX + key, title, body


def fetch_url(url: str, headers: dict | None = None) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT,
                                                   "Accept": "text/html,application/atom+xml,application/xml,text/xml",
                                                   **(headers or {})})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return {"status": response.status, "body": response.read().decode("utf-8", "replace"),
                        "etag": response.headers.get("ETag"), "lastModified": response.headers.get("Last-Modified")}
        except urllib.error.HTTPError as error:
            if error.code == 304:
                return {"status": 304, "body": "", "etag": error.headers.get("ETag"),
                        "lastModified": error.headers.get("Last-Modified")}
            if error.code != 429 and error.code < 500 or attempt == 2:
                raise
            time.sleep(0.25 * (2 ** attempt))
    raise RuntimeError(f"fetch attempts exhausted for {url}")


def discover(fetch=fetch_url, warnings: list[str] | None = None) -> list[dict]:
    warnings = warnings if warnings is not None else []
    candidates = {url: {"url": url, "priority": 0} for url in SEEDS}
    sitemap = fetch(LIBRARY_SITEMAP)
    if sitemap["status"] != 200:
        raise RuntimeError(f"YC library sitemap returned {sitemap['status']}")
    for location in re.findall(r"<loc>([^<]+)</loc>", sitemap["body"]):
        url = html.unescape(location)
        if "/library/" in url and "?" not in url:
            candidates.setdefault(url, {"url": url, "priority": 2})
    try:
        feed = fetch(YOUTUBE_FEED)
    except Exception as error:
        warnings.append(f"youtube discovery: {type(error).__name__}: {error}")
        feed = {"status": 0, "body": ""}
    if feed["status"] == 200:
        root = ET.fromstring(feed["body"])
        ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
        for entry in root.findall("a:entry", ns):
            video_id = entry.findtext("yt:videoId", namespaces=ns)
            if not video_id:
                continue
            url = f"https://www.youtube.com/watch?v={video_id}"
            candidates[url] = {"url": url, "priority": 3, "feed": {
                "url": url, "title": entry.findtext("a:title", default="YC video", namespaces=ns),
                "author": entry.findtext("a:author/a:name", default="Y Combinator", namespaces=ns),
                "publishedAt": entry.findtext("a:published", namespaces=ns), "updatedAt": entry.findtext("a:updated", namespaces=ns),
                "contentType": "video", "transcriptProvenance": "unavailable-public-feed-metadata-only",
                "youtubeId": video_id, "excerpt": "Public YC YouTube catalog metadata; transcript was not available from the feed.",
                "relatedUrls": [], "tags": classify_topics(entry.findtext("a:title", default="", namespaces=ns)),
            }}
    try:
        blog = fetch(BLOG_FEED)
    except Exception as error:
        warnings.append(f"blog discovery: {type(error).__name__}: {error}")
        blog = {"status": 0, "body": ""}
    if blog["status"] == 200:
        root = ET.fromstring(blog["body"])
        ns = {"a": "http://www.w3.org/2005/Atom"}
        topic_terms = tuple(term for terms in TOPICS.values() for term in terms)
        for entry in root.findall("a:entry", ns):
            title = entry.findtext("a:title", default="", namespaces=ns)
            summary = entry.findtext("a:summary", default="", namespaces=ns)
            link = next((node.get("href") for node in entry.findall("a:link", ns) if node.get("rel") == "alternate"), None)
            if link and any(term in f"{title} {summary}".lower() for term in topic_terms):
                candidates.setdefault(link, {"url": link, "priority": 1})
    return list(candidates.values())


def robots_allowed(url: str, cache: dict, fetch=fetch_url) -> bool:
    parsed = urllib.parse.urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in cache:
        robots = fetch(origin + "/robots.txt")
        parser = urllib.robotparser.RobotFileParser()
        parser.set_url(origin + "/robots.txt")
        parser.parse(robots["body"].splitlines() if robots["status"] == 200 else ["User-agent: *", "Disallow: /"])
        cache[origin] = parser
    return cache[origin].can_fetch(USER_AGENT, url)


def gbrain_put(slug: str, title: str, body: str, run=subprocess.run) -> tuple[bool, str | None]:
    """Same contract as reason_lane.write_gbrain (JOV-7715): page on stdin (Gem's wrapper
    ignores `--content`), and stored only when a read-back contains the page's last line."""
    tail = next((" ".join(line.split()) for line in reversed(body.splitlines()) if line.strip()), "")
    try:
        run(["gbrain", "put", slug], input=body, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        pass
    except OSError as error:
        return False, f"{type(error).__name__}: {error}"
    try:
        stored = run(["gbrain", "get", slug], capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError) as error:
        return False, f"read-back {type(error).__name__}: {error}"
    if stored.returncode == 0 and tail and tail in " ".join((stored.stdout or "").split()):
        return True, None
    return False, "gbrain read-back missing page body"


def read_state(path: Path) -> dict:
    try:
        state = json.loads(path.read_text())
        return state if state.get("schema") == STATE_SCHEMA else {"schema": STATE_SCHEMA}
    except (OSError, ValueError):
        return {"schema": STATE_SCHEMA}


def write_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(state, indent=2, sort_keys=True))
    os.replace(temporary, path)


def refresh(state_path: Path, limit: int = DEFAULT_LIMIT, fetch=fetch_url, put=gbrain_put,
            allowed=robots_allowed, now: float | None = None) -> dict:
    now = now or time.time()
    retrieved_at = now_iso(now)
    state = read_state(state_path)
    documents = state.setdefault("documents", {})
    page_hashes = state.setdefault("pageHashes", {})
    canonical = state.setdefault("canonical", {})
    failures: list[str] = []
    changed = unchanged = skipped = 0
    try:
        candidates = discover(fetch, failures)
    except Exception as error:
        result = {"status": "failed", "at": retrieved_at, "changed": 0, "unchanged": 0,
                  "skipped": 0, "failures": [f"discovery: {type(error).__name__}: {error}"]}
        state["lastRun"] = result
        state["nextAttemptAt"] = now + 3600
        write_state(state_path, state)
        return result

    candidates.sort(key=lambda item: (documents.get(item["url"], {}).get("checkedAt", ""), item["priority"], item["url"]))
    robots: dict = {}
    for candidate in candidates[:max(1, limit)]:
        url = candidate["url"]
        previous = documents.get(url, {})
        try:
            if "feed" in candidate:
                source = {**candidate["feed"], "retrievedAt": retrieved_at}
                response = {"etag": None, "lastModified": None}
            else:
                if not allowed(url, robots, fetch):
                    documents[url] = {**previous, "checkedAt": retrieved_at, "status": "robots-denied"}
                    skipped += 1
                    continue
                headers = {}
                if previous.get("etag"):
                    headers["If-None-Match"] = previous["etag"]
                if previous.get("lastModified"):
                    headers["If-Modified-Since"] = previous["lastModified"]
                response = fetch(url, headers)
                if response["status"] == 304:
                    documents[url] = {**previous, "checkedAt": retrieved_at, "status": "unchanged"}
                    unchanged += 1
                    continue
                if response["status"] != 200:
                    raise RuntimeError(f"HTTP {response['status']}")
                source = parse_html_source(url, response["body"], retrieved_at)

            stable_source = {key: value for key, value in source.items() if key != "retrievedAt"}
            source_digest = content_hash(json.dumps(stable_source, sort_keys=True, ensure_ascii=False))
            if previous.get("sourceHash") == source_digest:
                documents[url] = {**previous, "checkedAt": retrieved_at, "status": "unchanged",
                                  "etag": response.get("etag"), "lastModified": response.get("lastModified")}
                unchanged += 1
                continue

            title_key = "title:" + slug_token(source["title"])
            keys = [title_key] + (["youtube:" + source["youtubeId"]] if source.get("youtubeId") else [])
            slug, title, body = render_source(source)
            existing = next((canonical[key] for key in keys if key in canonical), None)
            if existing and (existing["priority"] < candidate["priority"] or
                             (existing["priority"] == candidate["priority"] and existing["slug"] != slug)):
                documents[url] = {**previous, "checkedAt": retrieved_at, "status": "duplicate",
                                  "duplicateOf": existing["slug"], "sourceHash": source_digest,
                                  "etag": response.get("etag"), "lastModified": response.get("lastModified")}
                skipped += 1
                continue
            digest = content_hash(body)
            ok, error = (True, None) if page_hashes.get(slug) == digest else put(slug, title, body)
            if not ok:
                failures.append(f"{slug}: {error}")
            else:
                changed += page_hashes.get(slug) != digest
                unchanged += page_hashes.get(slug) == digest
                page_hashes[slug] = digest
                for key in keys:
                    canonical[key] = {"slug": slug, "priority": candidate["priority"]}
            documents[url] = {"checkedAt": retrieved_at, "status": "indexed" if ok else "gbrain-failed",
                              "etag": response.get("etag"), "lastModified": response.get("lastModified"),
                              "contentHash": digest, "slug": slug,
                              **({"sourceHash": source_digest} if ok else {})}
        except Exception as error:
            failures.append(f"{url}: {type(error).__name__}: {error}")
            documents[url] = {**previous, "checkedAt": retrieved_at, "status": "fetch-failed"}

    for item in PLAYBOOKS:
        slug, title, body = render_playbook(item)
        digest = content_hash(body)
        if page_hashes.get(slug) == digest:
            unchanged += 1
            continue
        ok, error = put(slug, title, body)
        if ok:
            page_hashes[slug] = digest
            changed += 1
        else:
            failures.append(f"{slug}: {error}")

    result = {"status": "failed" if failures else "ok", "at": retrieved_at, "changed": changed,
              "unchanged": unchanged, "skipped": skipped, "discovered": len(candidates), "failures": failures[:20]}
    state["lastRun"] = result
    state["nextAttemptAt"] = now + (3600 if failures else REFRESH_INTERVAL_S)
    write_state(state_path, state)
    return result


def tick(state_dir: Path, spawn=subprocess.Popen, now: float | None = None) -> dict:
    now = now or time.time()
    path = state_dir / "yc-corpus.json"
    state = read_state(path)
    if now < float(state.get("nextAttemptAt", 0)):
        return {"status": "current", "lastRun": state.get("lastRun"), "nextAttemptAt": state.get("nextAttemptAt")}
    state["scheduledAt"] = now_iso(now)
    state["nextAttemptAt"] = now + 3600
    write_state(path, state)
    try:
        spawn([sys.executable, str(Path(__file__)), "refresh", "--state", str(path)], stdin=subprocess.DEVNULL,
              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except Exception as error:
        state["lastRun"] = {"status": "failed", "at": now_iso(now),
                            "failures": [f"spawn: {type(error).__name__}: {error}"]}
        write_state(path, state)
        raise
    return {"status": "scheduled", "scheduledAt": state["scheduledAt"], "lastRun": state.get("lastRun")}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    command = sub.add_parser("refresh")
    command.add_argument("--state", type=Path, default=Path.home() / ".local/state/jovie-lanes/yc-corpus.json")
    command.add_argument("--max-documents", type=int, default=DEFAULT_LIMIT)
    args = parser.parse_args(argv)
    result = refresh(args.state, args.max_documents)
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
