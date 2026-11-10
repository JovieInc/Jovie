import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DspQuietRow, displayDspUrl } from './DspQuietRow';

describe('DspQuietRow', () => {
  it('renders a quiet name plus outbound control for a linked DSP', () => {
    render(
      <DspQuietRow
        label='Spotify'
        icon={<span aria-hidden='true'>S</span>}
        href='https://open.spotify.com/album/take-me-over'
        testId='dsp-spotify'
      />
    );

    const row = screen.getByRole('link', { name: /Spotify/ });
    expect(row).toHaveAttribute(
      'href',
      'https://open.spotify.com/album/take-me-over'
    );
    // The shared row geometry (hover fill, group) lives on the wrapper that
    // also owns the destination action menu.
    expect(row.parentElement?.className).toContain('hover:bg-surface-1');
    expect(row).toHaveAccessibleName('Spotify');
    // The trailing control is the destination action menu (Open / Copy link
    // / …) — hover-revealed in the same reserved slot the old ↗ icon used.
    const menu = row.parentElement?.lastElementChild;
    expect(menu?.querySelector('button svg')).not.toBeNull();
    expect(menu?.className).toContain('group-hover:opacity-100');
    expect(screen.queryByText('Not found')).not.toBeInTheDocument();
    expect(screen.queryByText('Missing')).not.toBeInTheDocument();
  });

  it('replaces Not found with Find when the provider is unresolved', async () => {
    const user = userEvent.setup();
    const onFind = vi.fn();

    render(
      <DspQuietRow
        label='Apple Music'
        icon={<span aria-hidden='true'>A</span>}
        onFind={onFind}
        testId='dsp-apple'
      />
    );

    expect(screen.queryByText('Not found')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Find' }));
    expect(onFind).toHaveBeenCalledTimes(1);
  });

  it('shows the saved URL and a visible outbound mark when showUrl is set', () => {
    render(
      <DspQuietRow
        label='Tidal'
        icon={<span aria-hidden='true'>T</span>}
        href='https://www.tidal.com/browse/track/77611316'
        showUrl
      />
    );

    const row = screen.getByRole('link', { name: /Tidal/ });
    expect(row).toHaveTextContent('tidal.com/browse/track/77611316');
    // showUrl rows keep the action menu permanently visible (no hover
    // reveal) so link-review lists always expose the controls.
    expect(row.parentElement?.lastElementChild?.className).not.toContain(
      'opacity-0'
    );
    expect(displayDspUrl('https://open.spotify.com/track/abc/')).toBe(
      'open.spotify.com/track/abc'
    );
  });

  it('starts at the drawer content edge with no horizontal inset', () => {
    render(
      <DspQuietRow
        label='Spotify'
        icon={<span aria-hidden='true'>S</span>}
        href='https://open.spotify.com/album/take-me-over'
        testId='dsp-edge'
      />
    );
    expect(screen.getByTestId('dsp-edge').className).toContain('px-0');
  });
});
