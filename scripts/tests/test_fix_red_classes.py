import json
import os
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
            "domain-write-guard: apps/web/lib/leads/lead-claim-token.ts writes creatorProfiles directly 1x (allowed 0).": ("domain-write", "register-domain-writes"),
            "This PR conflicts with main in: scripts/preflight-changed.mjs . Resolve the conflict (lane-fix-conflict).": ("narrowed-preflight", "merge-narrowed-preflight"),
            "AssertionError: off-grid 10px/14px spacing steps (*-2.5, *-3.5) grew: 591 > baseline 590.": ("spacing-scale", "snap-spacing"),
            "Error: apps/web/app/(marketing)/pricing/page.tsx: source changed; renew certification evidence": ("census-certification", "sync-main"),
            "use atomic_state.atomic_write_text for whole-file state: [('x.py','f','open-w')]": ("atomic-write", "atomic-write"),
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


class AdditiveQuotedListMergeTest(unittest.TestCase):
    def test_unions_quoted_entries_and_rejects_unknown_hunks(self):
        text = (
            "export const TESTS = Object.freeze([\n"
            "  'scripts/lib/__tests__/external-api-guard.test.mjs',\n"
            "<<<<<<< HEAD\n"
            "  'scripts/lib/__tests__/api-budget.test.mjs',\n"
            "=======\n"
            "  'scripts/lib/__tests__/model-id-guard.test.mjs',\n"
            "  'scripts/lib/__tests__/ai-call-guard.test.mjs',\n"
            ">>>>>>> origin/main\n"
            "  'scripts/lib/__tests__/domain-write-guard.test.mjs',\n"
            "]);\n"
        )
        resolved = classes.resolve_additive_quoted_list_text(text)
        self.assertEqual(resolved, (
            "export const TESTS = Object.freeze([\n"
            "  'scripts/lib/__tests__/external-api-guard.test.mjs',\n"
            "  'scripts/lib/__tests__/model-id-guard.test.mjs',\n"
            "  'scripts/lib/__tests__/ai-call-guard.test.mjs',\n"
            "  'scripts/lib/__tests__/api-budget.test.mjs',\n"
            "  'scripts/lib/__tests__/domain-write-guard.test.mjs',\n"
            "]);\n"
        ))
        self.assertIsNone(classes.resolve_additive_quoted_list_text(text.replace(
            "  'scripts/lib/__tests__/api-budget.test.mjs',\n",
            "limitations. Keep the goal.\n",
        )))
        self.assertIsNone(classes.merge_additive_quoted_entries("", "  'scripts/a.test.mjs',\n"))


class AdditiveIdentifierListMergeTest(unittest.TestCase):
    def test_unions_slug_lines_and_rejects_unknown_hunks(self):
        text = (
            "Other scoped rules: ci-branching, event-driven, infra, linear, motion,\n"
            "<<<<<<< HEAD\n"
            "pr-stacking, swarm, hermes-air, rate-limits.\n"
            "=======\n"
            "pr-stacking, swarm, hermes-air, anti-slop.\n"
            ">>>>>>> origin/main\n"
            "Company domain canon: [index](canon/README.md).\n"
        )
        resolved = classes.resolve_additive_identifier_list_text(text)
        self.assertEqual(resolved, (
            "Other scoped rules: ci-branching, event-driven, infra, linear, motion,\n"
            "pr-stacking, swarm, hermes-air, anti-slop, rate-limits.\n"
            "Company domain canon: [index](canon/README.md).\n"
        ))
        self.assertIsNone(classes.resolve_additive_identifier_list_text(text.replace(
            "pr-stacking, swarm, hermes-air, rate-limits.\n",
            "keep both sides' intent.\n",
        )))
        self.assertIsNone(classes.merge_additive_identifier_list(
            "swarm, pr-stacking.\n",
            "pr-stacking, swarm.\n",
        ))
        self.assertIsNone(classes.merge_additive_identifier_list(
            "pr-stacking, swarm\n",
            "pr-stacking, swarm.\n",
        ))


class AndChainMergeTest(unittest.TestCase):
    OURS = (
        "node scripts/run-affected-tests.mjs --control && "
        "node --test scripts/ci-workflow-topology.test.mjs scripts/workflow-runner-pin-check.test.mjs && "
        "node scripts/ci-workflow-topology.mjs && pnpm ownership:check"
    )
    THEIRS = (
        "node scripts/run-affected-tests.mjs --control && "
        "node --test scripts/ci-workflow-topology.test.mjs && "
        "node scripts/ci-workflow-topology.mjs && pnpm ownership:check && "
        "node scripts/sources-of-truth.mjs && node scripts/invariants/duplicate-literals.mjs"
    )
    MERGED = (
        "node scripts/run-affected-tests.mjs --control && "
        "node --test scripts/ci-workflow-topology.test.mjs scripts/workflow-runner-pin-check.test.mjs && "
        "node scripts/ci-workflow-topology.mjs && pnpm ownership:check && "
        "node scripts/sources-of-truth.mjs && node scripts/invariants/duplicate-literals.mjs"
    )

    def test_unions_node_test_paths_and_trailing_commands(self):
        self.assertEqual(classes.merge_and_chain(self.OURS, self.THEIRS), self.MERGED)
        self.assertEqual(
            classes.merge_and_chain(NarrowedPreflightMergeTest.OURS, NarrowedPreflightMergeTest.THEIRS),
            classes.merge_narrowed_guard_command(NarrowedPreflightMergeTest.OURS, NarrowedPreflightMergeTest.THEIRS),
        )

    def test_rejects_a_changed_script_quotes_and_a_second_file_list(self):
        self.assertIsNone(classes.merge_and_chain(self.OURS, self.THEIRS.replace("ownership:check", "ownership:check --strict")))
        self.assertIsNone(classes.merge_and_chain(self.OURS + " && echo 'x'", self.THEIRS))
        doubled = self.OURS.replace("node --test", "node --test scripts/other.test.mjs && node --test", 1)
        self.assertIsNone(classes.merge_and_chain(doubled, self.THEIRS))

    def test_conflict_text_keeps_added_json_keys_and_fails_closed(self):
        text = (
            "{\n"
            "<<<<<<< HEAD\n"
            f'    "ci:control:test": "{self.OURS}",\n'
            "=======\n"
            f'    "ci:control:test": "{self.THEIRS}",\n'
            '    "fleet:check": "node scripts/fleet-registry.mjs check",\n'
            ">>>>>>> origin/main\n"
            "}\n"
        )
        resolved = classes.resolve_and_chain_text(text)
        self.assertIn(self.MERGED, resolved)
        self.assertIn('"fleet:check": "node scripts/fleet-registry.mjs check"', resolved)
        self.assertNotIn("<<<<<<<", resolved)
        edited = text.replace(
            f'    "ci:control:test": "{self.OURS}",\n',
            f'    "ci:control:test": "{self.OURS}",\n'
            '    "fleet:check": "node scripts/fleet-registry.mjs other",\n',
        )
        self.assertIsNone(classes.resolve_and_chain_text(edited))
        unknown = text.replace(f'    "ci:control:test": "{self.OURS}",\n', "    const drifted = true;\n")
        self.assertIsNone(classes.resolve_and_chain_text(unknown))


class AtomicWriteRepairTest(unittest.TestCase):
    LOG = "use atomic_state.atomic_write_text for whole-file state: [('sample.py', 'save', 'write_text')]"

    def test_repairs_the_reported_function_and_preserves_whole_file_until_replace(self):
        source = ('from pathlib import Path\nfrom atomic_state import atomic_write_text\n'
                  'def save(path):\n    label = "é"; path.write_text(label, encoding="utf-8")\n'
                  'def other(path):\n    path.write_text("untouched")\n')
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lanes = root / "scripts/lanes"
            lanes.mkdir(parents=True)
            target = lanes / "sample.py"
            target.write_text(source)
            self.assertEqual(classes.repair_atomic_state_writes(root, self.LOG), ["scripts/lanes/sample.py"])
            namespace = {}
            exec(compile(target.read_text(), str(target), "exec"), namespace)
            state = root / "state.json"
            state.write_text("old")
            from unittest.mock import patch
            import atomic_state
            replace = os.replace
            def observe(staged, dest):
                self.assertEqual(state.read_text(), "old")
                self.assertEqual(Path(staged).read_text(), "é")
                replace(staged, dest)
            with patch.object(atomic_state.os, "replace", side_effect=observe) as swapped:
                namespace["save"](state)
            swapped.assert_called_once()
            self.assertEqual(state.read_text(), "é")
            self.assertIn('path.write_text("untouched")', target.read_text())
            self.assertEqual(classes.repair_atomic_state_writes(root, self.LOG), [])

    def test_unknown_imports_signatures_shadowing_and_symlinks_are_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lanes = root / "scripts/lanes"
            lanes.mkdir(parents=True)
            target = lanes / "sample.py"
            for source in ('def save(p):\n    p.write_text("x")\n',
                           'from atomic_state import atomic_write_text\natomic_write_text = None\ndef save(p):\n    p.write_text("x")\n',
                           'from atomic_state import atomic_write_text\ndef save(p):\n    return p.write_text("x")\n',
                           'from atomic_state import atomic_write_text\ndef save(p):\n    p.write_text(str(p.write_text("x")))\n',
                           'from atomic_state import atomic_write_text\ndef save(p):\n    p.write_text("x", newline="")\n',
                           'from atomic_state import atomic_write_text\ndef save(p, atomic_write_text):\n    p.write_text("x")\n',
                           'from atomic_state import atomic_write_text\ndef save(p):\n    def nested():\n        p.write_text("x")\n'):
                target.write_text(source)
                self.assertEqual(classes.repair_atomic_state_writes(root, self.LOG), [])
                self.assertEqual(target.read_text(), source)
            outside = root / "outside.py"
            outside.write_text('from atomic_state import atomic_write_text\ndef save(p):\n    p.write_text("x")\n')
            target.unlink()
            target.symlink_to(outside)
            self.assertEqual(classes.repair_atomic_state_writes(root, self.LOG), [])
            self.assertIn('p.write_text("x")', outside.read_text())


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

    def test_missing_or_out_of_tree_files_are_left_to_the_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.tree(tmp)
            self.assertEqual(classes.wire_ci_fast(root, ["scripts/gone.test.mjs", "../x.test.mjs", "apps/web/a.test.ts"]), [])
            self.assertEqual((root / "scripts/ci-fast-lanes.mjs").read_text(), self.LIST)


class DomainWriteTest(unittest.TestCase):
    LOG = (
        "domain-write-guard: apps/web/lib/leads/lead-claim-token.ts writes creatorProfiles directly 1x (allowed 0). "
        "Route it through a registered domain function.\n"
        "HttpError: API rate limit exceeded for installation\n"
        "domain-write-guard: lower ratchet: apps/web/lib/leads/route-lead.ts creatorProfiles 1 -> 0\n"
    )
    REGISTRY = """{
  "schema": "jovie-domain-write-registry/v1",
  "sideEffects": {
    "socialLinks": ["invalidateSocialLinksCache"]
  },
  "coreTables": {
    "creatorProfiles": "creator_profiles",
    "socialLinks": "social_links",
    "users": "users"
  },
  "domains": [
    {
      "id": "claim.finalize",
      "entity": "claim",
      "module": "apps/web/lib/claim/finalize.ts",
      "exports": ["claimPrebuiltProfileForUser"],
      "tables": ["creatorProfiles"]
    }
  ],
  "agentTools": {
    "chat:submitFeedback": {"kind": "domain", "domain": "feedback.submit"}
  }
}
"""
    SOURCE = (
        "export function deriveLeadClaimToken(id: string): string {\n"
        "  return id;\n"
        "}\n\n"
        "export async function persistLeadClaimToken(): Promise<void> {\n"
        "  await db.update(creatorProfiles).set({ claimToken: hash });\n"
        "}\n"
    )

    def test_allowed_zero_beats_a_rate_limit_line_and_names_the_file(self):
        got = classes.classify(pr("Source Validation"), {"Source Validation": self.LOG})
        self.assertEqual((got["cls"], got["action"]), ("domain-write", "register-domain-writes"))
        self.assertEqual(got["files"], ["apps/web/lib/leads/lead-claim-token.ts"])

    def test_a_positive_cap_is_not_this_class(self):
        log = "domain-write-guard: apps/web/lib/leads/route-lead.ts writes creatorProfiles directly 1x (allowed 1)."
        got = classes.classify(pr("Source Validation"), {"Source Validation": log})
        self.assertNotEqual(got["action"], "register-domain-writes")

    def tree(self, tmp, source=None):
        root = Path(tmp)
        module = root / "apps/web/lib/leads/lead-claim-token.ts"
        module.parent.mkdir(parents=True)
        module.write_text(self.SOURCE if source is None else source)
        registry = root / "apps/web/lib/domain/write-registry.json"
        registry.parent.mkdir(parents=True)
        registry.write_text(self.REGISTRY)
        return root

    def test_registers_the_export_that_writes_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.tree(tmp)
            added = classes.register_direct_domain_writes(root, self.LOG)
            self.assertEqual(added, ["apps/web/lib/leads/lead-claim-token.ts"])
            text = (root / "apps/web/lib/domain/write-registry.json").read_text()
            parsed = json.loads(text)
            row = next(item for item in parsed["domains"] if item["module"].endswith("lead-claim-token.ts"))
            self.assertEqual(row["id"], "leads.lead-claim-token")
            self.assertEqual(row["entity"], "lead claim token")
            self.assertEqual(row["exports"], ["persistLeadClaimToken"])
            self.assertEqual(row["tables"], ["creatorProfiles"])
            self.assertIn('"agentTools"', text)
            self.assertEqual(classes.register_direct_domain_writes(root, self.LOG), [])

    def test_private_helper_extra_table_and_missing_side_effect_stay_unregistered(self):
        private = (
            "function writeProfile(): void {\n"
            "  db.update(creatorProfiles).set({ claimToken: hash });\n"
            "}\n"
            "export async function persistLeadClaimToken(): Promise<void> {\n"
            "  writeProfile();\n"
            "}\n"
        )
        extra = self.SOURCE + "\nexport function dropUser(): void {\n  db.delete(users);\n}\n"
        social = (
            "export async function persistLeadClaimToken(): Promise<void> {\n"
            "  db.update(socialLinks).set({ url });\n"
            "}\n"
        )
        social_log = (
            "domain-write-guard: apps/web/lib/leads/lead-claim-token.ts writes socialLinks directly 1x (allowed 0).\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = self.tree(tmp, private)
            self.assertEqual(classes.register_direct_domain_writes(root, self.LOG), [])
        with tempfile.TemporaryDirectory() as tmp:
            root = self.tree(tmp, extra)
            self.assertEqual(classes.register_direct_domain_writes(root, self.LOG), [])
        with tempfile.TemporaryDirectory() as tmp:
            root = self.tree(tmp, social)
            self.assertEqual(classes.register_direct_domain_writes(root, social_log), [])
            social_ok = social.replace(
                "db.update(socialLinks)",
                "invalidateSocialLinksCache();\n  db.update(socialLinks)",
            )
            (root / "apps/web/lib/leads/lead-claim-token.ts").write_text(social_ok)
            self.assertEqual(
                classes.register_direct_domain_writes(root, social_log),
                ["apps/web/lib/leads/lead-claim-token.ts"],
            )


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


class ReleaseIdentityStubTest(unittest.TestCase):
    SNIPPET = """
class T(unittest.TestCase):
    def test_backoff(self):
        identity = patch.object(lane, "release_identity", return_value={"bundleDigest": "t1", "sourceCommit": "a" * 40})
        lane.install_release(host)

    def test_custody(self):
        bundle = {"bundleDigest": "b" * 64, "sourceCommit": "a" * 40}
        patch.object(lane, "release_identity", return_value=bundle)
        lane.install_release(self.host)

    def test_multiline(self):
        bundle = {
            "bundleDigest": "b" * 64,
        }
        patch.object(lane, "release_identity", return_value=bundle)
        lane.install_release(self.host)

    def test_other(self):
        bundle = {"bundleDigest": "keep"}
        patch.object(lane, "release_identity", return_value=bundle)

    def test_spread(self):
        with patch.object(lane, "release_identity", return_value={**self.manifest, "sourceCommit": "b" * 40}):
            lane.install_release(self.host)
"""

    def test_stubs_that_reach_install_release_gain_objects_once(self):
        once = classes.complete_release_identity_stubs(self.SNIPPET)
        self.assertEqual(classes.complete_release_identity_stubs(once), once)
        self.assertIn(
            'return_value={"bundleDigest": "t1", "sourceCommit": "a" * 40, "objects": {"scripts/lanes": "f" * 40}}',
            once)
        self.assertIn(
            'bundle = {"bundleDigest": "b" * 64, "sourceCommit": "a" * 40, "objects": {"scripts/lanes": "f" * 40}}',
            once)
        self.assertIn('bundle = {\n            "bundleDigest": "b" * 64,\n        }', once)
        self.assertIn('bundle = {"bundleDigest": "keep"}', once)
        self.assertIn('{**self.manifest, "sourceCommit": "b" * 40}', once)
        self.assertEqual(once.count('"objects"'), 2)

    def test_checked_in_lane_runner_tests_need_no_further_stub_completion(self):
        path = Path(__file__).resolve().parents[1] / "tests" / "test_lane_runner.py"
        text = path.read_text()
        self.assertEqual(classes.complete_release_identity_stubs(text), text)


if __name__ == "__main__":
    unittest.main()
