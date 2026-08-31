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
  OFFICIAL_ROUTE_FILE,
  selectOfficialRoute,
  writeOfficialRoute,
} from '../../hermes/symphony-official-route.mjs';

const LAUNCHER = new URL(
  '../../hermes/symphony-official-codex',
  import.meta.url
).pathname;

const issue = (title, description = '', labels = []) => ({
  identifier: 'JOV-6000',
  title,
  description,
  labels: { nodes: labels.map(name => ({ name })) },
});

describe('official Symphony subscription routing', () => {
  it('uses Luna with cheap reasoning for routine low-risk work', () => {
    const route = selectOfficialRoute({
      issue: issue('Fix README typo'),
    });
    assert.equal(route.model, 'gpt-5.6-luna');
    assert.equal(route.reasoningEffort, 'low');
    assert.equal(route.classification.routeClass, 'routine');
  });

  it('escalates verification evidence and failures', () => {
    const evidence = selectOfficialRoute({
      issue: issue(
        'Prove the golden path invariant with exact runtime evidence'
      ),
    });
    assert.equal(evidence.model, 'gpt-5.6-terra');
    assert.equal(evidence.reasoningEffort, 'high');

    const retry = selectOfficialRoute({
      issue: issue('Update profile validation'),
      previous: evidence,
    });
    assert.equal(retry.model, 'gpt-5.6-terra');
    assert.equal(retry.reasoningEffort, 'high');
    assert.equal(retry.classification.failure, true);

    const repeated = selectOfficialRoute({
      issue: issue('Update profile validation'),
      previous: retry,
    });
    assert.equal(repeated.model, 'gpt-5.6-sol');
    assert.equal(repeated.reasoningEffort, 'xhigh');
  });

  it('prevents a hard route from downgrading when later text looks routine', () => {
    const hard = selectOfficialRoute({
      issue: issue('Repair production auth token failure'),
    });
    const later = selectOfficialRoute({
      issue: issue('Fix README typo'),
      previous: hard,
    });
    assert.equal(later.model, 'gpt-5.6-sol');
    assert.equal(later.reasoningEffort, 'xhigh');
    assert.equal(later.preventedDowngrade, true);
  });

  it('persists the no-downgrade floor outside the agent workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'official-symphony-floor-'));
    const workspace = join(root, 'workspace', 'JOV-6000');
    const stateRoot = join(root, 'state');
    const issueFile = join(root, 'issue.json');
    mkdirSync(workspace, { recursive: true });
    const routeTool = new URL(
      '../../hermes/symphony-official-route.mjs',
      import.meta.url
    ).pathname;
    try {
      writeFileSync(
        issueFile,
        JSON.stringify(issue('Repair production auth token failure'))
      );
      execFileSync(
        'node',
        [
          routeTool,
          'prepare',
          '--workspace',
          workspace,
          '--issue',
          'JOV-6000',
          '--issue-file',
          issueFile,
        ],
        { env: { ...process.env, SYMPHONY_ROUTE_STATE_ROOT: stateRoot } }
      );
      writeFileSync(issueFile, JSON.stringify(issue('Fix README typo')));
      execFileSync(
        'node',
        [
          routeTool,
          'prepare',
          '--workspace',
          workspace,
          '--issue',
          'JOV-6000',
          '--issue-file',
          issueFile,
        ],
        { env: { ...process.env, SYMPHONY_ROUTE_STATE_ROOT: stateRoot } }
      );
      const receipt = JSON.parse(
        readFileSync(join(workspace, OFFICIAL_ROUTE_FILE), 'utf8')
      );
      assert.equal(receipt.model, 'gpt-5.6-sol');
      assert.equal(receipt.reasoningEffort, 'xhigh');
      assert.equal(receipt.preventedDowngrade, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('records a capacity alert before a subscription is exhausted', () => {
    const route = selectOfficialRoute({
      issue: issue('Fix README typo'),
      capacity: {
        usagePercent: 92,
        remainingPercent: 8,
        observedAt: '2026-08-31T12:00:00Z',
      },
    });
    assert.equal(route.capacity.alert, 'multi-account-routing-required');
    assert.equal(route.capacity.remainingPercent, 8);
  });

  it('shadow-launches Codex with the exact selected model and effort', () => {
    const root = mkdtempSync(join(tmpdir(), 'official-symphony-route-'));
    const workspace = join(root, 'JOV-6000');
    const log = join(root, 'codex-args.log');
    const stub = join(root, 'codex-stub');
    mkdirSync(workspace);
    writeFileSync(
      stub,
      `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${log}"\n`
    );
    chmodSync(stub, 0o755);
    try {
      const route = selectOfficialRoute({
        issue: issue('Prove exact runtime verification evidence'),
      });
      writeOfficialRoute(workspace, route);
      execFileSync('bash', [LAUNCHER], {
        cwd: workspace,
        env: {
          ...process.env,
          SYMPHONY_CODEX_BIN: stub,
          SYMPHONY_WORKSPACE: workspace,
        },
      });
      const args = readFileSync(log, 'utf8');
      assert.match(args, /model="gpt-5\.6-terra"/);
      assert.match(args, /model_reasoning_effort=high/);
      assert.match(args, /app-server/);
      const receipt = JSON.parse(
        readFileSync(join(workspace, OFFICIAL_ROUTE_FILE), 'utf8')
      );
      assert.equal(receipt.model, 'gpt-5.6-terra');
      assert.equal(receipt.reasoningEffort, 'high');
      assert.equal(JSON.stringify(receipt).includes('lin_api_'), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
