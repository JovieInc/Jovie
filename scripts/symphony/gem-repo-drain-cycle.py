#!/usr/bin/env python3
"""Run one policy-checked rehabilitation pass per allowlisted repository."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gem_repo_registry import pr_drain_repos


def main() -> int:
    results: list[tuple[str, int]] = []
    for repo in pr_drain_repos():
        environment = os.environ.copy()
        environment["GEM_PR_DRAIN_REPO"] = repo.github
        process = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("gem-pr-drain.py")), *sys.argv[1:]],
            env=environment,
            text=True,
            check=False,
        )
        results.append((repo.github, process.returncode))
    print("Gem PR rehabilitation cycle:")
    for repo, returncode in results:
        print(f"  {repo}: rc={returncode}")
    return 0 if all(returncode == 0 for _, returncode in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
