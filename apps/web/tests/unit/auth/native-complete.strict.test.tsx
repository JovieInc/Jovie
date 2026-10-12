import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';
import NativeCompletePage from '@/app/(auth)/auth/native-complete/page';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  complete: vi.fn(async () => ({ returnTo: '/app' })),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/desktop/native-complete', () => ({
  completeDesktopNativeAuth: mocks.complete,
}));
vi.mock('@/lib/desktop/electron-bridge', () => ({
  consumeDesktopAuthCompletion: vi.fn(),
  getDesktopPasskeyState: vi.fn(async () => ({ available: false })),
  setDesktopPasskeyState: vi.fn(),
}));
it('continues to the workspace after StrictMode effect replay with one auth exchange', async () => {
  render(
    <StrictMode>
      <NativeCompletePage />
    </StrictMode>
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mocks.complete).toHaveBeenCalledTimes(1);
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/app');
  expect(
    screen.getByRole('heading', { name: 'Completing sign-in' })
  ).toBeInTheDocument();
});
