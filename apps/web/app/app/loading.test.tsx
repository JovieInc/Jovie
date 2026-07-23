import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));

vi.mock('next/headers', () => ({ headers: headersMock }));

vi.mock('@/components/organisms/AppShellSkeleton', () => ({
  AppShellSkeleton: ({
    brandVariant,
  }: {
    readonly brandVariant?: 'jovie' | 'ov';
  }) => (
    <div
      data-testid='app-shell-skeleton'
      data-brand-variant={brandVariant ?? 'jovie'}
    />
  ),
}));

import AppLoading from './loading';

describe('app/app/loading.tsx', () => {
  beforeEach(() => {
    headersMock.mockReset();
    headersMock.mockResolvedValue(
      new Headers({ 'x-jovie-app-shell-mode': 'customer' })
    );
  });

  it('renders the canonical shell skeleton without a rollout lookup', async () => {
    const ui = await AppLoading();
    const { getByTestId } = render(ui);

    expect(getByTestId('app-shell-skeleton')).toBeInTheDocument();
  });

  it('uses the OV skin for the cold operator loading boundary', async () => {
    headersMock.mockResolvedValue(
      new Headers({ 'x-jovie-app-shell-mode': 'ov' })
    );
    const { getByTestId } = render(await AppLoading());

    expect(
      getByTestId('app-shell-skeleton').getAttribute('data-brand-variant')
    ).toBe('ov');
  });

  it('keeps customer loading routes on the Jovie skin', async () => {
    const { getByTestId } = render(await AppLoading());

    expect(
      getByTestId('app-shell-skeleton').getAttribute('data-brand-variant')
    ).toBe('jovie');
  });
});
