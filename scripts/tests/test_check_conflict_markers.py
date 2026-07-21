"""
Regression tests for scripts/check-conflict-markers.sh (JOV-1962).

The pre-commit gate must print a one-line PASS confirmation on success and,
on failure, a clean numbered list of the affected files before the raw
`git diff --cached --check` output. Exit codes must remain unchanged.

Run with:
    python -m pytest scripts/tests/test_check_conflict_markers.py -v
"""
from __future__ import annotations

import subprocess
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _REPO_ROOT / "scripts" / "check-conflict-markers.sh"


def _init_repo(path: Path) -> None:
    subprocess.run(["git", "init", "-q"], cwd=path, check=True)


def _stage(repo: Path, name: str, content: str) -> None:
    (repo / name).write_text(content, encoding="utf-8")
    subprocess.run(["git", "add", name], cwd=repo, check=True)


def _run(repo: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(_SCRIPT)],
        cwd=repo,
        text=True,
        capture_output=True,
        check=False,
    )


class TestCheckConflictMarkers:
    def test_clean_staged_tree_prints_pass_line(self, tmp_path: Path) -> None:
        _init_repo(tmp_path)
        _stage(tmp_path, "clean.txt", "all good\n")

        result = _run(tmp_path)

        assert result.returncode == 0
        assert "PASS: conflict-marker check" in result.stdout

    def test_conflict_markers_list_affected_files_before_details(
        self, tmp_path: Path
    ) -> None:
        _init_repo(tmp_path)
        _stage(tmp_path, "clean.txt", "all good\n")
        _stage(
            tmp_path,
            "conflicted.txt",
            "before\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\nafter\n",
        )

        result = _run(tmp_path)

        assert result.returncode == 1
        # Numbered affected-file list appears before the raw detail lines...
        assert "Affected files:" in result.stdout
        assert "  1. conflicted.txt" in result.stdout
        assert result.stdout.index("Affected files:") < result.stdout.index(
            "leftover conflict marker"
        )
        # ...and only the affected file is listed, not every staged file.
        assert "clean.txt" not in result.stdout.split("Details:")[0]
        # Raw detector output is still printed for context.
        assert "leftover conflict marker" in result.stdout

    def test_multiple_conflicted_files_are_numbered(self, tmp_path: Path) -> None:
        _init_repo(tmp_path)
        _stage(tmp_path, "b.txt", "<<<<<<< HEAD\n")
        _stage(tmp_path, "a.txt", ">>>>>>> branch\n")

        result = _run(tmp_path)

        assert result.returncode == 1
        assert "  1. a.txt" in result.stdout
        assert "  2. b.txt" in result.stdout
