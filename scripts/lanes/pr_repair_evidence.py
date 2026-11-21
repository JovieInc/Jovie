"""Pure body-section parsing and explicit provenance repair for lane evidence."""
from __future__ import annotations

import re
from pr_body_markup import red_section_bounds

def with_locking_pr(body: str, locking_pr: int) -> str:
    """Fill an explicit placeholder without replacing citations, comments or notes."""
    updated = body
    if type(locking_pr) is not int or locking_pr < 1:
        raise ValueError("locking PR requires an explicit positive PR number")
    lines = updated.split("\n")
    bounds = red_section_bounds(lines, re.compile(r"^#{1,6}\s+Locked areas\s*$", re.I))
    if bounds is None:
        updated = updated.rstrip("\n") + f"\n\n## Locked areas\n\nLocking PR: #{locking_pr}\n"
    else:
        start, end = bounds
        original = "\n".join(lines[start + 1:end])
        content = re.sub(r"<!--[\s\S]*?-->", "", original).strip()
        # Fill explicit template declarations, preserving existing citations and
        # unrelated notes/footer text. Never replace text inside hidden comments.
        placeholder = r"(?:[-*][ \t]*)?(?:none|n/?a|not applicable|todo|tbd)[.!]?"
        if not content:
            updated = "\n".join(lines[:end] + [f"Locking PR: #{locking_pr}", ""] + lines[end:])
        elif (re.fullmatch(placeholder, content.splitlines()[0].strip(), re.I)
              and not re.search(r"\b(?:GBrain|Locking PR)\s*:", content, re.I)):
            parts = re.split(r"(<!--[\s\S]*?-->)", original)
            for index in range(0, len(parts), 2):
                parts[index], count = re.subn(r"(?im)^[ \t]*" + placeholder + r"[ \t]*$",
                                              f"Locking PR: #{locking_pr}", parts[index], count=1)
                if count:
                    break
            updated = "\n".join(lines[:start + 1] + "".join(parts).split("\n") + lines[end:])
    return updated


# Only this baseline has a verified locking-PR mapping; other paths stay explicit.
CITE_BASELINE_LOCK = "cite-baseline-lock"
TYPECHECK_TESTS_BASELINE = "apps/web/typecheck-tests-baseline.json"
BASELINE_LOCKING_PR = 16597
_BASELINE_LOCK_LINE = re.compile(
    r"locked-areas: cite GBrain: <slug/page> or Locking PR: #<number> in Locked areas for "
    + re.escape(TYPECHECK_TESTS_BASELINE) + r"\.(?: Add to the PR body:.*)?\s*")


class BaselineLockSignature:
    """Only actual error lines for the sole known path can authorize its citation."""

    def search(self, text):
        clean = re.sub(r"\x1b\[[0-9;]*m", "", str(text or ""))
        matches = []
        for line in clean.splitlines():
            line = re.sub(r"^[^\t]+\t[^\t]+\t(?=\d{4}-\d\d-\d\dT|##\[error\])", "", line)
            line = re.sub(r"^\d{4}-\d\d-\d\dT[\d:.]+Z\s+", "", line)
            line = re.sub(r"^(?:##\[error\]|::error::)", "", line)
            if not line.startswith("locked-areas:"):
                continue
            match = _BASELINE_LOCK_LINE.fullmatch(line)
            if not match:
                return None
            matches.append(match)
        return matches[0] if matches else None


BASELINE_LOCK_TEXT = BaselineLockSignature()

def baseline_locking_pr(text: str) -> int | None:
    """Locking PR when the locked-areas sentence names only the web test typecheck baseline.

    The path must sit immediately before the sentence period. A comma-separated
    extra path is a different lock and returns None.
    """
    if BASELINE_LOCK_TEXT.search(str(text or "")):
        return BASELINE_LOCKING_PR
    return None


INTERNAL_CHANGELOG_NOTE = '<!-- customer-changelog/v1 {"releaseWorthy":false} -->'

def stamp_internal_changelog(body) -> str | None:
    """Append the internal customer-changelog note. None when `body` is not a string or already
    contains a note (a second note is an ambiguous contract, not a stamp)."""
    if not isinstance(body, str) or re.search(r"<!--\s*customer-changelog/v1\b", body):
        return None
    if body and not body.endswith("\n"):
        body += "\n"
    return body + INTERNAL_CHANGELOG_NOTE + "\n"
