import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HudFullscreenControl } from '@/components/features/admin/hud/HudFullscreenControl';
import { APP_ROUTES } from '@/constants/routes';

describe('HudFullscreenControl', () => {
  const assign = vi.fn();

  beforeEach(() => {
    assign.mockReset();
    vi.stubGlobal('location', {
      origin: 'https://jov.ie',
      assign,
    } satisfies Pick<Location, 'origin' | 'assign'>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enters isolated fullscreen with fs=1 when no kiosk token is issued', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
      })
    );

    render(<HudFullscreenControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));

    await vi.waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://jov.ie/hud?fs=1');
    });
  });

  it('exits fullscreen back to the canonical /hud shell URL', () => {
    render(<HudFullscreenControl action='exit' />);
    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));

    expect(assign).toHaveBeenCalledWith(APP_ROUTES.HUD);
  });
});
