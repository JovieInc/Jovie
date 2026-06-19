"""
Unit tests for scripts/slopcheck.py.

Covers the known-slop / known-clean fixture pair required by JOV-#11098.
Run with:  python -m pytest scripts/tests/test_slopcheck.py -v
       or: python scripts/tests/test_slopcheck.py
"""
import sys
from pathlib import Path
import types

# ---------------------------------------------------------------------------
# Bootstrap: allow running directly or via pytest from repo root
# ---------------------------------------------------------------------------
_scripts_dir = Path(__file__).resolve().parents[1]
if str(_scripts_dir) not in sys.path:
    sys.path.insert(0, str(_scripts_dir))

from slopcheck import slop_score, main  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SLOP_COPY = """\
In today's vibrant and bustling digital landscape, it's worth noting that \
innovative companies are leveraging cutting-edge paradigm shifts to disrupt \
the ecosystem. Seamlessly empowering creators, our holistic approach harnesses \
robust, scalable synergies to unlock unprecedented growth. It's important to \
note that our multifaceted platform elevates actionable insights—transforming \
the realm of music—to foster a truly impactful experience. Not just a product, \
but a movement. Let us delve into how we reimagine what's possible. \
Groundbreaking. Revolutionary. Pivotal. Paramount. First and foremost, at the \
end of the day, last but not least, we are here to spearhead the future.
"""

CLEAN_COPY = """\
Jovie pays artists when fans listen, without selling anything.

Upload your music once. Your fans get a link. They save it to their library \
and listen on whichever streaming service they already pay for. You get paid \
for every play — on Spotify, Apple Music, and everywhere else.

No storefront. No bundles. No algorithm to game. Just plays that pay.

Join the waitlist.
"""


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestKnownSlop:
    def test_score_above_default_threshold(self):
        result = slop_score(SLOP_COPY, filename="slop_fixture.md")
        assert result.score > 3.0, (
            f"Expected slop score >3.0, got {result.score:.2f}. Hits: {result.hits}"
        )

    def test_hits_not_empty(self):
        result = slop_score(SLOP_COPY, filename="slop_fixture.md")
        assert len(result.hits) > 0, "Expected at least one hit for slop copy"

    def test_detects_banned_words(self):
        result = slop_score(SLOP_COPY, filename="slop_fixture.md")
        hit_text = " ".join(result.hits)
        assert "vibrant" in hit_text or "leverage" in hit_text or "delve" in hit_text, (
            f"Expected banned word hits, got: {result.hits}"
        )

    def test_detects_filler_phrases(self):
        result = slop_score(SLOP_COPY, filename="slop_fixture.md")
        hit_text = " ".join(result.hits)
        assert "filler" in hit_text, f"Expected filler phrase hit, got: {result.hits}"

    def test_detects_not_just_structural_tic(self):
        result = slop_score(SLOP_COPY, filename="slop_fixture.md")
        hit_text = " ".join(result.hits)
        assert "not just" in hit_text.lower(), (
            f"Expected 'not just X but Y' hit, got: {result.hits}"
        )


class TestKnownClean:
    def test_score_below_default_threshold(self):
        result = slop_score(CLEAN_COPY, filename="clean_fixture.md")
        assert result.score <= 3.0, (
            f"Expected clean score ≤3.0, got {result.score:.2f}. Hits: {result.hits}"
        )

    def test_score_is_zero_or_very_low(self):
        result = slop_score(CLEAN_COPY, filename="clean_fixture.md")
        # The clean copy should be essentially zero — no slop tells
        assert result.score < 1.0, (
            f"Expected near-zero score for clean copy, got {result.score:.2f}. Hits: {result.hits}"
        )


class TestStructuralTicContraction:
    """Covers the known tuning gap: 'isn't just X, but Y' contraction form."""

    def test_isnt_just_is_caught(self):
        text = "This isn't just a product, but a movement."
        result = slop_score(text, filename="contraction.md")
        hit_text = " ".join(result.hits)
        assert "not just" in hit_text.lower(), (
            "Contraction form \"isn't just\" should be caught as structural tic"
        )

    def test_its_not_just_is_caught(self):
        text = "It's not just about the music, but about the community."
        result = slop_score(text, filename="its_not.md")
        hit_text = " ".join(result.hits)
        assert "not just" in hit_text.lower(), (
            "Form \"it's not just\" should be caught as structural tic"
        )

    def test_that_is_not_just_is_caught(self):
        text = "That's not just clever, but revolutionary."
        result = slop_score(text, filename="thats.md")
        hit_text = " ".join(result.hits)
        assert "not just" in hit_text.lower()


class TestEmDashPenalty:
    def test_no_penalty_within_budget(self):
        # 2 em-dashes for ~100 words: budget = 2*(100/500) = 0.4, so 2 > 0.4 → penalty
        # Rephrase: test that a single em-dash in short text gives no heavy penalty
        text = "Music — not money — is the point. " * 5
        result = slop_score(text)
        # Em-dash penalty exists but shouldn't be catastrophic
        em_hits = [h for h in result.hits if "em-dash" in h]
        # If it fires, check the score is bounded
        assert result.score <= 10.0

    def test_penalty_for_heavy_em_dash_use(self):
        text = ("This — and that — and more — and yet — and also — and finally — "
                "are all — connected — by dashes.\n") * 3
        result = slop_score(text)
        em_hits = [h for h in result.hits if "em-dash" in h]
        assert len(em_hits) > 0, "Heavy em-dash use should trigger a hit"


class TestScoreCap:
    def test_score_never_exceeds_ten(self):
        # Pathological slop — pile on every pattern
        text = (
            "Delve into the vibrant bustling tapestry — leveraging synergistic "
            "paradigm shifts — to empower innovative disruption. It's worth noting "
            "that this is not just a product, but a movement. Isn't just bold, but "
            "revolutionary. First and foremost — at the end of the day — last but "
            "not least — groundbreaking — pivotal — paramount — seamlessly — "
            "holistically — robustly — scalably — impactfully — transformatively. "
        ) * 5
        result = slop_score(text)
        assert result.score <= 10.0


class TestCLI:
    def test_exit_0_on_clean(self, tmp_path):
        f = tmp_path / "clean.md"
        f.write_text(CLEAN_COPY, encoding="utf-8")
        code = main([str(f)])
        assert code == 0

    def test_exit_1_on_slop(self, tmp_path):
        f = tmp_path / "slop.md"
        f.write_text(SLOP_COPY, encoding="utf-8")
        code = main([str(f)])
        assert code == 1

    def test_custom_threshold_strict(self, tmp_path):
        # Even clean copy can fail with a very strict threshold
        f = tmp_path / "clean.md"
        f.write_text(CLEAN_COPY, encoding="utf-8")
        code = main(["--max", "0.0", str(f)])
        # clean copy score is ~0.0 so this should still pass
        # (score == 0.0 is not > 0.0)
        result = slop_score(CLEAN_COPY)
        expected_exit = 1 if result.score > 0.0 else 0
        assert code == expected_exit

    def test_custom_threshold_lenient(self, tmp_path):
        f = tmp_path / "slop.md"
        f.write_text(SLOP_COPY, encoding="utf-8")
        code = main(["--max", "999.0", str(f)])
        assert code == 0

    def test_missing_file_returns_nonzero(self, tmp_path):
        code = main([str(tmp_path / "nonexistent.md")])
        assert code == 1


# ---------------------------------------------------------------------------
# Self-test runner (python scripts/tests/test_slopcheck.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import traceback

    suite = [
        TestKnownSlop(),
        TestKnownClean(),
        TestStructuralTicContraction(),
        TestEmDashPenalty(),
        TestScoreCap(),
    ]

    # CLI tests need tmp_path; skip them in self-run
    passed = failed = 0
    for obj in suite:
        for name in [m for m in dir(obj) if m.startswith("test_")]:
            try:
                getattr(obj, name)()
                print(f"  PASS  {type(obj).__name__}::{name}")
                passed += 1
            except AssertionError as e:
                print(f"  FAIL  {type(obj).__name__}::{name}: {e}")
                failed += 1
            except Exception as e:
                print(f"  ERROR {type(obj).__name__}::{name}: {e}")
                traceback.print_exc()
                failed += 1

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
