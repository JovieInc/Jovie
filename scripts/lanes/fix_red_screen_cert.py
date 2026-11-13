"""Deterministic screen-certificate repair.

The node machine waives submit-event false positives and generates the stories
and axe test it can prove. A required state that stays missing returns None so
the model still runs. No module-level import of fix_red_classes (that imports
this module).
"""
from __future__ import annotations

import json
import re
import types

SCREEN_CERT_TEXT = re.compile(r"screen certificate gate failed:")
SCREEN_CERT_FILE = re.compile(r"(?m)^  ((?:apps|packages)/[\w./-]+\.tsx) \[")


def screen_cert_paths(log: str) -> list[str]:
    return sorted(set(SCREEN_CERT_FILE.findall(log or "")))


def dispatch(classes, sh, fixers: dict):
    """Fixer table the lane used to inline. Screen-cert and heading balance are routed here."""
    table = {
        classes.WIRE_CI_FAST: fixers["wire"],
        classes.ATOMIC_WRITE: fixers["atomic"],
        classes.RENUMBER: fixers["renumber"],
        classes.SNAP_SPACING: fixers["snap"],
        classes.STRIP_CACHE: fixers["strip"],
        classes.MERGE_NARROWED: fixers["merge"],
        classes.REGISTER_DOMAIN: fixers["register"],
        classes.REPAIR_SCREEN_CERT: (
            lambda host, pr, route, worktree, log, receipt: repair_screen_cert_fix(
                sh, host, pr, route, worktree, log, receipt)
        ),
    }
    balance = getattr(classes, "BALANCE_HEADINGS", None)
    if balance is not None:
        table[balance] = (
            lambda host, pr, route, worktree, log, receipt: balance_headings_fix(
                sh, pr, worktree, log, receipt, classes)
        )
    return table


def balance_headings_fix(sh, pr, worktree, log, receipt, classes):
    """Commit text-balance on headings this PR adds, then fast-forward the branch."""
    import fix_red_rewrite
    return fix_red_rewrite.rewrite_commit_push(
        sh, pr, worktree, log, receipt, ("apps/web", "packages/ui"),
        classes.balance_added_headings,
        "fix(ui): balance headings this change wraps",
        "balanced-headings", "balancedFiles")


def repair_screen_cert_fix(sh, host, pr, route, worktree, log, receipt):
    """Run the node repair, commit its paths, and fast-forward the PR branch."""
    del host
    paths = [item for item in ((route or {}).get("files") or []) if str(item).endswith(".tsx")]
    if not paths:
        return None
    argv = ["node", "scripts/lib/screen-cert-repair.mjs", "--write"]
    for rel in paths:
        argv.extend(["--component", rel])
    probe = sh(argv, cwd=worktree, log=log, timeout=300)
    if probe.returncode:
        return None
    try:
        result = json.loads((probe.stdout or "").strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError, AttributeError):
        return None
    changed = [
        rel for rel in result.get("changed") or []
        if isinstance(rel, str) and rel and not rel.startswith("/") and ".." not in rel.split("/")
    ]
    if not changed:
        return None
    formatted = [rel for rel in changed if rel.endswith((".ts", ".tsx", ".mjs"))]
    if formatted and sh(
            ["pnpm", "exec", "biome", "check", "--write", "--", *formatted],
            cwd=worktree, log=log, timeout=300).returncode:
        return None
    if sh(["git", "add", "--", *changed], cwd=worktree, log=log, timeout=120).returncode:
        return None
    staged = sh(["git", "diff", "--cached", "--name-only"], cwd=worktree, log=log, timeout=60)
    if staged.returncode or not (staged.stdout or "").strip():
        return None
    if sh(["git", "commit", "-q", "-m", "fix(ui): cover missing screen-certificate states"],
          cwd=worktree, log=log, timeout=900).returncode:
        return None
    if sh(["git", "push", "-q", "origin", f"HEAD:{pr['headRefName']}"],
          cwd=worktree, log=log, timeout=900).returncode:
        return None
    receipt.update(resolution="repaired-screen-cert", certifiedFiles=changed)
    return types.SimpleNamespace(returncode=0)
