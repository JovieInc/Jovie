import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateAvailablePill } from '@/components/atoms/UpdateAvailablePill';

const updateState = vi.hoisted(() => ({
  desktopAvailable: false,
  desktopDownloaded: false,
  install: vi.fn(),
  webAvailable: false,
  reload: vi.fn(),
}));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  useDesktopUpdate: () => ({
    available: updateState.desktopAvailable,
    downloaded: updateState.desktopDownloaded,
    install: updateState.install,
  }),
}));

vi.mock('@/lib/version/use-web-update', () => ({
  useWebUpdate: () => ({
    available: updateState.webAvailable,
    reload: updateState.reload,
  }),
}));

describe('UpdateAvailablePill', () => {
  beforeEach(() => {
    updateState.desktopAvailable = false;
    updateState.desktopDownloaded = false;
    updateState.webAvailable = false;
    updateState.install.mockReset();
    updateState.reload.mockReset();
  });

  it('shows a non-actionable downloading state until the desktop update is ready', () => {
    updateState.desktopAvailable = true;

    render(<UpdateAvailablePill />);

    const pill = screen.getByRole('button', { name: 'Downloading update' });
    expect(pill).toBeDisabled();
    expect(pill).toHaveAttribute('aria-busy', 'true');
    expect(pill).toHaveTextContent('Downloading…');

    fireEvent.click(pill);
    expect(updateState.install).not.toHaveBeenCalled();
  });

  it('offers restart only after the desktop update is downloaded', () => {
    updateState.desktopAvailable = true;
    updateState.desktopDownloaded = true;

    render(<UpdateAvailablePill />);

    const pill = screen.getByRole('button', { name: 'Ready to restart' });
    expect(pill).toBeEnabled();
    expect(pill).toHaveAttribute('aria-busy', 'false');
    expect(pill).toHaveTextContent('Restart');
    expect(pill).toHaveClass('w-24', 'rounded-full');
    expect(pill.className).toContain('focus-visible:ring-focus/30');

    fireEvent.click(pill);

    expect(updateState.install).toHaveBeenCalledOnce();
    expect(pill).toBeDisabled();
    expect(pill).toHaveTextContent('Restarting…');
  });

  it('preserves the web update action without using desktop download state', () => {
    updateState.webAvailable = true;

    render(<UpdateAvailablePill />);

    const pill = screen.getByRole('button', { name: 'Update available' });
    expect(pill).toBeEnabled();

    fireEvent.click(pill);

    expect(updateState.reload).toHaveBeenCalledOnce();
    expect(updateState.install).not.toHaveBeenCalled();
  });
});
