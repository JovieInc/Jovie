#!/usr/bin/env python3
"""Fix-red failure fingerprints: which red is deterministic, which needs a model, and how much it costs.

Gem ledger, 2026-10-21..25: 762 fix-red runs, 34% pushed anything. A model reading a log that says
"API rate limit exceeded", "Unwired: <test file>" or a BEHIND branch is spending money on work a few
lines of Python do every time. The lanes classify each red head by what its failed logs say, route the
deterministic classes to a deterministic fixer, and count LLM runs per (PR, fingerprint) so a model is
not asked again to fix what it has already failed to move (a machine-gap signal then asks for a
machine instead of another run).

Pure functions over parsed values; lane_runner owns every side effect (gh, git, state files).

    python3 fix_red_classes.py measure [--state DIR] [--days N]   # before/after numbers from the ledger
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
import sys
import symtable
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import migration_renumber
import remediation
from atomic_state import atomic_write_text

SCHEMA = "jovie-fix-red-class/v1"
# Actions a class can route to. `agent` is the default (a model run); the others spend no model.
RERUN, SYNC_MAIN, WIRE_CI_FAST, RENUMBER, STAMP_CHANGELOG, SNAP_SPACING, MERGE_NARROWED, REGISTER_DOMAIN, ATOMIC_WRITE, AGENT = (
    "rerun", "sync-main", "wire-ci-fast", "renumber-migrations", "stamp-changelog", "snap-spacing",
    "merge-narrowed-preflight", "register-domain-writes", "atomic-write", "agent")
DETERMINISTIC = frozenset({
    RERUN, SYNC_MAIN, WIRE_CI_FAST, RENUMBER, STAMP_CHANGELOG, SNAP_SPACING, MERGE_NARROWED, REGISTER_DOMAIN, ATOMIC_WRITE})

# remediation.INFRA_TEXT (runner loss, OOM, 5xx) plus the platform failures seen in 52 agent-declined
# fix runs. Kept out of INFRA_TEXT: the exhausted-PR classifier deliberately routes a rate-limited
# design gate to a model (test_engineering_credential_removal_is_not_a_founder_gate).
PLATFORM_TEXT = re.compile(
    remediation.INFRA_TEXT.pattern + r"|API rate limit exceeded|HTTP 408|you must provide a token|"
    r"timed out fetching|lost communication with the server|ECONNRESET", re.IGNORECASE)
QUOTA_TEXT = re.compile(r"github-quota-deferred|Fleet rule evidence is (?:missing|deferred)", re.IGNORECASE)
UNWIRED = re.compile(r"Unwired: (.+?)\. Wire each file into a ci-fast lane")
ATOMIC_TEXT = re.compile(r"use atomic_state\.atomic_write_text for whole-file state")
BODY_TEXT = re.compile(r"red-before-green:|PR body is missing|missing (?:a )?`?## ?(?:Red-before-green|Blast radius)",
                       re.IGNORECASE)
# The internal customer-changelog decision. A second note is `ambiguous`, so a body that already
# contains one is never stamped again. The quota form is the attempt>1 mask of the same defect:
# the guard could not re-read the body, so the log no longer says missing-metadata.
INTERNAL_CHANGELOG_NOTE = '<!-- customer-changelog/v1 {"releaseWorthy":false} -->'
CHANGELOG_MISSING = re.compile(r"Customer outcome decision missing or invalid \(missing-metadata\)")
CHANGELOG_QUOTA_READ = re.compile(r"github-quota-deferred: PR metadata read hit GitHub")
# Design-surface census throws this when a canonical digest no longer matches the
# source bytes. Main renews that certification. A red required check reports
# BLOCKED, so the BEHIND fallback never runs and a model is sent to rewrite a
# digest main already owns. Sync main instead. This pattern is checked before
# platform text: the same Source Validation log contains passing-test rate-limit
# lines. A branch that already contains main fails update-branch and still
# reaches a model, which is the only path that may renew a digest the PR owns.
CENSUS_CERTIFICATION = re.compile(r"source changed; renew certification evidence")
# Armed spacing ratchet (spacing-scale-ratchet.test.ts). The count grew because a
# PR added a 10px/14px utility. Snap those added utilities; do not raise the floor.
SPACING_RATCHET_TEXT = re.compile(
    r"off-grid 10px/14px spacing steps \(\*-2\.5, \*-3\.5\) grew")
# Same utility shape as apps/web/scripts/optical-grid-scanners.ts, limited to the
# armed conservative steps. Longer prefixes are not required: `p` fails closed on
# `px-2.5` because the step hyphen does not follow `p`.
CONSERVATIVE_UTILITY = re.compile(
    r"(?<![\w-])(?P<sign>-)?(?P<prefix>p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|"
    r"gap|gap-x|gap-y|space-x|space-y)-(?P<step>2\.5|3\.5)(?![\w./%])")
# 10px and 14px sit halfway between canonical seams. Tie-break toward the lower
# seam (8px / 12px) so the rewrite is deterministic and stays on the 4px grid.
SNAP_STEP = {"2.5": "2", "3.5": "3"}
SPACING_SCAN_PREFIXES = ("apps/web/app/", "apps/web/components/", "packages/ui/")
NON_PRODUCT_SPACING = re.compile(r"\.(?:test|spec|stories)\.[tj]sx?$")
# Source Validation's merge probe. Deterministic unions:
# - NARROWED vitest command in scripts/preflight-changed.mjs
# - shell && chains (node --test or vitest paths, plus added prefixes)
# - quoted list entries (both sides only add 'path', lines)
# - one-line comma-separated identifier lists (main order, then head-only tokens)
# Any other hunk stays a model fix.
NARROWED_PREFLIGHT = "scripts/preflight-changed.mjs"
NARROWED_CONFLICT = re.compile(
    r"This PR conflicts with \S+ in: scripts/preflight-changed\.mjs\s*\. "
    r"Resolve the conflict \(lane-fix-conflict\)")
# An allowed-0 direct write is a new path, not grandfathered debt. Register that
# module. A positive cap and "lower ratchet" lines stay with the model.
DOMAIN_WRITE = re.compile(
    r"domain-write-guard: (?P<path>apps/web/(?:app|lib|components)/[\w./-]+\.(?:ts|tsx)) "
    r"writes (?P<table>[A-Za-z_][A-Za-z0-9_]*) directly \d+x \(allowed 0\)")
_DOMAIN_REGISTRY = "apps/web/lib/domain/write-registry.json"
_EXPORT_START = re.compile(
    r"(?m)^export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_][A-Za-z0-9_]*)\b")
_DOMAINS_END = re.compile(r'\n    \}\n  \],\n  "agentTools":')
_NARROWED_NOTE_PHRASES = (
    "source identity",
    "metrics-layer",
    "locked chrome",
    "heading contracts",
)
_NARROWED_THOROUGH = re.compile(
    r";\s*full (?:design-system )?suite (?:runs )?with --thorough\s*$")
_NARROWED_TEST = re.compile(
    r"(?:^|\s)((?:[\w.@/-]+)\.(?:test|spec)\.[cm]?[jt]sx?)(?=\s|$)")
_NARROWED_HUNK = re.compile(
    r"^<<<<<<<[^\n]*\n(?P<ours>.*?)^=======\n(?P<theirs>.*?)^>>>>>>>[^\n]*(?:\n|\Z)",
    re.M | re.S)
_NARROWED_SIDE = re.compile(
    r"\A(?P<prefix>(?:[ \t]*command:\n)?)(?P<cindent>[ \t]*)'(?P<command>[^'\n]+)',\n"
    r"(?P<nindent>[ \t]*)note: '(?P<note>[^'\n]+)',\n?\Z")
_QUOTED_LIST_ENTRY = re.compile(r"^[ \t]*'[^'\n]+',[ \t]*$")
_IDENT_TOKEN = re.compile(r"[A-Za-z][A-Za-z0-9-]*")
_AND_CHAIN_LINE = re.compile(
    r"""^(?P<indent>[ \t]*)(?P<prefix>(?:"[^"\n]+"\s*:\s*)?)(?P<q>['"])(?P<command>[^'"\n]*&&[^'"\n]*)(?P=q)(?P<suffix>,?)\s*$""")
_JSON_KEY = re.compile(r'^\s*"([^"\n]+)"\s*:')

# (class, pattern, action). First match wins per check; order is most specific first.
SIGNATURES = (
    ("narrowed-preflight", NARROWED_CONFLICT, MERGE_NARROWED),
    # Before platform-infra: a Source Validation log can carry passing-test
    # rate-limit lines beside the guard error that actually failed the job.
    ("domain-write", DOMAIN_WRITE, REGISTER_DOMAIN),
    ("changelog-metadata", CHANGELOG_MISSING, STAMP_CHANGELOG),
    # Before platform-infra: the ratchet message includes a count such as 591,
    # and `\b5\d\d\b` would otherwise treat that count as an HTTP 5xx.
    ("spacing-scale", SPACING_RATCHET_TEXT, SNAP_SPACING),
    ("census-certification", CENSUS_CERTIFICATION, SYNC_MAIN),
    ("quota-deferred", QUOTA_TEXT, RERUN),
    ("platform-infra", PLATFORM_TEXT, RERUN),
    ("migration-number", migration_renumber.LOG_TEXT, RENUMBER),
    ("ci-fast-wiring", UNWIRED, WIRE_CI_FAST),
    ("atomic-write", ATOMIC_TEXT, ATOMIC_WRITE),
    ("pr-body", BODY_TEXT, AGENT),
)
BEHIND_CLASS = "stale-branch"
AGGREGATE = ("pr ready", "ci summary", "rollup")
RED = frozenset({"FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "CANCELLED", "ERROR"})
LLM_VERDICTS = frozenset({"fix-pushed", "fix-no-change", "cancelled", "failed"})
DEFAULT_BREAKER_N, MAX_BREAKER_N, MIN_CELL_RUNS = 2, 3, 10


def error_signature(text: str) -> str:
    """The first error-looking line with volatile tokens removed, so two runs of one failure match."""
    for line in str(text or "").splitlines():
        if re.search(r"\b(error|fail(?:ed|ure)?|assert|expected|unwired|violation)\b", line, re.IGNORECASE):
            line = re.sub(r"^\S*\d{4}-\d\d-\d\dT[\d:.]+Z\s*", "", line.strip())
            line = re.sub(r"\b[0-9a-f]{7,40}\b|\d+", "#", line)
            return re.sub(r"\s+", " ", line)[:120]
    return ""


def real_failures(pr: dict) -> list[dict]:
    return [check for check in pr.get("statusCheckRollup") or []
            if str(check.get("conclusion") or "").upper() in RED and str(check.get("name") or "").lower() not in AGGREGATE]


def fingerprint_key(cls: str, names: list[str], signature: str = "") -> str:
    parts = [cls, *sorted({re.sub(r"\s+", " ", str(name)).strip().lower() for name in names})]
    if cls in {"other", "mixed"}:
        parts.append(signature)
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:12]


def stamp_internal_changelog(body) -> str | None:
    """Append the internal customer-changelog note. None when `body` is not a string or already
    contains a note (a second note is an ambiguous contract, not a stamp)."""
    if not isinstance(body, str) or "customer-changelog/v1" in body:
        return None
    if body and not body.endswith("\n"):
        body += "\n"
    return body + INTERNAL_CHANGELOG_NOTE + "\n"


def classify(pr: dict, logs: dict[str, str] | None = None) -> dict:
    """{cls, key, action, checks, signature, files}. `logs` maps a failing check name to its failed-job log;
    a check with no log is `other`. A BEHIND branch with nothing deterministic to say is `stale-branch`."""
    logs = logs or {}
    names = sorted({str(check.get("name")) for check in real_failures(pr)})
    per_check = []
    for name in names:
        text = logs.get(name) or ""
        hit = next(((cls, action) for cls, pattern, action in SIGNATURES if pattern.search(text)), None)
        per_check.append(hit or ("other", AGENT))
    classes = {cls for cls, _ in per_check}
    if len(classes) == 1:
        cls, action = per_check[0]
    elif classes:
        cls, action = "mixed", AGENT
    else:
        cls, action = "other", AGENT
    signature = error_signature("\n".join(logs.get(name) or "" for name in names)) if cls in {"other", "mixed"} else ""
    if cls in {"other", "mixed"} and pr.get("mergeStateStatus") == "BEHIND":
        cls, action = BEHIND_CLASS, SYNC_MAIN
    # Attempt 2 of the changelog guard reports only the quota error. Stamp the missing internal
    # note when the body can take one; a body that already has a note stays a quota rerun.
    if cls == "quota-deferred" and CHANGELOG_QUOTA_READ.search("\n".join(logs.get(name) or "" for name in names)) \
            and stamp_internal_changelog(pr.get("body")) is not None:
        cls, action, signature = "changelog-metadata", STAMP_CHANGELOG, ""
    files = []
    if cls == "ci-fast-wiring":
        for name in names:
            found = UNWIRED.search(logs.get(name) or "")
            files.extend(item.strip() for item in (found.group(1).split(",") if found else []) if item.strip())
        files = sorted(set(files))
    elif cls == "domain-write":
        files = sorted(_domain_write_hits("\n".join(logs.get(name) or "" for name in names)))
    return {"schema": SCHEMA, "cls": cls, "key": fingerprint_key(cls, names, signature), "action": action,
            "checks": names, "signature": signature, "files": files}


def _snap_spacing_line(line: str) -> str:
    def repl(match: re.Match) -> str:
        sign = match.group("sign") or ""
        return f"{sign}{match.group('prefix')}-{SNAP_STEP[match.group('step')]}"
    return CONSERVATIVE_UTILITY.sub(repl, line)


def _spacing_product_path(path: str) -> bool:
    """Product TS/TSX under the spacing ratchet's scan roots. Tests and stories are debt-free."""
    rel = str(path or "").replace("\\", "/")
    if not rel or rel.startswith("/") or ".." in Path(rel).parts:
        return False
    if not rel.endswith((".ts", ".tsx")) or NON_PRODUCT_SPACING.search(rel):
        return False
    return rel.startswith(SPACING_SCAN_PREFIXES)


def _added_spacing_edits(diff: str) -> dict[str, dict[int, tuple[str, str]]]:
    """Map eligible file -> {new 1-based line: (added text, snapped text)} for utilities the diff adds."""
    edits: dict[str, dict[int, tuple[str, str]]] = {}
    rel = ""
    eligible = False
    new_line = 0
    in_hunk = False
    for raw in str(diff or "").splitlines():
        if raw.startswith("+++ b/"):
            rel = raw[6:]
            eligible = _spacing_product_path(rel)
            in_hunk = False
            continue
        if raw.startswith("--- ") or raw.startswith("diff --git "):
            continue
        header = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", raw)
        if header:
            new_line = int(header.group(1))
            in_hunk = True
            continue
        if not in_hunk:
            continue
        if raw.startswith("\\"):
            continue  # "\ No newline at end of file" is not a source line
        if raw.startswith("+"):
            added = raw[1:]
            snapped = _snap_spacing_line(added)
            if eligible and snapped != added:
                edits.setdefault(rel, {})[new_line] = (added, snapped)
            new_line += 1
        elif raw.startswith("-"):
            continue
        else:
            # A context line (rare with -U0) still occupies a new-file line.
            new_line += 1
    return edits


def snap_added_conservative_spacing(root: Path, diff: str) -> list[str]:
    """Snap conservative spacing utilities on lines this diff adds. Returns the files written.

    Grandfathered lines are left alone, including an identical `gap-2.5` elsewhere in the
    file. A line that no longer matches the diff is left alone so a stale patch cannot
    rewrite a neighbor. 2.5 -> 2 (10px -> 8px) and 3.5 -> 3 (14px -> 12px).
    """
    changed = []
    root = Path(root)
    for rel, lines in _added_spacing_edits(diff).items():
        path = root / rel
        try:
            original = path.read_text()
        except OSError:
            continue
        file_lines = original.splitlines(keepends=True)
        dirty = False
        for lineno, (added, snapped) in lines.items():
            index = lineno - 1
            if index < 0 or index >= len(file_lines):
                continue
            ending = "\r\n" if file_lines[index].endswith("\r\n") else "\n" if file_lines[index].endswith("\n") else ""
            current = file_lines[index][: len(file_lines[index]) - len(ending)]
            if current != added:
                continue
            file_lines[index] = snapped + ending
            dirty = True
        if not dirty:
            continue
        try:
            atomic_write_text(path, "".join(file_lines))
        except OSError:
            continue
        changed.append(rel)
    return sorted(changed)


def _split_shell_and(command: str) -> list[str] | None:
    """Split a `&&` chain. Quoted or empty segments fail closed."""
    if "'" in command or '"' in command or "\n" in command:
        return None
    parts = [part.strip() for part in command.split("&&")]
    if not parts or any(not part for part in parts):
        return None
    return parts


def _vitest_prefix_and_files(segment: str) -> tuple[str, list[str]] | None:
    if "vitest run" not in segment:
        return None
    files = _NARROWED_TEST.findall(segment)
    if not files:
        return None
    prefix = segment
    for name in files:
        prefix = re.sub(rf"(^|\s){re.escape(name)}(?=\s|$)", " ", prefix)
    prefix = re.sub(r"\s+", " ", prefix).strip()
    if "vitest run" not in prefix:
        return None
    return prefix, files


def _file_list_prefix_and_files(segment: str) -> tuple[str, list[str]] | None:
    """A vitest invocation, or `node --test` plus test paths and nothing else."""
    vitest = _vitest_prefix_and_files(segment)
    if vitest:
        return vitest
    if not segment.startswith("node --test"):
        return None
    files = _NARROWED_TEST.findall(segment)
    if not files:
        return None
    prefix = segment
    for name in files:
        prefix = re.sub(rf"(^|\s){re.escape(name)}(?=\s|$)", " ", prefix)
    prefix = re.sub(r"\s+", " ", prefix).strip()
    if prefix != "node --test":
        return None
    return prefix, files


def _opaque_command_key(segment: str) -> tuple[str, ...]:
    """Identity of one && segment. Flags-only commands key on the executable."""
    tokens = segment.split()
    if len(tokens) >= 2 and not tokens[1].startswith("-"):
        return tokens[0], tokens[1]
    return (tokens[0],)


def merge_and_chain(ours: str, theirs: str) -> str | None:
    """Union two shell `&&` chains. Base segments stay in base order, then
    head-only segments. `node --test` and vitest paths union the same way.
    The same script with different arguments, a changed runner, or quotes
    returns None."""
    ours_parts = _split_shell_and(str(ours or "").strip())
    theirs_parts = _split_shell_and(str(theirs or "").strip())
    if not ours_parts or not theirs_parts:
        return None

    def classify(parts: list[str]) -> tuple[list[tuple[str, list[str]]], list[str]] | None:
        lists = []
        opaque = []
        seen: dict[tuple[str, ...], str] = {}
        for part in parts:
            parsed = _file_list_prefix_and_files(part)
            if parsed:
                lists.append(parsed)
                continue
            key = _opaque_command_key(part)
            if seen.get(key, part) != part:
                return None
            seen[key] = part
            opaque.append(part)
        if len(lists) > 1:
            return None
        return lists, opaque

    ours_split = classify(ours_parts)
    theirs_split = classify(theirs_parts)
    if not ours_split or not theirs_split:
        return None
    ours_lists, ours_opaque = ours_split
    theirs_lists, theirs_opaque = theirs_split
    if len(ours_lists) != len(theirs_lists):
        return None
    if ours_lists and ours_lists[0][0] != theirs_lists[0][0]:
        return None
    theirs_by = {_opaque_command_key(part): part for part in theirs_opaque}
    ours_by = {_opaque_command_key(part): part for part in ours_opaque}
    for key in set(theirs_by) & set(ours_by):
        if theirs_by[key] != ours_by[key]:
            return None
    files: list[str] = []
    merged_list = None
    if theirs_lists:
        for name in theirs_lists[0][1] + ours_lists[0][1]:
            if name not in files:
                files.append(name)
        merged_list = f"{theirs_lists[0][0]} {' '.join(files)}"
    result: list[str] = []
    for segment in theirs_parts:
        result.append(merged_list if _file_list_prefix_and_files(segment) else segment)
    list_at = next((index for index, segment in enumerate(ours_parts) if _file_list_prefix_and_files(segment)), None)
    for index, segment in enumerate(ours_parts):
        if _file_list_prefix_and_files(segment) or segment in result:
            continue
        if merged_list and list_at is not None and index < list_at:
            result.insert(result.index(merged_list), segment)
        else:
            result.append(segment)
    return " && ".join(result)


def _and_chain_commands(lines: list[str]) -> tuple[list[re.Match[str]], list[str]] | None:
    found = []
    other = []
    for line in lines:
        match = _AND_CHAIN_LINE.match(line)
        if match:
            found.append(match)
        else:
            other.append(line)
    if len(found) != 1:
        return None
    return found, other


def _json_key_conflicts(ours: list[str], theirs: list[str]) -> bool:
    """Two different values for one JSON key are an edit, not an addition."""
    theirs_by: dict[str, str] = {}
    for line in theirs:
        match = _JSON_KEY.match(line)
        if match:
            theirs_by[match.group(1)] = line
    for line in ours:
        match = _JSON_KEY.match(line)
        if match and match.group(1) in theirs_by and theirs_by[match.group(1)] != line:
            return True
    return False


def _resolve_and_chain_hunk(ours: str, theirs: str) -> str | None:
    ours_parsed = _and_chain_commands(ours.splitlines())
    theirs_parsed = _and_chain_commands(theirs.splitlines())
    if not ours_parsed or not theirs_parsed:
        return None
    ours_command, ours_other = ours_parsed
    theirs_command, theirs_other = theirs_parsed
    ours_match, theirs_match = ours_command[0], theirs_command[0]
    if ours_match.group("q") != theirs_match.group("q") \
            or ours_match.group("indent") != theirs_match.group("indent") \
            or ours_match.group("prefix") != theirs_match.group("prefix") \
            or ours_match.group("suffix") != theirs_match.group("suffix"):
        return None
    if _json_key_conflicts(ours_other, theirs_other):
        return None
    merged = merge_and_chain(ours_match.group("command"), theirs_match.group("command"))
    if merged is None:
        return None
    command_line = (
        f"{theirs_match.group('indent')}{theirs_match.group('prefix')}"
        f"{theirs_match.group('q')}{merged}{theirs_match.group('q')}{theirs_match.group('suffix')}")
    lines = []
    for line in theirs.splitlines():
        match = _AND_CHAIN_LINE.match(line)
        lines.append(command_line if match else line)
    for line in ours_other:
        if line not in lines:
            lines.append(line)
    ending = "\n" if ours.endswith("\n") or theirs.endswith("\n") else ""
    return "\n".join(lines) + ending


def resolve_and_chain_text(text: str) -> str | None:
    """Replace conflict hunks that are only a shell `&&` chain, plus lines added
    on one side. None when any hunk has another shape, so the caller aborts."""
    if "<<<<<<<" not in str(text or ""):
        return None
    hunks = list(_NARROWED_HUNK.finditer(text))
    if not hunks:
        return None
    cleared = _NARROWED_HUNK.sub("", text)
    if "<<<<<<<" in cleared or ">>>>>>>" in cleared:
        return None
    pieces = []
    last = 0
    for hunk in hunks:
        resolved = _resolve_and_chain_hunk(hunk.group("ours"), hunk.group("theirs"))
        if resolved is None:
            return None
        pieces.append(text[last:hunk.start()])
        pieces.append(resolved)
        last = hunk.end()
    pieces.append(text[last:])
    resolved = "".join(pieces)
    if "<<<<<<<" in resolved or ">>>>>>>" in resolved or resolved == text:
        return None
    return resolved


def merge_narrowed_guard_command(ours: str, theirs: str) -> str | None:
    """Union two NARROWED vitest commands. Shell prefixes stay in base order, then
    head-only prefixes; test paths follow the same rule. A changed vitest invocation
    or two different arguments for one executable returns None."""
    ours_parts = _split_shell_and(str(ours or "").strip())
    theirs_parts = _split_shell_and(str(theirs or "").strip())
    if not ours_parts or not theirs_parts:
        return None

    def split(parts: list[str]) -> tuple[list[tuple[str, list[str]]], list[str]] | None:
        vitest = []
        other = []
        for part in parts:
            parsed = _vitest_prefix_and_files(part)
            if parsed:
                vitest.append(parsed)
            else:
                other.append(part)
        if len(vitest) != 1:
            return None
        by_exe: dict[str, str] = {}
        for segment in other:
            exe = segment.split()[0]
            if by_exe.get(exe, segment) != segment:
                return None
            by_exe[exe] = segment
        return vitest, other

    ours_split = split(ours_parts)
    theirs_split = split(theirs_parts)
    if not ours_split or not theirs_split:
        return None
    ours_vitest, ours_other = ours_split
    theirs_vitest, theirs_other = theirs_split
    if ours_vitest[0][0] != theirs_vitest[0][0]:
        return None
    theirs_by = {segment.split()[0]: segment for segment in theirs_other}
    ours_by = {segment.split()[0]: segment for segment in ours_other}
    for exe in set(theirs_by) & set(ours_by):
        if theirs_by[exe] != ours_by[exe]:
            return None
    files: list[str] = []
    for name in theirs_vitest[0][1] + ours_vitest[0][1]:
        if name not in files:
            files.append(name)
    merged_vitest = f"{theirs_vitest[0][0]} {' '.join(files)}"
    result: list[str] = []
    emitted = False

    def emit_vitest() -> None:
        nonlocal emitted
        if not emitted:
            result.append(merged_vitest)
            emitted = True

    for segment in theirs_parts:
        if _vitest_prefix_and_files(segment):
            emit_vitest()
        else:
            result.append(segment)
    for segment in ours_parts:
        if _vitest_prefix_and_files(segment):
            emit_vitest()
        elif segment not in result:
            result.insert(result.index(merged_vitest) if emitted else len(result), segment)
    if not emitted:
        return None
    return " && ".join(result)


def merge_narrowed_guard_note(ours: str, theirs: str) -> str | None:
    """Union the known NARROWED note phrases. An unrecognized phrase fails closed."""

    def parse(note: str) -> tuple[list[str], bool] | None:
        text = str(note or "").strip()
        thorough = _NARROWED_THOROUGH.search(text) is not None
        head = _NARROWED_THOROUGH.sub("", text).strip().rstrip(";").strip()
        phrases = [part.strip() for part in head.replace(" and ", ", ").split(",") if part.strip()]
        if any(phrase not in _NARROWED_NOTE_PHRASES for phrase in phrases):
            return None
        return phrases, thorough

    ours_parsed = parse(ours)
    theirs_parsed = parse(theirs)
    if not ours_parsed or not theirs_parsed:
        return None
    present = set(ours_parsed[0] + theirs_parsed[0])
    ordered = [phrase for phrase in _NARROWED_NOTE_PHRASES if phrase in present]
    if not ordered and not (ours_parsed[1] or theirs_parsed[1]):
        return None
    if len(ordered) <= 1:
        head = ordered[0] if ordered else ""
    elif len(ordered) == 2:
        head = f"{ordered[0]} and {ordered[1]}"
    else:
        head = ", ".join(ordered[:-1]) + " and " + ordered[-1]
    if ours_parsed[1] or theirs_parsed[1]:
        return f"{head}; full suite with --thorough" if head else "full suite with --thorough"
    return head


def resolve_preflight_narrowed_text(text: str) -> str | None:
    """Replace conflict hunks that are only the NARROWED command and note. None when any
    hunk has another shape, so the caller aborts and leaves the merge to a model."""
    if "<<<<<<<" not in str(text or ""):
        return None
    hunks = list(_NARROWED_HUNK.finditer(text))
    if not hunks:
        return None
    if "<<<<<<<" in _NARROWED_HUNK.sub("", text) or ">>>>>>>" in _NARROWED_HUNK.sub("", text):
        return None
    pieces = []
    last = 0
    for hunk in hunks:
        ours = _NARROWED_SIDE.match(hunk.group("ours"))
        theirs = _NARROWED_SIDE.match(hunk.group("theirs"))
        if not ours or not theirs:
            return None
        if ours.group("prefix") != theirs.group("prefix") or ours.group("cindent") != theirs.group("cindent") \
                or ours.group("nindent") != theirs.group("nindent"):
            return None
        command = merge_narrowed_guard_command(ours.group("command"), theirs.group("command"))
        note = merge_narrowed_guard_note(ours.group("note"), theirs.group("note"))
        if command is None or note is None:
            return None
        pieces.append(text[last:hunk.start()])
        pieces.append(
            f"{ours.group('prefix')}{ours.group('cindent')}'{command}',\n"
            f"{ours.group('nindent')}note: '{note}',\n")
        last = hunk.end()
    pieces.append(text[last:])
    resolved = "".join(pieces)
    if "<<<<<<<" in resolved or ">>>>>>>" in resolved:
        return None
    return resolved


def merge_additive_quoted_entries(ours: str, theirs: str) -> str | None:
    """Union two conflict sides that only add quoted list entries.

    Main's order stays, then head-only lines. A blank side, a non-entry line, or a
    repeated path with different text returns None."""

    def rows(side: str) -> list[str] | None:
        if not str(side or "").endswith("\n"):
            return None
        lines = side[:-1].split("\n")
        if not lines or any(_QUOTED_LIST_ENTRY.fullmatch(line) is None for line in lines):
            return None
        return lines

    ours_rows = rows(ours)
    theirs_rows = rows(theirs)
    if ours_rows is None or theirs_rows is None:
        return None
    seen: list[str] = []
    for line in theirs_rows + ours_rows:
        if line not in seen:
            seen.append(line)
    return "\n".join(seen) + "\n"


def merge_additive_identifier_list(ours: str, theirs: str) -> str | None:
    """Union two one-line comma-separated identifier lists.

    Main's order stays, then head-only tokens. A trailing period must match.
    Prose, a second line, a reordered shared token, or a repeated token returns None."""

    def parse(side: str) -> tuple[str, list[str], bool] | None:
        if not str(side or "").endswith("\n"):
            return None
        line = side[:-1]
        if "\n" in line:
            return None
        indent = line[:len(line) - len(line.lstrip(" \t"))]
        body = line.strip()
        period = body.endswith(".")
        if period:
            body = body[:-1].rstrip()
        if not body or body.endswith(","):
            return None
        tokens = [part.strip() for part in body.split(",")]
        if any(_IDENT_TOKEN.fullmatch(part) is None for part in tokens):
            return None
        if len(tokens) != len(set(tokens)) or body != ", ".join(tokens):
            return None
        return indent, tokens, period

    ours_parsed = parse(ours)
    theirs_parsed = parse(theirs)
    if not ours_parsed or not theirs_parsed:
        return None
    indent, ours_tokens, ours_period = ours_parsed
    theirs_indent, theirs_tokens, theirs_period = theirs_parsed
    if indent != theirs_indent or ours_period != theirs_period:
        return None
    theirs_set = set(theirs_tokens)
    ours_set = set(ours_tokens)
    if [token for token in ours_tokens if token in theirs_set] != [token for token in theirs_tokens if token in ours_set]:
        return None
    merged = list(theirs_tokens)
    for token in ours_tokens:
        if token not in merged:
            merged.append(token)
    text = indent + ", ".join(merged)
    if theirs_period:
        text += "."
    return text + "\n"


def resolve_additive_identifier_list_text(text: str) -> str | None:
    """Replace conflict hunks that are only a one-line identifier list. None when any
    hunk has another shape, so the caller leaves that merge to a model."""
    if "<<<<<<<" not in str(text or ""):
        return None
    hunks = list(_NARROWED_HUNK.finditer(text))
    if not hunks:
        return None
    if "<<<<<<<" in _NARROWED_HUNK.sub("", text) or ">>>>>>>" in _NARROWED_HUNK.sub("", text):
        return None
    pieces = []
    last = 0
    for hunk in hunks:
        merged = merge_additive_identifier_list(hunk.group("ours"), hunk.group("theirs"))
        if merged is None:
            return None
        pieces.append(text[last:hunk.start()])
        pieces.append(merged)
        last = hunk.end()
    pieces.append(text[last:])
    resolved = "".join(pieces)
    if "<<<<<<<" in resolved or ">>>>>>>" in resolved:
        return None
    return resolved


def resolve_additive_quoted_list_text(text: str) -> str | None:
    """Replace conflict hunks that are only quoted list entries. None when any hunk
    has another shape, so the caller leaves that merge to a model."""
    if "<<<<<<<" not in str(text or ""):
        return None
    hunks = list(_NARROWED_HUNK.finditer(text))
    if not hunks:
        return None
    if "<<<<<<<" in _NARROWED_HUNK.sub("", text) or ">>>>>>>" in _NARROWED_HUNK.sub("", text):
        return None
    pieces = []
    last = 0
    for hunk in hunks:
        merged = merge_additive_quoted_entries(hunk.group("ours"), hunk.group("theirs"))
        if merged is None:
            return None
        pieces.append(text[last:hunk.start()])
        pieces.append(merged)
        last = hunk.end()
    pieces.append(text[last:])
    resolved = "".join(pieces)
    if "<<<<<<<" in resolved or ">>>>>>>" in resolved:
        return None
    return resolved


def _domain_write_hits(log: str) -> dict[str, list[str]]:
    """Allowed-0 guard lines, in file order. A positive cap is not a hit."""
    hits: dict[str, list[str]] = {}
    for match in DOMAIN_WRITE.finditer(str(log or "")):
        tables = hits.setdefault(match.group("path"), [])
        if match.group("table") not in tables:
            tables.append(match.group("table"))
    return hits


def _writes_table(text: str, table: str, sql: object) -> bool:
    if re.search(rf"\.(?:insert|update|delete)\(\s*(?:schema\.)?{re.escape(table)}\s*\)", text):
        return True
    if isinstance(sql, str) and "_" in sql and re.search(
            rf"\b(?:insert\s+into|update|delete\s+from)\s+\"?(?:public\.)?\"?{re.escape(sql)}\b", text, re.I):
        return True
    return False


def _core_tables_written(text: str, core: dict) -> set[str]:
    return {table for table, sql in core.items() if isinstance(table, str) and _writes_table(text, table, sql)}


def _export_spans(source: str) -> list[tuple[str, str]]:
    found = list(_EXPORT_START.finditer(source))
    spans = []
    for index, match in enumerate(found):
        end = found[index + 1].start() if index + 1 < len(found) else len(source)
        spans.append((match.group(1), source[match.start():end]))
    return spans


def _domain_id(path: str) -> str | None:
    rel = path
    for prefix in ("apps/web/lib/", "apps/web/app/", "apps/web/components/"):
        if rel.startswith(prefix):
            rel = rel[len(prefix):]
            break
    else:
        return None
    rel = re.sub(r"\.(?:tsx|ts)$", "", rel)
    parts = []
    for part in rel.split("/"):
        if re.fullmatch(r"\([^)]*\)", part):
            continue
        part = part.replace("_", "-").lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", part):
            return None
        parts.append(part)
    ident = ".".join(parts)
    if not ident or not re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)*", ident):
        return None
    return ident


def _domain_block(entry: dict) -> str:
    exports = entry["exports"]
    if len(exports) == 1:
        exports_txt = json.dumps(exports)
    else:
        lines = ",\n".join(f"        {json.dumps(name)}" for name in exports)
        exports_txt = f"[\n{lines}\n      ]"
    return (
        "    {\n"
        f"      \"id\": {json.dumps(entry['id'])},\n"
        f"      \"entity\": {json.dumps(entry['entity'])},\n"
        f"      \"module\": {json.dumps(entry['module'])},\n"
        f"      \"exports\": {exports_txt},\n"
        f"      \"tables\": {json.dumps(entry['tables'])}\n"
        "    }"
    )


def _domain_entry(root: Path, path: str, tables: list[str], core: dict, side: dict) -> dict | None:
    """One registry domain for a file whose every core write is an allowed-0 export. None when a model must decide."""
    if not re.fullmatch(r"apps/web/(?:app|lib|components)/[\w./-]+\.(?:ts|tsx)", path):
        return None
    if ".." in Path(path).parts or re.search(r"\.(?:test|spec|stories)\.", path):
        return None
    source_path = Path(root) / path
    if not source_path.is_file():
        return None
    try:
        source = source_path.read_text(errors="replace")
    except OSError:
        return None
    reported = list(dict.fromkeys(tables))
    if not reported or any(table not in core for table in reported):
        return None
    if _core_tables_written(source, core) != set(reported):
        return None
    for table in reported:
        needed = side.get(table)
        if isinstance(needed, list) and needed and not any(isinstance(name, str) and name in source for name in needed):
            return None
    exports = []
    covered: set[str] = set()
    for name, span in _export_spans(source):
        written = [table for table in reported if _writes_table(span, table, core.get(table))]
        if not written:
            continue
        exports.append(name)
        covered.update(written)
    if not exports or covered != set(reported):
        return None
    ident = _domain_id(path)
    if not ident:
        return None
    stem = re.sub(r"\.(?:tsx|ts)$", "", Path(path).name).replace("-", " ").replace("_", " ")
    return {"id": ident, "entity": stem, "module": path, "exports": exports, "tables": reported}


def register_direct_domain_writes(root: Path, log: str) -> list[str]:
    """Append a domain for each allowed-0 writer the guard names. Returns modules added.

    Skips a path that is already registered, missing, written outside an export, missing a
    required side effect, or writing a core table the log did not report. Grandfathered
    (allowed > 0) files are never registered. The registry is inserted in place so the
    rest of the file is not reformatted.
    """
    hits = _domain_write_hits(log)
    if not hits:
        return []
    registry_path = Path(root) / _DOMAIN_REGISTRY
    try:
        text = registry_path.read_text()
        registry = json.loads(text)
    except (OSError, json.JSONDecodeError):
        return []
    domains = registry.get("domains")
    core = registry.get("coreTables")
    if not isinstance(domains, list) or not isinstance(core, dict):
        return []
    modules = {row.get("module") for row in domains if isinstance(row, dict)}
    ids = {row.get("id") for row in domains if isinstance(row, dict)}
    side = registry.get("sideEffects") if isinstance(registry.get("sideEffects"), dict) else {}
    blocks = []
    added = []
    for path in sorted(hits):
        if path in modules:
            continue
        entry = _domain_entry(Path(root), path, hits[path], core, side)
        if entry is None or entry["id"] in ids:
            continue
        ids.add(entry["id"])
        modules.add(path)
        blocks.append(_domain_block(entry))
        added.append(path)
    if not blocks:
        return []
    match = _DOMAINS_END.search(text)
    if not match:
        return []
    updated = (text[:match.start()] + "\n    },\n" + ",\n".join(blocks)
               + '\n  ],\n  "agentTools":' + text[match.end():])
    try:
        parsed = json.loads(updated)
    except json.JSONDecodeError:
        return []
    registered = {row.get("module") for row in parsed.get("domains") or [] if isinstance(row, dict)}
    if not set(added) <= registered:
        return []
    atomic_write_text(registry_path, updated if updated.endswith("\n") else updated + "\n")
    return added


def repair_atomic_state_writes(root: Path, log: str) -> list[str]:
    """Repair only ratchet-named write_text calls with an existing atomic writer import.

    Unknown signatures, open modes, imports and paths stay with the agent. The
    caller still runs the ratchet and behavior tests before publication.
    """
    if not ATOMIC_TEXT.search(log):
        return []
    hits = re.findall(r"\('([A-Za-z_]\w*\.py)', '([A-Za-z_]\w*)', 'write_text'\)", log)
    lanes = (Path(root) / "scripts/lanes").resolve()
    changed = []
    for filename in sorted({name for name, _ in hits}):
        path = lanes / filename
        if path.is_symlink() or path.resolve().parent != lanes:
            continue
        try:
            source = path.read_text()
            tree = ast.parse(source)
        except (OSError, SyntaxError):
            continue
        if not any(isinstance(n, ast.ImportFrom) and n.module == "atomic_state" and n.level == 0
                   and any(a.name == "atomic_write_text" and a.asname is None for a in n.names)
                   for n in tree.body):
            continue
        symbol = symtable.symtable(source, str(path), "exec").lookup("atomic_write_text")
        if symbol.is_assigned() or sum((a.asname or a.name) == "atomic_write_text"
                                      for n in ast.walk(tree) if isinstance(n, (ast.Import, ast.ImportFrom))
                                      for a in n.names) != 1:
            continue
        functions = {fn for name, fn in hits if name == filename}
        lines = source.encode().splitlines(keepends=True)
        offsets = [0]
        for line in lines:
            offsets.append(offsets[-1] + len(line))
        edits = {}
        for fn in tree.body:
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)) or fn.name not in functions:
                continue
            if any(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda))
                   for child in fn.body for n in ast.walk(child)):
                continue
            # A local binding could shadow the imported helper.
            if any((isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store) and n.id == "atomic_write_text")
                   or (isinstance(n, ast.arg) and n.arg == "atomic_write_text") for n in ast.walk(fn)):
                continue
            for statement in ast.walk(fn):
                call = statement.value if isinstance(statement, ast.Expr) else None
                if not (isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute)
                        and call.func.attr == "write_text" and 1 <= len(call.args) <= 2
                        and not any(isinstance(a, ast.Starred) for a in call.args)
                        and all(k.arg == "encoding" for k in call.keywords)):
                    continue
                if sum(isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "write_text"
                       for n in ast.walk(call)) != 1:
                    continue
                receiver = ast.get_source_segment(source, call.func.value)
                arguments = [ast.get_source_segment(source, a) for a in call.args]
                arguments += [f"{k.arg}={ast.get_source_segment(source, k.value)}" for k in call.keywords]
                start = offsets[call.lineno - 1] + call.col_offset
                end = offsets[call.end_lineno - 1] + call.end_col_offset
                edits[start] = (end, f"atomic_write_text({receiver}, {', '.join(arguments)})".encode())
        data = source.encode()
        for start, (end, replacement) in sorted(edits.items(), reverse=True):
            data = data[:start] + replacement + data[end:]
        if edits:
            try:
                ast.parse(data)
            except SyntaxError:
                continue
            atomic_write_text(path, data.decode())
            changed.append(f"scripts/lanes/{filename}")
    return changed


def wire_ci_fast(root: Path, files: list[str]) -> list[str]:
    """Append each unwired script test to the matching ci-fast list; return the files added. A file that
    is missing, already listed or outside scripts/ is left alone (the model path handles it)."""
    lanes = Path(root) / "scripts/ci-fast-lanes.mjs"
    try:
        text = lanes.read_text()
    except OSError:
        return []
    added = []
    for rel in files:
        if not re.fullmatch(r"scripts/[\w./-]+\.test\.(?:mjs|mts|js|ts)", rel) or ".." in rel \
                or not (Path(root) / rel).is_file() or f"'{rel}'" in text:
            continue
        source = (Path(root) / rel).read_text(errors="replace")
        name = "SCRIPT_CONTRACT_VITEST_TESTS" if re.search(r"""from ['"]vitest['"]""", source) else "SCRIPT_CONTRACT_NODE_TESTS"
        match = re.search(rf"(export const {name} = Object\.freeze\(\[\n(?:.*\n)*?)(\]\);)", text)
        if not match:
            continue
        text = text[:match.end(1)] + f"  '{rel}',\n" + text[match.end(1):]
        added.append(rel)
    if added:
        atomic_write_text(lanes, text)
    return added


def _ensure_objects(literal: str) -> str:
    """Add the objects map install_release archives, unless this flat dict already has one."""
    if not literal.startswith("{") or not literal.endswith("}") or "\n" in literal or "**" in literal:
        return literal
    if re.search(r"""['"]objects['"]\s*:""", literal):
        return literal
    body = literal[1:-1].rstrip()
    suffix = "" if not body.strip() or body.endswith(",") else ","
    return "{" + body + suffix + ' "objects": {"scripts/lanes": "f" * 40}}'


def _complete_block(block: str) -> str:
    names = set()
    for match in re.finditer(r"return_value\s*=\s*([A-Za-z_]\w*)\b", block):
        if match.end() < len(block) and block[match.end()] == ".":
            continue
        names.add(match.group(1))

    def rewrite(found):
        return found.group(1) + _ensure_objects(found.group(2))

    for name in sorted(names):
        block = re.sub(rf"(?m)^(\s*{re.escape(name)}\s*=\s*)(\{{[^\n]*\}})", rewrite, block)
    return re.sub(r"(return_value\s*=\s*)(\{[^\n]*\})", rewrite, block)


def complete_release_identity_stubs(source: str) -> str:
    """Fill one-line release_identity fixtures that install_release will archive.

    A top-level function or test method that both stubs release_identity and calls
    install_release needs an objects map: install_release archives sorted(bundle["objects"])
    before prove-staging. On 2026-10-29 that KeyError failed Source Validation for an
    incomplete custody stub, and the update backoff test uses the same shape. Multiline
    literals and **spreads stay as written. The checked-in lane runner tests are a fixed
    point of this function.
    """
    parts = re.split(r"(?=^(?:def |    def ))", source, flags=re.M)
    return "".join(
        _complete_block(part) if "install_release" in part and "release_identity" in part else part
        for part in parts)


# ---- measurement ---------------------------------------------------------------------------------

def _epoch(row: dict) -> float | None:
    for key in ("startedAt", "endedAt"):
        try:
            return datetime.fromisoformat(str(row.get(key)).replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
    return None


def historic_key(row: dict) -> str:
    """Ledger rows keep the failing check names, not the log: coarser than the live fingerprint, stable."""
    source = row.get("requestSource") or {}
    names = [name for name, verdict in source.get("checks") or []
             if str(verdict).upper() in RED and str(name).lower() not in AGGREGATE]
    kinds = ",".join(source.get("eventKinds") or [])
    return fingerprint_key("history", names or [f"event:{kinds}"])


def fix_rows(rows: list[dict]) -> list[dict]:
    return sorted((row for row in rows if row.get("kind") == "fix-red"), key=lambda row: _epoch(row) or 0.0)


def breaker_n(rows: list[dict]) -> int:
    """How many no-push LLM runs on one (PR, fingerprint) before the next run is not worth paying for:
    the smallest k where the push rate after k misses falls to half the first-run rate (cells of at least
    MIN_CELL_RUNS runs), else the default. Measured from the ledger so it follows the fleet."""
    seen = defaultdict(int)
    cells = defaultdict(lambda: [0, 0])
    for row in fix_rows(rows):
        if row.get("verdict") not in LLM_VERDICTS or row.get("attemptRefunded"):
            continue
        group = (row.get("pr"), historic_key(row))
        misses = min(seen[group], MAX_BREAKER_N + 2)
        pushed = row.get("verdict") == "fix-pushed"
        cells[misses][0] += 1
        cells[misses][1] += pushed
        seen[group] = 0 if pushed else seen[group] + 1
    first = cells[0]
    if first[0] < MIN_CELL_RUNS or not first[1]:
        return DEFAULT_BREAKER_N
    base = first[1] / first[0]
    for k in range(2, MAX_BREAKER_N + 1):  # 1 would stop after a single miss: the key is coarse
        runs, pushes = cells[k]
        if runs >= MIN_CELL_RUNS and pushes / runs <= base / 2:
            return k
    return DEFAULT_BREAKER_N


def measure(rows: list[dict], now: float, days: int = 5, cost_per_run: dict | None = None,
            merged_prs: set | None = None) -> dict:
    """Fix-red runs/day, push rate and $ per fix push (and per merged fix when `merged_prs` is given) over
    the last `days`. `cost_per_run` maps lane name to USD per run (capacity-metrics.json costUsd / runs)."""
    cost_per_run = cost_per_run or {}
    window = [row for row in fix_rows(rows) if (_epoch(row) or 0) >= now - days * 86400]
    llm = [row for row in window if row.get("verdict") in LLM_VERDICTS and not row.get("attemptRefunded")]
    routed = [row for row in window if str((row.get("reasons") or [""])[0]).startswith("infra-rerun:")]
    pushed = [row for row in llm if row.get("verdict") == "fix-pushed"]
    spend = sum(float(cost_per_run.get(row.get("provider")) or 0) for row in llm)
    merged = {row.get("pr") for row in pushed if merged_prs is not None and row.get("pr") in merged_prs}
    by_class = defaultdict(int)
    for row in routed:
        by_class[str(row["reasons"][0]).split(":", 1)[1].split("+")[0][:40]] += 1
    return {"windowDays": days, "fixRedRuns": len(window), "llmRuns": len(llm), "llmRunsPerDay": round(len(llm) / days, 1),
            "routedWithoutModel": len(routed), "routedByClass": dict(by_class), "pushed": len(pushed),
            "pushRate": round(len(pushed) / len(llm), 3) if llm else None, "spendUsd": round(spend, 2),
            "usdPerPush": round(spend / len(pushed), 2) if pushed and spend else None,
            "usdPerMergedFix": round(spend / len(merged), 2) if merged and spend else None,
            "mergedFixes": len(merged) if merged_prs is not None else None, "breakerN": breaker_n(rows)}


def read_ledger(state: Path) -> list[dict]:
    rows = []
    runs = Path(state) / "runs"
    for path in [*sorted((runs / "ledger-archive").glob("ledger-*.jsonl")), runs / "ledger.jsonl"]:
        try:
            lines = path.read_text(errors="replace").splitlines()
        except OSError:
            continue
        for line in lines:
            if line.startswith("{"):
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
    return rows


def costs_from_metrics(state: Path) -> dict:
    """Lane name -> USD per run, from the capacity metrics the doctor already writes."""
    try:
        data = json.loads((Path(state) / "capacity-metrics.json").read_text())
    except (OSError, ValueError):
        return {}
    lanes = {"openai-codex": "codex", "xai-grok": "grok", "hyperagent": "hyperagent", "anthropic-claude": "claude"}
    out = {}
    for name, row in (data.get("providers") or {}).items():
        if isinstance(row.get("costUsd"), (int, float)) and row.get("runs"):
            out[lanes.get(name, name)] = row["costUsd"] / row["runs"]
    return out


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=["measure"])
    parser.add_argument("--state", default=str(Path.home() / ".local/state/jovie-lanes"))
    parser.add_argument("--days", type=int, default=5)
    parser.add_argument("--now", type=float, default=None)
    args = parser.parse_args(argv)
    now = args.now or datetime.now(timezone.utc).timestamp()
    print(json.dumps(measure(read_ledger(Path(args.state)), now, args.days, costs_from_metrics(Path(args.state))), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
