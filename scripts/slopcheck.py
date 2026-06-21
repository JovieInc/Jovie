#!/usr/bin/env python3
"""
slopcheck.py — Deterministic slop detector for AI-generated business copy.

Ported from NousResearch/autonovel evaluate.py (slop_score, no-LLM scorer)
generalized from fiction → business copy. Zero API keys, zero network calls.

Usage:
    python scripts/slopcheck.py file.md [file2.md ...]
    echo "some copy" | python scripts/slopcheck.py -
    python scripts/slopcheck.py --max 2.0 marketing/homepage.md

Exit 0 = all files below threshold. Exit 1 = at least one file above threshold.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# ---------------------------------------------------------------------------
# Word/phrase ban lists
# ---------------------------------------------------------------------------

# Tier-1 banned words: near-certain AI tells in business copy
BANNED_WORDS: list[str] = [
    "delve",
    "tapestry",
    "vibrant",
    "bustling",
    "leverage",
    "synergy",
    "synergize",
    "synergistic",
    "paradigm",
    "disrupt",
    "disruption",
    "disruptive",
    "revolutionize",
    "game-changing",
    "game changer",
    "innovative",
    "cutting-edge",
    "cutting edge",
    "bleeding-edge",
    "bleeding edge",
    "seamless",
    "seamlessly",
    "ecosystem",
    "holistic",
    "robust",
    "scalable",
    "impactful",
    "transformative",
    "empower",
    "empowers",
    "empowering",
    "actionable",
    "utilize",
    "utilizes",
    "utilizing",
    "multifaceted",
    "nuanced",
    "foster",
    "fosters",
    "fostering",
    "spearhead",
    "spearheads",
    "spearheading",
    "unlock",
    "unlocks",
    "unlocking",
    "reimagine",
    "reimagines",
    "reimagining",
    "elevate",
    "elevates",
    "elevating",
    "harness",
    "harnessing",
    "pivotal",
    "paramount",
    "groundbreaking",
    "landmark",
    "unprecedented",
    "revolutionary",
    "landscape",
    "realm",
    "domain",
    "sphere",
    "crucial",
    "vital",
    "essential",
    "comprehensive",
    "dive deep",
    "dive into",
    "delves into",
    "intricate",
    "fascinating",
    "intriguing",
]

# Tier-2 filler phrases — worth noting, important to note, etc.
FILLER_PHRASES: list[str] = [
    "it's worth noting",
    "it is worth noting",
    "worth noting that",
    "it's important to note",
    "it is important to note",
    "importantly",
    "notably",
    "needless to say",
    "it goes without saying",
    "of course",
    "certainly",
    "absolutely",
    "definitely",
    "undoubtedly",
    "without a doubt",
    "it should be noted",
    "it is essential to understand",
    "a key point to understand",
    "first and foremost",
    "last but not least",
    "at the end of the day",
    "in conclusion",
    "in summary",
    "in the realm of",
    "in the landscape of",
    "in the world of",
    "as a matter of fact",
    "in actual fact",
    "the fact of the matter",
    "all in all",
    "on that note",
]

# Structural tic: "not just X, but Y" and contraction forms (JOV-#11098 gap)
_NOT_JUST_PATTERN = re.compile(
    r"\b(?:not|isn'?t|it'?s not|that'?s not|we'?re not|this is not)"
    r"\s+just\b",
    re.IGNORECASE,
)

# Em-dash patterns (— or --)
_EM_DASH_PATTERN = re.compile(r"—|--")

# Preprocessing patterns to strip non-prose regions before scoring
_FRONTMATTER_PATTERN = re.compile(r"^---.*?---\s*", re.DOTALL)
_FENCED_CODE_PATTERN = re.compile(r"```.*?```", re.DOTALL)
_INLINE_CODE_PATTERN = re.compile(r"`[^`\n]+`")


def _strip_code(text: str) -> str:
    """Remove frontmatter, fenced code blocks, and inline code from markdown text."""
    text = _FRONTMATTER_PATTERN.sub("", text)
    text = _FENCED_CODE_PATTERN.sub("", text)
    text = _INLINE_CODE_PATTERN.sub("", text)
    return text

# Sentence splitter (rough, good enough for penalty scoring)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


# ---------------------------------------------------------------------------
# Penalty weights
# ---------------------------------------------------------------------------

WEIGHT_BANNED_WORD = 0.5       # per unique banned word hit
WEIGHT_FILLER_PHRASE = 0.4     # per filler phrase hit
WEIGHT_NOT_JUST = 0.8          # per "not just X but Y" hit
WEIGHT_EM_DASH = 0.2           # per em-dash above threshold (>2 per 500 words)
WEIGHT_UNIFORM_LENGTH = 1.0    # if sentence length CV < 0.25

EM_DASH_BUDGET = 2             # allowed per 500 words before penalty kicks in
UNIFORM_CV_THRESHOLD = 0.25    # coefficient of variation below this = penalty


# ---------------------------------------------------------------------------
# Core scorer
# ---------------------------------------------------------------------------

@dataclass
class SlopResult:
    filename: str
    score: float
    hits: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return True  # filled in by caller

    def as_report(self, threshold: float) -> str:
        status = "PASS" if self.score <= threshold else "FAIL"
        lines = [f"{self.filename}: {self.score:.1f}  [{status}]"]
        for h in self.hits:
            lines.append(f"  • {h}")
        return "\n".join(lines)


def _word_count(text: str) -> int:
    return len(text.split())


def slop_score(text: str, filename: str = "<stdin>") -> SlopResult:
    """
    Score text for AI slop tells. Returns SlopResult with 0–10 penalty and hits list.
    """
    text = _strip_code(text)
    lower = text.lower()
    hits: list[str] = []
    penalty = 0.0

    # 1. Banned words
    for word in BANNED_WORDS:
        pattern = re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE)
        count = len(pattern.findall(text))
        if count:
            penalty += WEIGHT_BANNED_WORD
            hits.append(f"banned word '{word}' ×{count}")

    # 2. Filler phrases
    for phrase in FILLER_PHRASES:
        count = lower.count(phrase.lower())
        if count:
            penalty += WEIGHT_FILLER_PHRASE
            hits.append(f"filler '{phrase}' ×{count}")

    # 3. "not just X, but Y" structural tic (including contraction forms)
    matches = _NOT_JUST_PATTERN.findall(text)
    if matches:
        penalty += WEIGHT_NOT_JUST * len(matches)
        hits.append(f"structural tic 'not just X but Y' ×{len(matches)}")

    # 4. Em-dash overload
    wc = max(_word_count(text), 1)
    em_dashes = len(_EM_DASH_PATTERN.findall(text))
    budget_per_text = EM_DASH_BUDGET * (wc / 500)
    excess = max(0, em_dashes - budget_per_text)
    if excess > 0:
        em_penalty = WEIGHT_EM_DASH * excess
        penalty += em_penalty
        hits.append(f"em-dash overload: {em_dashes} dashes for {wc} words (budget ≤{budget_per_text:.1f})")

    # 5. Uniform sentence length (low coefficient of variation)
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(text) if len(s.strip()) > 10]
    if len(sentences) >= 4:
        lengths = [len(s.split()) for s in sentences]
        mean = sum(lengths) / len(lengths)
        if mean > 0:
            variance = sum((l - mean) ** 2 for l in lengths) / len(lengths)
            std = variance ** 0.5
            cv = std / mean
            if cv < UNIFORM_CV_THRESHOLD:
                penalty += WEIGHT_UNIFORM_LENGTH
                hits.append(
                    f"uniform sentence length: CV={cv:.2f} < {UNIFORM_CV_THRESHOLD} "
                    f"(mean {mean:.0f} words/sentence)"
                )

    return SlopResult(filename=filename, score=min(penalty, 10.0), hits=hits)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _read_file(path: str) -> tuple[str, str]:
    if path == "-":
        return sys.stdin.read(), "<stdin>"
    p = Path(path)
    return p.read_text(encoding="utf-8", errors="replace"), str(p)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Deterministic slop detector for AI-generated copy.",
        epilog="Exit 0 = all files pass. Exit 1 = at least one file above --max.",
    )
    parser.add_argument(
        "files",
        nargs="+",
        metavar="FILE",
        help="Files to check, or - for stdin",
    )
    parser.add_argument(
        "--max",
        type=float,
        default=3.0,
        metavar="N",
        help="Maximum penalty score before failure (default: 3.0)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Only print failing files",
    )
    args = parser.parse_args(argv)

    any_fail = False
    for path in args.files:
        try:
            text, name = _read_file(path)
        except (OSError, IOError) as e:
            print(f"ERROR reading {path}: {e}", file=sys.stderr)
            any_fail = True
            continue

        result = slop_score(text, filename=name)
        failed = result.score > args.max

        if failed or not args.quiet:
            print(result.as_report(args.max))

        if failed:
            any_fail = True

    return 1 if any_fail else 0


if __name__ == "__main__":
    sys.exit(main())
