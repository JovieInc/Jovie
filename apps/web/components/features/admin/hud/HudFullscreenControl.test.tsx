import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HudFullscreenControl } from '@/components/features/admin/hud/HudFullscreenControl';
import { APP_ROUTES } from '@/constants/routes';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

describe('HudFullscreenControl', () => {
  let fullscreenElement: Element | null;
  const requestFullscreen = vi.fn(async function (this: HTMLElement) {
    fullscreenElement = this;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  const exitFullscreen = vi.fn(async () => {
    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
  });

  beforeEach(() => {
    fullscreenElement = null;
    replace.mockReset();
    requestFullscreen.mockClear();
    exitFullscreen.mockClear();
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('expands the current main-content plane without navigating', async () => {
    render(
      <main data-app-shell-main-plane='true'>
        <HudFullscreenControl />
      </main>
    );
    const mainPlane = screen.getByRole('main');

    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));

    await vi.waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce());
    expect(requestFullscreen.mock.instances[0]).toBe(mainPlane);
    expect(replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Exit fullscreen' })
    ).toBeVisible();
    expect(screen.getByRole('main')).toBe(mainPlane);
  });

  it('exits the browser fullscreen surface in place', async () => {
    render(
      <main data-app-shell-main-plane='true'>
        <HudFullscreenControl />
      </main>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    await screen.findByRole('button', { name: 'Exit fullscreen' });

    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));

    await vi.waitFor(() => expect(exitFullscreen).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeVisible();
  });

  it('keeps the legacy packaged close control on canonical /hud', () => {
    render(<HudFullscreenControl action='close' />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(replace).toHaveBeenCalledWith(APP_ROUTES.HUD);
  });

  it('renders the enter control as an icon-only button', () => {
    render(<HudFullscreenControl />);

    const button = screen.getByRole('button', { name: 'Fullscreen' });
    expect(button).toHaveAttribute('title', 'Fullscreen');
    expect(button).toHaveTextContent('');
  });
});
