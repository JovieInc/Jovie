import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type DspAvatarItem, DspAvatarStack } from './DspAvatarStack';

const ITEMS: DspAvatarItem[] = [
  {
    id: 'apple',
    status: 'pending',
    label: 'Apple Music',
    glyph: 'A',
    colorClass: 'bg-rose-500',
  },
  {
    id: 'spotify',
    status: 'live',
    label: 'Spotify',
    glyph: 'S',
    colorClass: 'bg-emerald-500',
  },
  {
    id: 'youtube',
    status: 'missing',
    label: 'YouTube',
    glyph: 'Y',
    colorClass: 'bg-red-500',
  },
];

describe('DspAvatarStack', () => {
  it('returns null for an empty input', () => {
    const { container } = render(<DspAvatarStack dsps={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the live count over the total', () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    expect(screen.getByText('1/3 live')).toBeInTheDocument();
  });

  it('renders an overflow chip when more than one DSP is provided', () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('does not render an overflow chip for a single DSP', () => {
    render(<DspAvatarStack dsps={[ITEMS[1]]} />);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('lists every DSP label inside the popover', () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.getByText('Apple Music')).toBeInTheDocument();
    expect(screen.getByText('YouTube')).toBeInTheDocument();
  });
});
