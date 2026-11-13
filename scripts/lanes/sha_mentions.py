"""Wrap commit-SHA mentions so lane repair bodies pass the company mention guard.

JovieInc/ci guards/mention.mjs strips fenced blocks and inline code, then
treats a bare @login as a GitHub mention. A 7-40 character hex string is a
commit prefix, not a person. repair_evidence_body runs neutralize on the
finished body, so every lane repair stops tripping that guard. Real logins,
paths, emails, fences, and text that is already inline code stay as they are.
"""
from __future__ import annotations

import re

# Same strip and login shape as guards/mention.mjs extractMentions. ASCII
# matches Node's \w. Keep these two expressions aligned with that guard.
_PROTECTED = re.compile(r"```[\s\S]*?```|`[^`\n]*`", re.ASCII)
_MENTION = re.compile(
    r"(?<![\w@./`-])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?(?:\[bot\])?)"
    r"(?![\w-]*/|\w*\.\w)",
    re.ASCII,
)
_HEX = re.compile(r"[0-9a-fA-F]{7,40}")


def neutralize(text: str) -> str:
    """Wrap bare @<7-40 hex> mentions in inline code. Idempotent."""
    if not text:
        return text
    pieces: list[str] = []
    cursor = 0
    for match in _PROTECTED.finditer(text):
        pieces.append(_wrap(text[cursor:match.start()]))
        pieces.append(match.group(0))
        cursor = match.end()
    pieces.append(_wrap(text[cursor:]))
    return "".join(pieces)


def _wrap(prose: str) -> str:
    def replacer(match: re.Match[str]) -> str:
        login = match.group(1)
        if _HEX.fullmatch(login):
            return f"`@{login}`"
        return match.group(0)

    return _MENTION.sub(replacer, prose)
