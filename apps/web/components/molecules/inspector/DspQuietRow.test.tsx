import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DspQuietRow } from './DspQuietRow';

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
    expect(row.className).toContain('hover:bg-surface-1');
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
});
