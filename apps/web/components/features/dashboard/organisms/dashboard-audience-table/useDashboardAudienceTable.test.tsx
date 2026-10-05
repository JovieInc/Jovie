import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import type { AudienceMember } from '@/types';
import { useDashboardAudienceTable } from './useDashboardAudienceTable';

const copyToClipboard = vi.fn(async (_text: string) => true);
vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: (text: string) => copyToClipboard(text),
}));

function member(
  id: string,
  overrides: Partial<AudienceMember> = {}
): AudienceMember {
  return {
    id,
    type: 'email',
    displayName: `Fan ${id}`,
    locationLabel: '',
    geoCity: null,
    geoCountry: null,
    visits: 1,
    engagementScore: 50,
    intentLevel: 'medium',
    latestActions: [],
    referrerHistory: [],
    utmParams: {},
    email: `${id}@example.com`,
    emailVisibleToArtist: true,
    phone: null,
    spotifyConnected: false,
    purchaseCount: 0,
    tipAmountTotalCents: 0,
    tipCount: 0,
    tags: [],
    deviceType: null,
    lastSeenAt: null,
    ...overrides,
  };
}

const rows = [
  member('a'),
  member('b', { emailVisibleToArtist: false }),
  member('c'),
];

function renderAudienceHook() {
  return renderHook(
    () =>
      useDashboardAudienceTable({
        mode: 'members',
        rows,
        total: rows.length,
        sort: 'lastSeen',
        direction: 'desc',
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <TableMetaProvider>{children}</TableMetaProvider>
      ),
    }
  );
}

describe('useDashboardAudienceTable selection', () => {
  beforeEach(() => copyToClipboard.mockClear());

  it('adds a shift-click range to the existing selection', () => {
    const { result } = renderAudienceHook();

    act(() => result.current.toggleSelect('a'));
    act(() => result.current.selectRows([rows[1], rows[2]]));

    expect([...result.current.selectedIds].sort()).toEqual(['a', 'b', 'c']);
    expect(result.current.selectedCount).toBe(3);
  });

  it('copies only emails fans shared with the artist', async () => {
    const { result } = renderAudienceHook();
    act(() => result.current.selectRows(rows));

    const copy = result.current.bulkActions.find(
      action => action.label === 'Copy Emails'
    );
    await act(async () => {
      copy?.onClick();
    });

    expect(copyToClipboard).toHaveBeenCalledWith(
      'a@example.com\nc@example.com'
    );
  });

  it('offers no raw phone export from the bulk bar', () => {
    const { result } = renderAudienceHook();

    expect(result.current.bulkActions.map(action => action.label)).toEqual([
      'Copy Emails',
      'Clear Selection',
    ]);
  });
});
