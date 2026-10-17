import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ACKNOWLEDGED_MISMATCHES,
  extractCalls,
  reportWorkflowTokenScopes,
  scanWorkflowTokenScopes,
} from './workflow-token-scope.mjs';

const temporaryRoots = [];
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

/**
 * @param {string} workflow
 * @param {Record<string, string>} [files]
 */
function fixture(workflow, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'token-scope-'));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github', 'workflows', 'fixture.yml'),
    workflow
  );
  for (const [file, source] of Object.entries(files)) {
    const abs = path.join(root, file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, source);
  }
  return root;
}

const ENQUEUE_SCRIPT = `
export const ENQUEUE_PULL_REQUEST_MUTATION =
  'mutation($id:ID!){enqueuePullRequest(input:{pullRequestId:$id}){mergeQueueEntry{position}}}';
`;

const quiet = { acknowledged: [], requireAcknowledged: false };

test('enqueuePullRequest counts only inside a string', () => {
  assert.deepEqual(
    extractCalls('// enqueuePullRequest(input:{pullRequestId:$id})', 'js'),
    []
  );
  assert.deepEqual(extractCalls('await dequeuePullRequest(id)', 'js'), []);
  const found = extractCalls(
    'const q = `mutation($id:ID!){enqueuePullRequest(input:{pullRequestId:$id}){x}}`;',
    'js'
  );
  assert.equal(found[0]?.call, 'enqueuePullRequest');
  assert.deepEqual(found[0]?.requirement, { all: { contents: 'write' } });
});

test('gh pr merge --auto is enqueuePullRequest and --disable-auto is not', () => {
  const auto = extractCalls('gh pr merge 12 --auto --squash', 'shell');
  assert.equal(
    auto.some(call => call.call === 'enqueuePullRequest'),
    true
  );
  assert.deepEqual(extractCalls('gh pr merge 12 --disable-auto', 'shell'), []);
  assert.deepEqual(extractCalls('gh api repos/acme/app/pulls/1', 'shell'), []);
});

test('contents read cannot enqueue and contents write can', () => {
  const workflow = level => `
name: fixture
permissions: {}
jobs:
  rearm:
    runs-on: ubuntu-latest
    steps:
      - id: app-token
        uses: actions/create-github-app-token@v3
        with:
          permission-contents: ${level}
          permission-pull-requests: write
      - env:
          GH_TOKEN: \${{ steps.app-token.outputs.token }}
        run: node scripts/merge-group-victim-rearm.mjs
`;
  const denied = scanWorkflowTokenScopes(
    fixture(workflow('read'), {
      'scripts/merge-group-victim-rearm.mjs': ENQUEUE_SCRIPT,
    }),
    quiet
  );
  assert.equal(denied.failures.length, 1);
  assert.equal(denied.failures[0]?.call, 'enqueuePullRequest');
  assert.deepEqual(denied.failures[0]?.missing, ['contents:write']);

  const allowed = scanWorkflowTokenScopes(
    fixture(workflow('write'), {
      'scripts/merge-group-victim-rearm.mjs': ENQUEUE_SCRIPT,
    }),
    quiet
  );
  assert.deepEqual(allowed.failures, []);
});

test('a job GITHUB_TOKEN read grant does not apply to the app token the step uses', () => {
  const root = fixture(
    `
name: fixture
permissions: {}
jobs:
  write:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - id: app-token
        uses: actions/create-github-app-token@v3
        with:
          permission-contents: write
      - env:
          GH_TOKEN: \${{ steps.app-token.outputs.token }}
        run: node scripts/enqueue.mjs
`,
    { 'scripts/enqueue.mjs': ENQUEUE_SCRIPT }
  );
  assert.deepEqual(scanWorkflowTokenScopes(root, quiet).failures, []);
});

test('a per-command GH_TOKEN override is the token that must cover enqueue', () => {
  const root = fixture(`
name: fixture
permissions: {}
jobs:
  rearm:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - id: app-token
        uses: actions/create-github-app-token@v3
        with:
          permission-contents: read
      - env:
          READ_TOKEN: \${{ steps.app-token.outputs.token }}
        run: GH_TOKEN="$READ_TOKEN" gh pr merge 12 --auto
`);
  const denied = scanWorkflowTokenScopes(root, quiet);
  assert.equal(denied.failures[0]?.call, 'enqueuePullRequest');
  assert.deepEqual(denied.failures[0]?.missing, ['contents:write']);
});

test('the rearm acknowledgement does not cover the same bug in another job', () => {
  const root = fixture(
    `
name: fixture
permissions: {}
jobs:
  other-job:
    runs-on: ubuntu-latest
    steps:
      - id: app-token
        uses: actions/create-github-app-token@v3
        with:
          permission-contents: read
      - env:
          GH_TOKEN: \${{ steps.app-token.outputs.token }}
        run: node scripts/merge-group-victim-rearm.mjs
`,
    { 'scripts/merge-group-victim-rearm.mjs': ENQUEUE_SCRIPT }
  );
  const result = scanWorkflowTokenScopes(root, {
    acknowledged: ACKNOWLEDGED_MISMATCHES,
    requireAcknowledged: false,
  });
  assert.equal(result.warnings.length, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0]?.job, 'other-job');
});

test('an acknowledgement that no longer matches a live mismatch fails', () => {
  const root = fixture(`
name: fixture
permissions: {}
jobs:
  idle:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - run: node --version
`);
  const result = scanWorkflowTokenScopes(root);
  assert.ok(
    result.failures.some(
      failure =>
        failure.call === 'acknowledged-exception' &&
        failure.message.includes('rearm-enqueue-contents-read')
    )
  );
});

test('the live repo warns on the rearm enqueue mismatch and fails nothing else', () => {
  const result = scanWorkflowTokenScopes(repoRoot);
  assert.deepEqual(
    result.warnings.map(warning => warning.job),
    ['rearm-green-victims']
  );
  assert.equal(result.failures.length, 0);
  const rearm = result.warnings[0];
  assert.equal(rearm?.file, 'scripts/merge-group-victim-rearm.mjs');
  assert.equal(rearm?.call, 'enqueuePullRequest');
  assert.deepEqual(rearm?.missing, ['contents:write']);
  assert.match(rearm?.message ?? '', /app 2934433/);
  assert.match(rearm?.message ?? '', /permission-contents: write/);
  assert.match(rearm?.message ?? '', /Tim must approve/);
  const lines = [];
  assert.equal(
    reportWorkflowTokenScopes(result, line => lines.push(line)),
    0
  );
  assert.equal(lines.filter(line => line.startsWith('::warning ')).length, 1);
  assert.equal(
    lines.some(line => line.startsWith('::error ')),
    false
  );
});

test('the cli reports the rearm warning and exits 0', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/workflow-token-scope.mjs'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stderr,
    /::warning file=scripts\/merge-group-victim-rearm\.mjs/
  );
  assert.match(result.stderr, /Tim must approve permission-contents: write/);
  assert.match(result.stderr, /app 2934433/);
  assert.equal(result.stderr.includes('::error '), false);
});
