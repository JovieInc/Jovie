"""Screen-debt conflict union.

Split from fix_red_source_edits.py so that module stays within the 500-line
company budget. Callers still reach resolve_subtractive_screen_debt through
fix_red_source_edits.
"""
from __future__ import annotations

import json
import re


def _shrunk_criteria(base: str, ours: str, theirs: str) -> str | None:
    """Criteria still open on both sides, in main's order. Additions and reorders stay unresolved."""
    parsed = []
    for side in (base, ours, theirs):
        tokens = side.split(",")
        if (not tokens or len(tokens) != len(set(tokens))
                or any(re.fullmatch(r"[a-z][a-z0-9-]*", token) is None for token in tokens)):
            return None
        parsed.append(tokens)
    base_tokens, ours_tokens, theirs_tokens = parsed
    if any(token not in base_tokens for token in (*ours_tokens, *theirs_tokens)):
        return None
    if any(side != [token for token in base_tokens if token in side] for side in (ours_tokens, theirs_tokens)):
        return None
    return ",".join(token for token in theirs_tokens if token in ours_tokens)


def resolve_subtractive_screen_debt(worktree, rel: str, sh) -> str | None:
    """Drop debt rows and criteria either side cleared, in main's order. Additions, reorders and other edits stay unresolved."""
    # Imported lazily: this module is loaded by fix_red_source_edits.
    from fix_red_conflict_resolvers import _debt_rows, _load_json_object_stages

    if rel != "docs/design-system/cert-screens.json":
        return None
    loaded = _load_json_object_stages(worktree, rel, sh, "debt", _debt_rows)
    if loaded is None:
        return None
    base, ours, theirs = loaded
    if any(key not in base["debt"] for document in (ours, theirs) for key in document["debt"]):
        return None
    merged = {}
    for key, theirs_value in theirs["debt"].items():
        if key not in ours["debt"]:
            continue
        value = _shrunk_criteria(base["debt"][key], ours["debt"][key], theirs_value)
        if value is None:
            return None
        if value:
            merged[key] = value
    theirs["debt"] = merged
    return json.dumps(theirs, ensure_ascii=False, indent=2) + "\n"
