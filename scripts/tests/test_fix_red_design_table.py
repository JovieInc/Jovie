"""Design-table conflicts render count cells from the merged baseline files."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_design_table as design  # noqa: E402

REPO = Path(__file__).resolve().parents[2]


def _conflict(ours: str, theirs: str) -> str:
    return f"<<<<<<< HEAD\n{ours}=======\n{theirs}>>>>>>> origin/main\n"


class DesignTableMergeTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.directory = self.root / "apps/web/tests/unit/design-system"
        self.directory.mkdir(parents=True)

    def _write(self, name: str, payload: dict):
        (self.directory / name).write_text(json.dumps(payload))

    def test_shared_counts_come_from_baselines_and_head_only_gates_stay(self):
        self._write("source-identity.baseline.json", {"count": 1914})
        self._write("spacing-scale.baseline.json", {
            "conservative": {
                "armed": True,
                "count": 587,
                "perFamily": {
                    "web-shell": 241,
                    "marketing": 46,
                    "packages/ui": 11,
                    "web-other": 289,
                },
            },
        })
        ours = (
            "| `off-scale-step` | `error` | G + I | Yes | None; vs base |\n"
            "| `source-identity` | `error` | I | Yes | 1918 |\n"
            "| `spacing-scale (conservative)` | `error` | S + G | Yes | 589; armed=true; marketing=46; packages/ui=11; web-other=289; web-shell=243 |\n"
        )
        theirs = (
            "| `source-identity` | `error` | I | Yes | 2036 |\n"
            "| `spacing-scale (conservative)` | `error` | S + G | Yes | 587; armed=true; marketing=46; packages/ui=11; web-other=289; web-shell=241 |\n"
            "| `touch-target` | `error` | D | Yes | 153 |\n"
        )
        resolved = design.resolve_design_table_text(_conflict(ours, theirs), self.root)
        self.assertEqual(resolved, (
            "| `off-scale-step` | `error` | G + I | Yes | None; vs base |\n"
            "| `source-identity` | `error` | I | Yes | 1914 |\n"
            "| `spacing-scale (conservative)` | `error` | S + G | Yes | 587; armed=true; marketing=46; packages/ui=11; web-other=289; web-shell=241 |\n"
            "| `touch-target` | `error` | D | Yes | 153 |\n"
        ))

    def test_non_count_disagreement_unknown_gate_and_prose_stay_unresolved(self):
        self._write("source-identity.baseline.json", {"count": 1914})
        changed = (
            "| `source-identity` | `warn` | I | No | 1 |\n"
        )
        kept = "| `source-identity` | `error` | I | Yes | 1918 |\n"
        self.assertIsNone(design.resolve_design_table_text(
            _conflict(kept, changed), self.root))
        unknown = "| `contrast (raw colors)` | `error` | S | Yes | 0 |\n"
        self.assertIsNone(design.resolve_design_table_text(
            _conflict(unknown, unknown), self.root))
        self.assertIsNone(design.resolve_design_table_text(
            _conflict("not a row\n", "still not\n"), self.root))
        self.assertIsNone(design.merge_design_table(kept, changed, self.root))

    def test_conflict_markers_in_a_baseline_refuse_the_count(self):
        (self.directory / "source-identity.baseline.json").write_text('{"count": 1}\n<<<<<<<\n')
        row = "| `source-identity` | `error` | I | Yes | 1 |\n"
        self.assertIsNone(design.render_count("source-identity", self.root))
        self.assertIsNone(design.resolve_design_table_text(_conflict(row, row), self.root))

    def test_section_hash_uses_the_heading_above_the_hunk(self):
        body = "## Use Tokens, Not Raw Colors\nSee [lanes](scripts/ci.md).\n"
        digest = hashlib.sha256(
            body.replace("](scripts/ci.md)", "](link)").strip().encode()).hexdigest()
        self.assertEqual(design.section_digest(body + "## Next\n", "## Use Tokens, Not Raw Colors"), digest)
        text = (
            '    "heading": "## Use Tokens, Not Raw Colors",\n'
            + _conflict('    "sha256": "' + ("a" * 64) + '"\n', '    "sha256": "' + ("b" * 64) + '"\n')
        )
        resolved = design.resolve_design_sections_text(text, body)
        self.assertEqual(resolved, f'    "heading": "## Use Tokens, Not Raw Colors",\n    "sha256": "{digest}"\n')
        self.assertIsNone(design.resolve_design_sections_text(
            _conflict("    \"sha256\": \"not-a-digest\"\n", "    \"sha256\": \"" + ("c" * 64) + "\"\n"),
            body))
        self.assertIsNone(design.section_digest(body + "<<<<<<<\n", "## Use Tokens, Not Raw Colors"))


class DesignTableLaneTest(unittest.TestCase):
    def test_wrapper_writes_allowed_conflicts_then_pushes(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        directory = root / "apps/web/tests/unit/design-system"
        directory.mkdir(parents=True)
        (directory / "arbitrary-values.baseline.json").write_text('{"count": 1688}')
        (root / "DESIGN.md").write_text(
            "## Use Tokens, Not Raw Colors\n"
            + _conflict(
                "| `arbitrary-values` | `error` | G + I | Yes | 1 |\n",
                "| `arbitrary-values` | `error` | G + I | Yes | 2 |\n",
            ))
        sections = root / "scripts/agent-context"
        sections.mkdir(parents=True)
        (sections / "design-sections.json").write_text(
            '    "heading": "## Use Tokens, Not Raw Colors",\n'
            + _conflict('    "sha256": "' + ("a" * 64) + '"\n', '    "sha256": "' + ("b" * 64) + '"\n')
        )
        calls = []

        def sh(args, cwd=None, log=None, timeout=None):
            calls.append(args)
            if args[:3] == ["git", "merge", "--no-edit"]:
                return SimpleNamespace(returncode=1, stdout="", stderr="")
            if args[:4] == ["git", "diff", "--name-only", "--diff-filter=U"]:
                return SimpleNamespace(
                    returncode=0,
                    stdout="DESIGN.md\nscripts/agent-context/design-sections.json\n",
                    stderr="")
            if args[0] == "git" and args[1] in {"add", "commit", "push", "merge"}:
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            return SimpleNamespace(returncode=1, stdout="", stderr="")

        try:
            self.assertTrue(design.resolve_design_table_conflict(
                root, "claude/align-guard-off-scale", None, sh=sh))
            written = (root / "DESIGN.md").read_text()
            self.assertIn("| `arbitrary-values` | `error` | G + I | Yes | 1688 |", written)
            digest = design.section_digest(written, "## Use Tokens, Not Raw Colors")
            self.assertIn(digest, (sections / "design-sections.json").read_text())
            self.assertIn(["git", "push", "-q", "origin", "HEAD:refs/heads/claude/align-guard-off-scale"], calls)
            self.assertNotIn(["git", "merge", "--abort"], calls)
        finally:
            temporary.cleanup()

    def test_unknown_file_aborts_without_push(self):
        calls = []

        def sh(args, cwd=None, log=None, timeout=None):
            calls.append(args)
            if args[:3] == ["git", "merge", "--no-edit"]:
                return SimpleNamespace(returncode=1, stdout="", stderr="")
            if args[:4] == ["git", "diff", "--name-only", "--diff-filter=U"]:
                return SimpleNamespace(returncode=0, stdout="pnpm-lock.yaml\n", stderr="")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        self.assertFalse(design.resolve_design_table_conflict(
            Path("."), "branch", None, sh=sh))
        self.assertIn(["git", "merge", "--abort"], calls)
        self.assertFalse(any(args[:2] == ["git", "push"] for args in calls))

    def test_lane_runner_registers_the_resolver_inside_its_size_budget(self):
        source = (REPO / "scripts/lanes/lane_runner.py").read_text()
        design_at = source.index('"repair-design-table"')
        contained_at = source.index('"repair-contained-by-main"')
        self.assertLess(design_at, contained_at)
        self.assertIn("fix_red_design_table.resolve_design_table_conflict", source)
        lines = source.split("\n").__len__() - (1 if source.endswith("\n") else 0)
        baseline = json.loads((REPO / "scripts/company-guards/size-baseline.json").read_text())
        self.assertLessEqual(lines, baseline["scripts/lanes/lane_runner.py"])


if __name__ == "__main__":
    unittest.main()
