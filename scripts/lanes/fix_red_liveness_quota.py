"""Union the liveness quota-deferral conflict with main.

Two repairs defer a denied GitHub read for different evidence:

- JOV-9993 classifies a 403/429 that carries GitHub rate-limit evidence and
  returns ``quota-deferred`` with no ``deferred`` flag and no ``/rate_limit``
  read, so the dead-man reports ``github-quota-deferred`` and files nothing.
- JOV-10153 defers a double bare 403 only when GET ``/rate_limit`` shows the
  shared installation budget is spent (``deferred: true``). A funded budget,
  a missing API base, or an unreadable quota read stays the original failure.

The read tries the classifier first, then the spent-budget check. The liveness
reporter keeps both the quota-deferred row (unknown, no persisted color flip)
and the deferred row (``alertStateFor`` keeps the previous color). Any other
hunk stays unresolved so the caller aborts the merge.
"""
from __future__ import annotations

import re

_HUNK = re.compile(
    r"^<<<<<<<[^\n]*\n(?P<ours>.*?)^=======\n(?P<theirs>.*?)^>>>>>>>[^\n]*(?:\n|\Z)",
    re.M | re.S)
_COMMENT = re.compile(r"^ \*(?: .*|)$")
_IDENT = re.compile(r"^[ \t]*([A-Za-z_][A-Za-z0-9_]*),[ \t]*$")
_EXPORT = re.compile(r"(?m)^export (?:async )?function (\w+)\b")

_LIVENESS = "scripts/automation-liveness.mjs"
_READ = "scripts/lib/github-json-read.mjs"

# Classifier evidence wins and does not consult /rate_limit. A bare double 403
# falls through to the spent-budget deferral. Other failures stay a slim
# ``{ok:false, reason}`` so exact-equality tests keep their shape.
_READ_BODY = """\
  if (read.ok) return read;
  if (token && read.reason === 'http-403') {
    const recovery = await readJson(fetchImpl, url, {});
    if (recovery.ok) return recovery;
    const recoveryKind = quotaKindOf(read) ?? quotaKindOf(recovery);
    if (recoveryKind)
      return { ok: false, reason: 'quota-deferred', quotaKind: recoveryKind };
    if (
      recovery.reason === 'http-403' &&
      (await sharedBudgetSpent(fetchImpl, token, apiUrl))
    )
      return { ok: false, deferred: true, reason: 'quota-deferred' };
    return { ok: false, reason: recovery.reason };
  }
  const quotaKind = quotaKindOf(read);
  if (quotaKind) return { ok: false, reason: 'quota-deferred', quotaKind };
  return { ok: false, reason: read.reason };
"""

_STATE_BODY = """\
      if (!row.critical || isQuotaDeferredRow(row)) continue;
      const fingerprint = livenessFingerprint(row.id);
      state[fingerprint] = alertStateFor(row.status, previous[fingerprint]);
"""

_STDOUT = (
    "    `${JSON.stringify({ status: report.status, red: report.results"
    ".filter(row => !['fresh', 'deferred'].includes(row.status) && "
    "!isQuotaDeferredRow(row)).map(row => row.id), quotaDeferred })}\\n`\n"
)


def resolve_liveness_quota_text(rel: str, text: str) -> str | None:
    """Resolve one conflicted file. None when any hunk is a different shape."""
    rel = str(rel or "").replace("\\", "/")
    if rel.endswith(_LIVENESS):
        return _resolve_file(text, _liveness_hunk)
    if rel.endswith(_READ):
        return _resolve_file(text, _read_hunk)
    return None


def _resolve_file(text: str, one_hunk) -> str | None:
    if "<<<<<<<" not in str(text or ""):
        return None
    hunks = list(_HUNK.finditer(text))
    if not hunks or "<<<<<<<" in _HUNK.sub("", text) or ">>>>>>>" in _HUNK.sub("", text):
        return None
    pieces: list[str] = []
    last = 0
    for hunk in hunks:
        resolved = one_hunk(text, hunk)
        if resolved is None:
            return None
        start, end, replacement = resolved
        if start < last or end < hunk.end():
            return None
        pieces.append(text[last:start])
        pieces.append(replacement)
        last = end
    pieces.append(text[last:])
    out = "".join(pieces)
    if "<<<<<<<" in out or ">>>>>>>" in out or "=======" in out or out == text:
        return None
    return out


def _comment_only(side: str) -> bool:
    lines = side.splitlines()
    return bool(lines) and all(_COMMENT.match(line) for line in lines)


def _union_comments(ours: str, theirs: str) -> str:
    kept = ours.splitlines()
    for line in theirs.splitlines():
        if line in kept:
            continue
        body = line[2:].strip()
        if body and any(body in existing for existing in kept):
            continue
        kept.append(line)
    return "\n".join(kept) + "\n"


def _strip_unclosed_doc(side: str) -> str:
    start = side.rfind("/**")
    if start == -1 or "*/" in side[start:]:
        return side
    return side[:start].rstrip() + "\n"


def _body_brace(side: str, name_end: int) -> int:
    """Index of the function body ``{``, ignoring braces inside the parameter list."""
    paren = 0
    started = False
    for index in range(name_end, len(side)):
        char = side[index]
        if char == "(":
            paren += 1
            started = True
        elif char == ")":
            paren -= 1
        elif char == "{" and paren == 0 and started:
            return index
    return -1


def _extract_function(side: str, name: str) -> str | None:
    """Return one exported function, with its doc comment and leading consts."""
    match = None
    for found in _EXPORT.finditer(side):
        if found.group(1) == name:
            match = found
    if match is None:
        return None
    start = match.start()
    doc = re.search(r"/\*\*(?:(?!\*/).)*\*/\n\Z", side[:start], re.S)
    if doc:
        start = doc.start()
    consts = re.search(r"((?:const [A-Z0-9_]+ = [^\n]+;\n)+)\n*$", side[:start])
    if consts and start - consts.end() <= 2:
        start = consts.start()
    brace = _body_brace(side, match.end())
    if brace < 0:
        return None
    depth = 0
    for index in range(brace, len(side)):
        if side[index] == "{":
            depth += 1
        elif side[index] == "}":
            depth -= 1
            if depth == 0:
                return side[start:index + 1].strip("\n") + "\n"
    # Git often aligns both sides' final `}` into the line after the hunk, so
    # each function arrives one brace short. Only that exact shape is closed.
    if depth == 1:
        return side[start:].strip("\n") + "\n}\n"
    return None


def _read_hunk(text: str, hunk: re.Match[str]) -> tuple[int, int, str] | None:
    ours, theirs = hunk.group("ours"), hunk.group("theirs")
    start, end = hunk.start(), hunk.end()
    if (
        "export async function landedOnMainAt" in ours
        and "quotaKindOf" in ours
        and "export function githubReadFailure" in theirs
        and "deferred: true" in theirs
        and "sharedBudgetSpent" in theirs
    ):
        landed = _extract_function(ours, "landedOnMainAt")
        failure = _extract_function(theirs, "githubReadFailure")
        if not landed or not failure:
            return None
        closer = "}\n" if text[end:].startswith("}\n") else ("}" if text[end:].startswith("}") else None)
        if closer is None:
            return None
        replacement = f"{_READ_BODY}}}\n\n{landed}\n{failure}"
        return start, end + len(closer), replacement
    if (
        "export function quotaKindOf" in ours
        and "export async function classifyDeniedResponse" in ours
        and _comment_only(theirs)
        and "shared installation REST budget" in theirs
        and text[:start].endswith("/**\n")
        and text[end:].startswith(" */\n")
    ):
        body = _strip_unclosed_doc(ours).rstrip() + "\n"
        if not body.startswith(" *"):
            return None
        replacement = "/**\n" + body + "\n/**\n" + theirs.strip("\n") + "\n */\n"
        return start - len("/**\n"), end + len(" */\n"), replacement
    if _comment_only(ours) and _comment_only(theirs) and "JOV-9993" in ours and "JOV-10153" in theirs:
        return start, end, _union_comments(ours, theirs)
    return None


def _identifier_lines(side: str) -> list[str] | None:
    found = []
    for line in side.splitlines():
        if not line.strip():
            continue
        match = _IDENT.match(line)
        if not match:
            return None
        found.append(match.group(1))
    return found or None


def _liveness_hunk(text: str, hunk: re.Match[str]) -> tuple[int, int, str] | None:
    del text
    ours, theirs = hunk.group("ours"), hunk.group("theirs")
    ours_names, theirs_names = _identifier_lines(ours), _identifier_lines(theirs)
    if ours_names and theirs_names:
        merged = list(theirs_names)
        for name in ours_names:
            if name not in merged:
                merged.append(name)
        return hunk.start(), hunk.end(), "".join(f"  {name},\n" for name in merged)
    if "isQuotaDeferredRow" in ours and "row.critical" in ours and "alertStateFor" in theirs and "row.critical" in theirs:
        return hunk.start(), hunk.end(), _STATE_BODY
    if (
        "JSON.stringify({ status: report.status, red:" in ours
        and "quotaDeferred" in ours
        and "JSON.stringify({ status: report.status, red:" in theirs
        and "'deferred'" in theirs
    ):
        return hunk.start(), hunk.end(), _STDOUT
    return None
