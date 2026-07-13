import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getCachedAuthMock = vi.fn();
const getAppFlagValueMock = vi.fn();

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: () => getCachedAuthMock(),
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: (...args: unknown[]) => getAppFlagValueMock(...args),
}));

/**
 * Regression test for #14187: `app/app/loading.tsx` is the Suspense
 * fallback Next.js renders while `app/app/(shell)/layout.tsx` resolves, so
 * it must thread the same resolved `DESIGN_V1` variant into
 * `AppShellSkeleton` that the layout will land on. Before this fix it
 * always rendered the 'legacy' skeleton regardless of the flag.
 */
describe('AppLoading (app/app/loading.tsx)', () => {
  it('renders the shellChatV1 skeleton frame when DESIGN_V1 is enabled', async () => {
    getCachedAuthMock.mockResolvedValue({
      userId: 'user_123',
      sessionId: 'sess_123',
      orgId: null,
    });
    getAppFlagValueMock.mockResolvedValue(true);

    const { default: AppLoading } = await import('@/app/app/loading');
    const element = await AppLoading();
    const { container } = render(element);

    const frame = container.querySelector('[data-app-shell-frame]');
    expect(frame).toHaveAttribute('data-shell-design', 'shellChatV1');
    expect(getAppFlagValueMock).toHaveBeenCalledWith('DESIGN_V1', {
      userId: 'user_123',
    });
  });

  it('renders the legacy skeleton frame when DESIGN_V1 is disabled', async () => {
    getCachedAuthMock.mockResolvedValue({
      userId: null,
      sessionId: null,
      orgId: null,
    });
    getAppFlagValueMock.mockResolvedValue(false);

    const { default: AppLoading } = await import('@/app/app/loading');
    const element = await AppLoading();
    const { container } = render(element);

    const frame = container.querySelector('[data-app-shell-frame]');
    expect(frame).toHaveAttribute('data-shell-design', 'legacy');
  });
});
