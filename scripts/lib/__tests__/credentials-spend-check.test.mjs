import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadRegistry, runCheck } from '../../credentials-spend-check.mjs';
import { loadCredentialsPlans } from '../../remediation-sweep.mjs';
import {
  codexOverlays,
  grantOverlays,
  summarizeCodexAccounts,
  summarizeGrants,
} from '../credentials-live-reads.mjs';
import {
  DAY_MS,
  evaluateRegistry,
  validateCredentialsRegistry,
  validateSpendLedger,
} from '../credentials-registry.mjs';
import { runRemediationSweep } from '../remediation-sweep.mjs';

const at = iso => Date.parse(iso);
const RECOVERY_EXPIRY = '2026-10-18T02:05:12.907Z';

function credentials(entries = [], stores = []) {
  return {
    schema: 'jovie.credentials-registry/v1',
    credentials: entries,
    stores,
  };
}

function spend(providers = []) {
  return { schema: 'jovie.spend-ledger/v1', providers };
}

const grant = (overrides = {}) => ({
  id: 'summer-gateway-recovery-grant',
  provider: 'summer-config',
  kind: 'grant',
  owner: 'summer-config',
  consumers: ['summer'],
  names: ['SUMMER_GATEWAY_RECOVERY_(GRANT|ENABLED)'],
  expiresAt: RECOVERY_EXPIRY,
  status: 'active',
  ...overrides,
});

const evaluate = (creds, ledger, nowIso, live) =>
  evaluateRegistry({
    credentials: creds,
    spend: ledger ?? spend(),
    nowMs: at(nowIso),
    live,
  });

describe('live overlays', () => {
  const envs = [
    {
      key: 'SUMMER_GATEWAY_RECOVERY_GRANT',
      type: 'plain',
      target: ['production'],
      value: JSON.stringify({ schema: 'g/v1', expiresAt: RECOVERY_EXPIRY }),
    },
    {
      key: 'SUMMER_GATEWAY_RECOVERY_ENABLED',
      type: 'plain',
      target: ['production'],
      value: 'true',
    },
    {
      key: 'SUMMER_NEW_GRANT',
      type: 'plain',
      target: ['production'],
      value: JSON.stringify({ expiresAt: '2026-10-21T00:00:00Z' }),
    },
    {
      key: 'SUMMER_SECRET_GRANT',
      type: 'sensitive',
      target: ['production'],
      value: '',
    },
  ];

  it('extracts only dated fields from plain grant declarations', () => {
    const grants = summarizeGrants(envs);
    expect(grants.map(item => item.envName)).toEqual([
      'SUMMER_GATEWAY_RECOVERY_GRANT',
      'SUMMER_NEW_GRANT',
    ]);
    expect(JSON.stringify(grants)).not.toContain('"value"');
    expect(grants[0]).toMatchObject({
      enabled: true,
      expiresAt: RECOVERY_EXPIRY,
    });
  });

  it('updates a claimed grant in place and watches an unknown grant at once', () => {
    const registry = [
      grant({ status: 'superseded', retireAction: 'remove' }),
      {
        id: 'catch',
        kind: 'grant',
        catchAll: true,
        names: ['SUMMER_[A-Z_]*_GRANT'],
      },
    ];
    const overlays = grantOverlays(summarizeGrants(envs), registry);
    expect(overlays[0]).toEqual({
      id: 'summer-gateway-recovery-grant',
      expiresAt: RECOVERY_EXPIRY,
      liveEnabled: true,
    });
    expect(overlays[1]).toMatchObject({
      id: 'summer-grant:SUMMER_NEW_GRANT',
      status: 'unused',
    });
    const { findings } = evaluate(
      credentials([grant({ status: 'superseded', retireAction: 'remove' })]),
      null,
      '2026-10-20T12:00:00Z',
      {
        credentials: grantOverlays(
          summarizeGrants([
            ...envs,
            {
              key: 'SUMMER_NEW_ENABLED',
              type: 'plain',
              target: ['production'],
              value: 'true',
            },
          ]),
          registry
        ),
      }
    );
    expect(findings[0]).toMatchObject({
      fingerprint: 'credential-expiry:summer-grant:SUMMER_NEW_GRANT:1d',
      severity: 'critical',
    });
  });

  it('turns banked Codex resets into dated credits', () => {
    const accounts = summarizeCodexAccounts({
      _ledger: {},
      fourth: {
        lastKind: 'ok',
        capacityLease: {
          planType: 'pro',
          generatedAt: '2026-10-07T18:08:23Z',
          usableCapacityRemaining: {
            primary: { remainingPercent: 83, resetsAt: 1791948502 },
          },
          credits: {
            details: [
              { status: 'available', redemptionDeadline: 1793301007 },
              { status: 'redeemed', redemptionDeadline: 1 },
            ],
          },
        },
      },
    });
    expect(accounts[0]).toMatchObject({
      account: 'fourth',
      remainingPercent: 83,
    });
    expect(codexOverlays(accounts)).toEqual([
      expect.objectContaining({
        id: 'codex:fourth:banked-reset:1',
        expiresAt: '2026-10-29T19:10:07.000Z',
        owner: 'gem-lanes',
      }),
    ]);
  });
});

describe('runCheck', () => {
  it('records every stage with timestamps and survives missing credentials', async () => {
    let tick = at('2026-10-20T00:00:00Z');
    const report = await runCheck({
      env: {},
      live: true,
      codexPath: '/nonexistent/codex-accounts.json',
      now: () => (tick += 5),
      registry: { credentials: credentials([grant()]), spend: spend() },
    });
    expect(report.run.schema).toBe('jovie.credentials-spend-run/v1');
    expect(report.run.stages.map(stage => stage.name)).toEqual([
      'load-registry',
      'read-gateway-credits',
      'read-summer-grants',
      'read-codex-ledger',
      'evaluate',
    ]);
    expect(report.run.reads).toEqual({
      gatewayCredits: 'no-gateway-token',
      summerGrants: 'no-vercel-token',
      codexLedger: 'no-codex-ledger',
    });
    for (const stage of report.run.stages) {
      expect(Date.parse(stage.finishedAt)).toBeGreaterThanOrEqual(
        Date.parse(stage.startedAt)
      );
    }
    expect(report.run.durationMs).toBeGreaterThan(0);
  });

  it('overlays a live Gateway balance and never forwards the token anywhere else', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), auth: init.headers.authorization });
      return new Response(
        JSON.stringify({ balance: '6.5', total_used: '600' })
      );
    };
    const report = await runCheck({
      env: { AI_GATEWAY_API_KEY: 'test-key' },
      live: true,
      codexPath: '/nonexistent',
      fetchImpl,
      now: () => at('2026-10-21T00:00:00Z'),
      registry: {
        credentials: credentials(),
        spend: spend([
          {
            id: 'vercel-ai-gateway-credits',
            snapshot: {
              observedAt: '2026-10-20T00:00:00Z',
              balanceUsd: 8,
              totalUsedUsd: 598.5,
            },
          },
        ]),
      },
    });
    expect(calls).toEqual([
      {
        url: 'https://ai-gateway.vercel.sh/v1/credits',
        auth: 'Bearer test-key',
      },
    ]);
    expect(report.findings[0]).toMatchObject({
      fingerprint: 'spend-runway:vercel-ai-gateway-credits',
      severity: 'critical',
      runwayDays: 4.3,
    });
    expect(JSON.stringify(report)).not.toContain('test-key');
  });
});

describe('remediation sweep credentials mode', () => {
  it('files credentials plans through the sweep', async () => {
    const report = await runRemediationSweep({
      mode: 'credentials',
      dryRun: true,
      loadCredentials: () =>
        loadCredentialsPlans({
          env: {},
          check: async () => ({
            run: {
              stages: [
                {
                  name: 'read-gateway-credits',
                  ok: false,
                  reason: 'no-gateway-token',
                },
              ],
            },
            plans: [{ fingerprint: 'spend-runway:x', title: 't', priority: 2 }],
          }),
        }),
    });
    expect(report.issues).toEqual([
      expect.objectContaining({
        fingerprint: 'spend-runway:x',
        action: 'dry-run',
      }),
    ]);
    expect(report.warnings).toEqual([
      'Credentials registry read read-gateway-credits unavailable: no-gateway-token',
    ]);
  });

  it('warns instead of judging when no loader is wired', async () => {
    const report = await runRemediationSweep({
      mode: 'credentials',
      dryRun: true,
    });
    expect(report.warnings).toContain(
      'Credentials registry loader not wired; not judged'
    );
  });
});

describe('committed registry', () => {
  const { credentials: creds, spend: ledger } = loadRegistry();

  it('validates and claims every secret-like name in the inventory', () => {
    expect(validateCredentialsRegistry(creds)).toEqual([]);
    expect(validateSpendLedger(ledger)).toEqual([]);
    const { counts } = evaluateRegistry({
      credentials: creds,
      spend: ledger,
      nowMs: Date.parse(creds.updatedAt) + DAY_MS,
    });
    expect(counts.unclaimedSecretNames).toBe(0);
  });

  it('loads every third-party grant with a platform, account and revoke URL', () => {
    const { thirdPartyGrants } = loadRegistry();
    expect(thirdPartyGrants.length).toBeGreaterThan(100);
    for (const grant of thirdPartyGrants) {
      expect(grant.platform, grant.id).toBeTruthy();
      expect(grant.account, grant.id).toBeTruthy();
      expect(grant.revokeAt, grant.id).toMatch(/^https:\/\//);
    }
  });

  it('records metadata only: no secret values', () => {
    const text = ['ops/registry/credentials.json', 'ops/registry/spend.json']
      .map(path =>
        readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
      )
      .join('\n');
    expect(text).not.toMatch(
      /sk_(live|test)_|rk_live_|whsec_|ghp_|github_pat_|xox[bp]-|vck_|lin_api_|eyJ[\w-]{20}|-----BEGIN|postgres(ql)?:\/\/|rediss?:\/\/|AKIA[0-9A-Z]{12}/
    );
  });

  it('gives every active credential an owner and a consumer', () => {
    for (const entry of creds.credentials) {
      if (entry.status !== 'active') continue;
      expect(entry.owner, entry.id).toBeTruthy();
      expect(entry.consumers?.length, entry.id).toBeGreaterThan(0);
    }
  });
});

describe('inventory collector', () => {
  it('keeps unread stores and stamps refreshed ones', async () => {
    const { mergeStores, workflowSecretReferences } = await import(
      '../../credentials-inventory-collect.mjs'
    );
    const merged = mergeStores(
      [
        { id: 'b', names: ['OLD'], observedAt: '2026-10-01T00:00:00Z' },
        { id: 'a', names: ['X'], observedAt: '2026-10-01T00:00:00Z' },
      ],
      [{ id: 'a', names: ['Y'] }],
      '2026-10-20T00:00:00Z'
    );
    expect(merged).toEqual([
      { id: 'a', names: ['Y'], observedAt: '2026-10-20T00:00:00Z' },
      { id: 'b', names: ['OLD'], observedAt: '2026-10-01T00:00:00Z' },
    ]);
    const refs = workflowSecretReferences();
    expect(refs.has('LINEAR_API_KEY')).toBe(true);
    expect(refs.has('GITHUB_TOKEN')).toBe(false);
  });
});
