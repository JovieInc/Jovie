#!/usr/bin/env python3
"""Peel trailing test classes that grew a file past the company-guards size baseline.

Company guards counts newlines and refuses a baselined file that grew. The baseline
only shrinks, so the repair moves the trailing test class into a sibling
``*_overflow.py`` and leaves production modules and ``size-baseline.json`` untouched.
``fix_red_classes`` routes a ``size-500: path: grew A -> B`` log here.
"""
from __future__ import annotations

import json
import re
import subprocess
import types
from pathlib import Path

from atomic_state import atomic_write_text

GREW = re.compile(r"size-500: (?P<path>\S+): grew (?P<old>\d+) -> (?P<new>\d+)")
_CLASS = re.compile(r"(?m)^class ([A-Za-z_][A-Za-z0-9_]*)\(([^)\n]*)\):\s*$")
_MAIN = re.compile(r"""(?m)^if __name__ == ['"]__main__['"]:\s*$""")
BASELINE_REL = "scripts/company-guards/size-baseline.json"


def paths(log: str) -> list[str]:
    """Paths named by size-500 growth lines, in order, without duplicates."""
    found: list[str] = []
    for match in GREW.finditer(log or ""):
        rel = match.group("path")
        if rel not in found:
            found.append(rel)
    return found


def eligible(rel: str) -> bool:
    """True for a source test module this repair is allowed to split."""
    path = Path(str(rel))
    name = path.name
    return ("/tests/" in str(rel).replace("\\", "/") and name.startswith("test_")
            and name.endswith(".py") and not name.endswith("_overflow.py")
            and ".." not in path.parts and not path.is_absolute())


def overflow_rel(rel: str) -> str:
    path = Path(rel)
    return str(path.with_name(f"{path.stem}_overflow.py"))


def peel(text: str, limit: int) -> tuple[str, str]:
    """Return ``(kept, chunk)`` so ``kept`` has at most ``limit`` newlines.

    A trailing ``if __name__`` block stays in ``kept`` only when no class follows
    it. Raises ``ValueError`` instead of emptying the only class or stopping short.
    """
    if not isinstance(limit, int) or limit < 1:
        raise ValueError("size baseline limit must be a positive int")
    if text.count("\n") <= limit:
        return text, ""
    classes = list(_CLASS.finditer(text))
    if len(classes) < 2:
        raise ValueError("refusing to peel the only class")
    trailer = ""
    body = text
    mains = list(_MAIN.finditer(text))
    if mains and mains[-1].start() > classes[-1].start():
        trailer = text[mains[-1].start():]
        body = text[: mains[-1].start()]
        classes = [item for item in classes if item.start() < len(body)]
    if len(classes) < 2:
        raise ValueError("refusing to peel the only class")
    peeled: list[str] = []
    while body.count("\n") + trailer.count("\n") > limit:
        if len(classes) < 2:
            raise ValueError(f"cannot reach {limit} newlines by peeling trailing classes")
        cut = classes[-1].start()
        peeled.append(body[cut:])
        body = body[:cut]
        classes.pop()
    chunk = "".join(reversed(peeled))
    if not chunk.strip():
        raise ValueError("empty peel")
    kept = body + trailer
    if kept.count("\n") > limit:
        raise ValueError(f"cannot reach {limit} newlines")
    return kept, chunk


def rebase(chunk: str) -> str:
    """Point a single custom base at ``_src`` so unittest does not recollect it."""
    def repl(match: re.Match) -> str:
        name, base = match.group(1), match.group(2).strip()
        if base in {"unittest.TestCase", "TestCase"} or base.startswith("_src."):
            return match.group(0)
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", base):
            return f"class {name}(_src.{base}):"
        return match.group(0)
    return _CLASS.sub(repl, chunk)


def footer() -> str:
    """Hide inherited test_* methods so a helper base is not collected twice."""
    return '''
def _drop_inherited_tests() -> None:
    for value in list(globals().values()):
        if not isinstance(value, type) or not issubclass(value, unittest.TestCase):
            continue
        for name in dir(value):
            if name.startswith("test_") and name not in vars(value):
                setattr(value, name, None)


_drop_inherited_tests()
del _drop_inherited_tests
'''


def preamble(src_rel: str) -> str:
    module = src_rel[:-3].replace("/", ".")
    return f'''"""Tests peeled from {src_rel} so that file stays within the size-500 baseline."""
from __future__ import annotations

import importlib
import sys
import unittest
from pathlib import Path

_root = Path(__file__).resolve().parents[2]
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))
_src = importlib.import_module("{module}")


def _bind_source_names() -> None:
    for name, value in vars(_src).items():
        if name.startswith("__"):
            continue
        if isinstance(value, type) and issubclass(value, unittest.TestCase):
            continue
        globals().setdefault(name, value)


_bind_source_names()
del _bind_source_names


def setUpModule() -> None:
    start = getattr(_src, "setUpModule", None)
    if start is not None:
        start()


def tearDownModule() -> None:
    stop = getattr(_src, "tearDownModule", None)
    if stop is not None:
        stop()
'''


def apply_root(root, rels) -> list[str]:
    """Peel each over-baseline eligible test file. Never writes the baseline."""
    root = Path(root)
    baseline_path = root / BASELINE_REL
    before = baseline_path.read_bytes()
    baseline = json.loads(before)
    written: list[str] = []
    try:
        for rel in rels:
            rel = str(rel)
            if not eligible(rel) or rel == BASELINE_REL:
                continue
            limit = baseline.get(rel)
            if not isinstance(limit, int):
                continue
            path = root / rel
            if not path.is_file():
                continue
            text = path.read_text()
            if text.count("\n") <= limit:
                continue
            kept, chunk = peel(text, limit)
            if not kept.endswith("\n"):
                kept += "\n"
            dest_rel = overflow_rel(rel)
            dest = root / dest_rel
            piece = rebase(chunk)
            if not piece.endswith("\n"):
                piece += "\n"
            piece += footer()
            if dest.exists():
                existing = dest.read_text()
                if not existing.endswith("\n"):
                    existing += "\n"
                atomic_write_text(dest, existing + "\n" + piece)
            else:
                atomic_write_text(dest, preamble(rel) + piece)
            atomic_write_text(path, kept)
            written.extend([rel, dest_rel])
    finally:
        if baseline_path.read_bytes() != before:
            baseline_path.write_bytes(before)
            raise RuntimeError("refusing to write the size baseline")
    return written


def _run(args: list[str], cwd, log):
    done = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=900)
    if log is not None:
        log.write("$ " + " ".join(args) + "\n" + (done.stdout or "") + (done.stderr or ""))
    return done


def shrink_size_fix(host, pr, route, worktree, log, receipt):
    """Peel the logged test files, commit, and push. None when nothing changed.

    Push is a normal fast-forward of ``HEAD:<branch>``. No force, no baseline edit.
    """
    del host
    written = apply_root(worktree, list((route or {}).get("files") or []))
    if not written:
        return None
    branch = str((pr or {}).get("headRefName") or "")
    if not branch or branch.startswith("-"):
        return None
    steps = (["git", "add", "--", *written],
             ["git", "commit", "-q", "-m", "fix(lanes): peel tests past the size-500 baseline"],
             ["git", "push", "-q", "origin", f"HEAD:{branch}"])
    for step in steps:
        if _run(step, worktree, log).returncode:
            return None
    receipt.update(resolution="shrunk-size-baseline", peeledFiles=written)
    return types.SimpleNamespace(returncode=0)
