import json
import sys
import subprocess
from types import SimpleNamespace
from unittest.mock import patch
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import lane_runner as lane  # noqa: E402
import fix_red_source_edits as edits  # noqa: E402
import fix_red_statement_merge as statements  # noqa: E402
# Release self-test runs this listed file only, so the split class has to load here.
from scripts.tests.test_duplicate_clock_pin import DuplicateClockPinTest  # noqa: E402

assert issubclass(DuplicateClockPinTest, unittest.TestCase)


def pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge, "statusCheckRollup": [{"name": n, "conclusion": "FAILURE"} for n in names]
            + [{"name": "PR Ready", "conclusion": "FAILURE"}, {"name": "ok", "conclusion": "SUCCESS"}]}


class AdditiveCertificateWaiversTest(unittest.TestCase):
    REL = "docs/design-system/component-certification.json"

    def setUp(self):
        self.base = {"policy": {"mutationMin": 80}, "gates": {},
                     "waivers": {"existing.tsx": {"offline": "No network"}}}
        self.ours = json.loads(json.dumps(self.base))
        self.theirs = json.loads(json.dumps(self.base))
        self.ours["waivers"]["head.tsx"] = {"empty": "No collection"}
        self.theirs["waivers"]["main.tsx"] = {"offline": "No network"}

    def resolve(self, rel=None, blobs=None):
        values = blobs or [json.dumps(value) for value in (self.base, self.ours, self.theirs)]
        def sh(args, **kwargs):
            return SimpleNamespace(returncode=0, stdout=values[int(args[-1][1]) - 1])
        return edits.resolve_additive_certificate_waivers(Path("."), rel or self.REL, sh)

    def test_writes_the_union_sorted_by_component_path(self):
        result = json.loads(self.resolve())
        self.assertEqual(list(result["waivers"]), ["existing.tsx", "head.tsx", "main.tsx"])
        self.assertEqual(result["waivers"]["head.tsx"], self.ours["waivers"]["head.tsx"])
        self.assertEqual(result["policy"], self.base["policy"])

    def test_refuses_edits_deletions_conflicting_additions_and_other_paths(self):
        for mutate in (
            lambda: self.ours["policy"].update(mutationMin=0),
            lambda: self.ours["waivers"].pop("existing.tsx"),
            lambda: self.theirs["waivers"]["existing.tsx"].update(offline="Changed"),
            lambda: self.theirs["waivers"].update({"head.tsx": {"empty": "Different"}}),
            lambda: self.ours["waivers"].update({"head.tsx": []}),
        ):
            self.setUp()
            mutate()
            self.assertIsNone(self.resolve())
        self.assertIsNone(self.resolve("generated.json"))
        self.assertIsNone(self.resolve(blobs=['{"waivers":{},"waivers":{}}'] * 3))
        self.assertIsNone(self.resolve(blobs=["not JSON"] * 3))

    def test_real_git_append_conflict_is_repaired_through_existing_machine(self):
        debt_rel = "docs/design-system/cert-screens.json"
        debt_base = {"schema": "jovie.cert-screens/v1", "debt": {
            "kept.tsx": "a11y,states",
            "drop-head.tsx": "states",
            "also.tsx": "tests",
            "drop-main.tsx": "a11y",
        }}
        debt_ours = json.loads(json.dumps(debt_base))
        debt_theirs = json.loads(json.dumps(debt_base))
        del debt_ours["debt"]["drop-head.tsx"]
        del debt_theirs["debt"]["drop-main.tsx"]
        with tempfile.TemporaryDirectory() as scratch:
            work = Path(scratch)
            def sh(args, **kwargs):
                return subprocess.run(args, cwd=work, capture_output=True, text=True)
            def git(*args):
                result = sh(["git", *args])
                self.assertEqual(result.returncode, 0, result.stderr)
                return result.stdout.strip()
            git("init", "-q", "-b", "main")
            git("config", "user.name", "Test")
            git("config", "user.email", "test@example.test")
            git("config", "commit.gpgsign", "false")
            git("config", "core.hooksPath", str(work / "hooks"))
            target = work / self.REL
            debt_target = work / debt_rel
            target.parent.mkdir(parents=True)
            def save(waiver, debt):
                target.write_text(json.dumps(waiver, indent=2) + "\n")
                debt_target.write_text(json.dumps(debt, indent=2) + "\n")
                git("add", self.REL, debt_rel)
                git("commit", "-qm", "fixture")
            save(self.base, debt_base)
            git("branch", "feature")
            save(self.theirs, debt_theirs)
            git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"))
            git("checkout", "-q", "feature")
            save(self.ours, debt_ours)
            def machine_sh(args, **kwargs):
                # Leave mutation/verification/push ownership with the caller.
                if args[:2] == ["git", "push"]:
                    return SimpleNamespace(returncode=0)
                return sh(args)
            self.assertTrue(edits.resolve_additive_list_conflict(
                work, "feature", None, sh=machine_sh, merge_entries=lambda _: None))
            self.assertEqual(json.loads(target.read_text()), json.loads(self.resolve()))
            debt = json.loads(debt_target.read_text())
            self.assertEqual(list(debt["debt"]), ["kept.tsx", "also.tsx"])
            self.assertEqual(debt["schema"], debt_base["schema"])
            self.assertEqual(git("diff", "--name-only", "--diff-filter=U"), "")


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


class AdditiveNodeTestMergeTest(unittest.TestCase):
    @staticmethod
    def block(name, assertion="  assert.ok(true);"):
        return f"test('{name}', () => {{\n{assertion}\n}});\n\n"

    def conflict(self, ours, theirs, base=""):
        return f"<<<<<<< HEAD\n{ours}||||||| base\n{base}=======\n{theirs}>>>>>>> main\n"

    def test_unions_complete_added_tests_in_main_order(self):
        ours, theirs = self.block("head"), self.block("main")
        merged = classes.resolve_additive_node_tests_text(self.conflict(ours, theirs))
        self.assertEqual(merged, theirs + ours)
        self.assertEqual(classes.resolve_additive_node_tests_text(
            self.conflict(ours + theirs, theirs)), theirs + ours)

    def test_unknown_hunks_and_changes_to_existing_tests_stay_unresolved(self):
        ours, theirs = self.block("head"), self.block("main")
        for value in (self.conflict(ours, theirs, self.block("old")),
                      self.conflict(ours, "const x = 1;\n"),
                      self.conflict(ours, self.block("head", "  assert.ok(false);")),
                      self.conflict(ours + ours, theirs),
                      self.conflict(ours, theirs).replace("||||||| base\n", ""),
                      self.conflict(ours, theirs) + "<<<<<<< unknown\n"):
            with self.subTest(value=value):
                self.assertIsNone(classes.resolve_additive_node_tests_text(value))


class AdditiveNodeTestFileTest(unittest.TestCase):
    def test_real_git_conflict_preserves_and_executes_both_sides(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            work, origin = root / "work", root / "origin.git"
            subprocess.run(["git", "init", "-q", "-b", "main", str(work)], check=True)
            subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(origin)], check=True)
            def git(*args):
                return subprocess.run(["git", *args], cwd=work, check=True, capture_output=True, text=True)
            hooks = root / "hooks"
            hooks.mkdir()
            for key, value in (("user.name", "t"), ("user.email", "t@example.test"),
                               ("commit.gpgsign", "false"), ("core.hooksPath", str(hooks))):
                git("config", key, value)
            git("remote", "add", "origin", str(origin))
            path = work / "draft.test.mjs"
            base = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n"
            divider = "".join(f"// unchanged boundary {i}\n" for i in range(8))
            path.write_text(base + divider)
            git("add", ".")
            git("commit", "-qm", "base")
            git("branch", "feature")
            git("checkout", "-q", "feature")
            ours = "test('head retry budget', () => {\n  assert.equal(1 + 1, 2);\n});\n\n"
            ours_tail = AdditiveNodeTestMergeTest.block("head second insertion")
            path.write_text(base + ours + divider + ours_tail)
            git("commit", "-qam", "head test")
            git("push", "-q", "origin", "HEAD:refs/heads/feature")
            before = git("rev-parse", "HEAD").stdout.strip()
            git("checkout", "-q", "main")
            theirs = "test('main verbose errors', () => {\n  assert.ok(true);\n});\n\n"
            theirs_tail = AdditiveNodeTestMergeTest.block("main second insertion")
            path.write_text(base + theirs + divider + theirs_tail)
            git("commit", "-qam", "main test")
            git("push", "-q", "origin", "HEAD:refs/heads/main")
            git("checkout", "-q", "feature")
            self.assertTrue(lane.resolve_additive_list_conflict(work, "feature", None))
            self.assertEqual(path.read_text(), base + theirs + ours + divider + theirs_tail + ours_tail)
            after = git("rev-parse", "HEAD").stdout.strip()
            self.assertNotEqual(after, before)
            self.assertEqual(after, git("rev-parse", "origin/feature").stdout.strip())
            git("merge-base", "--is-ancestor", before, after)
            result = subprocess.run(["node", "--test", str(path)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("# pass 4", result.stdout.replace("ℹ", "#"))

    def test_unknown_files_missing_stages_and_merge_errors_fail_closed(self):
        for rel, replies in (("code.mjs", []),
                             ("draft.test.mjs", [SimpleNamespace(returncode=1)]),
                             ("draft.test.mjs", [SimpleNamespace(returncode=0, stdout="")]*3
                              + [SimpleNamespace(returncode=2, stdout="")])):
            with self.subTest(rel=rel, replies=replies), patch.object(lane, "sh", side_effect=replies):
                self.assertIsNone(classes.resolve_additive_node_test_file(Path("."), rel, lane.sh))

    def test_merge_status_bounds_preserve_fail_closed_behavior(self):
        block = AdditiveNodeTestMergeTest.block
        conflict = AdditiveNodeTestMergeTest().conflict(block("head"), block("main"))
        for code in (0, -1, 128, 255, 127):
            replies = [SimpleNamespace(returncode=0, stdout="")] * 3
            replies.append(SimpleNamespace(returncode=code, stdout=conflict))
            with self.subTest(code=code), patch.object(lane, "sh", side_effect=replies):
                actual = classes.resolve_additive_node_test_file(Path("."), "draft.test.mjs", lane.sh)
                self.assertEqual(actual, block("main") + block("head") if code == 127 else None)


class AdditiveStatementMergeTest(unittest.TestCase):
    @staticmethod
    def conflict(ours, theirs, base=""):
        return f"<<<<<<< HEAD\n{ours}||||||| base\n{base}=======\n{theirs}>>>>>>> main\n"

    def test_unions_empty_base_statements_in_main_order(self):
        ours = (
            "const mockSweepLegacySlugs = vi.hoisted(() =>\n"
            "  vi.fn(async () => ({ renamed: 1 }))\n"
            ");\n"
        )
        theirs = "const mockSweepAppleMusicCatalog = vi.hoisted(() => vi.fn());\n"
        mock_ours = (
            "vi.mock('@/lib/discography/slug-migration', () => ({\n"
            "  sweepLegacySlugsForCron: mockSweepLegacySlugs,\n"
            "}));\n"
        )
        mock_theirs = (
            "vi.mock('@/lib/discography/apple-music-import', () => ({\n"
            "  sweepAppleMusicCatalogCompletenessForCron: mockSweepAppleMusicCatalog,\n"
            "}));\n"
        )
        expect_ours = "    expect(data.results.legacySlugMigration.data).toEqual({ renamed: 1 });\n"
        expect_theirs = (
            "    expect(data.results.appleMusicCatalogImport.data).toEqual({\n"
            "      profilesChecked: 2,\n"
            "      releasesImported: 3,\n"
            "      failed: 0,\n"
            "    });\n"
        )
        text = (
            "before\n"
            + self.conflict(ours, theirs)
            + "middle\n"
            + self.conflict(mock_ours, mock_theirs)
            + "after\n"
            + self.conflict(expect_ours, expect_theirs)
        )
        merged = statements.resolve_additive_statements_text(text)
        self.assertEqual(merged, "before\n" + theirs + ours + "middle\n" + mock_theirs + mock_ours + "after\n" + expect_theirs + expect_ours)

    def test_unions_an_import_and_accepts_route_group_paths(self):
        imported = "import { getRequestSession } from '@/lib/auth/request-session';\n"
        mocks = (
            "const winbackMocks = vi.hoisted(() => ({ resolveWinbackResumeToken: vi.fn() }));\n"
            "vi.mock('@/lib/waitlist/winback-resume.server', () => ({\n"
            "  resolveWinbackResumeToken: winbackMocks.resolveWinbackResumeToken,\n"
            "}));\n"
        )
        merge = statements.resolve_additive_statements_text
        self.assertEqual(merge(self.conflict(imported, mocks)), mocks + imported)
        self.assertEqual(merge(self.conflict(imported, imported)), imported)
        self.assertIsNone(merge(self.conflict(
            imported, "import { other } from '@/lib/auth/request-session';\n")))
        self.assertIsNone(merge(self.conflict(
            "import {\n  getRequestSession,\n} from '@/lib/auth/request-session';\n", mocks)))
        calls = []

        def sh(args, **_kwargs):
            calls.append(args)
            return SimpleNamespace(returncode=1, stdout="")

        for rel in (
            "apps/web/app/(dynamic)/start/page.test.ts",
            "apps/web/app/[username]/page.test.tsx",
            "apps/web/app/(.)photo/page.test.ts",
            "README.md",
        ):
            calls.clear()
            self.assertIsNone(edits.resolve_additive_statement_file(Path("."), rel, sh))
            self.assertEqual(bool(calls), rel != "README.md")

    def test_edits_control_flow_and_unknown_shapes_stay_unresolved(self):
        added = "const head = vi.fn();\n"
        for value in (
            self.conflict(added, "const main = vi.fn();\n", "const old = vi.fn();\n"),
            self.conflict("  return 1;\n", "  return 2;\n"),
            self.conflict("const head = vi.fn();\n", "const head = vi.fn(async () => 1);\n"),
            self.conflict("vi.mock('@/a', () => ({\n", "vi.mock('@/b', () => ({\n"),
            self.conflict(added, "const main = vi.fn();\n").replace("||||||| base\n", ""),
            "const clean = vi.fn();\n",
        ):
            with self.subTest(value=value):
                self.assertIsNone(statements.resolve_additive_statements_text(value))


class Size500StaleTest(unittest.TestCase):
    LOG = "\n".join([
        "##[warning]vacuous-verdict: apps/web/lib/finance/metrics/engine.ts: 1 vacuous verdict site(s)",
        "##[error]size-500: apps/web/lib/agent-os/certification.ts: grew 1220 -> 1265",
        "##[error]size-500: scripts/lanes/lane_runner.py: grew 11721 -> 11736",
        "##[error]Process completed with exit code 1.",
        "company-guards: FAIL (2)",
    ])

    def test_blocked_size_growth_syncs_main(self):
        got = classes.classify(pr("Company guards", merge="BLOCKED"), {"Company guards": self.LOG})
        self.assertEqual((got["cls"], got["action"]), ("size-500-stale", "sync-main"))
        self.assertIsNone(edits.size_500_stale_hit(None))
        self.assertIsNone(edits.size_500_stale_hit("##[error]Process completed with exit code 1."))

    def test_another_annotated_error_stays_with_the_model(self):
        log = self.LOG + "\n##[error]AssertionError: expected 1"
        got = classes.classify(pr("Company guards", merge="BLOCKED"), {"Company guards": log})
        self.assertEqual((got["cls"], got["action"]), ("other", "agent"))

    def test_a_known_signature_outranks_size_growth_in_the_same_log(self):
        log = "API rate limit exceeded\n" + self.LOG
        got = classes.classify(pr("Company guards"), {"Company guards": log})
        self.assertEqual(got["action"], "rerun")

    def test_size_growth_beside_another_failing_check_stays_mixed(self):
        got = classes.classify(pr("Company guards", "Unit Tests"), {
            "Company guards": self.LOG,
            "Unit Tests": "AssertionError: expected 1",
        })
        self.assertEqual((got["cls"], got["action"]), ("mixed", "agent"))


if __name__ == "__main__":
    unittest.main()
