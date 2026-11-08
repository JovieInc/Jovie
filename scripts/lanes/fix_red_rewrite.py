"""Shared tail of the no-model fix-red rewrites: rewrite the lines the PR diff adds, commit, push."""
from __future__ import annotations

import types


def rewrite_commit_push(sh, pr, worktree, log, receipt, paths, rewrite, message, resolution, files_key):
    """Returns a finished-agent stand-in, or None when nothing applies or a git step fails."""
    diff = sh(["git", "diff", "-U0", "origin/main...HEAD", "--", *paths], cwd=worktree, log=log, timeout=300)
    if diff.returncode:
        return None
    changed = rewrite(worktree, diff.stdout or "")
    if not changed:
        return None
    steps = [["git", "add", "--", *changed], ["git", "commit", "-q", "-m", message],
             ["git", "push", "-q", "origin", f"HEAD:{pr['headRefName']}"]]
    for step in steps:
        if sh(step, cwd=worktree, log=log, timeout=900).returncode:
            return None
    receipt.update(resolution=resolution, **{files_key: changed})
    return types.SimpleNamespace(returncode=0)
