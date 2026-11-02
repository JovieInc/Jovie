"""
Regression tests for scripts/hostops/codex-launcher.sh (installed as ~/.local/bin/codex).

The 2026-10-31 9h hang: a background `codex exec` inherited a stdin that never
closed and waited forever for extra input. The launcher closes stdin for a
non-interactive `exec` unless the prompt is read from stdin (`-`).

Run with:
    python -m pytest scripts/tests/test_codex_launcher.py -v
"""
from __future__ import annotations

import json
import os
import stat
import subprocess
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
_LAUNCHER = _REPO_ROOT / "scripts" / "hostops" / "codex-launcher.sh"

_FAKE_CODEX = """#!/usr/bin/env python3
import json, sys
print(json.dumps({"argv": sys.argv[1:], "stdin": sys.stdin.read()}))
"""


@pytest.fixture()
def fake_codex(tmp_path: Path) -> Path:
    fake = tmp_path / "codex-real"
    fake.write_text(_FAKE_CODEX)
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    return fake


def run(fake: Path, args: list[str], stdin: str = "EXTRA-INPUT", env: dict | None = None) -> dict:
    full_env = {**os.environ, "CODEX_REAL_BIN": str(fake), **(env or {})}
    res = subprocess.run(
        ["bash", str(_LAUNCHER), *args],
        input=stdin, capture_output=True, text=True, env=full_env, timeout=30,
    )
    assert res.returncode == 0, res.stderr
    return json.loads(res.stdout)


def test_background_exec_gets_stdin_closed(fake_codex: Path) -> None:
    out = run(fake_codex, ["exec", "do the thing"])
    assert out["stdin"] == ""


def test_exec_with_dash_keeps_piped_prompt(fake_codex: Path) -> None:
    out = run(fake_codex, ["exec", "-"], stdin="prompt from pipe")
    assert out["stdin"] == "prompt from pipe"


def test_non_exec_subcommand_keeps_stdin(fake_codex: Path) -> None:
    out = run(fake_codex, ["review"], stdin="kept")
    assert out["stdin"] == "kept"


def test_exec_appends_unattended_flags(fake_codex: Path) -> None:
    out = run(fake_codex, ["exec", "-C", "/tmp", "-m", "gpt-5", "hi"])
    assert out["argv"] == [
        "exec", "-C", "/tmp", "-m", "gpt-5", "hi",
        "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check",
    ]


@pytest.mark.parametrize("flag", ["-a", "--ask-for-approval", "--approach"])
def test_approval_flag_and_value_are_dropped(fake_codex: Path, flag: str) -> None:
    out = run(fake_codex, ["exec", flag, "never", "hi"])
    assert flag not in out["argv"] and "never" not in out["argv"]
    assert out["argv"][:2] == ["exec", "hi"]


def test_mcp_runs_without_bypass_flags(fake_codex: Path) -> None:
    out = run(fake_codex, ["mcp", "serve"], stdin="")
    assert out["argv"] == ["mcp", "serve"]
