import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  completeDesktopNativeAuth: vi.fn(),
  getDesktopPasskeyState: vi.fn(),
  setDesktopPasskeyState: vi.fn(),
  addPasskey: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: hoisted.routerReplace }),
  useSearchParams: () => new URLSearchParams('client=electron&state=s1'),
}));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  consumeDesktopAuthCompletion: vi.fn(),
  getDesktopPasskeyState: () => hoisted.getDesktopPasskeyState(),
  setDesktopPasskeyState: (update: string) =>
    hoisted.setDesktopPasskeyState(update),
}));

vi.mock('@/lib/desktop/native-complete', () => ({
  completeDesktopNativeAuth: () => hoisted.completeDesktopNativeAuth(),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    passkey: {
      addPasskey: (input: unknown) => hoisted.addPasskey(input),
    },
  },
}));

async function renderPage() {
  const { default: NativeCompletePage } = await import(
    '@/app/(auth)/auth/native-complete/page'
  );
  await act(async () => {
    render(<NativeCompletePage />);
  });
}

beforeAll(async () => {
  await import('@/app/(auth)/auth/native-complete/page');
}, 60_000);

describe('native-complete Touch ID offer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/auth/native-complete?client=electron');
    hoisted.completeDesktopNativeAuth.mockResolvedValue({
      returnTo: '/app/chat',
    });
    hoisted.setDesktopPasskeyState.mockResolvedValue({ ok: true });
    hoisted.addPasskey.mockResolvedValue({ data: {}, error: null });
  });

  it('goes straight to the workspace when Touch ID is unavailable or decided', async () => {
    for (const state of [
      { available: false, enrolled: false, dismissed: false },
      { available: true, enrolled: true, dismissed: false },
      { available: true, enrolled: false, dismissed: true },
    ]) {
      hoisted.routerReplace.mockClear();
      hoisted.getDesktopPasskeyState.mockResolvedValueOnce(state);
      await renderPage();
      expect(hoisted.routerReplace).toHaveBeenCalledWith('/app/chat');
    }
  });

  it('offers Touch ID after a fresh sign-in and enrolls a platform passkey', async () => {
    hoisted.getDesktopPasskeyState.mockResolvedValueOnce({
      available: true,
      enrolled: false,
      dismissed: false,
    });
    await renderPage();

    expect(
      screen.getByRole('heading', { name: 'Sign In With Touch ID Next Time?' })
    ).toBeVisible();
    expect(hoisted.routerReplace).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Turn On Touch ID' }));
    });

    expect(hoisted.addPasskey).toHaveBeenCalledWith({
      name: 'Jovie for Mac',
      authenticatorAttachment: 'platform',
    });
    expect(hoisted.setDesktopPasskeyState).toHaveBeenCalledWith('enrolled');
    expect(hoisted.routerReplace).toHaveBeenCalledWith('/app/chat');
  });

  it('keeps the browser path when enrollment fails, and Not Now remembers the choice', async () => {
    hoisted.getDesktopPasskeyState.mockResolvedValueOnce({
      available: true,
      enrolled: false,
      dismissed: false,
    });
    hoisted.addPasskey.mockResolvedValueOnce({
      data: null,
      error: { message: 'NotAllowedError' },
    });
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Turn On Touch ID' }));
    });
    expect(
      screen.getByText(
        'Touch ID was not turned on. You can keep signing in with the browser.'
      )
    ).toBeVisible();
    expect(hoisted.setDesktopPasskeyState).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Not Now' }));
    });
    expect(hoisted.setDesktopPasskeyState).toHaveBeenCalledWith('dismissed');
    expect(hoisted.routerReplace).toHaveBeenCalledWith('/app/chat');
  });
});
