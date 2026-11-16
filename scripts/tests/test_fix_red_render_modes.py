"""The render-mode admitter runs only when the log names missing dynamic routes."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import fix_red_render_modes as render_modes  # noqa: E402

ROOM = (
    '/app/admin/room (dynamic) has no entry in apps/web/scripts/route-render-modes.json '
    '(new routes fail closed). Add "/app/admin/room": "dynamic", or run '
    '`node apps/web/scripts/route-render-modes.mjs --next-dir apps/web/.next --write` '
    'on the CI mock-env build, and commit it.'
)


def pr():
    return {"mergeStateStatus": "BLOCKED", "statusCheckRollup": [
        {"name": "Exact-head Coverage", "conclusion": "FAILURE"},
        {"name": "PR Ready", "conclusion": "FAILURE"}]}


class RenderModeAdmissionTest(unittest.TestCase):
    def test_exact_dynamic_miss_routes_to_the_admitter(self):
        log = (
            "Exact-head Coverage\tRender modes\t2026-11-14T07:21:01.1705375Z ##[error]"
            + ROOM + "\n"
            "2026-11-14T07:21:01.1741144Z ##[error]Process completed with exit code 1.\n"
        )
        got = classes.classify(pr(), {"Exact-head Coverage": log})
        self.assertEqual((got["cls"], got["action"]), ("render-mode-admission", "admit-render-mode"))
        self.assertEqual(got["files"], ["/app/admin/room"])
        self.assertIn(render_modes.ACTION, classes.DETERMINISTIC)

    def test_another_marked_error_is_not_this_class(self):
        log = f"##[error]{ROOM}\n##[error]cacheability lost\n"
        self.assertIsNone(render_modes.hit(log))
        got = classes.classify(pr(), {"Exact-head Coverage": log})
        self.assertNotEqual(got["action"], "admit-render-mode")

    def test_a_static_miss_is_not_admitted(self):
        log = (
            '##[error]/about (static html=30000) has no entry in '
            'apps/web/scripts/route-render-modes.json (new routes fail closed). '
            'Add "/about": "static html=30000"\n'
        )
        self.assertIsNone(render_modes.hit(log))

    def test_fixer_fast_forwards_only_after_the_node_admitter_succeeds(self):
        calls = []

        def sh(argv, cwd=None, log=None, timeout=None):
            del cwd, log, timeout
            calls.append(list(argv))
            if argv[:2] == ["node", "apps/web/scripts/route-render-modes.mjs"]:
                return SimpleNamespace(returncode=0, stdout='{"changed":["/app/admin/room"]}\n')
            if argv[:2] == ["git", "add"]:
                return SimpleNamespace(returncode=0, stdout="")
            if argv[:3] == ["git", "diff", "--cached"]:
                return SimpleNamespace(returncode=0, stdout=render_modes.SNAPSHOT + "\n")
            if argv[:2] == ["git", "commit"]:
                return SimpleNamespace(returncode=0, stdout="")
            if argv[:2] == ["git", "push"]:
                return SimpleNamespace(returncode=0, stdout="")
            return SimpleNamespace(returncode=1, stdout="")

        receipt = {}
        fixer = render_modes.bind(sh, {"Exact-head Coverage": f"##[error]{ROOM}\n"})
        result = fixer(None, {"headRefName": "claude/perf-ratchets"}, {"files": ["/app/admin/room"]}, "tree", None, receipt)
        self.assertEqual(result.returncode, 0)
        self.assertIn("--admit-from-log", calls[0])
        self.assertNotIn("--force", calls[-1])
        self.assertEqual(calls[-1][:4], ["git", "push", "-q", "origin"])
        self.assertEqual(receipt["admittedRoutes"], ["/app/admin/room"])

    def test_fixer_returns_none_when_node_refuses(self):
        def sh(argv, cwd=None, log=None, timeout=None):
            del cwd, log, timeout
            return SimpleNamespace(returncode=1, stdout="")

        fixer = render_modes.bind(sh, {"Exact-head Coverage": f"##[error]{ROOM}\n"})
        self.assertIsNone(fixer(None, {"headRefName": "claude/perf-ratchets"}, {}, "tree", None, {}))


if __name__ == "__main__":
    unittest.main()
