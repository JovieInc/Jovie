import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readOvieInbox } from './inbox.server';

const mocks = vi.hoisted(() => ({
  design: vi.fn(),
  cards: vi.fn(),
  inventory: vi.fn(),
  visual: vi.fn(),
  linear: vi.fn(),
}));
vi.mock('@/lib/agent-os/design-lab/proposals', () => ({
  listPendingDesignProposals: mocks.design,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  listSummerCards: mocks.cards,
}));
vi.mock('@/lib/ovie/certifications/inventory.server', () => ({
  readOvieCertificationInventory: mocks.inventory,
}));
vi.mock('@/lib/agent-os/visual-qa/review', () => ({
  listVisualQaReviewRuns: mocks.visual,
}));
vi.mock('@/lib/hud/linear-actions', () => ({
  fetchTimActionIssues: mocks.linear,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.design.mockResolvedValue([]);
  mocks.cards.mockResolvedValue([]);
  mocks.inventory.mockRejectedValue(new Error('private connection detail'));
  mocks.visual.mockResolvedValue([]);
  mocks.linear.mockResolvedValue({
    issues: [
      {
        id: 'work',
        identifier: 'JOV-1',
        title: 'Review work',
        url: 'https://example.com/1',
        priority: 1,
        createdAt: '2026-10-02T00:00:00Z',
      },
    ],
    observation: 'ok',
  });
});
describe('Inbox source isolation', () => {
  it('keeps healthy decisions available without leaking source errors', async () => {
    const result = await readOvieInbox();
    expect(result.cases.map(item => item.id)).toEqual(['linear:work']);
    expect(mocks.visual).toHaveBeenCalledWith(Number.POSITIVE_INFINITY);
    expect(result.issues).toEqual([
      'Certification evidence could not be loaded. Retry to check this source.',
    ]);
    expect(JSON.stringify(result)).not.toContain('private connection detail');
  });
  it('reports every failed source instead of returning a healthy empty inbox', async () => {
    for (const fn of Object.values(mocks))
      fn.mockRejectedValue(new Error('failure'));
    const result = await readOvieInbox();
    expect(result.cases).toEqual([]);
    expect(result.issues).toHaveLength(5);
  });
});
