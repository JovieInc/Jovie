import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
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

const ROUTER = new URL('../../symphony/symphony-codex-router', import.meta.url)
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
  const rotateEnv = join(root, 'rotate-env.txt');
  const stub = join(root, 'codex-rotate-stub');
  writeFileSync(
    stub,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >>"${rotateLog}"\nprintf '%s' "${'${LINEAR_API_KEY-}'}" >"${rotateEnv}"\n`
  );
  chmodSync(stub, 0o755);
  return { root, workspace, accounts, rotateLog, rotateEnv, stub };
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
      SYMPHONY_FALLBACK_LEASE_DIR: join(root, 'fallback-leases'),
      SYMPHONY_OPEN_PR_INDEX: 'empty',
      LINEAR_API_KEY: 'tracker-secret-must-not-reach-agent',
      SYMPHONY_CODEX_EXHAUSTED: new URL(
        '../../symphony/symphony-codex-exhausted.py',
        import.meta.url
      ).pathname,
      CODEX_ACCOUNTS_ROOT: accounts,
      CODEX_ACCOUNTS_STATE: join(accounts, 'state.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('Symphony launcher closed loop', () => {
  it('keeps the app-server stream alive during a slow routing preflight', async () => {
    const env = fixture();
    try {
      const { issue } = issueWithReceipt('Repair fleet architecture');
      const issueFile = join(env.root, 'issue.json');
      writeFileSync(issueFile, JSON.stringify(issue));
      const slowPickup = join(env.root, 'slow-pickup.py');
      writeFileSync(
        slowPickup,
        '#!/usr/bin/env python3\nimport time\ntime.sleep(3)\n'
      );
      chmodSync(slowPickup, 0o755);
      const child = spawn('bash', [ROUTER, 'app-server'], {
        cwd: env.workspace,
        env: {
          ...process.env,
          SYMPHONY_ROUTING_ISSUE_FILE: issueFile,
          SYMPHONY_ISSUE_IDENTIFIER: issue.identifier,
          SYMPHONY_WORKSPACE: env.workspace,
          SYMPHONY_CODEX_ROTATE: env.stub,
          SYMPHONY_FALLBACK_LEASE_DIR: join(env.root, 'fallback-leases'),
          SYMPHONY_CODEX_EXHAUSTED: slowPickup,
          SYMPHONY_ROUTER_HEARTBEAT_SECONDS: '1',
          CODEX_ACCOUNTS_ROOT: env.accounts,
          CODEX_ACCOUNTS_STATE: join(env.accounts, 'state.json'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        stdout += chunk;
      });
      const exitCode = await new Promise(resolve => {
        child.once('exit', resolve);
      });
      assert.equal(exitCode, 0);
      const heartbeats = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
      assert.ok(heartbeats.length >= 2);
      assert.ok(
        heartbeats.every(
          heartbeat => heartbeat.method === 'symphony-router/preflight'
        )
      );
      assert.match(readFileSync(env.rotateLog, 'utf8'), /app-server/);
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it('materializes the verified receipt and launches the selected model', () => {
    const env = fixture();
    try {
      const { issue, route } = issueWithReceipt('Repair fleet architecture');
      runRouter(env, issue);
      const args = readFileSync(env.rotateLog, 'utf8');
      assert.match(args, /model=\\?"gpt-5\.6-terra\\?"|model="gpt-5\.6-terra"/);
      assert.match(args, /app-server/);
      assert.equal(readFileSync(env.rotateEnv, 'utf8'), '');
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
          assert.equal(/** @type {any} */ (error).status, 78);
          assert.match(
            String(/** @type {any} */ (error).stderr),
            /SYMPHONY_LAUNCHER_FAILURE.*class=deterministic-launcher.*retryable=false.*maxAttempts=1/
          );
          return true;
        }
      );
      assert.throws(() => readFileSync(env.rotateLog, 'utf8'));
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it('fails closed when pickup-check refuses an In Review issue', () => {
    const env = fixture();
    try {
      const { issue } = issueWithReceipt('Fix README typo');
      const stub = join(env.root, 'pickup-check-stub.py');
      writeFileSync(
        stub,
        '#!/usr/bin/env python3\nimport sys\nprint(\'SYMPHONY_LAUNCHER_FAILURE schema=symphony-launcher-failure/v1 class=pickup-refused retryable=false maxAttempts=1 reason="issue_in_review owns JOV-5029"\', file=sys.stderr)\nsys.exit(78)\n'
      );
      chmodSync(stub, 0o755);
      assert.throws(
        () =>
          execFileSync('bash', [ROUTER, 'app-server'], {
            cwd: env.workspace,
            env: {
              ...process.env,
              SYMPHONY_ROUTING_ISSUE_FILE: join(env.root, 'issue.json'),
              SYMPHONY_ISSUE_IDENTIFIER: issue.identifier,
              SYMPHONY_WORKSPACE: env.workspace,
              SYMPHONY_CODEX_ROTATE: env.stub,
              SYMPHONY_FALLBACK_LEASE_DIR: join(env.root, 'fallback-leases'),
              SYMPHONY_OPEN_PR_INDEX: 'empty',
              SYMPHONY_CODEX_EXHAUSTED: stub,
              CODEX_ACCOUNTS_ROOT: env.accounts,
              CODEX_ACCOUNTS_STATE: join(env.accounts, 'state.json'),
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          }),
        error => {
          assert.equal(/** @type {any} */ (error).status, 78);
          assert.match(
            String(/** @type {any} */ (error).stderr),
            /issue_in_review/
          );
          return true;
        }
      );
      assert.throws(() => readFileSync(env.rotateLog, 'utf8'));
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it('fails closed when the fallback sidecar already holds the issue lease', async () => {
    const env = fixture();
    try {
      const { issue } = issueWithReceipt('Fix README typo');
      const leaseDir = join(env.root, 'fallback-leases');
      mkdirSync(leaseDir, { recursive: true });
      const lease = join(leaseDir, `${issue.identifier}.lock`);
      writeFileSync(lease, '');
      const holder = spawn(
        'python3',
        [
          '-c',
          'import fcntl, sys, time; f=open(sys.argv[1],"a+"); fcntl.flock(f, fcntl.LOCK_EX); time.sleep(8)',
          lease,
        ],
        { stdio: 'ignore', detached: true }
      );
      await new Promise(resolve => setTimeout(resolve, 80));
      try {
        assert.throws(
          () => runRouter(env, issue),
          error => {
            assert.equal(/** @type {any} */ (error).status, 78);
            assert.match(
              String(/** @type {any} */ (error).stderr),
              /fallback-lease-held/
            );
            return true;
          }
        );
      } finally {
        try {
          process.kill(-holder.pid, 'SIGTERM');
        } catch {
          /* holder may have already exited */
        }
      }
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
          assert.equal(/** @type {any} */ (error).status, 78);
          return true;
        }
      );
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it('parks the preserved JOV-4999 missing-routing shape at exit 78 without writing routing', () => {
    const env = fixture();
    const workspace = join(env.root, 'JOV-4999');
    mkdirSync(workspace, { recursive: true });
    env.workspace = workspace;
    try {
      const issue = {
        identifier: 'JOV-4999',
        title: 'Historical missing routing receipt',
        description: '',
        labels: { nodes: [] },
        comments: { nodes: [] },
      };
      assert.throws(
        () => runRouter(env, issue),
        error => {
          assert.equal(/** @type {any} */ (error).status, 78);
          assert.match(
            String(/** @type {any} */ (error).stderr),
            /SYMPHONY_LAUNCHER_FAILURE.*retryable=false.*maxAttempts=1/
          );
          return true;
        }
      );
      assert.throws(() =>
        readFileSync(join(workspace, '.symphony-routing.json'), 'utf8')
      );
      assert.throws(() => readFileSync(env.rotateLog, 'utf8'));
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
          assert.equal(/** @type {any} */ (error).status, 78);
          return true;
        }
      );
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it('backs off without a terminal block when authenticated accounts are cooling down', () => {
    const env = fixture();
    try {
      const { issue } = issueWithReceipt('Add profile validation');
      writeFileSync(
        join(env.accounts, 'state.json'),
        JSON.stringify({
          active: null,
          cooldowns: { acct1: Math.floor(Date.now() / 1000) + 3600 },
        })
      );
      assert.throws(
        () => runRouter(env, issue),
        error => {
          assert.equal(/** @type {any} */ (error).status, 75);
          assert.match(
            String(/** @type {any} */ (error).stderr),
            /CAPACITY_UNAVAILABLE.*class=provider-capacity.*retryable=true/
          );
          return true;
        }
      );
      assert.throws(() => readFileSync(env.rotateLog, 'utf8'));
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  });
});
