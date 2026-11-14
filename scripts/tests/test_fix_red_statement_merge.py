"""Regression coverage for conservative Vitest statement and named-import merges."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_source_edits as edits  # noqa: E402
import fix_red_statement_merge as statements  # noqa: E402


class AdditiveStatementMergeTest(unittest.TestCase):
    @staticmethod
    def conflict(ours, theirs, base=""):
        return f"<<<<<<< HEAD\n{ours}||||||| base\n{base}=======\n{theirs}>>>>>>> main\n"

    @staticmethod
    def resolve(text):
        def sh(args, **kwargs):
            return subprocess.run(args, cwd=kwargs.get('cwd'), capture_output=True, text=True)
        return statements.resolve_additive_statements_text(
            text, validate_imports=lambda value, spans: statements.unique_import_bindings(value, Path.cwd(), sh, spans))

    def test_unions_named_import_additions_against_the_actual_base(self):
        base = "import { describe, expect, it, vi } from 'vitest';\n"
        ours = "import { afterEach, describe, expect, it, vi } from 'vitest';\n"
        extra = "import { HOME_MARKETING_HEADER_CTA } from '@/data/marketing/headerCta';\n"
        theirs = base + extra
        self.assertEqual(self.resolve(
            self.conflict(ours, theirs, base)),
            "import { describe, expect, it, vi, afterEach } from 'vitest';\n" + extra)

    def test_named_import_deletions_aliases_and_binding_collisions_stay_unresolved(self):
        base = "import { describe, it } from 'vitest';\n"
        added = "import { describe, it, expect } from 'vitest';\n"
        for ours, theirs in (
            ("import { describe, afterEach } from 'vitest';\n", added),
            (added, "import { it, beforeEach } from 'vitest';\n"),
            ("import { describe, it, expect as check } from 'vitest';\n", added),
            ("import type { describe, it } from 'vitest';\n", added),
            (added, base + "import { expect } from 'other';\n"),
            (base + "import { afterEach } from 'vitest';\n", added),
            (base + "const extra = 1;\n", added),
            (base.replace("vitest", "other"), added),
            ("import { describe, it, it } from 'vitest';\n", added),
        ):
            with self.subTest(ours=ours, theirs=theirs):
                self.assertIsNone(self.resolve(
                    self.conflict(ours, theirs, base)))
        self.assertIsNone(self.resolve(
            self.conflict(added, base, base) + self.conflict("changed\n", "other\n", "old\n")))

    def test_refuses_collisions_outside_the_hunk_and_existing_module_reorders(self):
        base = "import { describe, it } from 'vitest';\n"
        ours = "import { describe, it, afterEach } from 'vitest';\n"
        theirs = "import { describe, it, beforeEach } from 'vitest';\n"
        conflict = self.conflict(ours, theirs, base)
        for context in (
            "import { afterEach } from './helper';\n",
            "import afterEach from './helper';\n",
            "import { helper as afterEach } from './helper';\n",
            "const afterEach = () => {};\n",
            "const { helper, afterEach } = makeHelpers();\n",
            "const [helper, afterEach] = makeHelpers();\n",
            "import { helper, afterEach } from './helper'\n",
            "import { helper as afterEach } from './helper'\n",
            "import * as afterEach from './helper';\n",
            "const broken = ;\n",
            self.conflict("import { afterEach } from './helper';\n", ""),
        ):
            with self.subTest(context=context):
                self.assertIsNone(self.resolve(conflict + context))
        alpha = "import { alpha } from './alpha';\n"
        beta = "import { beta } from './beta';\n"
        self.assertIsNone(self.resolve(self.conflict(
            beta.replace('beta }', 'beta, headBeta }') + alpha.replace('alpha }', 'alpha, headAlpha }'),
            alpha.replace('alpha }', 'alpha, mainAlpha }') + beta.replace('beta }', 'beta, mainBeta }'),
            alpha + beta)))

    def test_refuses_import_looking_strings_and_comments_and_tracks_unicode_offsets(self):
        base = "import { it } from 'vitest';\n"
        conflict = self.conflict("import { it, expect } from 'vitest';\n", base, base)
        for before, after in (("const fixture = `\n", "`;\n"), ("/*\n", "*/\n")):
            self.assertIsNone(self.resolve(before + conflict + after))
        # Earlier replacements change later offsets, including in non-ASCII context.
        prefix = "// 🎵 café\n" + self.conflict("const head = 1;\n", "const main = 2;\n")
        self.assertEqual(self.resolve(prefix + conflict),
                         "// 🎵 café\nconst main = 2;\nconst head = 1;\nimport { it, expect } from 'vitest';\n")

    def test_named_import_resolution_requires_the_full_file_validator(self):
        base = "import { it } from 'vitest';\n"
        conflict = self.conflict("import { it, expect } from 'vitest';\n", base, base)
        self.assertIsNone(statements.resolve_additive_statements_text(conflict))
        self.assertIsNone(statements.resolve_additive_statements_text(
            conflict, validate_imports=lambda *_: False))
        self.assertFalse(statements.unique_import_bindings(base, Path.cwd(),
                         lambda *args, **kwargs: SimpleNamespace(returncode=1)))
        with patch.object(statements, 'atomic_write_text', side_effect=OSError('unavailable')):
            self.assertFalse(statements.unique_import_bindings(base, Path.cwd(), None))

    def test_real_git_named_import_conflict_uses_the_existing_file_resolver(self):
        with tempfile.TemporaryDirectory() as scratch:
            work = Path(scratch)
            def sh(args, **kwargs):
                return subprocess.run(args, cwd=work, capture_output=True, text=True)
            def git(*args):
                result = sh(["git", *args])
                self.assertEqual(result.returncode, 0, result.stderr)
            git("init", "-q", "-b", "main")
            git("config", "user.name", "Test")
            git("config", "user.email", "test@example.test")
            git("config", "commit.gpgsign", "false")
            git("config", "core.hooksPath", str(work / "hooks"))
            rel = "apps/web/app/(home)/layout.hydration.test.tsx"
            target = work / rel
            target.parent.mkdir(parents=True)
            def save(text):
                target.write_text(text)
                git("add", rel)
                git("commit", "-qm", "fixture")
            base = "import { describe, it } from 'vitest';\n"
            save(base)
            git("branch", "feature")
            save("import { describe, it, expect } from 'vitest';\n")
            git("checkout", "-q", "feature")
            save("import { afterEach, describe, it } from 'vitest';\n")
            self.assertEqual(sh(["git", "merge", "--no-commit", "main"]).returncode, 1)
            self.assertEqual(edits.resolve_additive_statement_file(work, rel, sh),
                             "import { describe, it, expect, afterEach } from 'vitest';\n")
            self.assertIn("<<<<<<<", target.read_text())
            self.assertIsNone(edits.resolve_additive_statement_file(work, "README.md", sh))


class SharedCloserItMergeTest(unittest.TestCase):
    @staticmethod
    def conflict(ours, theirs):
        return (
            f"<<<<<<< HEAD\n{ours}=======\n{theirs}>>>>>>> origin/main\n"
            "  });\n"
        )

    def test_unions_main_then_head_and_closes_each_test(self):
        text = "before\n" + self.conflict(
            "  it('head flow', () => {\n    expect(head).toBe(true);\n",
            "  it('main menu', () => {\n    expect(main).toBe(false);\n",
        ) + "after();\n"
        resolved = statements.resolve_shared_closer_it_text(text)
        self.assertEqual(resolved, (
            "before\n"
            "  it('main menu', () => {\n    expect(main).toBe(false);\n  });\n"
            "\n"
            "  it('head flow', () => {\n    expect(head).toBe(true);\n  });\n"
            "after();\n"))
        with tempfile.TemporaryDirectory() as scratch:
            work = Path(scratch)
            rel = "HeaderNav.test.tsx"
            (work / rel).write_text(text)
            self.assertEqual(edits.resolve_additive_statement_file(
                work, rel, lambda *args, **kwargs: SimpleNamespace(returncode=1, stdout="")),
                resolved)

    def test_unknown_shapes_stay_unresolved(self):
        cases = [
            self.conflict(
                "  it('same', () => {\n    expect(1).toBe(1);\n",
                "  it('same', () => {\n    expect(2).toBe(2);\n",
            ),
            self.conflict(
                "  it.each([true])('flag %s', () => {\n    expect(true).toBe(true);\n",
                "  it('other', () => {\n    expect(true).toBe(true);\n",
            ),
            "<<<<<<< HEAD\n  it('a', () => {\n=======\n  it('b', () => {\n>>>>>>> origin/main\n",
            self.conflict("  const value = 1;\n", "  const value = 2;\n"),
            "<<<<<<< HEAD\n  it('a', () => {\n||||||| base\n=======\n  it('b', () => {\n>>>>>>> main\n  });\n",
            self.conflict(
                "  it('a', () => {\n    expect(1).toBe(1);\n",
                "  it('b', () => {\n    expect(2).toBe(2);\n",
            ) + self.conflict("  changed\n", "  other\n"),
        ]
        for text in cases:
            with self.subTest(text=text):
                self.assertIsNone(statements.resolve_shared_closer_it_text(text))
        same = "  it('same', () => {\n    expect(1).toBe(1);\n"
        self.assertEqual(
            statements.resolve_shared_closer_it_text(self.conflict(same, same)),
            "  it('same', () => {\n    expect(1).toBe(1);\n  });\n")
