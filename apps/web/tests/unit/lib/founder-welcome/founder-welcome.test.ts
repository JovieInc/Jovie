import { lintCopy } from '@jovie/copy';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendStreamEmail: vi.fn(),
  backend: null as unknown,
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/email/gateway', () => ({
  sendStreamEmail: mocks.sendStreamEmail,
}));
vi.mock('@/lib/notifications/suppression', () => ({
  isEmailSuppressed: async () => ({ suppressed: false }),
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => mocks.backend,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  getSummerCard: async () => null,
  submitSummerCard: async () => ({ outcome: 'created' }),
}));
vi.mock('@/lib/email/unsubscribe-token', () => ({
  generateUnsubscribeToken: () => 'tok',
}));

import {
  buildFounderWelcomeBody,
  buildFounderWelcomeEmail,
  FounderWelcomeBlocked,
} from '@/lib/founder-welcome/email';
import { createFounderWelcomeLedger } from '@/lib/founder-welcome/ledger';
import {
  type AdmittedVisitor,
  buildFounderWelcomeCard,
  type FiledCard,
  type FounderWelcomeDeps,
  type FounderWelcomeSend,
  founderWelcomeCardKey,
  runFounderWelcome,
} from '@/lib/founder-welcome/runner';
import {
  buildFounderWelcomeServerDeps,
  FOUNDER_WELCOME_PAGE_URL,
} from '@/lib/founder-welcome/server';
import { memoryRecordBackend } from '@/lib/ovie/mcp/store';
import { summerCardId } from '@/lib/ovie/summer-card-digest';
import type { SummerCardInput } from '@/lib/ovie/summer-cards';

const NOW = new Date('2026-11-11T12:00:00.000Z');
const PAGE = 'https://jov.ie/app/dashboard/profile';

const visitor = (over: Partial<AdmittedVisitor> = {}): AdmittedVisitor => ({
  entryId: '11111111-1111-4111-8111-111111111111',
  email: 'sam@mailbox-demo.com',
  firstName: 'Sam Rivera',
  artistName: 'Sam and the Tides',
  pageUrl: PAGE,
  suppressed: false,
  ...over,
});
const alice = visitor();
const bob = visitor({
  entryId: '22222222-2222-4222-8222-222222222222',
  email: 'bo@mailbox-demo.com',
  firstName: 'Bo',
  artistName: 'Bo Lumen',
});
/** The card key the runner files for a visitor's current wording. */
const keyOf = (v: AdmittedVisitor) =>
  buildFounderWelcomeCard({ ...v, pageUrl: PAGE }, v.artistName ?? '')
    .idempotencyKey;

/** In-memory Ovie inbox: one card per key, decided per card. */
function cardStore() {
  const cards = new Map<string, { input: SummerCardInput } & FiledCard>();
  return {
    cards,
    decide(key: string, status: FiledCard['status']) {
      const card = cards.get(key);
      if (!card) throw new Error(`no card ${key}`);
      cards.set(key, { ...card, status });
    },
    async readCard(key: string): Promise<FiledCard | null> {
      const card = cards.get(key);
      return card
        ? { status: card.status, recipient: card.recipient, body: card.body }
        : null;
    },
    async fileCard(input: SummerCardInput): Promise<'filed' | 'conflict'> {
      const existing = cards.get(input.idempotencyKey);
      if (existing) return existing.body === input.body ? 'filed' : 'conflict';
      cards.set(input.idempotencyKey, {
        input,
        status: 'pending',
        recipient: input.recipient,
        body: input.body,
      });
      return 'filed';
    },
  };
}

function harness(
  visitors: readonly AdmittedVisitor[],
  over: Partial<FounderWelcomeDeps> = {}
) {
  const store = cardStore();
  const sends: FounderWelcomeSend[] = [];
  const backend = memoryRecordBackend();
  const deps = (): FounderWelcomeDeps => ({
    visitors,
    mailingAddress: '1 Test St, Los Angeles, CA',
    now: NOW,
    ledger: createFounderWelcomeLedger(backend),
    unsubscribeUrl: () => 'https://jov.ie/api/unsubscribe/recovery?token=tok',
    readCard: key => store.readCard(key),
    fileCard: card => store.fileCard(card),
    async send(email) {
      sends.push(email);
      return { ok: true };
    },
    ...over,
  });
  return { store, sends, deps };
}

describe('founder welcome copy', () => {
  const body = buildFounderWelcomeBody({
    firstName: 'Sam Rivera',
    artistName: 'Sam and the Tides',
    link: PAGE,
  });

  it('is a short personal note from Tim', () => {
    const lines = body.split('\n').filter(Boolean);
    expect(lines[0]).toBe('Hi Sam,');
    expect(lines.at(-1)).toBe('Tim');
    const prose = lines.slice(1, -1).join(' ');
    const sentences = prose.split(/(?<=[.!?])\s+/u).filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences.length).toBeLessThanOrEqual(4);
    expect(body).toContain('Sam and the Tides');
    expect(body).toContain(PAGE);
  });

  it('avoids the banned phrasing', () => {
    for (const phrase of [
      'happy to',
      'just wanted to',
      'at your earliest convenience',
    ]) {
      expect(body.toLowerCase()).not.toContain(phrase);
    }
    expect(body).not.toMatch(/[–—]| - /u);
    expect((body.match(/!/gu) ?? []).length).toBeLessThanOrEqual(1);
    expect(lintCopy(body, { register: 'founder-tim' }).ok).toBe(true);
  });

  it('greets without a name when the name is not a plain name', () => {
    expect(
      buildFounderWelcomeBody({ firstName: null, artistName: 'X', link: PAGE })
    ).toMatch(/^Hi there,/u);
  });

  it('will not build a send without a postal address or unsubscribe link', () => {
    expect(() =>
      buildFounderWelcomeEmail({
        body,
        mailingAddress: null,
        unsubscribeUrl: 'https://u',
      })
    ).toThrow(FounderWelcomeBlocked);
    expect(() =>
      buildFounderWelcomeEmail({
        body,
        mailingAddress: '1 Test St',
        unsubscribeUrl: null,
      })
    ).toThrow(FounderWelcomeBlocked);
  });
});

describe('founder welcome card', () => {
  it('shows the exact recipient, subject and full body, and never sends on silence', () => {
    const card = buildFounderWelcomeCard(
      { ...alice, pageUrl: PAGE },
      'Sam and the Tides'
    );
    const body = buildFounderWelcomeBody({
      firstName: alice.firstName,
      artistName: 'Sam and the Tides',
      link: PAGE,
    });
    expect(card.kind).toBe('outbound');
    expect(card.recipient).toBe('sam@mailbox-demo.com');
    expect(card.body).toContain('To: sam@mailbox-demo.com');
    expect(card.body).toContain('Subject: Welcome to Jovie');
    expect(card.body).toContain(body);
    expect(card.defaultDecision).toBeNull();
    expect(card.idempotencyKey).toBe(
      founderWelcomeCardKey(alice.entryId, alice.email, body)
    );
  });
});

describe('runFounderWelcome', () => {
  it('files one card per person and none on a re-run', async () => {
    const h = harness([alice, bob, alice]);
    const first = await runFounderWelcome(h.deps());
    expect(first.cardsFiled).toBe(2);
    expect(first.sent).toBe(0);
    const second = await runFounderWelcome(h.deps());
    expect(second.cardsFiled).toBe(0);
    expect(second.awaitingApproval).toBe(2);
    expect(h.store.cards.size).toBe(2);
    expect(h.sends).toEqual([]);
  });

  it("card A's approval sends A's email only; B stays unsent", async () => {
    const h = harness([alice, bob]);
    await runFounderWelcome(h.deps());
    h.store.decide(keyOf(alice), 'approved');

    const result = await runFounderWelcome(h.deps());
    expect(result.sent).toBe(1);
    expect(result.awaitingApproval).toBe(1);
    expect(h.sends).toHaveLength(1);
    expect(h.sends[0]?.to).toBe(alice.email);
    expect(h.sends[0]?.cardKey).toBe(keyOf(alice));
    expect(h.sends.some(send => send.to === bob.email)).toBe(false);
  });

  it("an approved card for A never unlocks B, even if B's lookup returns it", async () => {
    const h = harness([alice, bob]);
    await runFounderWelcome(h.deps());
    const aliceKey = keyOf(alice);
    h.store.decide(aliceKey, 'approved');
    // Misrouted lookup: every key resolves to Alice's approved card.
    const result = await runFounderWelcome({
      ...h.deps(),
      readCard: () => h.store.readCard(aliceKey),
    });
    expect(h.sends.map(send => send.to)).toEqual([alice.email]);
    expect(result.skipped.card_mismatch).toBe(1);
  });

  it('new words get a fresh card; the old approval sends nothing', async () => {
    const h = harness([alice]);
    await runFounderWelcome(h.deps());
    h.store.decide(keyOf(alice), 'approved');
    const renamed = { ...alice, artistName: 'Sam Solo' };
    const result = await runFounderWelcome({
      ...h.deps(),
      visitors: [renamed],
    });
    expect(result.cardsFiled).toBe(1);
    expect(result.awaitingApproval).toBe(1);
    expect(h.sends).toEqual([]);
    h.store.decide(keyOf(renamed), 'approved');
    const sent = await runFounderWelcome({
      ...h.deps(),
      visitors: [renamed],
    });
    expect(sent.sent).toBe(1);
    expect(h.sends[0]?.text).toContain('Sam Solo');
  });

  it('sends once per person across runs', async () => {
    const h = harness([alice]);
    await runFounderWelcome(h.deps());
    h.store.decide(keyOf(alice), 'approved');
    expect((await runFounderWelcome(h.deps())).sent).toBe(1);
    const again = await runFounderWelcome(h.deps());
    expect(again.sent).toBe(0);
    expect(again.skipped.already_sent).toBe(1);
    expect(h.sends).toHaveLength(1);
  });

  it('retries a send that did not go out', async () => {
    const h = harness([alice]);
    await runFounderWelcome(h.deps());
    h.store.decide(keyOf(alice), 'approved');
    const failed = await runFounderWelcome({
      ...h.deps(),
      send: async () => ({ ok: false }),
    });
    expect(failed.skipped.send_failed).toBe(1);
    expect((await runFounderWelcome(h.deps())).sent).toBe(1);
  });

  it('holds approved sends without a postal address', async () => {
    const h = harness([alice], { mailingAddress: null });
    await runFounderWelcome(h.deps());
    h.store.decide(keyOf(alice), 'approved');
    const result = await runFounderWelcome(h.deps());
    expect(result.held).toBe('compliance_mailing_address');
    expect(h.sends).toEqual([]);
  });

  it('never sends a rejected card and files none for skipped people', async () => {
    const h = harness([
      alice,
      visitor({ entryId: 'e-suppressed', suppressed: true }),
      visitor({ entryId: 'e-no-profile', pageUrl: null }),
      visitor({ entryId: 'e-no-artist', artistName: '  ' }),
    ]);
    const first = await runFounderWelcome(h.deps());
    expect(first.cardsFiled).toBe(1);
    expect(first.skipped).toEqual({
      suppressed: 1,
      no_claimed_profile: 1,
      no_artist_name: 1,
    });
    h.store.decide(keyOf(alice), 'rejected');
    const second = await runFounderWelcome(h.deps());
    expect(second.skipped.rejected).toBe(1);
    expect(h.sends).toEqual([]);
  });
});

describe('founder welcome ledger', () => {
  it('takes over a crashed in-flight claim only once it is stale', async () => {
    const ledger = createFounderWelcomeLedger(memoryRecordBackend());
    const id = alice.entryId;
    expect(await ledger.reserve(id, NOW)).toBe(true);
    const soon = new Date(NOW.getTime() + 5 * 60 * 1000);
    expect(await ledger.reserve(id, soon)).toBe(false);
    const later = new Date(NOW.getTime() + 20 * 60 * 1000);
    expect(await ledger.reserve(id, later)).toBe(true);
    await ledger.markSent(id, later);
    const muchLater = new Date(NOW.getTime() + 24 * 3600 * 1000);
    expect(await ledger.reserve(id, muchLater)).toBe(false);
  });
});

describe('server deps', () => {
  it("sends on the lifecycle stream with this person's own card", async () => {
    mocks.backend = memoryRecordBackend();
    mocks.sendStreamEmail.mockResolvedValue({ status: 'sent' });
    const deps = buildFounderWelcomeServerDeps([alice], NOW);
    await deps.send({
      to: alice.email,
      subject: 'Welcome to Jovie',
      text: 'x',
      headers: {},
      cardKey: keyOf(alice),
      idempotencyKey: keyOf(alice),
    });
    expect(mocks.sendStreamEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: 'lifecycle',
        to: alice.email,
        approval: {
          cardId: summerCardId(keyOf(alice)),
        },
      })
    );
    expect(FOUNDER_WELCOME_PAGE_URL).toBe(
      'https://jov.ie/app/dashboard/profile'
    );
  });
});
