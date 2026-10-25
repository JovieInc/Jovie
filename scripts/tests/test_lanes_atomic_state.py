"""Guard: shared state under the lanes state dir is never rewritten in place.

A truncating `Path.write_text` / `open(path, "w")` leaves a window where a lock-free reader (doctor,
HUD, another worker, a test snapshot) sees an empty file. That tore worker-idle.json: JSONDecodeError in
ClaimScanCacheTest, 8 of 150 loaded runs, one refused Gem release (07:39Z 2026-10-25). Whole-file
state goes through atomic_state.atomic_write_text (stage beside the target, os.replace).

The scan flags any write_text / open(..., "w") inside a function that never calls os.replace or
rename. The allowlist is a ratchet: it may only shrink, and each entry is a write that is not shared
state (a per-run log or a flock sentinel).
"""
import ast
import sys
import tempfile
import unittest
from pathlib import Path

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
from atomic_state import atomic_write_text  # noqa: E402

# (file, function, kind): why it is not shared state.
ALLOWED = {
    ("bindings.py", "run", "open-w"): "per-run agent log, private to the run",
    ("claude_lane.py", "record_run", "open-w"): "flock sentinel, no content",
    ("codex_lane.py", "lease", "open-w"): "flock slot file, no content",
    ("codex_lane.py", "update_state", "open-w"): "flock sentinel, no content (state goes through write_state)",
    ("epics.py", "_decompose", "open-w"): "per-run agent log, private to the run",
    ("lane_runner.py", "_adopt_pr", "open-w"): "per-run agent log, private to the run",
    ("lane_runner.py", "_fix_red_pr", "open-w"): "per-run agent log, private to the run",
    ("lane_runner.py", "run_issue", "open-w"): "per-run agent log, private to the run",
    ("worktree_pool.py", "fill", "open-w"): "flock sentinel, no content",
}


def truncating_writes() -> set:
    found = set()
    for path in sorted(LANES.glob("*.py")):
        if path.name == "atomic_state.py":
            continue
        tree = ast.parse(path.read_text())
        for fn in ast.walk(tree):
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            nodes = list(ast.walk(fn))
            if any(isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr in ("replace", "rename")
                   for n in nodes):
                continue
            for node in nodes:
                if not isinstance(node, ast.Call):
                    continue
                if isinstance(node.func, ast.Attribute) and node.func.attr == "write_text":
                    found.add((path.name, fn.name, "write_text"))
                elif getattr(node.func, "id", getattr(node.func, "attr", "")) == "open":
                    mode = node.args[1].value if len(node.args) > 1 and isinstance(node.args[1], ast.Constant) else None
                    for keyword in node.keywords:
                        if keyword.arg == "mode" and isinstance(keyword.value, ast.Constant):
                            mode = keyword.value.value
                    if isinstance(mode, str) and "w" in mode:
                        found.add((path.name, fn.name, "open-w"))
    return found


class AtomicStateGuardTest(unittest.TestCase):
    def test_no_new_truncating_write_to_shared_state(self):
        new = truncating_writes() - set(ALLOWED)
        self.assertEqual(new, set(), "use atomic_state.atomic_write_text for whole-file state: " + repr(sorted(new)))

    def test_allowlist_only_shrinks(self):
        stale = set(ALLOWED) - truncating_writes()
        self.assertEqual(stale, set(), "remove fixed entries from ALLOWED: " + repr(sorted(stale)))

    def test_atomic_write_replaces_whole_and_leaves_no_temp(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "state.json"
            target.write_text("old")
            atomic_write_text(target, '{"a": 1}')
            self.assertEqual(target.read_text(), '{"a": 1}')
            self.assertEqual([p.name for p in Path(tmp).iterdir()], ["state.json"])
            missing = Path(tmp) / "absent" / "state.json"
            with self.assertRaises(OSError):
                atomic_write_text(missing, "x")


if __name__ == "__main__":
    unittest.main()
