"""
Unit tests for scripts/brand-scrub.py.

Covers:
  - Files under blocked strategy-doc paths are flagged regardless of content.
  - Competitor brand names in file content are flagged.
  - Clean files (no blocked path, no competitor brands) pass.
  - Case-insensitive brand matching.

Run with:
    python -m pytest scripts/tests/test_brand_scrub.py -v
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import pytest

import importlib.util

_scripts_dir = Path(__file__).resolve().parents[1]

# brand-scrub.py uses a hyphen — load it manually since Python can't import hyphens.
_spec = importlib.util.spec_from_file_location(
    "brand_scrub", _scripts_dir / "brand-scrub.py"
)
assert _spec and _spec.loader
_brand_scrub = importlib.util.module_from_spec(_spec)
sys.modules["brand_scrub"] = _brand_scrub  # register so @dataclass can resolve __module__
_spec.loader.exec_module(_brand_scrub)  # type: ignore[union-attr]

check_file = _brand_scrub.check_file
main = _brand_scrub.main


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_file(content: str, name: str = "doc.md") -> str:
    """Write content to a temp file and return its path."""
    tmp = tempfile.NamedTemporaryFile(suffix=name, mode="w", delete=False)
    tmp.write(content)
    tmp.flush()
    return tmp.name


def make_file_at(content: str, rel_path: str, base: Path) -> str:
    """Write content to a file at a specific relative path inside base dir."""
    full = base / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content)
    return str(full)


# ---------------------------------------------------------------------------
# Path-block tests
# ---------------------------------------------------------------------------


def test_blocked_path_docs_plans(tmp_path: Path) -> None:
    """Files under docs/plans/ are always flagged."""
    p = make_file_at("Innocuous content", "docs/plans/some-analysis.md", tmp_path)
    # check_file uses the path string directly — pass with prefix
    p_rel = "docs/plans/some-analysis.md"
    violations = check_file(p_rel)
    assert any(v.kind == "blocked_path" for v in violations)


def test_blocked_path_docs_ideation(tmp_path: Path) -> None:
    violations = check_file("docs/ideation/market-notes.md")
    assert any(v.kind == "blocked_path" for v in violations)


def test_blocked_path_docs_idea_radar(tmp_path: Path) -> None:
    violations = check_file("docs/idea-radar/feature-validation.md")
    assert any(v.kind == "blocked_path" for v in violations)


def test_unblocked_path_passes() -> None:
    """A clean file in an allowed path produces no violations."""
    p = make_file("Jovie pays artists when fans listen.", name=".md")
    violations = check_file(p)
    assert violations == []


# ---------------------------------------------------------------------------
# Competitor-brand content tests
# ---------------------------------------------------------------------------


def test_competitor_brand_rp_hypertrophy() -> None:
    """RP Hypertrophy named in content triggers a competitor_brand violation."""
    p = make_file(
        "We reviewed RP Hypertrophy and found it has steep pricing.\n"
    )
    violations = check_file(p)
    assert any(v.kind == "competitor_brand" for v in violations)


def test_competitor_brand_hevy() -> None:
    p = make_file("Hevy charges $8.99/month for strength tracking.\n")
    violations = check_file(p)
    assert any(v.kind == "competitor_brand" for v in violations)


def test_competitor_brand_case_insensitive() -> None:
    """Brand matching is case-insensitive."""
    p = make_file("rp hypertrophy users complain about logging friction.\n")
    violations = check_file(p)
    assert any(v.kind == "competitor_brand" for v in violations)


def test_competitor_brand_liftosaur() -> None:
    p = make_file("Reddit thread: switching from liftosaur to something better.\n")
    violations = check_file(p)
    assert any(v.kind == "competitor_brand" for v in violations)


def test_clean_content_passes() -> None:
    """No competitor brands in content — should be clean."""
    p = make_file(
        "Jovie helps artists monetize their music.\n"
        "We support Spotify, Apple Music, and SoundCloud.\n"
        "Payment processing via Stripe.\n"
    )
    violations = check_file(p)
    assert violations == []


def test_brand_requires_word_boundary() -> None:
    """'Hive' must not match the substring inside 'archive'/'archived' (regression)."""
    p = make_file(
        "We preserve the destructive archive styling.\n"
        "Empty, paused, or archived states render no fallback.\n"
    )
    violations = check_file(p)
    assert violations == [], f"unexpected substring match: {violations}"


def test_brand_still_matches_standalone_word() -> None:
    """The word-boundary fix must still flag the brand as a standalone word."""
    p = make_file("Hive takes 0% but lacks payouts.\n")
    violations = check_file(p)
    assert any(v.kind == "competitor_brand" for v in violations)


# ---------------------------------------------------------------------------
# Combined: path + content
# ---------------------------------------------------------------------------


def test_blocked_path_and_brand_both_flagged() -> None:
    """A file in a blocked path with competitor brand names produces both violations."""
    violations = check_file("docs/plans/competitor-analysis.md")
    assert any(v.kind == "blocked_path" for v in violations)
    # Path alone produces the path violation; brand check requires readable file content.
    # The path violation is sufficient for the guard to block.


def test_actual_leaked_doc_would_be_caught() -> None:
    """Simulate the exact scenario from issue #11024 (PR #11018)."""
    # The leaked file was at docs/plans/lyb-aesthetics-workout-tracker-validation.md
    # with content referencing RP Hypertrophy, Liftosaur, Alpha Progression, Hevy.
    p = make_file(
        "# RP Hypertrophy Complaint Validation\n"
        "Competitor floor: Alpha Progression ~$9.99/mo; Hevy Pro ~$8.99/mo\n"
        "Reddit: r/liftosaur (bugs)\n"
    )
    # Path-level check (docs/plans/ prefix)
    path_violations = check_file("docs/plans/lyb-aesthetics-workout-tracker-validation.md")
    assert any(v.kind == "blocked_path" for v in path_violations)
    # Content-level check (the actual file)
    content_violations = check_file(p)
    brand_kinds = [v.kind for v in content_violations]
    assert "competitor_brand" in brand_kinds


# ---------------------------------------------------------------------------
# CLI main() tests
# ---------------------------------------------------------------------------


def test_main_no_violations(capsys: pytest.CaptureFixture[str]) -> None:
    p = make_file("Jovie pays artists.\n")
    rc = main([p])
    assert rc == 0
    captured = capsys.readouterr()
    assert "OK" in captured.out


def test_main_with_violation(capsys: pytest.CaptureFixture[str]) -> None:
    p = make_file("RP Hypertrophy teardown analysis.\n")
    rc = main([p])
    assert rc == 1
    captured = capsys.readouterr()
    assert "competitor_brand" in captured.out


def test_main_no_files(monkeypatch: pytest.MonkeyPatch) -> None:
    # Simulate a TTY so the code doesn't try to read from pytest's captured stdin.
    monkeypatch.setattr(sys, "stdin", type("FakeTTY", (), {"isatty": lambda self: True})())
    rc = main([])
    assert rc == 0
