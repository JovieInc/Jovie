"""Budgeted `gh` access for lane code.

New lane code reads and edits PRs through apiclient.gh.run_gh (shared GitHub ledger, retry and
quota deferral) instead of a bare gh subprocess, per .claude/rules/external-apis.md and the
external-api-guard ratchet. A deferral (code 75) is returned like any non-zero exit.
"""
from types import SimpleNamespace


def gh_call(args, priority: str = "default", timeout=None):
    from apiclient.gh import run_gh  # scripts/ is on sys.path in lane_runner and in the release bundle
    result = run_gh(list(args), priority=priority)
    return SimpleNamespace(returncode=result["code"], stdout=result["stdout"], stderr=result["stderr"])
