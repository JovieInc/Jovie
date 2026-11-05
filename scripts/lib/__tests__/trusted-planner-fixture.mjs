import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildVerificationEnv } from '../../run-affected-tests.mjs';

const ROOT = join(import.meta.dirname, '../../..');

export function trustedPlannerFixture(t, withProducer) {
  const root = mkdtempSync(join(tmpdir(), 'trusted-planner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = buildVerificationEnv(process.env);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q');
  git('config', 'user.name', 'Trusted planner fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  const put = (file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  put(
    'scripts/lib/blog-content-ci.mjs',
    "export const blogMarker='trusted-blog';\n"
  );
  put(
    'scripts/lib/git-base-ref.mjs',
    "export const baseMarker='immutable-base';\n"
  );
  put(
    'scripts/lib/trusted-test-planner-snapshot.mjs',
    readFileSync(join(ROOT, 'scripts/lib/trusted-test-planner-snapshot.mjs'))
  );
  if (withProducer)
    put(
      'scripts/lib/onboarding-test-producers.mjs',
      "export const tests=['trusted.unit.test.ts'];\n"
    );
  put(
    'scripts/run-affected-tests.mjs',
    "import {baseMarker} from './lib/git-base-ref.mjs';\n" +
      "import {blogMarker} from './lib/blog-content-ci.mjs';\n" +
      (withProducer
        ? "import {tests} from './lib/onboarding-test-producers.mjs';\n"
        : "const tests=['legacy.unit.test.ts'];\n") +
      "export const buildAffectedTestPlan=()=>({mode:'selected',selectedTests:tests,baseMarker});\n"
  );
  git('add', '.');
  git('commit', '-qm', 'seed immutable base');
  return { root, git, put, env, base: git('rev-parse', 'HEAD') };
}
export function workflowBootstrap() {
  const workflow = readFileSync(
    join(ROOT, '.github/workflows/pr-conflict-handler.yml'),
    'utf8'
  );
  const start = workflow.indexOf(
    '          # Bootstrap and every planner import'
  );
  const end = workflow.indexOf(
    "          {\n            echo 'candidate=true'",
    start
  );
  assert.ok(start >= 0 && end > start);
  return {
    workflow,
    bootstrap: workflow.slice(start, end).replace(/^          /gm, ''),
  };
}
