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

  it('exposes the popover to keyboard focus without changing layout', () => {
    render(<DspAvatarStack dsps={ITEMS} />);

    const trigger = screen.getByLabelText('View DSP Distribution Details');
    const popover = screen.getByRole('tooltip');

    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('aria-describedby', popover.id);
    expect(popover).toHaveClass('absolute');
    expect(popover).toHaveClass('opacity-0');
    expect(popover).toHaveClass('group-focus-within/dsps:opacity-100');
    expect(popover).toHaveClass('group-focus-within/dsps:pointer-events-auto');
  });

  it('falls back to text glyph when no iconPath is provided', () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('Y')).toBeInTheDocument();
  });

  it('surfaces brand color via CSS custom properties', () => {
    render(<DspAvatarStack dsps={ITEMS} />);

    // Primary (live) and missing items render with brand color CSS var
    const avatars = document.querySelectorAll('[style*="--system-b-dsp-avatar-color"]');
    const styleAttrs = Array.from(avatars).map(el => el.getAttribute('style') ?? '');

    expect(styleAttrs.some(s => s.includes('#1DB954'))).toBe(true);
    expect(styleAttrs.some(s => s.includes('#FF0000'))).toBe(true);
  });

  it('avoids Tailwind color utility classes for DSP brand colors', () => {
    render(<DspAvatarStack dsps={ITEMS} />);
    const liveDot = document.querySelector('.system-b-dsp-status-dot-live');
    expect(liveDot?.className).not.toContain('bg-emerald');
  });
});
