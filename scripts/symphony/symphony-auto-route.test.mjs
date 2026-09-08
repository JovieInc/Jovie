import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  buildRoutingReceipt,
  materializeRoutingReceipt,
  selectSymphonyRoute,
} from '../backlog-orchestrator/symphony-routing.mjs';
import { prepareSymphonyRoute } from './symphony-auto-route.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const AUTO_ROUTE = join(ROOT, 'scripts/symphony/symphony-auto-route.mjs');

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'symphony-auto-route-'));
  roots.push(root);
  const workspaceDir = join(root, 'JOV-5034');
  mkdirSync(workspaceDir, { recursive: true });
  const issueFile = join(root, 'leased-issue.json');
  const issue = {
    id: 'issue-5034',
    identifier: 'JOV-5034',
    title: 'Repair routing receipt handoff',
    description: '',
    labels: { nodes: [] },
    comments: { nodes: [] },
  };
  const capacity = {
    accounts: 1,
    ready: 1,
    active: 'acct-1',
    cooldowns: {},
  };
  return { root, workspaceDir, issueFile, issue, capacity };
}

function routingWithCapacity(capacity) {
  return {
    buildRoutingReceipt,
    materializeRoutingReceipt,
    readCodexRotateCapacity: () => capacity,
    selectSymphonyRoute,
  };
}

describe('Symphony auto route', () => {
  it('materializes a valid receipt from leased issue evidence without tracker I/O', async () => {
    const env = fixture();
    const decision = selectSymphonyRoute({
      issue: env.issue,
      capacity: env.capacity,
    });
    env.issue.comments.nodes.push({
      body: buildRoutingReceipt(decision.route),
    });
    writeFileSync(env.issueFile, JSON.stringify(env.issue));
    const tracker = {
      fetchIssue: async () => assert.fail('must not fetch leased issue again'),
      addComment: async () => assert.fail('must not rewrite a valid receipt'),
    };

    const result = await prepareSymphonyRoute({
      issueIdentifier: env.issue.identifier,
      workspaceDir: env.workspaceDir,
      issueFile: env.issueFile,
      routing: routingWithCapacity(env.capacity),
      tracker,
    });

    assert.equal(result.source, 'existing-receipt');
    assert.equal(
      JSON.parse(readFileSync(result.path, 'utf8')).fingerprint,
      decision.route.fingerprint
    );
  });

  it('fetches once, persists once, and materializes without a refetch', async () => {
    const env = fixture();
    let fetches = 0;
    let comments = 0;
    const tracker = {
      fetchIssue: async () => {
        fetches += 1;
        return env.issue;
      },
      addComment: async () => {
        comments += 1;
        return { commentCreate: { success: true } };
      },
    };

    const result = await prepareSymphonyRoute({
      issueIdentifier: env.issue.identifier,
      workspaceDir: env.workspaceDir,
      issueFile: undefined,
      routing: routingWithCapacity(env.capacity),
      tracker,
    });

    assert.equal(fetches, 1);
    assert.equal(comments, 1);
    assert.equal(result.source, 'created-receipt');
    assert.equal(
      JSON.parse(readFileSync(result.path, 'utf8')).issue,
      'JOV-5034'
    );
  });

  it('replays identical materialization and rejects conflicting evidence', () => {
    const env = fixture();
    const decision = selectSymphonyRoute({
      issue: env.issue,
      capacity: env.capacity,
    });
    env.issue.comments.nodes.push({
      body: buildRoutingReceipt(decision.route),
    });
    const first = materializeRoutingReceipt(env.issue, env.workspaceDir, {
      requireCapacityEvidence: true,
    });
    const before = readFileSync(first.path, 'utf8');
    assert.equal(
      materializeRoutingReceipt(env.issue, env.workspaceDir, {
        requireCapacityEvidence: true,
      }).path,
      first.path
    );

    const conflict = {
      ...JSON.parse(before),
      model: 'conflicting-model',
    };
    writeFileSync(first.path, JSON.stringify(conflict) + '\n');
    assert.throws(
      () =>
        materializeRoutingReceipt(env.issue, env.workspaceDir, {
          requireCapacityEvidence: true,
        }),
      /symphony-routing-materialization-conflict/
    );
    assert.equal(
      JSON.parse(readFileSync(first.path, 'utf8')).model,
      'conflicting-model'
    );
    assert.deepEqual(
      readdirSync(env.workspaceDir).filter(name => name.endsWith('.tmp')),
      []
    );
  });

  it('runs the installed entrypoint against workspace-local source and evidence', () => {
    const env = fixture();
    const account = join(env.root, 'accounts/acct-1');
    const state = join(env.root, 'accounts/state.json');
    mkdirSync(account, { recursive: true });
    symlinkSync(
      join(ROOT, 'scripts'),
      join(env.workspaceDir, 'scripts'),
      'dir'
    );
    const decision = selectSymphonyRoute({
      issue: env.issue,
      capacity: env.capacity,
    });
    env.issue.comments.nodes.push({
      body: buildRoutingReceipt(decision.route),
    });
    writeFileSync(env.issueFile, JSON.stringify(env.issue));
    writeFileSync(state, JSON.stringify({ active: 'acct-1', cooldowns: {} }));
    writeFileSync(join(account, 'auth.json'), '{}');

    const result = spawnSync(process.execPath, [AUTO_ROUTE], {
      cwd: env.workspaceDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        SYMPHONY_WORKSPACE: env.workspaceDir,
        SYMPHONY_ISSUE_IDENTIFIER: env.issue.identifier,
        SYMPHONY_ROUTING_ISSUE_FILE: env.issueFile,
        CODEX_ACCOUNTS_ROOT: join(env.root, 'accounts'),
        CODEX_ACCOUNTS_STATE: state,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ROUTE_ADMITTED.*source=existing-receipt/);
    assert.equal(
      JSON.parse(
        readFileSync(join(env.workspaceDir, '.symphony-routing.json'), 'utf8')
      ).issue,
      'JOV-5034'
    );
  });
});
