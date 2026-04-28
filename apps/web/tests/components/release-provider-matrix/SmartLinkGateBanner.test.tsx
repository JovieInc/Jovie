import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SmartLinkGateBanner } from '@/features/dashboard/organisms/release-provider-matrix/SmartLinkGateBanner';
import type { NudgeState } from '@/lib/queries/usePlanGate';

vi.mock('@/components/molecules/drawer', () => ({
  DrawerButton: ({
    children,
    asChild,
  }: {
    children: ReactNode;
    asChild?: boolean;
  }) => (asChild ? children : <button type='button'>{children}</button>),
  DrawerSurfaceCard: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

const mockNudgeState = vi.hoisted(() => ({
  value: 'never_trialed' as NudgeState,
}));

vi.mock('@/lib/queries/usePlanGate', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/queries/usePlanGate')
  >('@/lib/queries/usePlanGate');
  return {
    ...actual,
    usePlanGate: () => ({
      nudgeState: mockNudgeState.value,
    }),
  };
});

function setNudgeState(state: NudgeState) {
  mockNudgeState.value = state;
}

describe('SmartLinkGateBanner', () => {
  it('renders the soft-cap copy and support action', () => {
    setNudgeState('never_trialed');
    render(
      <SmartLinkGateBanner mode='soft-cap' releasedCount={124} softCap={100} />
    );

    expect(screen.getByText('You have 124 smart links')).toBeInTheDocument();
    expect(screen.getByText('Email support')).toBeInTheDocument();
  });

  it('renders never-trialed unreleased copy', () => {
    setNudgeState('never_trialed');
    render(<SmartLinkGateBanner mode='unreleased' unreleasedCount={2} />);

    expect(
      screen.getByText('You have 2 upcoming releases')
    ).toBeInTheDocument();
    expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
  });

  it('renders trial-aware unreleased copy referencing trial expiry', () => {
    setNudgeState('trial_late');
    render(<SmartLinkGateBanner mode='unreleased' unreleasedCount={2} />);

    expect(
      screen.getByText('2 upcoming releases after your trial')
    ).toBeInTheDocument();
    expect(screen.getByText('Lock in Pro')).toBeInTheDocument();
  });

  it('renders reclaim copy for recently_lapsed users', () => {
    setNudgeState('recently_lapsed');
    render(<SmartLinkGateBanner mode='unreleased' unreleasedCount={1} />);

    expect(screen.getByText('1 upcoming release')).toBeInTheDocument();
    expect(screen.getByText('Reclaim Pro')).toBeInTheDocument();
  });

  it('renders calm gain-framed copy for stale_lapsed users', () => {
    setNudgeState('stale_lapsed');
    render(<SmartLinkGateBanner mode='unreleased' unreleasedCount={3} />);

    expect(screen.getByText('3 upcoming releases')).toBeInTheDocument();
    expect(screen.getByText('Get Pro')).toBeInTheDocument();
  });
});
