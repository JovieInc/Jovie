#!/usr/bin/env python3
"""Run one policy-checked rehabilitation pass per allowlisted repository."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gem_repo_registry import pr_drain_repos

JOVIE_REPOSITORY = "JovieInc/Jovie"


def run_summer_bottleneck_producer() -> int:
    """Refresh Jovie's fleet receipt and publish one snapshot per timer cadence."""
    workspace = Path(
        os.environ.get("GEM_WORKSPACE", Path(__file__).resolve().parents[1])
    )
    state_dir = workspace / "state/gem-priority-gate"
    gate = subprocess.run(
        [
            sys.executable,
            str(Path(__file__).with_name("gem-priority-gate.py")),
            "--consumer",
            "remediation",
            "--repo",
            JOVIE_REPOSITORY,
            "--state-dir",
            str(state_dir),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    # A policy hold is a valid, persisted observation for the producer. Other
    # exit codes identify an observation or contract failure.
    if gate.returncode not in {0, 2}:
        return gate.returncode or 1
    producer = subprocess.run(
        [
            sys.executable,
            str(Path(__file__).with_name("summer_bottleneck_producer.py")),
            "--submit",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return producer.returncode


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
    # This cadence is fleet-wide, but the Summer bridge is Jovie-only and does
    # not depend on Jovie being enabled for PR drain. Run it after every repo so
    # its failure cannot prevent another repository's rehabilitation pass.
    try:
        summer_returncode = run_summer_bottleneck_producer()
    except (OSError, subprocess.SubprocessError):
        summer_returncode = 1
    print("Gem PR rehabilitation cycle:")
    for repo, returncode in results:
        print(f"  {repo}: rc={returncode}")
    print(f"Summer Jovie bottleneck snapshot: rc={summer_returncode}")
    return 0 if all(returncode == 0 for _, returncode in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
