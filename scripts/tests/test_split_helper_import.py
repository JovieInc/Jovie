"""Split-helper merge conflicts keep main's identical definitions and the head-only names."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_source_edits as edits  # noqa: E402
from split_helper_import import resolve_split_helper_conflict  # noqa: E402

REST = "LABEL = 'kept'\n\ndef run():\n    return SHARED + only_head() + ONLY_MAIN + len(LABEL)\n"
HEAD_IMPORT = "from head_mod import SHARED, only_head, UNUSED, ONLY_MAIN, SHARED_UNUSED\n"
MAIN_IMPORT = "from main_mod import SHARED, ONLY_MAIN, SHARED_UNUSED\n"
HEAD_SRC = '''"""head helpers."""
import re

SHARED = 1
SHARED_UNUSED = 4
UNUSED = 2

def only_head():
    return SHARED
'''
MAIN_SRC = '''"""main helpers."""
import re

SHARED = 1
SHARED_UNUSED = 4
ONLY_MAIN = 3
'''
EXPECTED_CONSUMER = (
    "from main_mod import SHARED, ONLY_MAIN\n"
    "from head_mod import only_head\n"
    + REST)
EXPECTED_HEAD = '''"""head helpers."""
import re
from main_mod import SHARED

UNUSED = 2

def only_head():
    return SHARED
'''
REL = "scripts/lanes/consumer.py"


def _run(work, *args):
    done = subprocess.run(["git", *args], cwd=work, capture_output=True, text=True)
    if done.returncode != 0:
        raise AssertionError(f"{args}\n{done.stderr}")
    return done


def _prepare(root, *, head_src=HEAD_SRC, main_src=MAIN_SRC, head_import=HEAD_IMPORT,
             main_import=MAIN_IMPORT, write_head=True):
    """Feature and main each add one helper module and a different consumer import."""
    work, origin, hooks = root / "work", root / "origin.git", root / "hooks"
    hooks.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main", str(work)], check=True)
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(origin)], check=True)
    env = {**os.environ, "GIT_AUTHOR_NAME": "lane", "GIT_AUTHOR_EMAIL": "lane@example.test",
           "GIT_COMMITTER_NAME": "lane", "GIT_COMMITTER_EMAIL": "lane@example.test"}
    def git(*args):
        done = subprocess.run(["git", *args], cwd=work, env=env, capture_output=True, text=True)
        if done.returncode != 0:
            raise AssertionError(f"{args}\n{done.stderr}")
        return done
    for key, value in {"user.name": "lane", "user.email": "lane@example.test",
                       "commit.gpgsign": "false", "core.hooksPath": str(hooks)}.items():
        git("config", key, value)
    git("remote", "add", "origin", str(origin))
    lanes = work / "scripts/lanes"
    lanes.mkdir(parents=True)
    (lanes / "consumer.py").write_text(REST)
    git("add", ".")
    git("commit", "-qm", "base")
    git("switch", "-qc", "feature")
    if write_head:
        (lanes / "head_mod.py").write_text(head_src)
    (lanes / "consumer.py").write_text(head_import + REST)
    git("add", ".")
    git("commit", "-qm", "head helpers")
    git("push", "-q", "origin", "HEAD:refs/heads/feature")
    tip = git("rev-parse", "HEAD").stdout.strip()
    git("switch", "-q", "main")
    (lanes / "main_mod.py").write_text(main_src)
    (lanes / "consumer.py").write_text(main_import + REST)
    git("add", ".")
    git("commit", "-qm", "main helpers")
    git("push", "-q", "origin", "HEAD:refs/heads/main")
    git("switch", "-q", "feature")
    return work, tip


class SplitHelperImportTest(unittest.TestCase):
    def test_rejects_alias_same_module_and_prose_without_git(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            path = root / REL
            path.parent.mkdir(parents=True)
            samples = (
                "<<<<<<< HEAD\nfrom head_mod import SHARED as S\n=======\nfrom main_mod import SHARED\n>>>>>>> main\n",
                "<<<<<<< HEAD\nfrom head_mod import SHARED\n=======\nfrom head_mod import ONLY\n>>>>>>> main\n",
                "<<<<<<< HEAD\nnote\n=======\nfrom main_mod import SHARED\n>>>>>>> main\n",
                "<<<<<<< HEAD\nfrom head_mod import SHARED\n=======\nfrom main_mod import SHARED\n>>>>>>> main\n"
                "<<<<<<< HEAD\nstill prose\n=======\nfrom main_mod import ONLY\n>>>>>>> main\n",
            )
            for sample in samples:
                with self.subTest(sample=sample):
                    path.write_text(sample)
                    self.assertIsNone(resolve_split_helper_conflict(root, REL))

    def test_keeps_main_definitions_and_head_only_names(self):
        with tempfile.TemporaryDirectory() as scratch:
            work, _tip = _prepare(Path(scratch))
            merged = subprocess.run(["git", "merge", "--no-edit", "origin/main"], cwd=work,
                                    capture_output=True, text=True)
            self.assertNotEqual(merged.returncode, 0)
            resolved = resolve_split_helper_conflict(work, REL)
            self.assertIsNotNone(resolved)
            text, writes = resolved
            self.assertEqual(text, EXPECTED_CONSUMER)
            self.assertEqual(writes, {"scripts/lanes/head_mod.py": EXPECTED_HEAD})
            self.assertEqual((work / "scripts/lanes/main_mod.py").read_text(), MAIN_SRC)

    def test_fail_closed_on_drift_cycles_partial_assigns_and_missing_modules(self):
        cases = {
            "drift": {"head_src": HEAD_SRC.replace("SHARED = 1", "SHARED = 2", 1)},
            "cycle": {"main_src": "from head_mod import only_head\n" + MAIN_SRC},
            "partial": {"head_src": HEAD_SRC.replace("SHARED = 1\n", "SHARED, OTHER = 1, 2\n"),
                        "main_src": MAIN_SRC.replace("SHARED = 1\n", "SHARED, OTHER = 1, 2\n")},
            "undefined": {"head_import": "from head_mod import MISSING\n",
                          "main_import": "from main_mod import MISSING\n"},
            "missing": {"write_head": False, "head_import": "from head_mod import SHARED\n"},
            "rebind": {"head_src": HEAD_SRC.replace(
                "def only_head():\n    return SHARED\n",
                "def only_head():\n    SHARED = 5\n    return SHARED\n")},
        }
        for name, kwargs in cases.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as scratch:
                work, _tip = _prepare(Path(scratch), **kwargs)
                subprocess.run(["git", "merge", "--no-edit", "origin/main"], cwd=work,
                               capture_output=True, text=True)
                self.assertIsNone(resolve_split_helper_conflict(work, REL))
                self.assertIn("<<<<<<<", (work / REL).read_text())

    def test_additive_resolver_fast_forwards_without_force(self):
        with tempfile.TemporaryDirectory() as scratch:
            work, tip = _prepare(Path(scratch))
            calls = []

            def sh(args, cwd=None, log=None, **_ignored):
                calls.append(list(args))
                return subprocess.run(list(args), cwd=cwd, capture_output=True, text=True)

            self.assertTrue(edits.resolve_additive_list_conflict(
                work, "feature", None, sh=sh, merge_entries=lambda text: None))
            self.assertEqual((work / REL).read_text(), EXPECTED_CONSUMER)
            self.assertEqual((work / "scripts/lanes/head_mod.py").read_text(), EXPECTED_HEAD)
            pushed = [args for args in calls if args[:2] == ["git", "push"]]
            self.assertEqual(pushed, [["git", "push", "-q", "origin", "HEAD:refs/heads/feature"]])
            for args in calls:
                self.assertFalse(set(args) & {"--force", "-f", "--force-with-lease"})
                self.assertFalse(any(str(arg).startswith("+") for arg in args))
            parents = _run(work, "rev-list", "--parents", "-n", "1", "HEAD").stdout.split()
            self.assertEqual(len(parents), 3)
            _run(work, "merge-base", "--is-ancestor", tip, "HEAD")
            self.assertEqual(_run(work, "rev-parse", "HEAD").stdout.strip(),
                             _run(work, "rev-parse", "origin/feature").stdout.strip())

    def test_refuses_to_rewrite_a_conflicted_path(self):
        with tempfile.TemporaryDirectory() as scratch:
            work, tip = _prepare(Path(scratch))
            calls = []

            def sh(args, cwd=None, log=None, **_ignored):
                calls.append(list(args))
                return subprocess.run(list(args), cwd=cwd, capture_output=True, text=True)

            with patch.object(edits, "resolve_split_helper_conflict",
                              return_value=("resolved\n", {REL: "resolved\n"})):
                self.assertFalse(edits.resolve_additive_list_conflict(
                    work, "feature", None, sh=sh, merge_entries=lambda text: None))
            self.assertFalse((work / ".git/MERGE_HEAD").exists())
            self.assertFalse(any(args[:2] == ["git", "push"] for args in calls))
            self.assertEqual(_run(work, "rev-parse", "HEAD").stdout.strip(), tip)

    def test_fix_prompt_names_the_split_helper_resolver(self):
        import lane_runner as lane
        prompt = lane.render_fix_prompt(
            {"mergeStateStatus": "DIRTY", "number": 23381, "headRefName": "fix/certify-history-budget"}, "")
        self.assertIn("resolve_split_helper_conflict", prompt)
        self.assertIn("Unknown hunks stay unresolved.", prompt)


if __name__ == "__main__":
    unittest.main()
