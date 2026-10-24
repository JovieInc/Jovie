import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AvailableDSP } from '@/lib/dsp';
import { DSPButtonGroup } from './DSPButtonGroup';

vi.mock('@/components/atoms/DSPButton', () => ({
  DSPButton: ({ name }: { readonly name: string }) => (
    <button type='button'>{name}</button>
  ),
}));

const spotify = {
  key: 'spotify',
  name: 'Spotify',
  url: 'https://open.spotify.com/artist/x',
  config: { color: '#1DB954', textColor: '#fff', logoSvg: '' },
} as unknown as AvailableDSP;

describe('DSPButtonGroup', () => {
  it('shows an empty-state message with the AA tertiary token', () => {
    render(<DSPButtonGroup dsps={[]} />);
    expect(screen.getByText('No streaming platforms available')).toHaveClass(
      'text-tertiary-token'
    );
  });

  it('renders one button per platform plus the preference notice', () => {
    render(<DSPButtonGroup dsps={[spotify]} />);
    expect(screen.getByRole('button', { name: 'Spotify' })).toBeInTheDocument();
    expect(
      screen.getByText('Your preference will be saved for next time')
    ).toHaveClass('text-tertiary-token');
  });
});
