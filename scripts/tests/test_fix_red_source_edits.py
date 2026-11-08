import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402


def pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge, "statusCheckRollup": [{"name": n, "conclusion": "FAILURE"} for n in names]
            + [{"name": "PR Ready", "conclusion": "FAILURE"}, {"name": "ok", "conclusion": "SUCCESS"}]}


class SpacingSnapTest(unittest.TestCase):
    DIFF = """diff --git a/apps/web/components/Card.tsx b/apps/web/components/Card.tsx
--- a/apps/web/components/Card.tsx
+++ b/apps/web/components/Card.tsx
@@ -1,0 +2 @@
+        <div className='mb-4 flex items-center gap-2.5 h-3.5 -mx-3.5 sm:gap-3.5'>
diff --git a/apps/web/components/Card.test.tsx b/apps/web/components/Card.test.tsx
--- a/apps/web/components/Card.test.tsx
+++ b/apps/web/components/Card.test.tsx
@@ -1,0 +1 @@
+expect(node).toHaveClass('gap-2.5')
diff --git a/apps/web/lib/skip.ts b/apps/web/lib/skip.ts
--- a/apps/web/lib/skip.ts
+++ b/apps/web/lib/skip.ts
@@ -1,0 +1 @@
+const klass = 'gap-2.5'
"""

    def test_snaps_only_the_added_product_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "apps/web/components/Card.tsx"
            path.parent.mkdir(parents=True)
            path.write_text(
                "const kept = 'gap-2.5'\n"
                "        <div className='mb-4 flex items-center gap-2.5 h-3.5 -mx-3.5 sm:gap-3.5'>\n"
            )
            (root / "apps/web/components/Card.test.tsx").write_text("expect(node).toHaveClass('gap-2.5')\n")
            (root / "apps/web/lib").mkdir()
            (root / "apps/web/lib/skip.ts").write_text("const klass = 'gap-2.5'\n")
            changed = classes.snap_added_conservative_spacing(root, self.DIFF)
            self.assertEqual(changed, ["apps/web/components/Card.tsx"])
            text = path.read_text()
            self.assertIn("const kept = 'gap-2.5'\n", text)
            self.assertIn("gap-2 h-3.5 -mx-3 sm:gap-3", text)
            self.assertNotIn("gap-2.5 h-3.5", text)
            self.assertIn("gap-2.5", (root / "apps/web/components/Card.test.tsx").read_text())
            self.assertIn("gap-2.5", (root / "apps/web/lib/skip.ts").read_text())

    def test_stale_line_is_not_rewritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "apps/web/components/Card.tsx"
            path.parent.mkdir(parents=True)
            path.write_text("const kept = 'gap-2.5'\nalready snapped gap-2\n")
            self.assertEqual(classes.snap_added_conservative_spacing(root, self.DIFF), [])
            self.assertIn("already snapped gap-2\n", path.read_text())


class CacheSurfaceTest(unittest.TestCase):
    LOG = (
        "passing fixture: github-quota-deferred; API rate limit exceeded\n"
        "HttpError: HTTP 500\n"
        "Error: legacy Cache Components surface grew to 500 (maximum 241):\n"
        "  apps/web/app/api/internal/ovie/dogfood-judge-evidence/route.ts\n"
    )
    DIFF = """diff --git a/apps/web/app/api/internal/ovie/dogfood-judge-evidence/route.ts b/apps/web/app/api/internal/ovie/dogfood-judge-evidence/route.ts
new file mode 100644
--- /dev/null
+++ b/apps/web/app/api/internal/ovie/dogfood-judge-evidence/route.ts
@@ -0,0 +1,3 @@
+export const runtime = 'nodejs';
+export const dynamic = 'force-dynamic';
+export const revalidate = 0;
diff --git a/apps/web/app/api/internal/ovie/certification-evidence/route.ts b/apps/web/app/api/internal/ovie/certification-evidence/route.ts
--- a/apps/web/app/api/internal/ovie/certification-evidence/route.ts
+++ b/apps/web/app/api/internal/ovie/certification-evidence/route.ts
@@ -2,0 +3 @@
+export const fetchCache = 'force-no-store';
diff --git a/apps/web/app/api/internal/ovie/dogfood-judge-evidence/route.test.ts b/apps/web/app/api/internal/ovie/dogfood-judge-evidence/route.test.ts
new file mode 100644
--- /dev/null
+++ b/apps/web/app/api/internal/ovie/dogfood-judge-evidence/route.test.ts
@@ -0,0 +1,1 @@
+export const dynamic = 'force-dynamic';
diff --git a/apps/web/../outside.ts b/apps/web/../outside.ts
--- /dev/null
+++ b/apps/web/../outside.ts
@@ -0,0 +1,1 @@
+export const dynamic = 'force-dynamic';
"""

    def test_growth_outranks_http_500_noise(self):
        got = classes.classify(pr("Source Validation"), {"Source Validation": self.LOG})
        self.assertEqual((got["cls"], got["action"]), ("cache-surface", "strip-cache-exports"))
        self.assertIn(got["action"], classes.DETERMINISTIC)

    def test_strips_only_added_exports(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            new = root / "apps/web/app/api/internal/ovie/dogfood-judge-evidence/route.ts"
            old = root / "apps/web/app/api/internal/ovie/certification-evidence/route.ts"
            test = root / "apps/web/app/api/internal/ovie/dogfood-judge-evidence/route.test.ts"
            new.parent.mkdir(parents=True)
            old.parent.mkdir(parents=True)
            new.write_text(
                "export const runtime = 'nodejs';\n"
                "export const dynamic = 'force-dynamic';\n"
                "export const revalidate = 0;\n"
            )
            old.write_text(
                "export const runtime = 'nodejs';\n"
                "export const dynamic = 'force-dynamic';\n"
                "export const fetchCache = 'force-no-store';\n"
            )
            test.write_text("export const dynamic = 'force-dynamic';\n")
            outside = root / "outside.ts"
            outside.write_text("export const dynamic = 'force-dynamic';\n")
            changed = classes.strip_added_legacy_cache_exports(root, self.DIFF)
            self.assertEqual(changed, [
                "apps/web/app/api/internal/ovie/certification-evidence/route.ts",
                "apps/web/app/api/internal/ovie/dogfood-judge-evidence/route.ts",
            ])
            self.assertEqual(new.read_text(), "export const runtime = 'nodejs';\n")
            self.assertEqual(
                old.read_text(),
                "export const runtime = 'nodejs';\nexport const dynamic = 'force-dynamic';\n",
            )
            self.assertIn("force-dynamic", test.read_text())
            self.assertIn("force-dynamic", outside.read_text())

    def test_stale_line_is_not_deleted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "apps/web/app/api/internal/ovie/dogfood-judge-evidence/route.ts"
            path.parent.mkdir(parents=True)
            path.write_text("export const runtime = 'nodejs';\n")
            self.assertEqual(classes.strip_added_legacy_cache_exports(root, self.DIFF), [])
            self.assertEqual(path.read_text(), "export const runtime = 'nodejs';\n")


class BaseRetargetTest(unittest.TestCase):
    def test_script_source_is_not_a_base_retarget_and_the_argv_is_shared(self):
        source = "throw new Error('PRs must target main. Retarget the pull request base to main.');"
        self.assertEqual(classes.classify(pr("PR targets main"), {"PR targets main": source})["action"], classes.AGENT)
        runtime = "Error: PRs must target main. Retarget the pull request base to main."
        got = classes.classify(pr("PR targets main"), {"PR targets main": runtime})
        self.assertEqual((got["cls"], got["action"]), ("base-not-main", "retarget-pr-base-to-main"))
        argv = ["pr", "edit", "24530", "--repo", "JovieInc/Jovie", "--base", "main"]
        self.assertEqual(classes.retarget_main_args(24530), argv)
        live = {"state": "OPEN", "isInMergeQueue": False, "baseRefName": "parent", "number": 24530,
                "mergeStateStatus": "DIRTY", "statusCheckRollup": [{"name": "PR targets main", "conclusion": "FAILURE"}]}
        self.assertTrue(classes.should_retarget_base(live))
        self.assertFalse(classes.should_retarget_base({**live, "baseRefName": "main"}) or classes.should_retarget_base({**live, "isInMergeQueue": True}))
        seen, receipt = [], {}
        ok = lambda args, priority="repair": seen.append((args, priority)) or type("R", (), {"returncode": 0})()
        self.assertIsNone(classes.retarget_if_needed(live, receipt, ok, "JovieInc/Jovie"))
        self.assertEqual((seen, receipt.get("retargetedBase"), live["baseRefName"]), ([(argv, "repair")], "main", "main"))
        clean = {**live, "baseRefName": "parent", "mergeStateStatus": "BLOCKED"}
        self.assertEqual(classes.retarget_if_needed(clean, {}, ok, "JovieInc/Jovie"), "retargeted-main")


if __name__ == "__main__":
    unittest.main()
