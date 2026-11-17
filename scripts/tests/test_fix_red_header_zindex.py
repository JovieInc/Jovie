"""The header z-index fix-red route rewrites only the two marketing header twins."""
import json
import sys
import tempfile
import textwrap
import unittest
from unittest.mock import patch, sentinel
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import fix_red_header_zindex as header_z  # noqa: E402


def _pr():
    name = "Affected Unit Tests (4/4)"
    return {
        "mergeStateStatus": "BLOCKED",
        "statusCheckRollup": [
            {"name": name, "conclusion": "FAILURE"},
            {"name": "PR Ready", "conclusion": "FAILURE"},
        ],
    }


class HeaderZIndexRouteTest(unittest.TestCase):
    def write(self, root: Path, rel: str, text: str) -> None:
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def tree(self) -> Path:
        root = Path(tempfile.mkdtemp())
        self.write(root, header_z.TOKEN_FILE, "  --z-index-tooltip: 150;\n")
        self.write(root, header_z.HEADER_FILES[0], "style={{\n          zIndex: 100,\n}}\n")
        self.write(root, header_z.HEADER_FILES[1], "style={{\n        zIndex: 100,\n}}\n")
        self.write(root, "apps/web/components/molecules/MobileNav.tsx", "style={{\n  zIndex: 100,\n}}\n")
        self.write(
            root,
            header_z.BASELINE,
            textwrap.dedent(
                """\
                {
                  "totalFindings": 3,
                  "files": {
                    "apps/web/components/molecules/MobileNav.tsx": {
                      "z-[100]": 1
                    },
                    "apps/web/components/organisms/HeaderNav.tsx": {
                      "zIndex:100": 1
                    },
                    "apps/web/components/shell/ContextMenuOverlay.tsx": {
                      "z-[110]": 1
                    }
                  }
                }
                """
            ),
        )
        return root

    def diff(self) -> str:
        return (
            "diff --git a/apps/web/components/organisms/RootNotFoundHeader.tsx "
            "b/apps/web/components/organisms/RootNotFoundHeader.tsx\n"
            "+++ b/apps/web/components/organisms/RootNotFoundHeader.tsx\n"
            "+        zIndex: 100,\n"
        )

    def test_rewrites_only_header_chrome_and_shrinks_that_baseline_key(self):
        root = self.tree()
        changed = header_z.rewrite_header_site_zindex(root, self.diff())
        self.assertEqual(
            changed,
            [
                header_z.TOKEN_FILE,
                header_z.HEADER_FILES[0],
                header_z.HEADER_FILES[1],
                header_z.BASELINE,
            ],
        )
        sheet = (root / header_z.TOKEN_FILE).read_text()
        self.assertEqual(sheet.count("--z-index-site-header:"), 1)
        self.assertIn("--z-index-tooltip: 150;", sheet)
        for rel in header_z.HEADER_FILES:
            text = (root / rel).read_text()
            self.assertNotIn("zIndex: 100", text)
            self.assertIn("zIndex: 'var(--z-index-site-header)'", text)
        untouched = (root / "apps/web/components/molecules/MobileNav.tsx").read_text()
        self.assertIn("zIndex: 100", untouched)
        baseline = json.loads((root / header_z.BASELINE).read_text())
        self.assertNotIn(header_z.HEADER_FILES[0], baseline["files"])
        self.assertEqual(baseline["files"]["apps/web/components/molecules/MobileNav.tsx"], {"z-[100]": 1})
        self.assertEqual(baseline["files"]["apps/web/components/shell/ContextMenuOverlay.tsx"], {"z-[110]": 1})
        self.assertEqual(baseline["totalFindings"], 2)

    def test_ignores_a_diff_that_does_not_add_header_chrome(self):
        root = self.tree()
        self.assertEqual(header_z.rewrite_header_site_zindex(root, "+ zIndex: 100,\n"), [])
        self.assertIn("zIndex: 100", (root / header_z.HEADER_FILES[0]).read_text())

    def test_classify_prefers_the_header_route_over_quota_noise(self):
        name = "Affected Unit Tests (4/4)"
        log = (
            "overlay-raw-z-index: apps/web/components/organisms/RootNotFoundHeader.tsx: "
            "zIndex:100 x1 (baseline 0)\n"
            "github-quota-deferred\n"
        )
        route = classes.classify(_pr(), {name: log})
        self.assertEqual(route["cls"], "overlay-header-zindex")
        self.assertEqual(route["action"], classes.HEADER_ZINDEX)

    def test_shared_dispatcher_runs_the_header_rewrite(self):
        import fix_red_compose
        import lane_runner as lane

        pr, worktree, log, receipt = _pr(), Path("tree"), "log", {}
        with patch.object(lane.fix_red_rewrite, "rewrite_commit_push", return_value=sentinel.pushed) as rewrite:
            fixer = fix_red_compose.deterministic_fixer(lane, classes.HEADER_ZINDEX)
            self.assertIs(fixer(None, pr, {}, worktree, log, receipt), sentinel.pushed)
        rewrite.assert_called_once_with(
            lane.sh, pr, worktree, log, receipt, ("apps/web", "scripts/invariants"),
            classes.rewrite_header_site_zindex,
            "fix(web): point header chrome at the site-header z-index token",
            "rewrote-header-zindex", "rewroteFiles")

    def test_lane_tests_lists_this_file(self):
        runner = Path(__file__).resolve().parents[1].joinpath("lanes/lane_runner.py").read_text()
        self.assertIn("scripts/tests/test_fix_red_header_zindex.py", runner)
