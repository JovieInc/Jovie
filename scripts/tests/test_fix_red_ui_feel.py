"""ui-feel log routing and the token applicator."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import fix_red_ui_feel as ui_feel  # noqa: E402

HEADING = "<h2 className='mt-2 text-2xl text-primary-token'>"
NUMERAL = "<p className='mt-2 text-xl text-primary-token'>"
BLOCK = (
    "github-quota-deferred\n"
    "Source Validation\tSTEP\t2026-11-13T02:06:11.2226643Z "
    "[lint:ui-feel] new violations on lines this change adds:\n"
    "Source Validation\tSTEP\t2026-11-13T02:06:11.2229665Z   "
    "components/features/demo/DemoReleaseTasksSurface.tsx:1  headingNeedsBalance\n"
    "Source Validation\tSTEP\t2026-11-13T02:06:11.2231197Z   "
    "components/features/demo/DemoReleaseTasksSurface.tsx:2  missingTabularNums\n"
    "Source Validation\tSTEP\t2026-11-13T02:06:11.2231918Z "
    "[lint:ui-feel] see eslint-rules/ui-feel.js for each check and its fix.\n"
)


def pr():
    return {"mergeStateStatus": "BLOCKED", "statusCheckRollup": [
        {"name": "Source Validation", "conclusion": "FAILURE"},
        {"name": "PR Ready", "conclusion": "FAILURE"}]}


class UiFeelTest(unittest.TestCase):
    def test_ui_feel_outranks_quota_text_in_the_same_log(self):
        got = classes.classify(pr(), {"Source Validation": BLOCK})
        self.assertEqual((got["cls"], got["action"]), ("ui-feel", "ui-feel"))
        self.assertIn(got["action"], classes.DETERMINISTIC)
        plain = classes.classify(pr(), {"Source Validation": "github-quota-deferred"})
        self.assertEqual((plain["cls"], plain["action"]), ("quota-deferred", "rerun"))
        bare = classes.classify(pr(), {"Source Validation": "components/x.tsx:1  missingTabularNums"})
        self.assertNotEqual(bare["cls"], "ui-feel")

    def test_apply_inserts_reported_tokens_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "apps/web/components/features/demo/DemoReleaseTasksSurface.tsx"
            path.parent.mkdir(parents=True)
            path.write_text(HEADING + "\n" + NUMERAL + "\n", encoding="utf-8")
            changed = ui_feel.apply(root, BLOCK)
            self.assertEqual(changed, ["apps/web/components/features/demo/DemoReleaseTasksSurface.tsx"])
            text = path.read_text(encoding="utf-8")
            self.assertIn("text-balance", text.splitlines()[0])
            self.assertIn("tabular-nums", text.splitlines()[1])
            self.assertEqual(ui_feel.apply(root, BLOCK), [])

    def test_exempt_dynamic_escape_and_partial_failure_write_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            good = root / "apps/web/components/Good.tsx"
            bad = root / "apps/web/components/Bad.tsx"
            good.parent.mkdir(parents=True)
            good.write_text("<h2 className='text-pretty title'>\n", encoding="utf-8")
            bad.write_text("<p className={countClass}>\n", encoding="utf-8")
            exempt = (
                "[lint:ui-feel] new violations on lines this change adds:\n"
                "  components/Good.tsx:1  headingNeedsBalance\n"
                "[lint:ui-feel] see eslint-rules\n")
            self.assertEqual(ui_feel.apply(root, exempt), [])
            self.assertIn("text-pretty", good.read_text(encoding="utf-8"))
            needs = root / "apps/web/components/Needs.tsx"
            needs.write_text("<h2 className='title'>\n", encoding="utf-8")
            mixed = (
                "[lint:ui-feel] new violations on lines this change adds:\n"
                "  components/Needs.tsx:1  headingNeedsBalance\n"
                "  components/Bad.tsx:1  missingTabularNums\n"
                "[lint:ui-feel] see eslint-rules\n")
            self.assertEqual(ui_feel.apply(root, mixed), [])
            self.assertEqual(needs.read_text(encoding="utf-8"), "<h2 className='title'>\n")
            self.assertNotIn("tabular-nums", bad.read_text(encoding="utf-8"))
            escaped = (
                "[lint:ui-feel] new violations on lines this change adds:\n"
                "  components/../../outside.tsx:1  missingTabularNums\n"
                "[lint:ui-feel] see eslint-rules\n")
            self.assertIsNone(ui_feel.hits(escaped))
            self.assertEqual(ui_feel.apply(root, escaped), [])
            self.assertEqual(ui_feel.hits("missingTabularNums without the marker"), [])

    def test_failed_atomic_replace_preserves_source_and_cleans_staging(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "apps/web/components/features/demo/DemoReleaseTasksSurface.tsx"
            path.parent.mkdir(parents=True)
            original = HEADING + "\n" + NUMERAL + "\n"
            path.write_text(original, encoding="utf-8")
            with patch("atomic_state.os.replace", side_effect=OSError("replace refused")):
                with self.assertRaisesRegex(OSError, "replace refused"):
                    ui_feel.apply(root, BLOCK)
            self.assertEqual(path.read_text(encoding="utf-8"), original)
            self.assertEqual(list(path.parent.iterdir()), [path])

    def test_reported_dynamic_route_and_main_heading_forms_are_repaired(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "apps/web/app/[username]/page.tsx"
            path.parent.mkdir(parents=True)
            path.write_text("<h2>Account setup</h2>\n<h3 className={`title`}>Profile</h3>\n", encoding="utf-8")
            log = BLOCK.replace("components/features/demo/DemoReleaseTasksSurface.tsx", "app/[username]/page.tsx").replace("missingTabularNums", "headingNeedsBalance")
            self.assertEqual(ui_feel.apply(root, log), ["apps/web/app/[username]/page.tsx"])
            self.assertEqual(path.read_text(encoding="utf-8"), '<h2 className="text-balance">Account setup</h2>\n<h3 className={`text-balance title`}>Profile</h3>\n')
            self.assertEqual(ui_feel.apply(root, log), [])

    def test_heading_without_class_keeps_main_repair_behavior(self):
        self.assertEqual(ui_feel.insert_token("<h2>Account setup</h2>", "headingNeedsBalance"), '<h2 className="text-balance">Account setup</h2>')

    def test_publish_skips_commit_when_the_log_has_no_block(self):
        class Result:
            returncode = 0
            stdout = ""

        def sh(args, cwd, log, timeout):
            self.assertEqual(args[:3], ["git", "diff", "-U0"])
            return Result()

        self.assertIsNone(ui_feel.publish(
            sh, lambda *_args: {}, object(), {"number": 1, "headRefName": "fix/x"}, Path("."), None, {}))

    def test_runner_dispatch_keeps_ui_feel_repair_after_compose_integration(self):
        import lane_runner as lane
        from fix_red_compose import deterministic_fixer

        receipt = {}
        pr_row = {"number": 25272}
        with patch.object(classes, "publish_ui_feel", return_value="pushed") as publish:
            fixer = deterministic_fixer(lane, classes.UI_FEEL)
            self.assertIsNotNone(fixer)
            self.assertEqual(fixer("host", pr_row, {}, Path("."), "log", receipt), "pushed")
        publish.assert_called_once_with(lane.sh, lane.failed_logs, "host", pr_row, Path("."), "log", receipt)


if __name__ == "__main__":
    unittest.main()
