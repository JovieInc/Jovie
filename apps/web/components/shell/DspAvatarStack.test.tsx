import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type DspAvatarItem, DspAvatarStack } from './DspAvatarStack';

const ITEMS: DspAvatarItem[] = [
  {
    id: 'apple',
    status: 'pending',
    label: 'Apple Music',
    glyph: 'A',
    color: '#FA243C',
  },
  {
    id: 'spotify',
    status: 'live',
    label: 'Spotify',
    glyph: 'S',
    color: '#1DB954',
  },
  {
    id: 'youtube',
    status: 'missing',
    label: 'YouTube',
    glyph: 'Y',
    color: '#FF0000',
  },
];

describe('DspAvatarStack', () => {
  it('returns null for an empty input', () => {
    const { container } = render(<DspAvatarStack dsps={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the live count over the total', () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    expect(screen.getByText('1/3 Live')).toBeInTheDocument();
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

  it('keeps the popover above shell chrome', () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    expect(screen.getByRole('tooltip')).toHaveClass(
      'system-b-dsp-avatar-stack-popover'
    );
  });

  it('uses canonical DSP brand colors instead of Tailwind color classes', () => {
    render(<DspAvatarStack dsps={ITEMS} />);

    const primary = screen.getAllByText('S')[0];
    const missing = screen.getAllByText('Y')[0];
    const liveDot = document.querySelector('.system-b-dsp-status-dot-live');

    expect(primary).toHaveStyle({ '--system-b-dsp-avatar-color': '#1DB954' });
    expect(primary.className).not.toContain('bg-emerald');
    expect(missing).toHaveStyle({ '--system-b-dsp-avatar-color': '#FF0000' });
    expect(missing.className).toContain('opacity-45');
    expect(liveDot?.className).not.toContain('bg-emerald');
  });
});
