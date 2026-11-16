import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const h = vi.hoisted(() => ({
  hydrator: vi.fn(),
  shell: vi.fn(),
  seeded: undefined as unknown,
}));

// The demo app shell is certified on its own; this stand-in runs the seed
// callback the harness hands it and renders a main landmark.
vi.mock('./DemoAuthShell', () => ({
  DemoAuthShell: ({
    children,
    seedQueryClient,
  }: {
    readonly children: ReactNode;
    readonly seedQueryClient?: (client: QueryClient) => void;
  }) => {
    const client = new QueryClient();
    seedQueryClient?.(client);
    h.seeded = client.getQueryData(queryKeys.earnings.stats());
    return <main>{children}</main>;
  },
}));

vi.mock('@/features/dashboard/organisms/PreviewDataHydrator', () => ({
  PreviewDataHydrator: (props: unknown) => {
    h.hydrator(props);
    return null;
  },
}));

vi.mock('@/components/organisms/PageShell', () => ({
  PageShell: ({
    children,
    maxWidth,
    'data-testid': testId,
  }: {
    readonly children: ReactNode;
    readonly maxWidth: string;
    readonly 'data-testid'?: string;
  }) => {
    h.shell(maxWidth);
    return (
      <div data-testid={testId} data-max-width={maxWidth}>
        {children}
      </div>
    );
  },
}));

import {
  DEMO_EARNINGS_RESPONSE,
  DEMO_PROFILE_SOCIAL_LINKS,
} from './demo-surface-fixtures';
import { DEMO_DASHBOARD_DATA } from './mock-dashboard-data';
import { SettingsDemoHarness } from './SettingsDemoHarness';

const Body = () => (
  <section aria-label='Profile settings'>
    <button type='button'>Save profile</button>
  </section>
);

describe('SettingsDemoHarness certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.seeded = undefined;
  });

  it('renders children bare with no seed data and no hydrator', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SettingsDemoHarness>
        <Body />
      </SettingsDemoHarness>
    );

    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('region', { name: 'Profile settings' })
    );
    expect(h.shell).not.toHaveBeenCalled();
    expect(h.hydrator).not.toHaveBeenCalled();
    expect(h.seeded).toBeUndefined();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Save profile' })).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('wraps the settings shell and hydrates the profile links', async () => {
    const { container } = render(
      <SettingsDemoHarness
        shell='settings'
        dashboardData={DEMO_DASHBOARD_DATA}
        initialLinks={DEMO_PROFILE_SOCIAL_LINKS}
      >
        <Body />
      </SettingsDemoHarness>
    );

    expect(screen.getByTestId('settings-shell-content')).toHaveAttribute(
      'data-max-width',
      'form'
    );
    expect(h.hydrator).toHaveBeenCalledWith(
      expect.objectContaining({ initialLinks: DEMO_PROFILE_SOCIAL_LINKS })
    );
    const [{ connectedDSPs }] = h.hydrator.mock.calls.at(-1) as [
      { connectedDSPs: readonly unknown[] },
    ];
    expect(connectedDSPs.length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('hydrates no DSPs for a profile without links', () => {
    render(
      <SettingsDemoHarness dashboardData={DEMO_DASHBOARD_DATA}>
        <Body />
      </SettingsDemoHarness>
    );

    expect(h.hydrator).toHaveBeenCalledWith({
      initialLinks: [],
      connectedDSPs: [],
    });
  });

  it('uses the wide page shell with a caller test id and seeds earnings', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SettingsDemoHarness
          shell='page'
          testId='demo-showcase-links'
          earningsData={DEMO_EARNINGS_RESPONSE}
        >
          <Body />
        </SettingsDemoHarness>
      </div>
    );

    expect(screen.getByTestId('demo-showcase-links')).toHaveAttribute(
      'data-max-width',
      'wide'
    );
    expect(h.seeded).toEqual(DEMO_EARNINGS_RESPONSE);
    await expectNoA11yViolations(container);
  });
});
