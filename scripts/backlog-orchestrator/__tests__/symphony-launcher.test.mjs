import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildRoutingReceipt,
  selectSymphonyRoute,
} from '../symphony-routing.mjs';

const ROUTER = new URL('../../hermes/symphony-codex-router', import.meta.url)
  .pathname;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'symphony-launcher-'));
  const workspace = join(root, 'JOV-5029');
  const accounts = join(root, 'codex-accounts');
  mkdirSync(join(workspace), { recursive: true });
  mkdirSync(join(accounts, 'acct1'), { recursive: true });
  writeFileSync(join(accounts, 'acct1', 'auth.json'), '{}');
  writeFileSync(
    join(accounts, 'state.json'),
    JSON.stringify({ active: 'acct1', cooldowns: {} })
  );
  const rotateLog = join(root, 'rotate-args.txt');
  const stub = join(root, 'codex-rotate-stub');
  writeFileSync(
    stub,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >>"${rotateLog}"\n`
  );
  chmodSync(stub, 0o755);
  return { root, workspace, accounts, rotateLog, stub };
}

function issueWithReceipt(title) {
  const issue = {
    identifier: 'JOV-5029',
    title,
    description: '',
    labels: { nodes: [] },
    comments: { nodes: [] },
  };
  const decision = selectSymphonyRoute({
    issue,
    capacity: { accounts: 1, ready: 1, active: 'acct1', cooldowns: {} },
  });
  assert.equal(decision.status, 'selected');
  issue.comments.nodes.push({ body: buildRoutingReceipt(decision.route) });
  return { issue, route: decision.route };
}

function runRouter({ root, workspace, accounts, stub }, issue) {
  const issueFile = join(root, 'issue.json');
  writeFileSync(issueFile, JSON.stringify(issue));
  return execFileSync('bash', [ROUTER, 'app-server'], {
    cwd: workspace,
    env: {
      ...process.env,
      SYMPHONY_ROUTING_ISSUE_FILE: issueFile,
      SYMPHONY_ISSUE_IDENTIFIER: issue.identifier,
      SYMPHONY_WORKSPACE: workspace,
      SYMPHONY_CODEX_ROTATE: stub,
      CODEX_ACCOUNTS_ROOT: accounts,
      CODEX_ACCOUNTS_STATE: join(accounts, 'state.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('Symphony launcher closed loop', () => {
  it('materializes the verified receipt and launches the selected model', () => {
    const env = fixture();
    try {
      const { issue, route } = issueWithReceipt('Repair fleet architecture');
      runRouter(env, issue);
      const args = readFileSync(env.rotateLog, 'utf8');
      assert.match(args, /model=\\?"gpt-5\.6-terra\\?"|model="gpt-5\.6-terra"/);
      assert.match(args, /app-server/);
      const materialized = JSON.parse(
        readFileSync(join(env.workspace, '.symphony-routing.json'), 'utf8')
      );
      assert.equal(materialized.fingerprint, route.fingerprint);
      assert.equal(materialized.model, 'gpt-5.6-terra');
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it('fails closed on a tampered receipt model', () => {
    const env = fixture();
    try {
      const { issue } = issueWithReceipt('Fix README typo');
      const forged = issue.comments.nodes[0].body.replace(
        'gpt-5.6-luna',
        'gpt-5.6-sol'
      );
      issue.comments.nodes[0].body = forged;
      assert.throws(
        () => runRouter(env, issue),
        error => {
          assert.equal(error.status, 78);
          return true;
        }
      );
      assert.throws(() => readFileSync(env.rotateLog, 'utf8'));
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it('fails closed when no routing receipt exists', () => {
    const env = fixture();
    try {
      const issue = {
        identifier: 'JOV-5029',
        title: 'Add profile validation',
        description: '',
        labels: { nodes: [] },
        comments: { nodes: [] },
      };
      assert.throws(
        () => runRouter(env, issue),
        error => {
          assert.equal(error.status, 78);
          return true;
        }
      );
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it('fails closed when codex-rotate capacity is unreadable', () => {
    const env = fixture();
    try {
      const { issue } = issueWithReceipt('Add profile validation');
      env.accounts = join(env.root, 'missing-accounts');
      assert.throws(
        () => runRouter(env, issue),
        error => {
          assert.equal(error.status, 78);
          return true;
        }
      );
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  });
});
