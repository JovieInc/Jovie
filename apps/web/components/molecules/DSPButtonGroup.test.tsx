import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AvailableDSP } from '@/lib/dsp';
import { DSPButtonGroup } from './DSPButtonGroup';

const mockDSPs: AvailableDSP[] = [
  {
    key: 'spotify',
    name: 'Spotify',
    url: 'https://open.spotify.com/artist/example',
    config: {
      name: 'Spotify',
      color: '#1DB954',
      textColor: 'white',
      logoSvg:
        '<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>Spotify</title></svg>',
    },
  },
];

describe('DSPButtonGroup', () => {
  it('renders the preference notice with the secondary text token for contrast', () => {
    render(<DSPButtonGroup dsps={mockDSPs} />);
    expect(
      screen.getByText('Your preference will be saved for next time')
    ).toHaveClass('text-secondary-token');
  });

  it('renders the empty state with the secondary text token for contrast', () => {
    render(<DSPButtonGroup dsps={[]} />);
    expect(screen.getByText('No streaming platforms available')).toHaveClass(
      'text-secondary-token'
    );
  });
});
