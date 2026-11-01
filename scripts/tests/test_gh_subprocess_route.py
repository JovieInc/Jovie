import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import gh_subprocess_route as route  # noqa: E402

HELPER = route.HELPER
FIXTURE = """import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function gh(args) {
  const run = spawnSync('gh', args, { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr || 'gh failed');
  return run.stdout;
}

function resolveControllerWorkflowId(repo) {
  const workflow = JSON.parse(
    gh(['api', `repos/${repo}/actions/workflows/production-controller.yml`])
  );
  return String(workflow.id);
}

function readActiveRuns({ repo, currentRunId }) {
  if (!currentRunId) return [];
  const runs = JSON.parse(
    gh([
      'api',
      `repos/${repo}/actions/runs`,
    ])
  ).workflow_runs;
  return runs;
}

function readMarkerOnline({ repo, currentRunId }) {
  const run = spawnSync(process.execPath, ['marker.mjs'], { encoding: 'utf8' });
  const marker = JSON.parse(run.stdout.trim());
  return marker?.state === 'none' ? readActiveRuns({ repo, currentRunId }) : marker;
}

export async function waitForVerdict({ readMarker }) {
  let marker;
  try {
    marker = readMarker();
  } catch (error) {
    marker = { state: 'manual', reason: 'evidence_api_error' };
  }
  return marker;
}

async function main() {
  const workflowId = resolveControllerWorkflowId('JovieInc/Jovie');
  return waitForVerdict({
    readMarker: () =>
      readMarkerOnline({
        repo: 'JovieInc/Jovie',
        currentRunId: workflowId,
      }),
  });
}
"""


class RewriteTest(unittest.TestCase):
    def rewritten(self):
        updated = route.rewrite(FIXTURE, ".github/scripts/production-predecessor-verdict.mjs")
        self.assertIsNotNone(updated)
        return updated

    def test_routes_the_exact_helper_and_awaits_direct_callers(self):
        updated = self.rewritten()
        self.assertIn("import { runGh } from '../../packages/api-client/gh.ts';", updated)
        self.assertIn("await runGh(args, { priority: 'deploy' })", updated)
        self.assertIn("run.deferred || run.code !== 0", updated)
        self.assertNotIn("spawnSync('gh'", updated)
        self.assertIn("spawnSync(process.execPath, ['marker.mjs']", updated)
        self.assertIn("async function resolveControllerWorkflowId", updated)
        self.assertIn("async function readActiveRuns", updated)
        self.assertIn("async function readMarkerOnline", updated)
        self.assertIn("await gh(", updated)
        self.assertIn("await readActiveRuns(", updated)
        self.assertIn("const workflowId = await resolveControllerWorkflowId(", updated)
        self.assertIn("marker = await readMarker()", updated)
        self.assertNotIn("await readMarkerOnline(", updated)
        self.assertIn("readMarker: () =>\n      readMarkerOnline(", updated)
        self.assertIsNone(route.rewrite(updated, ".github/scripts/production-predecessor-verdict.mjs"))

    def test_import_depth_follows_the_file(self):
        self.assertEqual(route.run_gh_specifier("scripts/quota-deferred-heads.mjs"),
                         "../packages/api-client/gh.ts")
        self.assertEqual(route.run_gh_specifier("tool.mjs"), "./packages/api-client/gh.ts")
        self.assertIsNone(route.run_gh_specifier("../outside.mjs"))
        self.assertIsNone(route.run_gh_specifier("/abs/tool.mjs"))

    def test_absent_or_ambiguous_helpers_stay_untouched(self):
        self.assertIsNone(route.rewrite("function gh() {}\n", "scripts/x.mjs"))
        self.assertIsNone(route.rewrite(FIXTURE + "\n" + HELPER + "\n", "scripts/x.mjs"))
        drifted = FIXTURE.replace("encoding: 'utf8'", "encoding: 'utf8', timeout: 1000")
        self.assertIsNone(route.rewrite(drifted, "scripts/x.mjs"))

    def test_a_nested_gh_call_that_cannot_be_awaited_returns_none(self):
        unsafe = FIXTURE.replace(
            "return String(workflow.id);",
            "return items.map(() => gh(['api', 'user']));",
        )
        self.assertIsNone(route.rewrite(unsafe, "scripts/x.mjs"))

    def test_a_second_gh_spawn_is_not_claimed_as_routed(self):
        extra = FIXTURE.replace(
            "return String(workflow.id);",
            "spawnSync('gh', ['auth', 'status']);\n  return String(workflow.id);",
        )
        self.assertIsNone(route.rewrite(extra, "scripts/x.mjs"))

    def test_log_lines_name_the_file_to_rewrite(self):
        log = (
            "external-api-guard: .github/scripts/production-predecessor-verdict.mjs:158 "
            "gh-subprocess: 1 direct call(s), 0 grandfathered.\n"
        )
        self.assertTrue(route.LOG_TEXT.search(log))
        self.assertEqual(
            route.files_from_log(log),
            [".github/scripts/production-predecessor-verdict.mjs"],
        )


if __name__ == "__main__":
    unittest.main()
