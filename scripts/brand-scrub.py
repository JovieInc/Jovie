#!/usr/bin/env python3
"""
brand-scrub.py — Block competitor analysis & private strategy docs from public repos.

Enforces two rules:
  1. Files under blocked strategy-doc paths (docs/plans/, docs/ideation/) must not
     be added to this public repo without explicit review.
  2. Known competitor / third-party brand names must not appear in public files.

Allowed exceptions (not flagged):
  - Vendor names (Stripe, Vercel, Neon, Resend, Clerk, Sentry, etc.)
  - DSP / music-platform names (Spotify, Apple Music, SoundCloud, etc.)
  - Social-network / platform names (Instagram, TikTok, Twitter/X, YouTube, etc.)

Usage:
    python scripts/brand-scrub.py file.md [file2.md ...]

Exit 0 = no violations.
Exit 1 = at least one violation found (CI should block merge).

See .claude/rules/security.md → "competitor docs" and GitHub issue #11024.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# ---------------------------------------------------------------------------
# Blocked strategy-doc paths (relative to repo root, checked by file path)
# ---------------------------------------------------------------------------

BLOCKED_PATH_PREFIXES: list[str] = [
    "docs/plans/",
    "docs/ideation/",
    "docs/idea-radar/",
    "docs/competitor/",
    "docs/competitive/",
    "docs/market-research/",
    "docs/private/",
]

# ---------------------------------------------------------------------------
# Competitor / third-party brand names to flag in file content
# ---------------------------------------------------------------------------

COMPETITOR_BRANDS: list[str] = [
    # Fitness / workout tracker competitors
    "RP Hypertrophy",
    "Renaissance Periodization",
    "Alpha Progression",
    "Hevy",
    "Mesostrength",
    "Liftosaur",
    "Dr. Mike",
    "MyoAdapt",
    "Strong app",
    "Jefit",
    "FitBod",
    "Fitbod",
    # Music / creator economy competitors
    "DistroKid",
    "TuneCore",
    "CD Baby",
    "RouteNote",
    "Amuse",
    "Hive",
    "Stem Music",
    "Beatchain",
    "Feature.fm",
    "Submithub",
    "SubmitHub",
    "Groover",
    "Audiomack",
    "Soundcharts",
    "Chartmetric",
    "Spotify for Artists",  # platform API - OK; competitor *analysis* context is flagged via path
]

# Regex: case-insensitive whole-word / phrase match.
# \b boundaries prevent substring false positives (e.g. 'Hive' inside 'archive').
_BRAND_PATTERNS: list[re.Pattern[str]] = [
    re.compile(rf"\b{re.escape(b)}\b", re.IGNORECASE) for b in COMPETITOR_BRANDS
]


@dataclass
class Violation:
    path: str
    kind: str  # "blocked_path" | "competitor_brand"
    detail: str
    line: int = 0


def check_file(path: str) -> list[Violation]:
    violations: list[Violation] = []

    # Rule 1: blocked strategy-doc path
    norm = path.replace("\\", "/")
    for prefix in BLOCKED_PATH_PREFIXES:
        if norm.startswith(prefix) or norm == prefix.rstrip("/"):
            violations.append(
                Violation(
                    path=path,
                    kind="blocked_path",
                    detail=(
                        f"Strategy / competitor-analysis docs belong in a PRIVATE repo, "
                        f"not under '{prefix}' in a public repo. "
                        f"See issue #11024."
                    ),
                )
            )
            break  # one blocked-path violation per file is enough

    # Rule 2: competitor brand names in content
    try:
        text = Path(path).read_text(encoding="utf-8", errors="replace")
    except (OSError, IsADirectoryError):
        return violations

    for lineno, line in enumerate(text.splitlines(), start=1):
        for pattern, brand in zip(_BRAND_PATTERNS, COMPETITOR_BRANDS):
            if pattern.search(line):
                violations.append(
                    Violation(
                        path=path,
                        kind="competitor_brand",
                        detail=f"competitor brand '{brand}' found",
                        line=lineno,
                    )
                )
                break  # one brand violation per line is enough

    return violations


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "files",
        nargs="*",
        help="Files to check (reads from stdin if '-' or empty with pipe).",
    )
    args = parser.parse_args(argv)

    files: list[str] = args.files
    if not files and not sys.stdin.isatty():
        files = [f.rstrip("\n") for f in sys.stdin if f.strip()]

    if not files:
        print("brand-scrub: no files to check — pass file paths as arguments.")
        return 0

    all_violations: list[Violation] = []
    for f in files:
        all_violations.extend(check_file(f))

    if not all_violations:
        print(f"brand-scrub: OK — {len(files)} file(s) checked, no violations.")
        return 0

    print(f"brand-scrub: {len(all_violations)} violation(s) found:\n")
    for v in all_violations:
        loc = f":{v.line}" if v.line else ""
        print(f"  [{v.kind}] {v.path}{loc} — {v.detail}")

    print(
        "\nMove competitor-analysis / strategy docs to a PRIVATE repo before landing."
        "\nSee .claude/rules/security.md and issue #11024 for the governance rule."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
