import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoSettingsPanel } from './DemoSettingsPanel';

const runDemoAction = vi.hoisted(() => vi.fn());

vi.mock('./demo-actions', () => ({ runDemoAction }));

const mockSearchParams = vi.hoisted(() => ({
  get: vi.fn((_key?: string): string | null => null),
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
    mockSearchParams.get.mockImplementation((key?: string) =>
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

  it('toggles a preference through the Switch atom and reports the demo action', async () => {
    const user = userEvent.setup();
    runDemoAction.mockClear();
    const { container } = render(<DemoSettingsPanel />);

    const toggle = screen.getByRole('switch', { name: 'Public Profile' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(runDemoAction).toHaveBeenCalledWith({
      successMessage: 'Setting updated (demo).',
    });
    await expectNoA11yViolations(container);
  });

  it('reconnects a platform from its row button', async () => {
    const user = userEvent.setup();
    runDemoAction.mockClear();
    render(<DemoSettingsPanel />);

    await user.click(screen.getAllByRole('button', { name: 'Reconnect' })[0]);

    expect(runDemoAction).toHaveBeenCalledWith({
      successMessage: 'Spotify reconnected (demo).',
    });
  });

  it.each(['quality', 'sync'])(
    'renders the %s capture card without a11y violations or nested borders',
    async mode => {
      mockSearchParams.get.mockImplementation((key?: string) =>
        key === 'capture' ? mode : null
      );
      try {
        const { container } = render(<DemoSettingsPanel />);
        const switches = screen.getAllByRole('switch', {
          name: 'Always In Sync',
        });
        expect(switches.length).toBeGreaterThan(0);
        await expectNoA11yViolations(container);
      } finally {
        mockSearchParams.get.mockImplementation(() => null);
      }
    }
  );
});
