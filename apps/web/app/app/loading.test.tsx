import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCachedAuthMock, getAppFlagValueMock, headersMock } = vi.hoisted(
  () => ({
    getCachedAuthMock: vi.fn(),
    getAppFlagValueMock: vi.fn(),
    headersMock: vi.fn(),
  })
);

vi.mock('next/headers', () => ({ headers: headersMock }));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: getCachedAuthMock,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: getAppFlagValueMock,
}));

vi.mock('@/components/organisms/AppShellSkeleton', () => ({
  AppShellSkeleton: ({
    brandVariant,
    variant,
  }: {
    readonly brandVariant?: 'jovie' | 'ov';
    readonly variant?: 'legacy' | 'shellChatV1';
  }) => (
    <div
      data-testid='app-shell-skeleton'
      data-brand-variant={brandVariant ?? 'jovie'}
      data-variant={variant ?? 'legacy'}
    />
  ),
}));

import AppLoading from './loading';

describe('app/app/loading.tsx', () => {
  beforeEach(() => {
    getCachedAuthMock.mockReset();
    getAppFlagValueMock.mockReset();
    headersMock.mockReset();
    getCachedAuthMock.mockResolvedValue({ userId: 'user_test' });
    headersMock.mockResolvedValue(
      new Headers({ 'x-jovie-app-shell-mode': 'customer' })
    );
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

  it('uses the OV skin for the cold operator loading boundary', async () => {
    headersMock.mockResolvedValue(
      new Headers({ 'x-jovie-app-shell-mode': 'ov' })
    );
    getAppFlagValueMock.mockResolvedValue(true);

    const { getByTestId } = render(await AppLoading());

    expect(
      getByTestId('app-shell-skeleton').getAttribute('data-brand-variant')
    ).toBe('ov');
  });

  it('keeps customer loading routes on the Jovie skin', async () => {
    getAppFlagValueMock.mockResolvedValue(true);

    const { getByTestId } = render(await AppLoading());

    expect(
      getByTestId('app-shell-skeleton').getAttribute('data-brand-variant')
    ).toBe('jovie');
  });
});
