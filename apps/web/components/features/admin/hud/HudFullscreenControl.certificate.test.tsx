import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HudFullscreenControl } from './HudFullscreenControl';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

describe('HudFullscreenControl certificate', () => {
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

  it('is axe-clean before and after entering fullscreen', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <main data-app-shell-main-plane='true'>
        <HudFullscreenControl />
      </main>
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));

    expect(requestFullscreen).toHaveBeenCalledOnce();
    const exit = await screen.findByRole('button', { name: 'Exit fullscreen' });
    expect(exit).toHaveAttribute('title', 'Exit fullscreen');
    await expectNoA11yViolations(container);

    await user.click(exit);
    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole('button', { name: 'Fullscreen' })
    ).toBeVisible();
  });

  it('routes back to the HUD from the axe-clean close control', async () => {
    const user = userEvent.setup();
    const { container } = render(<HudFullscreenControl action='close' />);
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(replace).toHaveBeenCalledExactlyOnceWith(APP_ROUTES.HUD);
    expect(requestFullscreen).not.toHaveBeenCalled();
  });
});
