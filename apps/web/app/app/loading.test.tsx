import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { headersMock, cookiesMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  cookiesMock: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: headersMock, cookies: cookiesMock }));

vi.mock('@/components/organisms/AppShellSkeleton', () => ({
  AppShellSkeleton: ({
    brandVariant,
    sidebarCollapsed,
    main,
  }: {
    readonly brandVariant?: 'jovie' | 'ov';
    readonly sidebarCollapsed?: boolean;
    readonly main?: React.ReactNode;
  }) => (
    <div
      data-testid='app-shell-skeleton'
      data-sidebar-collapsed={sidebarCollapsed}
      data-brand-variant={brandVariant ?? 'jovie'}
    >
      {main}
    </div>
  ),
}));
vi.mock('@/components/shell/TasksRouteSkeleton', () => ({
  TasksRouteSkeleton: () => <div data-testid='tasks-route-skeleton' />,
}));

import AppLoading from './loading';

describe('app/app/loading.tsx', () => {
  beforeEach(() => {
    cookiesMock.mockResolvedValue({ get: () => undefined });
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

  it.each(['customer', 'ov'])(
    'preserves the collapsed cookie in the %s workspace',
    async mode => {
      headersMock.mockResolvedValue(
        new Headers({ 'x-jovie-app-shell-mode': mode })
      );
      cookiesMock.mockResolvedValue({ get: () => ({ value: 'false' }) });
      const { getByTestId } = render(await AppLoading());
      expect(getByTestId('app-shell-skeleton')).toHaveAttribute(
        'data-sidebar-collapsed',
        'true'
      );
    }
  );

  it.each([undefined, 'true', 'invalid'])(
    'keeps the sidebar expanded for cookie %s',
    async value => {
      cookiesMock.mockResolvedValue({
        get: () => (value === undefined ? undefined : { value }),
      });
      const { getByTestId } = render(await AppLoading());
      expect(getByTestId('app-shell-skeleton')).toHaveAttribute(
        'data-sidebar-collapsed',
        'false'
      );
    }
  );

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

  it('reserves the Tasks frame in the app-root loading boundary', async () => {
    headersMock.mockResolvedValue(
      new Headers({
        'x-jovie-app-shell-mode': 'customer',
        'next-url': '/app/tasks',
      })
    );

    const { getByTestId } = render(await AppLoading());

    expect(getByTestId('app-shell-skeleton')).toContainElement(
      getByTestId('tasks-route-skeleton')
    );
  });
});
