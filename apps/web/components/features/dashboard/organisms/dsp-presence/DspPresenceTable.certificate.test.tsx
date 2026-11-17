import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DspPresenceTable } from './DspPresenceTable';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
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

describe('DspPresenceTable certificate', () => {
  it('selects a row on click without the external link selecting it', async () => {
    const user = userEvent.setup();
    const onRowSelect = vi.fn();
    const apple = item({
      matchId: 'm-apple',
      providerId: 'apple_music',
      externalArtistName: 'Tim White Music',
      status: 'suggested',
    });
    const { container } = render(
      <DspPresenceTable
        items={[item({}), apple]}
        selectedMatchId={null}
        onRowSelect={onRowSelect}
      />
    );

    await expectNoA11yViolations(container);
    await user.click(screen.getByText('Tim White Music'));
    expect(onRowSelect).toHaveBeenCalledWith(apple);

    onRowSelect.mockClear();
    const link = screen.getAllByRole('link', { name: 'View on Spotify' })[0];
    expect(link).toHaveAttribute('href', 'https://open.spotify.com/artist/1');
    link.addEventListener('click', event => event.preventDefault());
    await user.click(link);
    expect(onRowSelect).not.toHaveBeenCalled();
  });

  it('renders manual, unnamed and imaged rows', async () => {
    const { container } = render(
      <DspPresenceTable
        items={[
          item({ matchSource: 'manual', externalArtistUrl: null }),
          item({
            matchId: 'm-deezer',
            providerId: 'deezer',
            externalArtistName: null,
            externalArtistImageUrl: 'https://cdn.example.com/artist.jpg',
          }),
        ]}
        selectedMatchId='m-deezer'
        onRowSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.getByText('Unknown Artist')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Deezer' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/artist.jpg'
    );
    await expectNoA11yViolations(container);
  });

  it('renders an empty list and a long RTL name accessibly', async () => {
    const empty = render(
      <DspPresenceTable
        items={[]}
        selectedMatchId={null}
        onRowSelect={vi.fn()}
      />
    );
    expect(screen.queryByTestId('presence-match-row-spotify')).toBeNull();
    await expectNoA11yViolations(empty.container);
    empty.unmount();

    const longName =
      'تيم وايت والفرقة الموسيقية الدولية للموسيقى الإلكترونية والتجريبية';
    const { container } = render(
      <div dir='rtl'>
        <DspPresenceTable
          items={[item({ externalArtistName: longName })]}
          selectedMatchId={null}
          onRowSelect={vi.fn()}
        />
      </div>
    );
    expect(screen.getByText(longName)).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });
});
