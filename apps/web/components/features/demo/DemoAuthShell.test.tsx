import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';

vi.mock('@jovie/ui', () => ({
  TooltipProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/organisms/AuthShellWrapper', () => ({
  AuthShellWrapper: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='demo-auth-shell-wrapper'>{children}</div>
  ),
}));

vi.mock('@/components/providers/NuqsProvider', () => ({
  NuqsProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  ClerkSafeDefaultsProvider: ({
    children,
  }: {
    readonly children: ReactNode;
  }) => <>{children}</>,
}));

import { DemoAuthShell } from './DemoAuthShell';

function DemoQueryProbe() {
  const queryClient = useQueryClient();
  const billing = queryClient.getQueryData<{ plan: string }>(
    queryKeys.billing.status()
  );
  const usage = queryClient.getQueryData<{
    remaining: number;
    weeklyLimit: number;
  }>(queryKeys.chat.usage());

  return (
    <div>
      <span data-testid='demo-billing-plan'>{billing?.plan}</span>
      <span data-testid='demo-usage-snapshot'>
        {usage?.remaining}/{usage?.weeklyLimit}
      </span>
    </div>
  );
}

describe('DemoAuthShell', () => {
  it('renders children with seeded demo billing and weekly usage data', () => {
    render(
      <DemoAuthShell>
        <DemoQueryProbe />
      </DemoAuthShell>
    );

    expect(screen.getByTestId('demo-auth-shell-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('demo-billing-plan')).toHaveTextContent('max');
    expect(screen.getByTestId('demo-usage-snapshot')).toHaveTextContent(
      '122/250'
    );
  });
});
