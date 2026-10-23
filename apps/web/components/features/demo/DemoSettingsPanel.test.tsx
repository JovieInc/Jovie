import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DemoSettingsPanel } from './DemoSettingsPanel';

const mockSearchParams = vi.hoisted(() => ({
  get: vi.fn(() => null),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

const PLATFORM_NAMES = [
  'Spotify',
  'Apple Music',
  'YouTube Music',
  'Amazon Music',
  'SoundCloud',
  'Tidal',
] as const;

describe('DemoSettingsPanel', () => {
  it('renders platform connection rows without hardcoded brand hues', () => {
    render(<DemoSettingsPanel />);

    // Platform names ride the neutral text token — status is carried by the
    // quiet dot plus the Reconnect/Connect label, never a brand hex. The
    // element-level assertion bans ANY inline style (stronger than a color
    // check and null-safe when the attribute is absent).
    for (const name of PLATFORM_NAMES) {
      const node = screen.getByText(name);
      expect(node).not.toHaveAttribute('style');
      expect(node.className).toContain('text-primary-token');
    }
  });

  it('keeps capture-card section labels Title Case (no uppercase eyebrow)', () => {
    mockSearchParams.get.mockImplementation((key: string) =>
      key === 'capture' ? 'quality' : null
    );
    try {
      const { container } = render(<DemoSettingsPanel />);

      for (const p of container.querySelectorAll('p')) {
        expect(p.className).not.toContain('uppercase');
      }
    } finally {
      mockSearchParams.get.mockImplementation(() => null);
    }
  });
});
