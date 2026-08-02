import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtistProfileModeSwitcher } from '@/components/marketing/artist-profile/ArtistProfileModeSwitcher';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

function expectSelectedTab(name: string) {
  expect(screen.getByRole('tab', { name })).toHaveAttribute(
    'aria-selected',
    'true'
  );
}

describe('ArtistProfileModeSwitcher', () => {
  it('starts on the first mode and changes only after a deliberate selection', () => {
    render(
      <ArtistProfileModeSwitcher adaptive={ARTIST_PROFILE_COPY.adaptive} />
    );

    expectSelectedTab('Upcoming Release');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Touring' }), {
      button: 0,
      ctrlKey: false,
    });

    expectSelectedTab('Touring');
  });

  it('keeps all four accessible modes in one reserved panel slot', () => {
    render(
      <ArtistProfileModeSwitcher adaptive={ARTIST_PROFILE_COPY.adaptive} />
    );

    const panelSlot = screen.getByRole('tabpanel').parentElement;
    expect(panelSlot).toHaveClass('min-h-28');

    for (const mode of ARTIST_PROFILE_COPY.adaptive.modes) {
      fireEvent.mouseDown(screen.getByRole('tab', { name: mode.label }), {
        button: 0,
        ctrlKey: false,
      });
      expectSelectedTab(mode.label);
      expect(screen.getByRole('tabpanel').parentElement).toBe(panelSlot);
    }
  });

  it('keeps compact consumers descriptive and interactive', () => {
    render(
      <ArtistProfileModeSwitcher
        adaptive={ARTIST_PROFILE_COPY.adaptive}
        phoneCaption='One profile.'
        phoneSubcaption='Adapts to every fan.'
        showIntroHeading={false}
      />
    );

    expect(
      screen.getByText('One profile. Adapts to every fan.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: ARTIST_PROFILE_COPY.adaptive.headline,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: ARTIST_PROFILE_COPY.adaptive.modes[0].screenshotAlt,
      })
    ).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Release Day' }), {
      button: 0,
      ctrlKey: false,
    });
    expectSelectedTab('Release Day');
    expect(
      screen.getByRole('img', {
        name: ARTIST_PROFILE_COPY.adaptive.modes[1].screenshotAlt,
      })
    ).toBeInTheDocument();
  });
});
