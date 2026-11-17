"""Source-preserving checkout retirement, shared by lane cleanup callers."""
from __future__ import annotations

import subprocess
from pathlib import Path

import worktree_hosts


def remove_worktree(lane, host, worktree: Path) -> bool:
    """True only when clean, published source retired; retained work keeps its branch."""
    sh, disk_guard = lane.sh, lane.disk_guard
    git_housekeeping, worktree_pool = lane.git_housekeeping, lane.worktree_pool
    worktree_busy, preserve_repair = lane.worktree_busy, lane.preserve_repair
    record_worktree_disposition, HOST = lane.record_worktree_disposition, lane.HOST
    if not worktree.exists() or (worktree / disk_guard.PRESERVED_REPAIR).exists():
        return False
    # A maintenance child started before this config was in effect still holds
    # index.lock. Wait for it to leave; do not treat that writer as unpublished source.
    git_housekeeping.quiesce(worktree)
    busy = worktree_busy(worktree)
    if busy:
        record_worktree_disposition(host, worktree, "preserved", busy)
        preserve_repair(worktree, {"runId": worktree.name, "reasons": [f"cleanup-not-idle:{busy}"]})
        return False
    status = sh(["git", "status", "--porcelain", *disk_guard.SOURCE_PATHSPEC], cwd=worktree)
    if status.returncode or status.stdout.strip():
        record_worktree_disposition(host, worktree, "preserved", "source-unverified")
        preserve_repair(worktree, {"runId": worktree.name, "reasons": ["cleanup-source-unverified"]})
        return False
    reason = "publication-unverified"
    try:
        # Local refs (including HEAD itself) are not publication. Refresh every
        # origin branch atomically and prune deleted refs before trusting ancestry.
        fetched = sh(["git", "fetch", "-q", "--atomic", "--prune", "--no-tags",
                      "--no-recurse-submodules", "origin", "+refs/heads/*:refs/remotes/origin/*"],
                     cwd=worktree, timeout=30)
        head = (sh(["git", "rev-parse", "--verify", "HEAD"], cwd=worktree, timeout=30)
                if fetched.returncode == 0 else None)
        unpushed = (sh(["git", "rev-list", "--count", head.stdout.strip(), "--not", "--remotes=origin"],
                       cwd=worktree, timeout=30)
                    if head is not None and head.returncode == 0 and head.stdout.strip() else None)
        if unpushed is not None and unpushed.returncode == 0:
            count = unpushed.stdout.strip()
            if count == "0":
                reason = None
            elif count.isdecimal():
                reason = "unpublished-work"
    except (OSError, subprocess.SubprocessError):
        pass  # unknown publication is never permission to destroy source
    if reason:
        record_worktree_disposition(host, worktree, "preserved", reason)
        preserve_repair(worktree, {"runId": worktree.name, "reasons": [f"cleanup-{reason}"]})
        return False
    # The origin read may have taken time; recheck live ownership and source.
    git_housekeeping.quiesce(worktree)
    busy = worktree_busy(worktree)
    status = sh(["git", "status", "--porcelain", *disk_guard.SOURCE_PATHSPEC], cwd=worktree)
    current_head = sh(["git", "rev-parse", "--verify", "HEAD"], cwd=worktree, timeout=30)
    if (busy or status.returncode or status.stdout.strip() or current_head.returncode or
            current_head.stdout.strip() != head.stdout.strip()):
        reason = f"cleanup-not-idle:{busy}" if busy else "cleanup-source-unverified"
        record_worktree_disposition(host, worktree, "preserved", reason)
        preserve_repair(worktree, {"runId": worktree.name, "reasons": [reason]})
        return False
    # Proven clean and published: hand it to the next run installed, instead of spending
    # minutes deleting ~230k node_modules files (JOV-7723).
    slot = worktree_pool.recycle(host.repo, worktree) if worktree_hosts.role(HOST) == "primary" else None
    record_worktree_disposition(host, worktree, "recycled" if slot else "removed", slot)
    if not slot:
        removed, _error = git_housekeeping.remove_linked_worktree(
            lambda args: sh(["git", *args], cwd=host.repo, timeout=120), worktree)
        return removed
    return True

