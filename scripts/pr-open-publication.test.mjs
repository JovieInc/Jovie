import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { draftBody, persistPublicationCapabilityRequest } from './pr-open.mjs';

const file = (filename, status = 'modified') => ({
  filename,
  status,
  patch: '',
});

function publicationFixture(mode = 'normal') {
  const root = mkdtempSync(path.join(tmpdir(), 'pr-open-publication-'));
  const repo = path.join(root, 'repo');
  const remote = path.join(root, 'remote.git');
  const bin = path.join(root, 'bin');
  const hooks = path.join(root, 'hooks');
  const calls = path.join(root, 'gh.jsonl');
  const pushes = path.join(root, 'pushes');
  const guards = path.join(root, 'guards');
  const env = { ...process.env };
  // These owned Git fixtures must never inherit a hook's repository selectors.
  for (const key of Object.keys(env))
    if (key.startsWith('GIT_')) delete env[key];
  const git = args =>
    execFileSync('git', args, {
      cwd: repo,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  mkdirSync(repo);
  mkdirSync(bin);
  mkdirSync(hooks);
  try {
    git(['init', '-b', 'main']);
    git(['config', 'user.email', 'publication@example.invalid']);
    git(['config', 'user.name', 'Publication fixture']);
    git(['config', 'core.hooksPath', hooks]);
    git(['init', '--bare', '-b', 'main', remote]);
    mkdirSync(path.join(repo, 'scripts/lib'), { recursive: true });
    writeFileSync(path.join(repo, '.gitignore'), 'packages/\n');
    writeFileSync(
      path.join(repo, 'scripts/lib/product-lane-classifier.mjs'),
      "import fs from 'node:fs'; fs.appendFileSync(process.env.FIXTURE_GUARDS, 'classifier\\n');\n"
    );
    writeFileSync(
      path.join(repo, 'scripts/check-changed-test-coverage.mjs'),
      "import fs from 'node:fs'; fs.appendFileSync(process.env.FIXTURE_GUARDS, 'coverage\\n'); console.log(JSON.stringify({applicable:false}));\n"
    );
    git(['add', '.']);
    git(['commit', '-m', 'chore: fixture base']);
    git(['remote', 'add', 'origin', remote]);
    git([
      'config',
      '--replace-all',
      'remote.origin.fetch',
      '+refs/heads/main:refs/remotes/origin/main',
    ]);
    git(['push', '-u', 'origin', 'main']);
    const base = git(['rev-parse', 'HEAD']);
    git(['checkout', '-b', 'feature/publication']);
    writeFileSync(
      path.join(repo, 'notes.txt'),
      'documented publication fixture\n'
    );
    git(['add', '.']);
    git(['commit', '-m', 'chore(docs): fixture publication']);
    const head = git(['rev-parse', 'HEAD']);
    if (mode === 'mismatch')
      git(['push', 'origin', `${base}:refs/heads/feature/publication`]);
    if (mode === 'detached') git(['checkout', '--detach', 'HEAD']);
    mkdirSync(path.join(repo, 'packages'));
    cpSync(
      path.join(import.meta.dirname, '../packages/api-client'),
      path.join(repo, 'packages/api-client'),
      {
        recursive: true,
        filter: source => !source.split(path.sep).includes('node_modules'),
      }
    );
    writeFileSync(
      path.join(hooks, 'pre-push'),
      `#!/usr/bin/env node
require('node:fs').appendFileSync(process.env.FIXTURE_PUSHES, 'push\\n');
`
    );
    chmodSync(path.join(hooks, 'pre-push'), 0o755);
    writeFileSync(
      path.join(bin, 'gh'),
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_GH_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'api' && args.includes('graphql')) { if (process.env.FIXTURE_CAPABILITY_DENIED === '1') { console.error('Post https://api.github.com/graphql: Forbidden'); process.exit(1); } console.log(JSON.stringify({data:{viewer:{login:'fixture'}}})); process.exit(0); }
if (args[0] !== 'pr' || args[1] !== 'create') process.exit(2);
if (!args.includes('--head')) {
  console.error('aborted: you must first push the current branch to a remote, or use the --head flag'); process.exit(1);
}
if (args[args.indexOf('--head') + 1] !== 'feature/publication' || !args.includes('--draft')) process.exit(2);
console.log('https://github.com/JovieInc/Jovie/pull/42');
`
    );
    chmodSync(path.join(bin, 'gh'), 0o755);
    // Keep the CLI's pre-existing homedir metrics writer inside this fixture,
    // without changing HOME or any production path/authorization behavior.
    const preload = path.join(root, 'isolated-metrics.mjs');
    writeFileSync(
      preload,
      `import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
os.homedir = () => process.env.FIXTURE_RECORD_HOME;
syncBuiltinESMExports();
`
    );
    const body = path.join(root, 'body.md');
    writeFileSync(
      body,
      draftBody({
        title: 'chore(docs): fixture publication',
        files: [file('notes.txt', 'added')],
        summary: 'Publishes an owned documentation fixture.',
      })
    );
    Object.assign(env, {
      PATH: [bin, path.dirname(process.execPath), env.PATH ?? ''].join(
        path.delimiter
      ),
      FIXTURE_CAPABILITY_DENIED: mode === 'capability-denied' ? '1' : '0',
      FIXTURE_PUSHES: pushes,
      FIXTURE_GUARDS: guards,
      FIXTURE_GH_CALLS: calls,
      FIXTURE_RECORD_HOME: path.join(root, 'record-home'),
      JOVIE_API_STATE_DIR: path.join(root, 'api-state'),
      JOVIE_GITHUB_CREDENTIAL: 'pr-open-publication-fixture',
      GH_TOKEN: '',
      GITHUB_TOKEN: '',
    });
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        preload,
        path.join(import.meta.dirname, 'pr-open.mjs'),
        'open',
        '--repo',
        repo,
        '--draft',
        '--body-file',
        body,
        '--title',
        'chore(docs): fixture publication',
        ...(['normal', 'capability-denied'].includes(mode)
          ? []
          : ['--no-push']),
      ],
      { cwd: repo, env, encoding: 'utf8', timeout: 15_000 }
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return {
      root,
      repo,
      git,
      result,
      head,
      calls: existsSync(calls)
        ? readFileSync(calls, 'utf8')
            .trim()
            .split('\n')
            .map(s => JSON.parse(s))
        : [],
      pushes: existsSync(pushes)
        ? readFileSync(pushes, 'utf8').trim().split('\n')
        : [],
      guards: existsSync(guards) ? readFileSync(guards, 'utf8') : '',
      cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

test('actual new draft publication verifies the pushed head with a main-only fetch refspec', () => {
  const f = publicationFixture();
  try {
    assert.equal(
      f.git(['config', '--get-all', 'remote.origin.fetch']),
      '+refs/heads/main:refs/remotes/origin/main'
    );
    assert.equal(
      f
        .git([
          'ls-remote',
          '--heads',
          'origin',
          'refs/heads/feature/publication',
        ])
        .split(/\s+/)[0],
      f.head
    );
    assert.equal(f.pushes.length, 1, 'normal push hook runs exactly once');
    assert.match(f.guards, /classifier/);
    assert.match(f.guards, /coverage/);
    assert.equal(f.result.status, 0, f.result.stdout + f.result.stderr);
    assert.equal(
      f.calls.filter(args => args[0] === 'pr' && args[1] === 'create').length,
      1,
      'create once after the single successful push'
    );
    assert.equal(
      f.calls.find(args => args[1] === 'create')[
        f.calls.find(args => args[1] === 'create').indexOf('--head') + 1
      ],
      'feature/publication'
    );
  } finally {
    f.cleanup();
  }
});

for (const mode of ['unknown', 'mismatch', 'detached']) {
  test(`actual new draft publication refuses ${mode} intended head without creating or pushing`, () => {
    const f = publicationFixture(mode);
    try {
      assert.notEqual(f.result.status, 0);
      assert.equal(f.pushes.length, 0);
      assert.equal(
        f.calls.length,
        0,
        'refusal happens before the GitHub create call'
      );
      assert.match(f.result.stdout, /publication-head/);
    } finally {
      f.cleanup();
    }
  });
}

test('missing publication capability is requested before push without create or alternate route', () => {
  const f = publicationFixture('capability-denied');
  try {
    assert.equal(f.result.status, 75, f.result.stdout + f.result.stderr);
    assert.equal(f.pushes.length, 0);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0][0], 'api');
    const journal = path.join(
      f.root,
      'record-home/.local/state/jovie-lanes/pr-open.jsonl'
    );
    const request = readFileSync(journal, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
      .find(row => row.capabilityRequest).capabilityRequest;
    assert.equal(request.kind, 'access-unclassified');
    assert.equal(request.binding.head, f.head);
    assert.equal(request.bindingVerified, false);
    assert.equal(request.delivery.status, 'pending');
    assert.equal(request.execution.outcome, 'not-started');
  } finally {
    f.cleanup();
  }
});

test('capability requests use strict existing-journal readback and retain denied deduplication state', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pr-open-capability-'));
  try {
    const journal = path.join(dir, 'pr-open.jsonl');
    const denied = {
      id: 'request-1',
      createdAt: '2026-11-13T20:00:00Z',
      status: 'denied',
    };
    assert.equal(
      persistPublicationCapabilityRequest(denied, journal).persisted,
      true
    );
    assert.equal(
      persistPublicationCapabilityRequest(
        { ...denied, status: 'pending' },
        journal
      ).request.status,
      'denied'
    );
    assert.equal(readFileSync(journal, 'utf8').trim().split('\n').length, 1);
    assert.throws(() =>
      persistPublicationCapabilityRequest(
        { id: 'other' },
        path.join(journal, 'impossible')
      )
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deduplication retains uncertain execution evidence after a later attempted mutation', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pr-open-uncertain-'));
  try {
    const journal = path.join(dir, 'pr-open.jsonl');
    const request = {
      id: 'same-request',
      createdAt: '2026-11-13T20:00:00Z',
      status: 'denied',
      execution: { outcome: 'not-started' },
    };
    persistPublicationCapabilityRequest(request, journal);
    const next = persistPublicationCapabilityRequest(
      {
        ...request,
        status: 'pending',
        execution: { outcome: 'unknown', nextAction: 'read-existing-pr' },
      },
      journal
    ).request;
    assert.equal(next.status, 'denied');
    assert.equal(next.execution.outcome, 'unknown');
    assert.equal(
      persistPublicationCapabilityRequest(request, journal).request.execution
        .outcome,
      'unknown'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
