import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readOvieInbox } from './inbox.server';
import type { SummerCard } from './summer-cards';

const mocks = vi.hoisted(() => ({ cards: vi.fn() }));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  listSummerCards: mocks.cards,
}));
// Any other source being imported would fail loudly here.
vi.mock('@/lib/agent-os/design-lab/proposals', () => {
  throw new Error('design proposals are not an Inbox source');
});
vi.mock('@/lib/hud/linear-actions', () => {
  throw new Error('Linear is not an Inbox source');
});

const card = (id: string, over: Partial<SummerCard> = {}): SummerCard => ({
  id,
  idempotencyKey: `key-${id}`,
  kind: 'spend',
  product: 'company',
  title: `Card ${id}`,
  body: 'Body',
  recommendation: 'Do it',
  defaultIfSilent: 'Do not spend',
  recipient: null,
  amountUsd: null,
  evidence: [],
  status: 'pending',
  comment: null,
  createdAt: '2026-10-02T00:00:00.000Z',
  decidedAt: null,
  decideBy: '2026-10-22T12:00:00.000Z',
  defaultDecision: 'reject',
  resolution: null,
  feedback: [],
  feedbackAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cards.mockResolvedValue([]);
});

describe('Inbox is Summer-only', () => {
  it('asks only for pending Summer cards and returns them in Summer order', async () => {
    mocks.cards.mockResolvedValue([
      card('late', { decideBy: '2026-10-25T00:00:00.000Z' }),
      card('none', { decideBy: null as unknown as string }),
      card('early', { decideBy: '2026-10-20T00:00:00.000Z' }),
      card('tie-new', { createdAt: '2026-10-03T00:00:00.000Z' }),
      card('tie-old', { createdAt: '2026-10-01T00:00:00.000Z' }),
    ]);
    const result = await readOvieInbox();
    expect(mocks.cards).toHaveBeenCalledWith({ status: 'pending', limit: 100 });
    expect(result.cases.map(item => item.id)).toEqual([
      'summer-card:early',
      'summer-card:tie-old',
      'summer-card:tie-new',
      'summer-card:late',
      'summer-card:none',
    ]);
    expect(result.cases.every(item => item.source.system === 'summer')).toBe(
      true
    );
  });

  it('reports the 100-item limit', async () => {
    mocks.cards.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => card(`c${i}`))
    );
    const result = await readOvieInbox();
    expect(result.issues).toContain(
      'Company decisions are limited to the newest 100 pending items.'
    );
  });

  it('reports a failed source without leaking the error', async () => {
    mocks.cards.mockRejectedValue(new Error('private connection detail'));
    const result = await readOvieInbox();
    expect(result.cases).toEqual([]);
    expect(result.issues).toEqual([
      'Company decisions could not be loaded. Retry to check this source.',
    ]);
    expect(JSON.stringify(result)).not.toContain('private connection detail');
  });
});
