"""No-model repair for marketing header chrome that copies a raw zIndex: 100.

The overlay ratchet fails a new file at baseline 0. Header chrome stays painted
at 100 so it remains above shell menus at 90 and below the page-builder drawer
at 120. This rewrites only the two header twins onto --z-index-site-header and
drops HeaderNav's grandfathered literal. Every other raw z-index stays.
"""
from __future__ import annotations

import re
from pathlib import Path

from atomic_state import atomic_write_text

HEADER_ZINDEX = "rewrite-header-zindex"
# Header chrome copies zIndex:100 into a new file. Route it before quota noise in the same shard log.
OVERLAY_HEADER_Z = re.compile(
    r"overlay-raw-z-index: apps/web/components/organisms/(?:HeaderNav|RootNotFoundHeader)\.tsx: zIndex:100 x\d+ \(baseline \d+\)")

HEADER_FILES = (
    "apps/web/components/organisms/HeaderNav.tsx",
    "apps/web/components/organisms/RootNotFoundHeader.tsx",
)
TOKEN_FILE = "apps/web/styles/tailwind-foundation.css"
BASELINE = "scripts/invariants/overlay-layer-contract.baseline.json"
_HEADER_Z = re.compile(r"(?m)^([ \t]*)zIndex: 100(,?)[ \t]*$")
_ANCHOR = "  --z-index-tooltip: 150;"
_TOKEN = "  --z-index-site-header: 100;"
_NOTE = "  /* Marketing header chrome: above z-index 90 shell menus, below drawer 120. */"
_BASELINE_BLOCK = (
    '    "apps/web/components/organisms/HeaderNav.tsx": {\n'
    '      "zIndex:100": 1\n'
    "    },\n"
)
_TOTAL = re.compile(r'("totalFindings": )(\d+)')


def _read(path: Path) -> str | None:
    try:
        return path.read_text()
    except OSError:
        return None


def rewrite_header_site_zindex(root: Path, diff: str = "") -> list[str]:
    """Rewrite allowlisted header chrome when `diff` adds a raw zIndex: 100."""
    diff = str(diff or "")
    if "zIndex: 100" not in diff and "zIndex:100" not in diff:
        return []
    if not any(rel in diff for rel in HEADER_FILES):
        return []
    root = Path(root)
    css_path = root / TOKEN_FILE
    sheet = _read(css_path)
    if sheet is None or ("--z-index-site-header:" not in sheet and _ANCHOR not in sheet):
        return []
    changed: list[str] = []
    if "--z-index-site-header:" not in sheet:
        sheet = sheet.replace(_ANCHOR, f"{_ANCHOR}\n{_NOTE}\n{_TOKEN}", 1)
        atomic_write_text(css_path, sheet)
        changed.append(TOKEN_FILE)
    for rel in HEADER_FILES:
        path = root / rel
        text = _read(path)
        if text is None:
            continue
        updated = _HEADER_Z.sub(r"\1zIndex: 'var(--z-index-site-header)'\2", text)
        if updated != text:
            atomic_write_text(path, updated)
            changed.append(rel)
    owner = _read(root / HEADER_FILES[0]) or ""
    if "zIndex: 100" in owner:
        return changed
    base_path = root / BASELINE
    raw = _read(base_path)
    if raw and _BASELINE_BLOCK in raw:
        raw = raw.replace(_BASELINE_BLOCK, "", 1)
        raw = _TOTAL.sub(lambda match: f"{match.group(1)}{int(match.group(2)) - 1}", raw, count=1)
        atomic_write_text(base_path, raw)
        changed.append(BASELINE)
    return changed
