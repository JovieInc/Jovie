import sys
import subprocess
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes
import lane_runner as lane


class AdditiveNodeImportMergeTest(unittest.TestCase):
    BASE_IMPORTS = (
        "import { mkdtempSync, readFileSync } from 'node:fs';\n"
        "import { join } from 'node:path';\n"
    )
    IMPORT_CONFLICT = (
        "<<<<<<< HEAD\n"
        "import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';\n"
        "import { join } from 'node:path';\n"
        "=======\n"
        "import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';\n"
        "import { basename, join, resolve } from 'node:path';\n"
        ">>>>>>> origin/main\n"
    )

    def test_unions_named_node_imports_only_with_additive_base_evidence(self):
        self.assertEqual(
            classes.resolve_additive_identifier_list_text(self.IMPORT_CONFLICT, base=self.BASE_IMPORTS),
            "import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';\n"
            "import { basename, join, resolve } from 'node:path';\n",
        )
        self.assertIsNone(classes.resolve_additive_identifier_list_text(self.IMPORT_CONFLICT))

    def test_unions_imports_added_independently_to_a_module_absent_from_base(self):
        resolved = classes.resolve_additive_identifier_list_text(self.IMPORT_CONFLICT, base="// no imports yet\n")
        self.assertIn("{ mkdirSync, mkdtempSync, readFileSync, writeFileSync }", resolved)
        self.assertIsNone(classes.resolve_additive_identifier_list_text(
            self.IMPORT_CONFLICT, base="import fs from 'node:fs';\n"))
        self.assertIsNone(classes.resolve_additive_identifier_list_text(
            self.IMPORT_CONFLICT.replace("basename, join, resolve", "readFileSync, join, resolve"),
            base=self.BASE_IMPORTS))

    def test_import_removals_aliases_module_changes_and_unknown_hunks_stay_unresolved(self):
        for conflict, base in (
            (self.IMPORT_CONFLICT.replace("mkdirSync, mkdtempSync, readFileSync", "mkdirSync, mkdtempSync"), self.BASE_IMPORTS),
            (self.IMPORT_CONFLICT.replace("writeFileSync", "writeFileSync as write"), self.BASE_IMPORTS),
            (self.IMPORT_CONFLICT.replace("writeFileSync", "readFileSync"), self.BASE_IMPORTS),
            (self.IMPORT_CONFLICT.replace("'node:fs'", "'other'", 1), self.BASE_IMPORTS),
            (self.IMPORT_CONFLICT.replace("import { join } from 'node:path';", "doSomething();"), self.BASE_IMPORTS),
            (self.IMPORT_CONFLICT, self.BASE_IMPORTS + self.BASE_IMPORTS),
            (self.IMPORT_CONFLICT, ""),
            (self.IMPORT_CONFLICT + "<<<<<<< HEAD\nunknown();\n=======\nother();\n>>>>>>> origin/main\n", self.BASE_IMPORTS),
        ):
            with self.subTest(conflict=conflict, base=base):
                self.assertIsNone(classes.resolve_additive_identifier_list_text(conflict, base=base))



class NativeNodeImportConflictTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_identifier_list_conflict_unions_named_node_imports_and_fast_forwards(self):
        base = "// both branches add their own subprocess fixture\n"
        self._identifier_list_conflict(
            "fixture.mjs", base,
            "import { spawnSync } from 'node:child_process';\n" + base,
            "import { execFileSync } from 'node:child_process';\n" + base,
            "import { execFileSync, spawnSync } from 'node:child_process';\n" + base)

    def test_identifier_import_conflict_rejects_duplicate_bindings_across_hunks(self):
        base = ("import { readFileSync } from 'node:fs';\n" + "// unchanged separator\n" * 12
                + "import { tmpdir } from 'node:os';\n")
        self._identifier_list_conflict(
            "fixture.mjs", base,
            base.replace("readFileSync }", "readFileSync, constants }").replace("tmpdir }", "tmpdir, homedir }"),
            base.replace("readFileSync }", "readFileSync, writeFileSync }").replace("tmpdir }", "tmpdir, constants }"),
            None)

    def test_identifier_import_conflict_leaves_unvalidated_typescript_unresolved(self):
        base = "// both branches add imports\n"
        self._identifier_list_conflict(
            "fixture.ts", base,
            "import { spawnSync } from 'node:child_process';\n" + base,
            "import { execFileSync } from 'node:child_process';\n" + base,
            None)

    def _identifier_list_conflict(self, filename, base, head, main, expected):
        root = Path(self.tmp.name)
        origin = root / "origin.git"
        work = root / "work"
        work.mkdir()
        subprocess.run(["git", "init", "-q", "-b", "main", str(work)], check=True)
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(origin)], check=True)

        def git(*args, cwd=work):
            return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)

        hooks = root / "hooks"
        hooks.mkdir()
        for key, value in (("user.name", "t"), ("user.email", "t@example.test"), ("commit.gpgsign", "false"),
                           ("core.hooksPath", str(hooks))):
            git("config", key, value)
        git("remote", "add", "origin", str(origin))
        path = work / filename
        path.write_text(base)
        git("add", filename)
        git("commit", "-qm", "base")
        git("branch", "feature")
        git("push", "-q", "origin", "HEAD:refs/heads/main")
        git("checkout", "-q", "feature")
        path.write_text(head)
        git("commit", "-qam", "head adds identifiers")
        git("push", "-q", "origin", "HEAD:refs/heads/feature")
        git("checkout", "-q", "main")
        path.write_text(main)
        git("commit", "-qam", "main adds identifiers")
        git("push", "-q", "origin", "HEAD:refs/heads/main")
        git("checkout", "-q", "feature")
        before = git("rev-parse", "HEAD").stdout.strip()
        result = lane.resolve_identifier_list_conflict(work, "feature", None)
        if expected is None:
            self.assertFalse(result)
            self.assertEqual(path.read_text(), head)
            self.assertEqual(git("rev-parse", "HEAD").stdout.strip(), before)
            self.assertEqual(git("rev-parse", "origin/feature").stdout.strip(), before)
            self.assertEqual(git("status", "--porcelain").stdout, "")
            return
        self.assertTrue(result)
        text = path.read_text()
        self.assertEqual(text, expected)
        self.assertNotIn("<<<<<<<", text)
        after = git("rev-parse", "HEAD").stdout.strip()
        self.assertEqual(after, git("rev-parse", "origin/feature").stdout.strip())
        self.assertNotEqual(after, before)
        self.assertEqual(git("merge-base", "--is-ancestor", before, after).returncode, 0)
