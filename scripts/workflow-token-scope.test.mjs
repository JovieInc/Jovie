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
  const undo = extractCalls('gh pr merge 12 --disable-auto', 'shell');
  assert.equal(undo[0]?.call, 'disablePullRequestAutoMerge');
  assert.equal(
    undo.some(call => call.call === 'enqueuePullRequest'),
    false
  );
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

test('REST status writes need statuses and GETs are ignored', () => {
  const root = fixture(`
name: fixture
permissions: {}
jobs:
  status:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - run: gh api repos/acme/app/commits/abc
      - run: gh api -X POST repos/acme/app/statuses/abc -f state=success
`);
  const result = scanWorkflowTokenScopes(root, quiet);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0]?.call, 'POST repos/{}/{}/statuses/{}');
  assert.deepEqual(result.failures[0]?.missing, ['statuses:write']);
});

test('a cancel uses the per-command token, not the read app token', () => {
  const clean = scanWorkflowTokenScopes(
    fixture(`
name: fixture
permissions: {}
jobs:
  supersede:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - id: app-token
        uses: actions/create-github-app-token@v3
        with:
          permission-actions: read
      - env:
          READ_TOKEN: \${{ steps.app-token.outputs.token }}
          CANCEL_TOKEN: \${{ github.token }}
        run: GH_TOKEN="$CANCEL_TOKEN" gh api -X POST repos/acme/app/actions/runs/99/cancel
`),
    quiet
  );
  assert.deepEqual(clean.failures, []);
  const denied = scanWorkflowTokenScopes(
    fixture(`
name: fixture
permissions: {}
jobs:
  supersede:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - id: app-token
        uses: actions/create-github-app-token@v3
        with:
          permission-actions: read
      - env:
          READ_TOKEN: \${{ steps.app-token.outputs.token }}
        run: GH_TOKEN="$READ_TOKEN" gh api -X POST repos/acme/app/actions/runs/99/cancel
`),
    quiet
  );
  assert.equal(
    denied.failures[0]?.call,
    'POST repos/{}/{}/actions/runs/{}/cancel'
  );
  assert.deepEqual(denied.failures[0]?.missing, ['actions:write']);
});

test('a CLI subcommand does not inherit another command mutation', () => {
  const script = `
const CREATE_COMMIT_MUTATION = \`mutation($input:CreateCommitOnBranchInput!){
  createCommitOnBranch(input:$input){commit{oid}}
}\`;
function planCommand() {
  return { planned: true };
}
async function commitCommand() {
  return CREATE_COMMIT_MUTATION;
}
async function main() {
  const command = process.argv[2];
  if (command === 'plan') return planCommand();
  if (command === 'commit') return commitCommand();
}
`;
  const plan = scanWorkflowTokenScopes(
    fixture(
      `
name: fixture
permissions: {}
jobs:
  plan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - run: node .fx-policy/scripts/lib/tool.mjs plan
`,
      { 'scripts/lib/tool.mjs': script }
    ),
    quiet
  );
  assert.deepEqual(plan.failures, []);
  const commit = scanWorkflowTokenScopes(
    fixture(
      `
name: fixture
permissions: {}
jobs:
  commit:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - run: node scripts/lib/tool.mjs commit
`,
      { 'scripts/lib/tool.mjs': script }
    ),
    quiet
  );
  assert.equal(commit.failures[0]?.call, 'createCommitOnBranch');
  assert.deepEqual(commit.failures[0]?.missing, ['contents:write']);
});

test('a javascript dequeuePullRequest call outside a string is not the mutation', () => {
  const found = extractCalls(
    'const q = `mutation($id:ID!){dequeuePullRequest(input:{id:$id}){clientMutationId}}`;',
    'js'
  );
  assert.equal(found[0]?.call, 'dequeuePullRequest');
  assert.deepEqual(extractCalls('await dequeuePullRequest(id)', 'js'), []);
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
  assert.deepEqual(result.warnings.map(warning => warning.job).sort(), [
    'dequeue-held',
    'hold-failed-revision',
    'rearm-green-victims',
  ]);
  assert.equal(result.failures.length, 0);
  const rearm = result.warnings.find(
    warning => warning.job === 'rearm-green-victims'
  );
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
  assert.equal(lines.filter(line => line.startsWith('::warning ')).length, 3);
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
