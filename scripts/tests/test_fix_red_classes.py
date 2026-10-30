import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402


def pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge, "statusCheckRollup": [{"name": n, "conclusion": "FAILURE"} for n in names]
            + [{"name": "PR Ready", "conclusion": "FAILURE"}, {"name": "ok", "conclusion": "SUCCESS"}]}


class ClassifyTest(unittest.TestCase):
    def test_signatures_map_to_classes_and_actions(self):
        cases = {
            "github-quota-deferred; fleet evidence retry": ("quota-deferred", "rerun"),
            "HttpError: API rate limit exceeded for installation": ("platform-infra", "rerun"),
            "upstream returned HTTP 500 before the job started": ("platform-infra", "rerun"),
            "Unwired: scripts/a.test.mjs, scripts/b.test.mjs. Wire each file into a ci-fast lane": ("ci-fast-wiring", "wire-ci-fast"),
            "This PR conflicts with main in: scripts/preflight-changed.mjs . Resolve the conflict (lane-fix-conflict).": ("narrowed-preflight", "merge-narrowed-preflight"),
            "AssertionError: off-grid 10px/14px spacing steps (*-2.5, *-3.5) grew: 591 > baseline 590.": ("spacing-scale", "snap-spacing"),
            "Error: apps/web/app/(marketing)/pricing/page.tsx: source changed; renew certification evidence": ("census-certification", "sync-main"),
            "use atomic_state.atomic_write_text for whole-file state: [('x.py','f','open-w')]": ("atomic-write", "agent"),
            "red-before-green: include Failing command:": ("pr-body", "agent"),
            "AssertionError: expected 1": ("other", "agent"),
        }
        for log, (cls, action) in cases.items():
            got = classes.classify(pr("Source Validation"), {"Source Validation": log})
            self.assertEqual((got["cls"], got["action"]), (cls, action), log)

    def test_unwired_files_are_extracted_and_aggregates_ignored(self):
        got = classes.classify(pr("Source Validation"), {"Source Validation":
                               "Unwired: scripts/a.test.mjs, scripts/b.test.mjs. Wire each file into a ci-fast lane"})
        self.assertEqual(got["files"], ["scripts/a.test.mjs", "scripts/b.test.mjs"])
        self.assertEqual(got["checks"], ["Source Validation"])

    def test_mixed_classes_go_to_the_model_and_behind_branches_sync_main(self):
        mixed = classes.classify(pr("A", "B"), {"A": "API rate limit exceeded", "B": "AssertionError"})
        self.assertEqual((mixed["cls"], mixed["action"]), ("mixed", "agent"))
        behind = classes.classify(pr("A", merge="BEHIND"), {"A": "AssertionError"})
        self.assertEqual((behind["cls"], behind["action"]), ("stale-branch", "sync-main"))
        still = classes.classify(pr("A", merge="BEHIND"), {"A": "API rate limit exceeded"})
        self.assertEqual(still["action"], "rerun", "a deterministic log outranks the stale-branch default")

    def test_stale_census_certification_syncs_main_while_checks_block_the_branch(self):
        log = (
            "run 900 attempt 1 failed on GitHub primary-rate-limit: re-ran failed jobs; not repair work\n"
            "HttpError: API rate limit exceeded for installation\n"
            "Error: apps/web/app/(marketing)/pricing/page.tsx: source changed; renew certification evidence\n"
        )
        blocked = classes.classify(pr("Source Validation", merge="BLOCKED"), {"Source Validation": log})
        self.assertEqual((blocked["cls"], blocked["action"]), ("census-certification", "sync-main"))
        behind = classes.classify(pr("Source Validation", merge="BEHIND"), {"Source Validation": log})
        self.assertEqual((behind["cls"], behind["action"]), ("census-certification", "sync-main"))

    def test_missing_changelog_metadata_stamps_and_a_quota_mask_stamps_only_a_bare_body(self):
        missing = "Error: Customer outcome decision missing or invalid (missing-metadata)."
        got = classes.classify(pr("Source Validation"), {"Source Validation": missing})
        self.assertEqual((got["cls"], got["action"]), ("changelog-metadata", "stamp-changelog"))
        quota = "Error: github-quota-deferred: PR metadata read hit GitHub primary-rate-limit\n"
        bare = {**pr("Source Validation"), "body": "## Summary\nadmin label\n"}
        stamped = classes.classify(bare, {"Source Validation": quota})
        self.assertEqual((stamped["cls"], stamped["action"]), ("changelog-metadata", "stamp-changelog"))
        noted = {**bare, "body": bare["body"] + classes.INTERNAL_CHANGELOG_NOTE + "\n"}
        stay = classes.classify(noted, {"Source Validation": quota})
        self.assertEqual((stay["cls"], stay["action"]), ("quota-deferred", "rerun"))
        fleet = classes.classify({**pr("Source Validation"), "body": "bare\n"},
                                 {"Source Validation": "github-quota-deferred; fleet evidence retry"})
        self.assertEqual((fleet["cls"], fleet["action"]), ("quota-deferred", "rerun"))
        nobody = classes.classify(pr("Source Validation"), {"Source Validation": quota})
        self.assertEqual((nobody["cls"], nobody["action"]), ("quota-deferred", "rerun"))

    def test_stamp_appends_one_internal_note_and_refuses_a_second(self):
        self.assertIsNone(classes.stamp_internal_changelog(None))
        body = "## Summary\nadmin label"
        once = classes.stamp_internal_changelog(body)
        self.assertEqual(once, body + "\n" + classes.INTERNAL_CHANGELOG_NOTE + "\n")
        self.assertEqual(once.count("customer-changelog/v1"), 1)
        self.assertIsNone(classes.stamp_internal_changelog(once))
        self.assertEqual(classes.stamp_internal_changelog(""), classes.INTERNAL_CHANGELOG_NOTE + "\n")

    def test_key_ignores_volatile_numbers_but_separates_failures(self):
        a = classes.classify(pr("T"), {"T": "AssertionError: expected 12 to equal 3"})
        b = classes.classify(pr("T"), {"T": "AssertionError: expected 99 to equal 4"})
        c = classes.classify(pr("T"), {"T": "TypeError: x is not a function"})
        self.assertEqual(a["key"], b["key"])
        self.assertNotEqual(a["key"], c["key"])


class NarrowedPreflightMergeTest(unittest.TestCase):
    OURS = (
        "pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts "
        "tests/unit/analytics-metrics-layer-guard.test.ts "
        "tests/unit/marketing/locked-pen-chrome-contract.test.ts "
        "tests/unit/design-system/mac-header-two-lines-v1.test.ts "
        "tests/unit/marketing/marketing-headline-line-clamp-guard.test.ts"
    )
    THEIRS = (
        "node scripts/design-system-source-ratchet.mjs && "
        "pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts "
        "tests/unit/analytics-metrics-layer-guard.test.ts "
        "tests/unit/marketing/locked-pen-chrome-contract.test.ts"
    )
    OURS_NOTE = "metrics-layer, locked chrome and heading contracts; full design-system suite runs with --thorough"
    THEIRS_NOTE = "source identity, metrics-layer and locked chrome; full suite with --thorough"

    def test_unions_prefixes_paths_and_known_note_phrases(self):
        command = classes.merge_narrowed_guard_command(self.OURS, self.THEIRS)
        self.assertEqual(command, (
            "node scripts/design-system-source-ratchet.mjs && "
            "pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts "
            "tests/unit/analytics-metrics-layer-guard.test.ts "
            "tests/unit/marketing/locked-pen-chrome-contract.test.ts "
            "tests/unit/design-system/mac-header-two-lines-v1.test.ts "
            "tests/unit/marketing/marketing-headline-line-clamp-guard.test.ts"
        ))
        note = classes.merge_narrowed_guard_note(self.OURS_NOTE, self.THEIRS_NOTE)
        self.assertEqual(
            note,
            "source identity, metrics-layer, locked chrome and heading contracts; full suite with --thorough",
        )

    def test_conflict_text_resolves_and_unknown_hunks_fail_closed(self):
        text = (
            "export const NARROWED = {\n"
            "  'merge-group-unit-guards': {\n"
            "    command:\n"
            "<<<<<<< HEAD\n"
            f"      '{self.OURS}',\n"
            f"    note: '{self.OURS_NOTE}',\n"
            "=======\n"
            f"      '{self.THEIRS}',\n"
            f"    note: '{self.THEIRS_NOTE}',\n"
            ">>>>>>> origin/main\n"
            "  },\n"
            "};\n"
        )
        resolved = classes.resolve_preflight_narrowed_text(text)
        self.assertIn("node scripts/design-system-source-ratchet.mjs &&", resolved)
        self.assertIn("marketing-headline-line-clamp-guard.test.ts", resolved)
        self.assertNotIn("<<<<<<<", resolved)
        self.assertIsNone(classes.resolve_preflight_narrowed_text(text.replace("heading contracts", "mystery phrase")))
        other = text.replace("note:", "title:", 1)
        self.assertIsNone(classes.resolve_preflight_narrowed_text(other))
        self.assertIsNone(classes.merge_narrowed_guard_command(self.OURS, self.THEIRS.replace("vitest run", "vitest watch")))


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


class WireTest(unittest.TestCase):
    LIST = "export const SCRIPT_CONTRACT_NODE_TESTS = Object.freeze([\n  'scripts/x.test.mjs',\n]);\nexport const SCRIPT_CONTRACT_VITEST_TESTS = Object.freeze([\n  'scripts/y.test.mjs',\n]);\n"

    def tree(self, tmp):
        root = Path(tmp)
        (root / "scripts").mkdir()
        (root / "scripts/ci-fast-lanes.mjs").write_text(self.LIST)
        (root / "scripts/n.test.mjs").write_text("import test from 'node:test';\n")
        (root / "scripts/v.test.mjs").write_text("import { it } from 'vitest';\n")
        return root

    def test_files_land_in_the_matching_list_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.tree(tmp)
            self.assertEqual(classes.wire_ci_fast(root, ["scripts/n.test.mjs", "scripts/v.test.mjs"]),
                             ["scripts/n.test.mjs", "scripts/v.test.mjs"])
            text = (root / "scripts/ci-fast-lanes.mjs").read_text()
            node, vitest = text.split("SCRIPT_CONTRACT_VITEST_TESTS")
            self.assertIn("'scripts/n.test.mjs'", node)
            self.assertIn("'scripts/v.test.mjs'", vitest)
            self.assertEqual(classes.wire_ci_fast(root, ["scripts/n.test.mjs"]), [], "already listed")

    def test_cli_wires_tests_without_a_model_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.tree(tmp)
            command = [sys.executable, str(Path(classes.__file__).resolve()), "wire-ci-fast", "--root", str(root),
                       "scripts/n.test.mjs", "scripts/v.test.mjs"]
            first = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(json.loads(first.stdout), {"added": ["scripts/n.test.mjs", "scripts/v.test.mjs"]})
            node, vitest = (root / "scripts/ci-fast-lanes.mjs").read_text().split("SCRIPT_CONTRACT_VITEST_TESTS")
            self.assertIn("'scripts/n.test.mjs'", node)
            self.assertIn("'scripts/v.test.mjs'", vitest)
            second = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(json.loads(second.stdout), {"added": []})

    def test_missing_or_out_of_tree_files_are_left_to_the_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.tree(tmp)
            self.assertEqual(classes.wire_ci_fast(root, ["scripts/gone.test.mjs", "../x.test.mjs", "apps/web/a.test.ts"]), [])
            self.assertEqual((root / "scripts/ci-fast-lanes.mjs").read_text(), self.LIST)


class MeasureTest(unittest.TestCase):
    def rows(self):
        out = []
        for i in range(30):  # one PR/fingerprint streak: first runs push 50%, after one miss 10%
            out.append({"kind": "fix-red", "pr": i, "provider": "codex", "verdict": "fix-pushed" if i % 2 else "fix-no-change",
                        "startedAt": f"2026-10-25T00:{i:02d}:00Z", "requestSource": {"checks": [["T", "FAILURE"]]}})
        for i in range(30):
            out.append({"kind": "fix-red", "pr": i, "provider": "codex", "verdict": "fix-pushed" if i == 0 else "fix-no-change",
                        "startedAt": f"2026-10-25T01:{i:02d}:00Z", "requestSource": {"checks": [["T", "FAILURE"]]}})
        out.append({"kind": "fix-red", "pr": 1, "verdict": "skipped", "reasons": ["infra-rerun:quota-deferred"],
                    "startedAt": "2026-10-25T02:00:00Z"})
        return out

    def test_measure_counts_model_runs_separately_from_routed_ones(self):
        now = classes._epoch({"startedAt": "2026-10-26T00:00:00Z"})
        got = classes.measure(self.rows(), now, 1, {"codex": 0.5}, merged_prs={1, 3})
        self.assertEqual((got["llmRuns"], got["routedWithoutModel"], got["pushed"]), (60, 1, 16))
        self.assertEqual(got["routedByClass"], {"quota-deferred": 1})
        self.assertEqual(got["spendUsd"], 30.0)
        self.assertEqual(got["usdPerMergedFix"], 15.0)

    def test_breaker_n_is_measured_from_where_pushes_stop_and_never_below_two(self):
        rows = self.rows()
        self.assertEqual(classes.breaker_n(rows), 2)
        self.assertEqual(classes.breaker_n([]), classes.DEFAULT_BREAKER_N)


if __name__ == "__main__":
    unittest.main()
