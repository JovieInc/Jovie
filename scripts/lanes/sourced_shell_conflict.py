"""Resolve a shell conflict that sources a helper on one side and inlines it on the other.

The script keeps the source line. Stall flags, the attempt ceiling, and jitter
from the inline copy are ported into that helper. Any other hunk returns None
so the caller aborts instead of guessing. An `&&` chain still resolves first.
"""

from __future__ import annotations

import re
from pathlib import Path

import atomic_state
import fix_red_classes

_SOURCE_LINE = re.compile(
    r'^[ \t]*(?:\.|source) "(?P<path>\$REPO_ROOT/(?P<rel>[-A-Za-z0-9_./]+))"\s*$',
    re.M)
_ASSIGN = re.compile(
    r'^[ \t]*[A-Za-z_][A-Za-z0-9_]*="\$\{[A-Za-z_][A-Za-z0-9_]*:-[^"\n]*\}"\s*$')
_FUNC = "fetch_release_tarball() {"
_STALL = re.compile(
    r"curl -sSfL (?P<flags>--connect-timeout \d+ --speed-limit \d+ --speed-time \d+) ")
_ATTEMPTS = re.compile(
    r'^SCAN_SECRETS_DOWNLOAD_ATTEMPTS="\$\{SCAN_SECRETS_DOWNLOAD_ATTEMPTS:-\d+\}"$',
    re.M)
_FIXED_SLEEP = re.compile(r'^([ \t]*)sleep "\$\{SCAN_SECRETS_RETRY_DELAY:-2\}"[ \t]*$', re.M)
_LOCAL = re.compile(r"^([ \t]*)local tmp attempt status[ \t]*$", re.M)
_LOCAL_READY = re.compile(
    r'^[ \t]*local tmp attempt status delay="\$\{SCAN_SECRETS_RETRY_DELAY:-2\}"', re.M)
_ARITHMETIC = "for ((attempt = 1; attempt <= SCAN_SECRETS_DOWNLOAD_ATTEMPTS; attempt++)); do"
_JITTER = 'sleep "$((delay + RANDOM % (delay + 1)))"'
_DOUBLING = "delay=$((delay * 2))"
_NOTE = "Stalled downloads abort (--speed-time) and retries back off with jitter."


def resolve_shell_conflict(text: str, worktree, extras: list) -> str | None:
    """Return conflict text with sourced-helper hunks kept, or an &&-chain union.

    The known checksum-verified scanner replacement is kept when both callers
    have migrated and its downloader and pin files are present.
    `extras` receives helper paths whose bytes changed, so the caller can stage
    them. None leaves the merge untouched aside from a failed read.
    """
    chained = fix_red_classes.resolve_and_chain_text(text)
    if chained is not None:
        return chained
    if "<<<<<<<" not in str(text or ""):
        return None
    hunks = list(fix_red_classes._NARROWED_HUNK.finditer(text))
    if not hunks:
        return None
    cleared = fix_red_classes._NARROWED_HUNK.sub("", text)
    if "<<<<<<<" in cleared or ">>>>>>>" in cleared:
        return None
    pieces: list[str] = []
    upgrades: dict[str, str] = {}
    last = 0
    for hunk in hunks:
        replacement = _scanner_replacement(hunk.group("ours"), hunk.group("theirs"), text, worktree)
        if replacement is not None:
            pieces.extend((text[last:hunk.start()], replacement))
            last = hunk.end()
            continue
        source_side, inline = _hunk_sides(hunk.group("ours"), hunk.group("theirs"))
        if source_side is None or inline is None:
            return None
        rel = _helper_rel(source_side)
        if rel is None:
            return None
        if rel in upgrades and upgrades[rel] != inline:
            return None
        upgrades[rel] = inline
        pieces.append(text[last:hunk.start()])
        pieces.append(source_side)
        last = hunk.end()
    pieces.append(text[last:])
    resolved = "".join(pieces)
    if "<<<<<<<" in resolved or ">>>>>>>" in resolved or _FUNC in resolved:
        return None
    root = Path(worktree)
    pending: list[tuple[str, Path, str]] = []
    for rel, inline in upgrades.items():
        helper_path = root / rel
        try:
            current = helper_path.read_text()
        except (OSError, UnicodeError):
            return None
        if "<<<<<<<" in current:
            return None
        upgraded = _upgrade_helper(current, inline)
        if upgraded is None:
            return None
        if upgraded != current:
            pending.append((rel, helper_path, upgraded))
    for rel, helper_path, upgraded in pending:
        mode = helper_path.stat().st_mode
        try:
            atomic_state.atomic_write_text(helper_path, upgraded)
            helper_path.chmod(mode)
        except OSError:
            return None
        if rel not in extras:
            extras.append(rel)
    return resolved


def _scanner_replacement(ours: str, theirs: str, text: str, worktree) -> str | None:
    legacy = "scripts/security/scan-secrets-release-fetch.sh"
    canonical = "scripts/security/fetch-scanner.sh"
    if _classify(ours) != "source" or _classify(theirs) != "source":
        return None
    left, right = _helper_rel(ours), _helper_rel(theirs)
    if {left, right} != {legacy, canonical}:
        return None
    for tool in ("gitleaks", "trufflehog"):
        if f'$(fetch_scanner {tool} "${tool.upper()}_VERSION")' not in text:
            return None
    root = Path(worktree)
    if not all((root / rel).is_file() for rel in (canonical, "scripts/security/scanner-pins.txt")):
        return None
    return ours if left == canonical else theirs


def _hunk_sides(ours: str, theirs: str) -> tuple[str | None, str | None]:
    left, right = _classify(ours), _classify(theirs)
    if left is None or right is None or left == right:
        return None, None
    if left == "source":
        return ours, theirs
    return theirs, ours


def _classify(side: str) -> str | None:
    lines = side.splitlines()
    source_hits = [line for line in lines if _SOURCE_LINE.match(line)]
    funcs = [line.strip() for line in lines if line.strip().endswith("() {")]
    if funcs == [_FUNC] and not source_hits:
        func_at = next(index for index, line in enumerate(lines) if line.strip() == _FUNC)
        if any(not _preamble(line) for line in lines[:func_at]):
            return None
        if not lines or lines[-1].strip() != "}":
            # splitlines drops the trailing newline; the last physical line is `}`.
            return None
        return "inline"
    if funcs or len(source_hits) != 1:
        return None
    if any(not _preamble(line) and not _SOURCE_LINE.match(line) for line in lines):
        return None
    return "source"


def _preamble(line: str) -> bool:
    stripped = line.strip()
    return stripped == "" or stripped.startswith("#") or _ASSIGN.match(line) is not None


def _helper_rel(source_side: str) -> str | None:
    matches = list(_SOURCE_LINE.finditer(source_side))
    if len(matches) != 1:
        return None
    rel = matches[0].group("rel")
    parts = Path(rel).parts
    if not parts or rel.startswith("/") or any(part in {".", ".."} for part in parts):
        return None
    if not rel.endswith(".sh"):
        return None
    return rel


def _upgrade_helper(helper: str, inline: str) -> str | None:
    flags = _one(_STALL.findall(inline))
    attempts = _one(_ATTEMPTS.findall(inline))
    if flags is None or attempts is None:
        return None
    if _ARITHMETIC not in inline or _JITTER not in inline or _DOUBLING not in inline:
        return None
    if _FUNC not in helper or "fetch_release_asset_via_api() {" not in helper:
        return None
    text = _port_flags(helper, flags)
    text = None if text is None else _swap(
        text, "for attempt in 1 2 3; do", _ARITHMETIC)
    text = None if text is None else _swap(
        text, "[[ $attempt -lt 3 ]]", "[[ $attempt -lt $SCAN_SECRETS_DOWNLOAD_ATTEMPTS ]]")
    text = None if text is None else _swap(
        text, "after 3 attempts", "after $SCAN_SECRETS_DOWNLOAD_ATTEMPTS attempts")
    text = None if text is None else _port_sleep(text)
    text = None if text is None else _port_local(text)
    text = None if text is None else _port_attempts(text, attempts)
    if text is None:
        return None
    text = _port_note(text)
    if "fetch_release_asset_via_api() {" not in text:
        return None
    if "[[ $status -eq 22 ]]" in helper and "[[ $status -eq 22 ]]" not in text:
        return None
    if flags not in text or attempts not in text or _JITTER not in text or _DOUBLING not in text:
        return None
    return text


def _one(found: list[str]) -> str | None:
    if len(found) != 1:
        return None
    return found[0]


def _swap(text: str, old: str, new: str) -> str | None:
    count = text.count(old)
    if new in text:
        return None if count else text
    if count != 1:
        return None
    return text.replace(old, new, 1)


def _port_flags(text: str, flags: str) -> str | None:
    lines = []
    for line in text.splitlines(keepends=True):
        if "curl -sSfL " in line and "--speed-time" not in line:
            line = line.replace("curl -sSfL ", f"curl -sSfL {flags} ", 1)
        lines.append(line)
    updated = "".join(lines)
    if "curl -sSfL " not in updated or flags not in updated:
        return None
    if any("curl -sSfL " in line and flags not in line for line in updated.splitlines()):
        return None
    return updated


def _port_sleep(text: str) -> str | None:
    fixed = list(_FIXED_SLEEP.finditer(text))
    if _JITTER in text and _DOUBLING in text:
        return None if fixed else text
    if len(fixed) != 1 or _JITTER in text or _DOUBLING in text:
        return None
    indent = fixed[0].group(1)
    return _FIXED_SLEEP.sub(f"{indent}{_JITTER}\n{indent}{_DOUBLING}", text, count=1)


def _port_local(text: str) -> str | None:
    if _LOCAL_READY.search(text):
        return None if _LOCAL.search(text) else text
    matches = list(_LOCAL.finditer(text))
    if len(matches) != 1:
        return None
    indent = matches[0].group(1)
    replacement = f'{indent}local tmp attempt status delay="${{SCAN_SECRETS_RETRY_DELAY:-2}}"'
    return _LOCAL.sub(replacement, text, count=1)


def _port_attempts(text: str, line: str) -> str | None:
    if line in text:
        return text
    if text.count(_FUNC) != 1:
        return None
    return text.replace(_FUNC, f"{line}\n\n{_FUNC}", 1)


def _port_note(text: str) -> str:
    if _NOTE in text:
        return text
    comment = f"# {_NOTE}\n"
    lines = text.splitlines(keepends=True)
    if lines and lines[0].startswith("#!"):
        lines.insert(1, comment)
        return "".join(lines)
    return comment + text
