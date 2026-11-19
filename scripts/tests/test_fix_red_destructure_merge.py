"""Complementary awaited-destructure conflicts keep both sides' names."""
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_source_edits as edits  # noqa: E402


def conflict(ours, theirs):
    return f"<<<<<<< HEAD\n{ours}=======\n{theirs}>>>>>>> origin/main\n"


OPEN = "  const { view, promotion } = await searchParams;\n"
MAIN = (
    "  const { view } = await searchParams;\n"
    "  const requestedDocument = (await searchParams).document;\n"
    "  const requestedId =\n"
    "    typeof requestedDocument === 'string' && isCanonicalUuid(requestedDocument)\n"
    "      ? requestedDocument.toLowerCase()\n"
    "      : null;\n"
)
MERGED = (
    "  const { view, promotion } = await searchParams;\n"
    "  const requestedDocument = (await searchParams).document;\n"
    "  const requestedId =\n"
    "    typeof requestedDocument === 'string' && isCanonicalUuid(requestedDocument)\n"
    "      ? requestedDocument.toLowerCase()\n"
    "      : null;\n"
)


class ComplementaryDestructureTest(unittest.TestCase):
    def test_unions_main_names_then_head_only_names_and_trailing_statements(self):
        text = "before\n" + conflict(OPEN, MAIN) + "after\n"
        self.assertEqual(edits.resolve_complementary_destructure_text(text), "before\n" + MERGED + "after\n")

    def test_keeps_one_copy_of_an_identical_trailer_and_appends_head_only_trailers(self):
        trailer = "  const extra = 1;\n"
        head_only = "  const later = 2;\n"
        resolved = edits.resolve_complementary_destructure_text(
            conflict(OPEN + trailer + head_only, MAIN + trailer))
        self.assertEqual(resolved, MERGED + trailer + head_only)

    def test_rejects_shapes_that_are_not_the_same_simple_destructure(self):
        cases = (
            conflict("  const { view: alias } = await searchParams;\n", MAIN),
            conflict("  const { view, ...rest } = await searchParams;\n", MAIN),
            conflict("  const { view, view } = await searchParams;\n", MAIN),
            conflict("  let { view, promotion } = await searchParams;\n", MAIN),
            conflict(OPEN.replace("searchParams", "other"), MAIN),
            conflict(OPEN.replace("  const", "const"), MAIN),
            conflict(OPEN + "  if (promotion) return null;\n", MAIN),
            conflict(OPEN + "  const view = 1;\n", MAIN),
            conflict(OPEN, MAIN + "  const promotion = 1;\n"),
            conflict(OPEN + "  const extra = 1;\n", MAIN + "  const extra = 2;\n"),
            conflict(OPEN, MAIN).replace("=======\n", "||||||| base\n=======\n"),
            "no conflict\n",
            conflict(OPEN, MAIN) + conflict("  return 1;\n", "  return 2;\n"),
        )
        for case in cases:
            with self.subTest(case=case):
                self.assertIsNone(edits.resolve_complementary_destructure_text(case))

    def test_file_helper_resolves_typescript_and_leaves_other_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "page.tsx"
            path.write_text(conflict(OPEN, MAIN))
            self.assertEqual(
                edits.resolve_complementary_destructure_file(root, "page.tsx"), MERGED)
            self.assertIsNone(edits.resolve_complementary_destructure_file(root, "README.md"))

    def test_open_merge_uses_the_destructure_union_for_a_typescript_conflict(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rel = "app/page.tsx"
            target = root / rel
            target.parent.mkdir()
            target.write_text("keep\n" + conflict(OPEN, MAIN))
            calls = []

            def sh(args, cwd=None, log=None, timeout=None, stream=None):
                del cwd, log, timeout, stream
                calls.append(args)
                if args[:3] == ["git", "merge", "--no-edit"]:
                    return SimpleNamespace(returncode=1, stdout="", stderr="")
                if args[:4] == ["git", "diff", "--name-only", "--diff-filter=U"]:
                    return SimpleNamespace(returncode=0, stdout=rel + "\n", stderr="")
                if args[:2] == ["git", "add"] or args[:3] == ["git", "commit", "--no-edit"]:
                    return SimpleNamespace(returncode=0, stdout="", stderr="")
                if args[:3] == ["git", "merge", "--abort"]:
                    return SimpleNamespace(returncode=0, stdout="", stderr="")
                raise AssertionError(args)

            self.assertTrue(edits.resolve_additive_list_conflict(
                root, "branch", None, sh=sh, merge_entries=lambda _text: None, push=False))
            self.assertEqual(target.read_text(), "keep\n" + MERGED)
            self.assertNotIn(["git", "merge", "--abort"], calls)
            self.assertIn(["git", "commit", "--no-edit"], calls)
