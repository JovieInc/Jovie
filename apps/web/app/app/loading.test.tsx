import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCachedAuthMock, getAppFlagValueMock } = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  getAppFlagValueMock: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: getCachedAuthMock,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: getAppFlagValueMock,
}));

vi.mock('@/components/organisms/AppShellSkeleton', () => ({
  AppShellSkeleton: ({
    variant,
  }: {
    readonly variant?: 'legacy' | 'shellChatV1';
  }) => (
    <div data-testid='app-shell-skeleton' data-variant={variant ?? 'legacy'} />
  ),
}));

import AppLoading from './loading';

describe('app/app/loading.tsx', () => {
  beforeEach(() => {
    getCachedAuthMock.mockReset();
    getAppFlagValueMock.mockReset();
    getCachedAuthMock.mockResolvedValue({ userId: 'user_test' });
  });

  it('renders shellChatV1 skeleton when DESIGN_V1 is enabled', async () => {
    getAppFlagValueMock.mockResolvedValue(true);
    const ui = await AppLoading();
    const { getByTestId } = render(ui);

    expect(getAppFlagValueMock).toHaveBeenCalledWith('DESIGN_V1', {
      userId: 'user_test',
    });
    expect(getByTestId('app-shell-skeleton').getAttribute('data-variant')).toBe(
      'shellChatV1'
    );
  });

  it('renders legacy skeleton when DESIGN_V1 is disabled', async () => {
    getAppFlagValueMock.mockResolvedValue(false);
    const ui = await AppLoading();
    const { getByTestId } = render(ui);

    expect(getByTestId('app-shell-skeleton').getAttribute('data-variant')).toBe(
      'legacy'
    );
  });

  it('passes null userId when unauthenticated', async () => {
    getCachedAuthMock.mockResolvedValue({ userId: null });
    getAppFlagValueMock.mockResolvedValue(false);
    await AppLoading();

    expect(getAppFlagValueMock).toHaveBeenCalledWith('DESIGN_V1', {
      userId: null,
    });
  });
});
