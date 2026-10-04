import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  planBillingHealthPublic,
  readBillingHealthResponse,
} from '../../billing-health-public-intake.mjs';
import { planBillingSyncIntake } from '../../billing-sync-intake.mjs';
import {
  docsDeploymentUrl,
  docsShaOnMain,
  planDocsDeploy,
} from '../../docs-deploy-intake.mjs';

const NOW = Date.parse('2026-10-02T00:00:00.000Z');

describe('billing detector plans', () => {
  it('accepts the canonical public liveness response and authenticated detail', () => {
    expect(
      planBillingHealthPublic(200, {
        healthy: true,
        timestamp: new Date(NOW).toISOString(),
      }).action
    ).toBe('resolve');
    expect(planBillingHealthPublic(401).action).toBe('resolve');
    expect(planBillingHealthPublic(403).action).toBe('resolve');
    expect(planBillingHealthPublic(503).action).toBe('skip');
  });

  it('files actual anonymous detailed state, including unsuccessful health checks', () => {
    expect(
      planBillingHealthPublic(200, { metrics: { proUsersInDb: 42 } }).action
    ).toBe('upsert');
    expect(
      planBillingHealthPublic(503, {
        checks: { recentReconciliation: { status: 'critical' } },
      }).action
    ).toBe('upsert');
  });

  it('does not infer clean evidence from status alone or unknown response bodies', () => {
    for (const response of [
      undefined,
      null,
      [],
      {},
      { healthy: true },
      { healthy: true, timestamp: 'invalid' },
      {
        healthy: true,
        timestamp: new Date(NOW).toISOString(),
        extra: 'unknown',
      },
    ]) {
      expect(planBillingHealthPublic(200, response).action).toBe('skip');
    }
  });

  it('reads bounded JSON evidence and rejects missing, malformed, oversized and linked files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-billing-response-'));
    try {
      const path = join(dir, 'response.json');
      const body = { healthy: true, timestamp: new Date(NOW).toISOString() };
      expect(readBillingHealthResponse(path)).toBeUndefined();
      writeFileSync(path, JSON.stringify(body));
      expect(readBillingHealthResponse(path)).toEqual(body);
      symlinkSync(path, join(dir, 'link.json'));
      expect(readBillingHealthResponse(join(dir, 'link.json'))).toBeUndefined();
      writeFileSync(path, '{');
      expect(readBillingHealthResponse(path)).toBeUndefined();
      writeFileSync(path, ' '.repeat(32769));
      expect(readBillingHealthResponse(path)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a failed reconciliation open even when its receipt is fresh', () => {
    const receipt = {
      lastReconciliationAt: new Date(NOW - 60_000).toISOString(),
      lastReconciliationSuccess: false,
      now: NOW,
    };
    expect(planBillingSyncIntake(receipt)).toMatchObject({
      action: 'upsert',
      reconciliationFailed: true,
    });
    expect(
      planBillingSyncIntake({ ...receipt, lastReconciliationSuccess: true })
        .action
    ).toBe('resolve');
  });

  it('files reconciliation older than 36 hours or webhooks older than 2 hours', () => {
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 37 * 60 * 60 * 1000).toISOString(),
        now: NOW,
      }).action
    ).toBe('upsert');
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
        unprocessedWebhooks: 2,
        oldestUnprocessedAt: new Date(NOW - 121 * 60 * 1000).toISOString(),
        now: NOW,
      }).action
    ).toBe('upsert');
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 35 * 60 * 60 * 1000).toISOString(),
        unprocessedWebhooks: 2,
        oldestUnprocessedAt: new Date(NOW - 119 * 60 * 1000).toISOString(),
        now: NOW,
      }).action
    ).toBe('resolve');
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
        unprocessedWebhooks: 2,
        oldestUnprocessedAt: null,
        now: NOW,
      }).action
    ).toBe('resolve');
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
        unprocessedWebhooks: 0,
        now: NOW,
      }).action
    ).toBe('resolve');
  });
});

describe('docs deploy plan', () => {
  it('uses the latest deployment status URL before the payload fallback', () => {
    expect(
      docsDeploymentUrl(
        { payload: { web_url: 'https://jovie-docs.vercel.app' } },
        { environment_url: 'https://vercel.com/jovie/docs/deploy-123' }
      )
    ).toBe('https://vercel.com/jovie/docs/deploy-123');
    expect(
      docsDeploymentUrl(
        { payload: { web_url: 'https://jovie-docs.vercel.app' } },
        {}
      )
    ).toBe('https://jovie-docs.vercel.app/');
  });

  it('does not substitute API URLs or unsafe/malformed provider metadata', () => {
    expect(
      docsDeploymentUrl(
        { url: 'https://api.github.com/repos/JovieInc/Jovie/deployments/123' },
        {}
      )
    ).toBeUndefined();
    for (const url of [
      'https://api.github.com/repos/JovieInc/Jovie/deployments/123',
      'http://vercel.com/deploy/123',
      'https://secret@vercel.com/deploy/123',
      'invalid',
    ]) {
      expect(
        docsDeploymentUrl(
          { payload: { web_url: url } },
          { environment_url: url }
        )
      ).toBeUndefined();
    }
  });

  it('files a failed main deployment and resolves the next success', () => {
    expect(docsShaOnMain('ahead')).toBe(true);
    expect(docsShaOnMain('identical')).toBe(true);
    expect(docsShaOnMain('behind')).toBe(false);
    expect(planDocsDeploy({ status: 'error', onMain: true }).action).toBe(
      'upsert'
    );
    expect(planDocsDeploy({ status: 'failure', onMain: false }).action).toBe(
      'skip'
    );
    expect(planDocsDeploy({ status: 'success', onMain: true }).action).toBe(
      'resolve'
    );
  });
});
