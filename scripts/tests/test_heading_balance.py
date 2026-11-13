"""Heading-balance repair. Split from test_fix_red_source_edits.py (size-500)."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import fix_red_source_edits as edits  # noqa: E402


def pr(*names, merge="BLOCKED"):
    return {
        "mergeStateStatus": merge,
        "statusCheckRollup": [{"name": name, "conclusion": "FAILURE"} for name in names]
        + [{"name": "PR Ready", "conclusion": "FAILURE"}, {"name": "ok", "conclusion": "SUCCESS"}],
    }


class HeadingBalanceTest(unittest.TestCase):
    DIFF = """diff --git a/apps/web/components/Card.tsx b/apps/web/components/Card.tsx
--- a/apps/web/components/Card.tsx
+++ b/apps/web/components/Card.tsx
@@ -3,0 +4,4 @@
+      <h2 className='text-base font-semibold text-primary-token'>
+      <h3 className="text-balance text-base">
+      <h4 className={cn('text-base')}>
+      <h5 className={`text-base font-semibold`}>
diff --git a/apps/web/components/Card.test.tsx b/apps/web/components/Card.test.tsx
--- a/apps/web/components/Card.test.tsx
+++ b/apps/web/components/Card.test.tsx
@@ -1,0 +1 @@
+<h2 className='text-base'>
"""

    def test_balances_only_static_added_product_headings(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "apps/web/components/Card.tsx"
            path.parent.mkdir(parents=True)
            path.write_text(
                "export function Card() {\n"
                "  return (\n"
                "    <section>\n"
                "      <h2 className='text-base font-semibold text-primary-token'>\n"
                "      <h3 className=\"text-balance text-base\">\n"
                "      <h4 className={cn('text-base')}>\n"
                "      <h5 className={`text-base font-semibold`}>\n"
            )
            test = root / "apps/web/components/Card.test.tsx"
            test.write_text("<h2 className='text-base'>\n")
            changed = edits.balance_added_headings(root, self.DIFF)
            self.assertEqual(changed, ["apps/web/components/Card.tsx"])
            text = path.read_text()
            self.assertIn(
                "<h2 className='text-balance text-base font-semibold text-primary-token'>",
                text,
            )
            self.assertIn('<h3 className="text-balance text-base">', text)
            self.assertIn("<h4 className={cn('text-base')}>", text)
            self.assertIn("<h5 className={`text-balance text-base font-semibold`}>", text)
            self.assertEqual(test.read_text(), "<h2 className='text-base'>\n")

    def test_stale_heading_line_is_not_rewritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "apps/web/components/Card.tsx"
            path.parent.mkdir(parents=True)
            path.write_text("already <h2 className='text-balance text-base'>\n")
            self.assertEqual(edits.balance_added_headings(root, self.DIFF), [])

    def test_heading_log_routes_before_rate_limit_noise(self):
        log = (
            "API rate limit exceeded\n"
            "components/features/dashboard/dashboard-pay/DashboardPay.tsx:390  headingNeedsBalance\n"
        )
        got = classes.classify(pr("Source Validation"), {"Source Validation": log})
        self.assertEqual((got["cls"], got["action"]), ("heading-balance", "balance-headings"))
        self.assertIn("balance-headings", classes.DETERMINISTIC)


if __name__ == "__main__":
    unittest.main()
