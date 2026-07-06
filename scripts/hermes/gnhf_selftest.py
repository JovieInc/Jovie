#!/usr/bin/env python3
"""
gnhf_selftest.py — regression guard for the gnhf overnight loop (GH #10928)

Imports and exercises the pure-Python logic in ~/.hermes/scripts/gnhf.py without
requiring network access, a real coder, or a git repo. Fails fast if the script
is absent or its core invariants are broken.

Run:
  python3 scripts/hermes/gnhf_selftest.py
  # exits 0 on pass, 1 on failure

This test proves:
- The script is importable and locatable at the expected path
- OBJECTIVES are non-empty and structurally valid
- make_branch produces safe branch names (no spaces, single slash after prefix)
- IterResult captures status/pr correctly
- print_summary produces expected output structure
- The built-in --selftest mode passes
"""
from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
from pathlib import Path

GNHF_PATH = Path.home() / ".hermes" / "scripts" / "gnhf.py"
REQUIRED_OBJECTIVES = {"lyb-test-hardening", "dashboard-liquid-split"}


def load_gnhf():
    """Import gnhf.py as a module without executing main()."""
    if not GNHF_PATH.exists():
        raise FileNotFoundError(
            f"gnhf.py not found at {GNHF_PATH}. "
            "Deploy it from the repo: scripts/hermes/gnhf.py → ~/.hermes/scripts/gnhf.py"
        )
    spec = importlib.util.spec_from_file_location("gnhf", GNHF_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_objectives(gnhf) -> None:
    missing = REQUIRED_OBJECTIVES - set(gnhf.OBJECTIVES)
    assert not missing, f"Missing objectives: {missing}"

    for slug, tasks in gnhf.OBJECTIVES.items():
        assert tasks, f"Objective '{slug}' has no tasks"
        for t in tasks:
            for key in ("title", "prompt", "risk"):
                assert key in t, f"Task in '{slug}' missing '{key}': {t}"
            assert t["risk"] in ("low", "medium", "high"), \
                f"Invalid risk in '{slug}': {t['risk']}"
            assert len(t["title"]) < 100, f"Title too long in '{slug}': {t['title']}"
            assert len(t["prompt"]) > 50, f"Prompt too short in '{slug}': {t['title']}"


def test_make_branch(gnhf) -> None:
    b = gnhf.make_branch("test task foo/bar", 3)
    assert " " not in b, f"Branch has spaces: {b!r}"
    assert b.startswith("gnhf/"), f"Branch must start with gnhf/: {b!r}"
    assert b.count("/") == 1, f"Branch has extra slashes: {b!r}"
    assert len(b) < 80, f"Branch too long: {b!r}"

    # Edge: very long title gets truncated
    b2 = gnhf.make_branch("a" * 200, 1)
    assert len(b2) < 100, f"Long title not truncated: {b2!r}"


def test_iter_result(gnhf) -> None:
    ok = gnhf.IterResult(1, "feat: x", "ok", pr=99)
    assert ok.status == "ok"
    assert ok.pr == 99

    fail = gnhf.IterResult(2, "feat: y", "fail", notes="err")
    assert fail.status == "fail"
    assert fail.pr is None
    assert "err" in fail.notes

    skip = gnhf.IterResult(3, "feat: z", "skip")
    assert skip.status == "skip"


def test_print_summary(gnhf) -> None:
    with tempfile.NamedTemporaryFile(mode="w", suffix=".log", delete=False) as f:
        log_path = Path(f.name)
    try:
        results = [
            gnhf.IterResult(1, "feat: a", "ok", pr=10),
            gnhf.IterResult(2, "feat: b", "fail", notes="boom"),
            gnhf.IterResult(3, "feat: c", "skip"),
        ]
        gnhf.print_summary(results, 60.0, log_path)
        text = log_path.read_text()
        assert "1 ok" in text, f"Expected '1 ok' in summary: {text[:400]}"
        assert "1 failed" in text, f"Expected '1 failed' in summary: {text[:400]}"
        assert "60s" in text, f"Expected elapsed time: {text[:400]}"
    finally:
        log_path.unlink(missing_ok=True)


def test_selftest_subprocess() -> None:
    """Run gnhf --selftest as a subprocess; must exit 0."""
    r = subprocess.run(
        [sys.executable, str(GNHF_PATH), "--selftest"],
        capture_output=True, text=True, timeout=15,
    )
    out = (r.stdout + r.stderr).strip()
    assert r.returncode == 0, f"gnhf --selftest exited {r.returncode}:\n{out}"
    assert "selftest ok" in out, f"Expected 'selftest ok' in output:\n{out}"


def main() -> int:
    gnhf = load_gnhf()

    tests = [
        ("objectives structure", lambda: test_objectives(gnhf)),
        ("make_branch slug safety", lambda: test_make_branch(gnhf)),
        ("IterResult captures status/pr", lambda: test_iter_result(gnhf)),
        ("print_summary output", lambda: test_print_summary(gnhf)),
        ("--selftest subprocess", test_selftest_subprocess),
    ]

    passed = 0
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  ✓ {name}")
            passed += 1
        except Exception as exc:
            print(f"  ✗ {name}: {exc}")
            failed += 1

    print(f"\ngnhf_selftest: {passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
