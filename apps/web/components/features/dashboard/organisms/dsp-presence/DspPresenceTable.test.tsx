import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { DspPresenceTable } from './DspPresenceTable';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img alt='' {...props} />,
}));

function item(overrides: Partial<DspPresenceItem>): DspPresenceItem {
  return {
    matchId: 'm-spotify',
    providerId: 'spotify',
    externalArtistName: 'Tim White',
    externalArtistImageUrl: null,
    externalArtistUrl: 'https://open.spotify.com/artist/1',
    confidenceScore: null,
    confidenceBreakdown: null,
    matchingIsrcCount: 0,
    status: 'confirmed',
    matchSource: null,
    confirmedAt: null,
    ...overrides,
  };
}

describe('DspPresenceTable', () => {
  const items = [
    item({}),
    item({ matchId: 'm-apple', providerId: 'apple_music' }),
  ];

  it('uses the shared list row mode', () => {
    render(
      <DspPresenceTable
        items={items}
        selectedMatchId={null}
        onRowSelect={vi.fn()}
      />
    );

    expect(screen.getByRole('table')).toHaveAttribute(
      'data-table-row-mode',
      'list'
    );
  });

  it('marks the selected row through the shared selected state', () => {
    render(
      <DspPresenceTable
        items={items}
        selectedMatchId='m-apple'
        onRowSelect={vi.fn()}
      />
    );

    const selected = screen.getByTestId('presence-match-row-apple_music');
    const other = screen.getByTestId('presence-match-row-spotify');
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected.className).toContain('system-b-table-row-selected');
    expect(other.className).not.toContain('system-b-table-row-selected');
    for (const row of [selected, other]) {
      expect(row.className).toContain('system-b-table-row-hover');
      expect(row.className).not.toMatch(/rounded-lg|color-mix/);
    }
  });
});
