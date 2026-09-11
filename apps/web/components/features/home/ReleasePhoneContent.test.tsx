import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReleasePhoneContent } from './ReleasePhoneContent';
import { RELEASES } from './releases-data';

vi.mock('next/image', () => ({
  default: ({
    alt,
    fill: _fill,
    src,
    ...props
  }: React.ComponentProps<'img'> & { fill?: boolean }) => (
    <img src={typeof src === 'string' ? src : undefined} alt={alt} {...props} />
  ),
}));

describe('ReleasePhoneContent', () => {
  it('renders the phone smart link page with title, artist, and DSP rows', () => {
    render(<ReleasePhoneContent release={RELEASES[0]} />);

    expect(screen.getByText('jov.ie/tim/never-say-a-word')).toBeInTheDocument();
    expect(screen.getByText('Never Say A Word')).toBeInTheDocument();
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    for (const label of [
      'Spotify',
      'Apple Music',
      'YouTube Music',
      'Amazon Music',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders secondary DSP rows transparent at rest via the shared button', () => {
    render(<ReleasePhoneContent release={RELEASES[1]} />);

    // Rows render without data-dsp-provider (providerKey is not passed on
    // this surface), so reach each row through its label span.
    for (const label of [
      'Spotify',
      'Apple Music',
      'YouTube Music',
      'Amazon Music',
    ]) {
      const row = screen.getByText(label).parentElement as HTMLElement;
      expect(row).toHaveClass('bg-transparent');
      expect(row).not.toHaveClass('bg-surface-1');
      expect(row).not.toHaveClass('bg-white/10');
      expect(row).not.toHaveClass('backdrop-blur-sm');
    }
  });
});
