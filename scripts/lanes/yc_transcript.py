"""Full-transcript handling for the YC corpus refresher (JOV-14457).

YC Library pages embed the whole transcript of each talk. Pages keep it in the
private GBrain store so Summer and the lanes can retrieve the actual argument,
not a 2,400-character teaser. Transcripts are for internal retrieval only: the
page keeps its publisher links and is never republished or mirrored publicly.
"""
from __future__ import annotations

import re

# Bump when the page layout changes: every stored page is re-fetched and re-rendered,
# bypassing ETag/304 and source-hash short-circuits, BACKFILL_LIMIT pages per run.
RENDER = 2
BACKFILL_LIMIT = 200
MAX_CHARS = 250_000
PARAGRAPH_CHARS = 1_500
STORAGE = "private-internal-transcript"
FOOTER = ("Transcript kept for Jovie's internal retrieval only; the source stays at the linked "
          "publisher and is never republished.")


def normalize(text: str | None) -> str:
    """Whitespace-clean transcript text with paragraph breaks the semantic chunker can use."""
    if not text:
        return ""
    lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in text.replace("\r", "\n").split("\n")]
    joined = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    if "\n" not in joined and len(joined) > PARAGRAPH_CHARS:
        paragraphs, current = [], ""
        for sentence in re.split(r"(?<=[.!?])\s+", joined):
            if current and len(current) + len(sentence) > PARAGRAPH_CHARS:
                paragraphs.append(current)
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        joined = "\n\n".join([*paragraphs, current] if current else paragraphs)
    if len(joined) > MAX_CHARS:
        cut = joined.rfind("\n\n", 0, MAX_CHARS)
        joined = joined[:cut if cut > MAX_CHARS // 2 else MAX_CHARS].rstrip()
    return joined


def section(transcript: str) -> str:
    return f"## Transcript\n\n{transcript}\n\n" if transcript else ""


def needs_render(previous: dict) -> bool:
    """A page written by an older renderer is re-fetched even if the publisher says 304."""
    return bool(previous.get("slug")) and previous.get("render") != RENDER


def effective_limit(limit: int, stale: int) -> int:
    return max(limit, min(BACKFILL_LIMIT, limit + stale)) if stale else limit
