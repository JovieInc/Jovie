import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/email/tracking', () => ({
  buildClickTrackingUrl: (_p: unknown, url: string) => `https://t.test/c?u=x`,
}));
vi.mock('@/lib/email/unsubscribe-token', () => ({
  generateUnsubscribeToken: () => 'tok',
}));

import { memoryRecordBackend } from '@/lib/ovie/mcp/store';
import { buildRecoveryEmail, RecoveryEmailBlocked } from '@/lib/recovery/email';
import { type FixCertifier } from '@/lib/recovery/gate';
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
  deployedAt: '2026-10-30T00:00:00.000Z',
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
const live = new Set(['f1']);
const none = { fixIdsSent: [], totalSent: 0 };

describe('decide', () => {
  it('is eligible when stalled before a live fix', () => {
    expect(decide(user(), fix, live, none).eligible).toBe(true);
  });
  it.each([
    ['fix_not_live', user(), new Set<string>(), none],
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
    recheck: async () => true,
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
      recheck: async () => false,
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
