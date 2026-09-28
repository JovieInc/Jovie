import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import postcss from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminStepUpBanner } from './AdminStepUpBanner';

const client = vi.hoisted(() => ({
  listUserPasskeys: vi.fn(),
  addPasskey: vi.fn(),
  signInPasskey: vi.fn(),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    passkey: {
      listUserPasskeys: client.listUserPasskeys,
      addPasskey: client.addPasskey,
    },
    signIn: { passkey: client.signInPasskey },
  },
}));

const reload = vi.fn();
Object.defineProperty(window, 'location', {
  value: { ...window.location, reload },
  writable: true,
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AdminStepUpBanner', () => {
  it('enrolls a first passkey, then steps up and reloads', async () => {
    client.listUserPasskeys.mockResolvedValue({ data: [], error: null });
    client.addPasskey.mockResolvedValue({ data: {}, error: null });
    client.signInPasskey.mockResolvedValue({ data: {}, error: null });
    render(<AdminStepUpBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(client.addPasskey).toHaveBeenCalledWith({ name: 'Ovie' });
    expect(client.signInPasskey).toHaveBeenCalledOnce();
  });

  it('skips enrollment when a passkey already exists', async () => {
    client.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk1' }],
      error: null,
    });
    client.signInPasskey.mockResolvedValue({ data: {}, error: null });
    render(<AdminStepUpBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(client.addPasskey).not.toHaveBeenCalled();
  });

  it('shows the server refusal and offers retry without reloading', async () => {
    client.listUserPasskeys.mockResolvedValue({ data: [], error: null });
    client.addPasskey.mockResolvedValue({
      data: null,
      error: { message: 'Sign in again to set up a passkey.' },
    });
    render(<AdminStepUpBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(
      await screen.findByText('Sign in again to set up a passkey.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(client.signInPasskey).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('drops below the Electron titlebar row so traffic lights never cover it (JOV-6796)', () => {
    document.documentElement.dataset.desktopRuntime = 'electron';
    try {
      render(<AdminStepUpBanner />);
      const banner = screen.getByRole('status');
      const css = postcss.parse(
        readFileSync(resolve(__dirname, '../../../app/globals.css'), 'utf8')
      );
      const margins: string[] = [];
      css.walkRules(rule => {
        if (
          rule.selector.includes('[data-admin-step-up-banner=') &&
          banner.matches(rule.selector)
        ) {
          rule.walkDecls('margin-top', declaration => {
            margins.push(declaration.value);
          });
        }
      });
      expect(margins.at(-1)).toBe('var(--electron-titlebar-height)');
    } finally {
      document.documentElement.removeAttribute('data-desktop-runtime');
    }
  });
});
