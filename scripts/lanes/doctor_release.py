"""The install-receipt gate for doctor-filed issues reaching Done (JOV-14764).

Merge is not deploy: a doctor issue whose fix landed on main may move to Done
only when the host install receipt proves the installed generation contains
the fix. The receipt is the lanes-status.json `release` block published by the
lanes updater (#26726 / JOV-13564): { sourceCommit, bundleDigest, installedAt,
refused }. A recorded fix SHA (a `<!-- doctor-fix:<40-hex> -->` body marker on
the issue, written by the fixing side — never by the doctor) may close its
issue only when it equals receipt.sourceCommit or is its ancestor, proven
against the local git object store with merge-base --is-ancestor. A missing,
unreadable, malformed or refused receipt, an unreadable issue body, or
unknowable ancestry, fails closed: the issue keeps its state and gets at most
one upserted comment a day. Issues without a recorded fix SHA keep the plain
alert-clear close behind the JOV-14452 hysteresis.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

FIX_MARKER_RE = re.compile(r"<!-- doctor-fix:([0-9a-f]{40}) -->")
SOURCE_COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
COMMENT_INTERVAL_S = 24 * 3600


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fix_sha(body: str | None) -> str | None:
    """The recorded fix SHA from a `<!-- doctor-fix:<40-hex> -->` body marker."""
    match = FIX_MARKER_RE.search(str(body or ""))
    return match.group(1) if match else None


def read_receipt(state_dir) -> dict | None:
    """The install receipt, read defensively: lanes-status.json `release` must be
    an object whose sourceCommit is a full 40-hex commit and whose install was
    not refused. Missing, unreadable, malformed or refused returns None, and the
    Done gate fails closed (JOV-14764)."""
    if state_dir is None:
        return None
    try:
        feed = json.loads((Path(state_dir) / "lanes-status.json").read_text())
        release = feed.get("release") if isinstance(feed, dict) else None
        if not isinstance(release, dict) or release.get("refused") is True:
            return None  # a refused install (JOV-13564) proves nothing is live
        return release if SOURCE_COMMIT_RE.match(str(release.get("sourceCommit") or "")) else None
    except (OSError, ValueError):
        return None


def contains(repo, fix: str, installed: str) -> bool:
    """True only when the installed generation provably contains the fix: equal
    SHAs, or ancestry proven with git merge-base --is-ancestor against the local
    object store. Anything unknowable (no repo, missing objects, git failure)
    is False: the gate fails closed (JOV-14764)."""
    if fix == installed:
        return True
    if repo is None:
        return False
    try:
        result = subprocess.run(["git", "-C", str(repo), "merge-base", "--is-ancestor", fix, installed],
                                capture_output=True, timeout=30)
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def repo_root(fallback: Path | None = None):
    """The lanes git checkout ancestry is checked against: LANES_REPO when it is
    a real checkout, else the module's own repo root; None when neither is one."""
    for candidate in (os.environ.get("LANES_REPO"), str(fallback) if fallback else None):
        if candidate and (Path(candidate) / ".git").exists():
            return Path(candidate)
    return None


def awaiting_install(tracker, issue_id: str, stable: str, repo=None, now=None) -> bool:
    """True when this issue's fix is recorded as merged but not proven live on
    the host: close() must then fail closed — no state change, one upserted
    comment a day (JOV-14764). Issues without a recorded fix SHA are plain
    alert-clear closes and return False here."""
    now = time.time() if now is None else now
    linear = getattr(tracker, "linear", None)
    if linear is None:
        return False  # no transport (a test double): the plain close semantics own it
    try:
        data = linear.gql('query($id:String!){issue(id:$id){description}}', {"id": issue_id})
        body = (((data or {}).get("issue") or {}).get("description")) or ""
    except Exception:  # noqa: BLE001 - an unreadable body cannot prove anything
        return True
    fix = fix_sha(body)
    if fix is None:
        return False
    ledger = getattr(tracker, "filer", None)
    ledger = getattr(ledger, "ledger", None)
    state_dir = ledger.path.parent if ledger is not None and ledger.path is not None else None
    receipt = read_receipt(state_dir)
    if receipt is None or not contains(repo_root() if repo is None else repo,
                                       fix, str(receipt["sourceCommit"])):
        note_daily(tracker, issue_id, stable, fix, now)
        return True
    return False


def note_daily(tracker, issue_id: str, stable: str, fix: str, now: float) -> None:
    """One upserted 'fix merged <sha>, awaiting Gem install' comment a day."""
    ledger = getattr(getattr(tracker, "filer", None), "ledger", None)
    linear = getattr(tracker, "linear", None)
    if ledger is None or linear is None:
        return
    stamps = ledger.data.setdefault("awaitComments", {})
    if isinstance(stamps.get(stable), (int, float)) and now - stamps[stable] < COMMENT_INTERVAL_S:
        return
    try:
        linear.comment(issue_id, f"🤖 doctor: fix merged {fix[:12]}, awaiting Gem install ({now_iso()}).")
    except Exception:  # noqa: BLE001 - the note is courtesy; the closed gate is the enforcement
        pass
    stamps[stable] = now
    ledger.save()
