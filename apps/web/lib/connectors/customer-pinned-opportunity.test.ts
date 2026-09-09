import { beforeEach, describe, expect, it, vi } from 'vitest';

const load = vi.hoisted(() => vi.fn());
vi.mock('./opportunity-inbox-data', () => ({ loadOpportunityInboxData: load }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { loadCustomerChatPinnedOpportunity } from './customer-pinned-opportunity';
import {
  normalizeCustomerPinnedOpportunity,
  resolveCustomerChatPinnedOpportunity,
} from './opportunity-surface-policy';

beforeEach(() => vi.clearAllMocks());
describe('authoritative pinned opportunity context', () => {
  it('ignores forged title/category and resolves owned creator evidence', async () => {
    load.mockResolvedValue({
      cards: [
        {
          id: 'owned',
          title: 'Verified',
          category: 'suggestion',
          why: 'Evidence',
          typeLabel: 'Suggestion',
        },
      ],
    });
    expect(
      await loadCustomerChatPinnedOpportunity('owner', {
        id: 'owned',
        title: 'Forged',
        category: 'workflow_capture',
      })
    ).toMatchObject({ title: 'Verified', why: 'Evidence' });
    expect(load).toHaveBeenCalledWith('owner');
  });
  it('rejects stale deep links to Ovie, unknown categories, and other owners', async () => {
    load.mockResolvedValue({
      cards: [
        { id: 'capture', title: 'Internal', category: 'workflow_capture' },
        { id: 'future', title: 'Unknown', category: 'future' },
      ],
    });
    for (const id of ['capture', 'future', 'other-owner']) {
      expect(
        await loadCustomerChatPinnedOpportunity('owner', {
          id,
          category: 'suggestion',
          title: 'Forged',
        })
      ).toBeNull();
    }
  });
  it('fails closed for malformed input, missing user, and storage failure', async () => {
    for (const value of [null, 'x', {}, { id: ' ' }])
      expect(
        await loadCustomerChatPinnedOpportunity('owner', value)
      ).toBeNull();
    expect(load).not.toHaveBeenCalled();
    load.mockResolvedValueOnce(null);
    expect(
      await loadCustomerChatPinnedOpportunity('owner', { id: 'x' })
    ).toBeNull();
    load.mockRejectedValueOnce(new Error('offline'));
    expect(
      await loadCustomerChatPinnedOpportunity('owner', { id: 'x' })
    ).toBeNull();
  });
});

describe('consumer card contract', () => {
  it.each([
    'suggestion',
    'tour_date',
    'report',
    'brand_deal',
  ])('preserves %s including optional action evidence', category => {
    expect(
      normalizeCustomerPinnedOpportunity({
        id: ' x ',
        title: ' Verified ',
        category,
        primaryActionLabel: ' Review ',
        signalType: ' other ',
      })
    ).toEqual({
      id: 'x',
      title: 'Verified',
      why: '',
      typeLabel: '',
      primaryActionLabel: 'Review',
      signalType: 'other',
    });
  });
  it('rejects malformed authoritative cards and ID hints', () => {
    for (const value of [
      null,
      'x',
      {},
      { category: 'suggestion', title: 'x' },
      { category: 'suggestion', id: 'x' },
    ])
      expect(normalizeCustomerPinnedOpportunity(value)).toBeNull();
    for (const value of [null, 'x', {}, { id: ' ' }])
      expect(resolveCustomerChatPinnedOpportunity([], value)).toBeNull();
  });
});
