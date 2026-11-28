"""Prepare new linked slots without changing common Git config on a bare store."""
from __future__ import annotations

import json
import re
from pathlib import Path


def strict_dependency_env(slot, node_env, run):
    try:
        node = (slot / ".nvmrc").read_text().strip().removeprefix("v")
        metadata = json.loads((slot / "package.json").read_text())
        manager = metadata.get("packageManager") if isinstance(metadata, dict) else None
    except (OSError, ValueError) as error:
        raise RuntimeError("pool runtime pins unavailable") from error
    if not re.fullmatch(r"\d+\.\d+\.\d+", node) or not isinstance(manager, str) or not re.fullmatch(
        r"pnpm@\d+\.\d+\.\d+", manager
    ):
        raise RuntimeError("pool runtime pins invalid")
    env = node_env(slot)

    def version(binary):
        return run([binary, "--version"], cwd=slot, env=env, timeout=30).stdout.strip()

    if version("node") != f"v{node}":
        raise RuntimeError("pool Node version differs from target pin")
    if version("pnpm") != manager.removeprefix("pnpm@"):
        raise RuntimeError("pool pnpm version differs from target pin")
    return env


def install_pool_dependencies(repo, slot, install, node_env, run, log=None):
    def git(cwd, *args):
        return run(["git", *args], cwd=cwd, timeout=60).stdout.strip()

    if git(slot, "rev-parse", "--is-inside-work-tree") != "true":
        common = Path(git(slot, "rev-parse", "--path-format=absolute", "--git-common-dir")).resolve()
        git_dir = Path(git(slot, "rev-parse", "--absolute-git-dir")).resolve()
        expected = Path(git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir")).resolve()
        if common != expected or git_dir.parent != common / "worktrees" or (
            git(repo, "config", "--local", "--bool", "--get", "extensions.worktreeConfig") != "true"
        ) or git(slot, "rev-parse", "--is-bare-repository") != "true":
            raise RuntimeError("new pool slot is not a recognized linked worktree")
        # Set only this slot's keys, before pnpm can invoke the tracked hook installer.
        for key, value in (("core.bare", "false"), ("core.hooksPath", ".husky")):
            run(["git", "config", "--worktree", key, value], cwd=slot, log=log, timeout=60)

    top = Path(git(slot, "rev-parse", "--show-toplevel")).resolve()
    if top != slot.resolve() or git(slot, "rev-parse", "--is-inside-work-tree") != "true":
        raise RuntimeError("new pool slot does not resolve to its own checkout")
    run(install, cwd=slot, log=log, env=strict_dependency_env(slot, node_env, run))
