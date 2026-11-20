import { describe, expect, it, vi } from 'vitest';

const SHA = 'a'.repeat(40);
const shared = vi.hoisted(() => ({ backend: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  env: { VERCEL_ENV: 'production' },
}));
vi.mock('@/lib/observability/build-info', () => ({
  resolveCommitSha: () => 'a'.repeat(40),
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => shared.backend,
}));
vi.mock('@/lib/email/tracking', () => ({
  buildClickTrackingUrl: (_p: unknown, url: string) => `https://t.test/c?u=x`,
}));
vi.mock('@/lib/email/unsubscribe-token', () => ({
  generateUnsubscribeToken: () => 'tok',
}));

import {
  PROD_GOLDEN_PATH_SURFACE_IDS,
  type ProdGoldenPathReceipt,
  recordProdGoldenPathRun,
} from '@/lib/ovie/certifications/prod-golden-path-ledger';
import { memoryRecordBackend } from '@/lib/ovie/mcp/store';
import { buildRecoveryEmail, RecoveryEmailBlocked } from '@/lib/recovery/email';
import { certifyFix, type FixCertifier } from '@/lib/recovery/gate';
import { createLedger } from '@/lib/recovery/ledger';
import { decide, type StalledUser } from '@/lib/recovery/policy';
import type { KnownBadFlowFix } from '@/lib/recovery/registry';
import { buildRecoveryReport } from '@/lib/recovery/report';
import { type RunnerDeps, runRecovery } from '@/lib/recovery/runner';

const fix: KnownBadFlowFix = {
  id: 'f1',
  issue: 'JOV-1',
  step: 'preview',
  templateClass: 'step-fixed',
  whatBroke: 'your preview only showed your name',
  whatChanged: 'it now shows your releases',
  fallbackPath: '/start',
  checkId: 'c1',
  shippedInCode: true,
};
const user = (over: Partial<StalledUser> = {}): StalledUser => ({
  userId: 'u1',
  firstName: 'Sam',
  email: 'sam@mailbox-demo.com',
  stalledStep: 'preview',
  stalledAt: new Date('2026-10-28T00:00:00.000Z'),
  readyUrl: 'https://jov.ie/sam',
  suppressed: false,
  ...over,
});
const live = new Map([['f1', '2026-10-30T00:00:00.000Z']]);
const none = { fixIdsSent: [], totalSent: 0 };

describe('decide', () => {
  it('is eligible when stalled before a live fix', () => {
    expect(decide(user(), fix, live, none).eligible).toBe(true);
  });
  it.each([
    ['fix_not_live', user(), new Map<string, string>(), none],
    ['internal_account', user({ email: 'a@jov.ie' }), live, none],
    ['suppressed', user({ suppressed: true }), live, none],
    [
      'stalled_after_fix',
      user({ stalledAt: new Date('2026-11-01') }),
      live,
      none,
    ],
    [
      'already_sent_for_fix',
      user(),
      live,
      { fixIdsSent: ['f1'], totalSent: 1 },
    ],
    ['recovery_cap_reached', user(), live, { fixIdsSent: [], totalSent: 2 }],
    ['nothing_ready', user({ readyUrl: null }), live, none],
  ])('skips %s', (reason, u, l, h) => {
    expect(decide(u, fix, l, h)).toEqual({ eligible: false, reason });
  });
});

describe('buildRecoveryEmail', () => {
  const base = {
    fix,
    firstName: 'Sam',
    email: 'sam@mailbox-demo.com',
    readyUrl: 'https://jov.ie/sam',
    recordId: 'r1',
  };
  it('is plain text from Tim with address, unsubscribe and one link', () => {
    const e = buildRecoveryEmail({ ...base, mailingAddress: '1 Main St' });
    expect(e.text).toContain('your preview only showed your name');
    expect(e.text).toContain('1 Main St');
    expect(e.text).toContain('Unsubscribe');
    expect(e.headers['List-Unsubscribe-Post']).toBe(
      'List-Unsubscribe=One-Click'
    );
    expect(e.from).toContain('Tim White');
    expect(e.text).not.toMatch(/[–—]/);
    expect((e.text.match(/https?:\/\//g) ?? []).length).toBe(2); // ready link + unsubscribe
  });
  it('refuses without a mailing address', () => {
    expect(() => buildRecoveryEmail({ ...base, mailingAddress: null })).toThrow(
      RecoveryEmailBlocked
    );
  });
});

function deps(over: Partial<RunnerDeps> = {}, users = [user()]) {
  const sent: string[] = [];
  const cards: string[] = [];
  const status = { v: 'none' as 'none' | 'pending' | 'approved' | 'rejected' };
  const certifier: FixCertifier = {
    isLiveOnProduction: async () => true,
    deployedAt: async () => '2026-10-30T00:00:00.000Z',
    recheck: async () => true,
    goldenPathGreen: async () => true,
  };
  const d: RunnerDeps = {
    fixes: [fix],
    users,
    certifier,
    ledger: createLedger(memoryRecordBackend()),
    mailingAddress: '1 Main St',
    now: new Date('2026-10-31'),
    send: async (_e, to) => (sent.push(to), { ok: true }),
    cardStatus: async () => status.v,
    fileCard: async c => void cards.push(c.body),
    ...over,
  };
  return { d, sent, cards, status };
}

describe('runRecovery', () => {
  it('files an approval card first and sends nothing', async () => {
    const { d, sent, cards } = deps();
    const r = await runRecovery(d);
    expect(r.cardsFiled).toBe(1);
    expect(sent).toEqual([]);
    expect(cards[0]).toContain('Hey Sam,');
    expect(cards[0]).not.toContain('sam@mailbox-demo.com');
  });
  it('sends after approval, once, and auto-sends the class afterwards', async () => {
    const { d, sent, status } = deps();
    status.v = 'approved';
    expect((await runRecovery(d)).sent).toBe(1);
    expect((await runRecovery(d)).sent).toBe(0); // one per user per fix
    const second = {
      ...d,
      users: [user({ userId: 'u2', email: 'lee@mailbox-demo.com' })],
      cardStatus: async () => 'none' as const,
    };
    expect((await runRecovery(second)).sent).toBe(1); // template class approved
    expect(sent).toHaveLength(2);
  });
  it('holds sends without a postal address', async () => {
    const { d, sent, status } = deps({ mailingAddress: null });
    status.v = 'approved';
    const r = await runRecovery(d);
    expect(r.held).toBe('compliance_mailing_address');
    expect(sent).toEqual([]);
  });
  it('never sends when the gate is closed', async () => {
    const closed: FixCertifier = {
      isLiveOnProduction: async () => true,
      deployedAt: async () => '2026-10-30T00:00:00.000Z',
      recheck: async () => false,
      goldenPathGreen: async () => true,
    };
    const { d, sent, cards } = deps({ certifier: closed });
    const r = await runRecovery(d);
    expect(r.skipped.fix_not_live).toBe(1);
    expect(sent).toEqual([]);
    expect(cards).toEqual([]);
  });
  it('caps a user at two recovery emails ever', async () => {
    const fix2 = { ...fix, id: 'f2' };
    const fix3 = { ...fix, id: 'f3' };
    const { d, sent, status } = deps({ fixes: [fix, fix2, fix3] });
    status.v = 'approved';
    const ledger = d.ledger;
    await ledger.reserve('u1', 'f2', 'step-fixed', d.now);
    await ledger.reserve('u1', 'f3', 'step-fixed', d.now);
    const r = await runRecovery(d);
    expect(sent).toEqual([]);
    expect(r.skipped.recovery_cap_reached).toBe(1);
  });
});

describe('buildRecoveryReport', () => {
  it('counts stages and click-to-complete percentiles', () => {
    const r = (o: object) => ({
      id: 'x',
      userId: 'u',
      fixId: 'f',
      templateClass: 't',
      createdAt: 'a',
      sentAt: null,
      openedAt: null,
      clickedAt: null,
      returnedAt: null,
      completedStepAt: null,
      claimedAt: null,
      paidAt: null,
      ...o,
    });
    const rep = buildRecoveryReport([
      r({
        sentAt: 'x',
        clickedAt: '2026-10-31T00:00:00Z',
        completedStepAt: '2026-10-31T00:01:00Z',
      }),
      r({ sentAt: 'x' }),
    ]);
    expect(rep).toMatchObject({
      sent: 2,
      clicked: 1,
      completedStep: 1,
      paid: 0,
      clickToCompleteMsP50: 60000,
    });
  });
});

describe('certifyFix', () => {
  const ok: FixCertifier = {
    isLiveOnProduction: async () => true,
    deployedAt: async () => '2026-10-30T00:00:00.000Z',
    recheck: async () => true,
    goldenPathGreen: async () => true,
  };
  it('certifies only when shipped, live, deployed and the check passes', async () => {
    expect((await certifyFix(fix, ok)).live).toBe(true);
    expect(
      (await certifyFix({ ...fix, shippedInCode: false }, ok)).reason
    ).toBe('no_deploy_recorded');
    expect(
      (await certifyFix(fix, { ...ok, isLiveOnProduction: async () => false }))
        .reason
    ).toBe('not_on_production');
    expect(
      (await certifyFix(fix, { ...ok, deployedAt: async () => null })).reason
    ).toBe('no_deploy_recorded');
    expect(
      (await certifyFix(fix, { ...ok, recheck: async () => false })).reason
    ).toBe('check_failed');
  });
});

describe('production certifier against the golden-path ledger', () => {
  const NOW = new Date('2026-10-31T12:00:00Z');
  const STEP = 'golden-path-preview-has-release';
  const stepFix: KnownBadFlowFix = { ...fix, checkId: STEP };
  const receipt = (
    surface: ProdGoldenPathReceipt['surface'],
    over: Partial<ProdGoldenPathReceipt> = {},
    stepStatus: 'passed' | 'failed' = 'passed'
  ): ProdGoldenPathReceipt => ({
    schema: 'jovie.prod-golden-path-receipt/v1',
    surface,
    status: 'passed',
    sha: SHA,
    deploymentId: null,
    startedAt: '2026-10-31T05:59:00Z',
    endedAt: '2026-10-31T06:00:00Z',
    runUrl: null,
    screenIds: [],
    identity: 'anonymous',
    checks: [
      {
        id: 'c',
        status: 'passed',
        startedAt: '2026-10-31T05:59:00Z',
        endedAt: '2026-10-31T06:00:00Z',
        summary: 'ok',
      },
      ...(surface === 'claim'
        ? [
            {
              id: STEP,
              status: stepStatus,
              startedAt: '2026-10-31T05:59:00Z',
              endedAt: '2026-10-31T06:00:00Z',
              summary: 'ok',
            },
          ]
        : []),
    ],
    blocker: null,
    issueUrl: null,
    observations: [],
    ...over,
  });

  async function certifier(
    overrides: Partial<
      Record<ProdGoldenPathReceipt['surface'], Partial<ProdGoldenPathReceipt>>
    > = {},
    omit: string[] = []
  ) {
    const backend = memoryRecordBackend();
    shared.backend = backend;
    const receipts = PROD_GOLDEN_PATH_SURFACE_IDS.filter(
      id => !omit.includes(id)
    ).map(id => receipt(id, overrides[id]));
    await recordProdGoldenPathRun({ backend, receipts });
    const { createProductionCertifier } = await import(
      '@/lib/recovery/probes.server'
    );
    return createProductionCertifier(
      (async () =>
        new Response(JSON.stringify({ commitSha: SHA }))) as typeof fetch
    );
  }

  const runWith = async (c: FixCertifier, address: string | null) => {
    const h = deps({
      fixes: [stepFix],
      certifier: c,
      mailingAddress: address,
    });
    h.status.v = 'approved';
    vi.setSystemTime(NOW);
    const r = await runRecovery({ ...h.d, now: NOW });
    return { r, ...h };
  };

  it('everything green but no mailing address: no send', async () => {
    const c = await certifier();
    vi.useFakeTimers();
    const { r, sent } = await runWith(c, null);
    vi.useRealTimers();
    expect(r.held).toBe('compliance_mailing_address');
    expect(sent).toEqual([]);
  });

  it.each([
    ['a surface failed', { checkout: { status: 'failed' as const } }, []],
    ['a surface is missing', {}, ['smartlink']],
    [
      'a surface is stale',
      {
        landing: {
          startedAt: '2026-10-29T05:59:00Z',
          endedAt: '2026-10-29T06:00:00Z',
        },
      },
      [],
    ],
    ['a surface passed on another sha', { chat: { sha: 'b'.repeat(40) } }, []],
  ])('golden path red (%s): no send, no card', async (_n, over, omit) => {
    const c = await certifier(over as never, omit);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(await c.goldenPathGreen()).toBe(false);
    const { r, sent, cards } = await runWith(c, '1 Main St');
    vi.useRealTimers();
    expect(r.sent).toBe(0);
    expect(r.skipped.fix_not_live).toBe(1);
    expect(sent).toEqual([]);
    expect(cards).toEqual([]);
  });

  it('the fix step check failing blocks even a green path', async () => {
    const backend = memoryRecordBackend();
    shared.backend = backend;
    await recordProdGoldenPathRun({
      backend,
      receipts: PROD_GOLDEN_PATH_SURFACE_IDS.map(id =>
        receipt(id, id === 'claim' ? { status: 'passed' } : {}, 'passed')
      ).map(r =>
        r.surface === 'claim'
          ? { ...r, checks: r.checks.filter(c => c.id !== STEP) }
          : r
      ),
    });
    const { createProductionCertifier } = await import(
      '@/lib/recovery/probes.server'
    );
    const c = createProductionCertifier(
      (async () =>
        new Response(JSON.stringify({ commitSha: SHA }))) as typeof fetch
    );
    expect(await c.recheck(STEP)).toBe(false);
  });

  it('all green plus address: the eligible user gets an approval card, not an email', async () => {
    const c = await certifier();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(await c.goldenPathGreen()).toBe(true);
    expect(await c.recheck(STEP)).toBe(true);
    const h = deps({
      fixes: [stepFix],
      certifier: { ...c, deployedAt: async () => '2026-10-30T00:00:00.000Z' },
      mailingAddress: '1 Main St',
    });
    const r = await runRecovery({ ...h.d, now: NOW });
    vi.useRealTimers();

    expect(r.cardsFiled).toBe(1);
    expect(r.sent).toBe(0);
    expect(h.sent).toEqual([]);
    expect(h.cards).toHaveLength(1);
  });
});
