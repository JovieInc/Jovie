import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SmartLinkGateBanner } from '@/features/dashboard/organisms/release-provider-matrix/SmartLinkGateBanner';

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

describe('SmartLinkGateBanner', () => {
  it('renders the soft-cap copy and support action', () => {
    render(
      <SmartLinkGateBanner mode='soft-cap' releasedCount={124} softCap={100} />
    );

    expect(screen.getByText('You have 124 smart links')).toBeInTheDocument();
    expect(screen.getByText('Email support')).toBeInTheDocument();
  });

  it('renders the unreleased upgrade prompt', () => {
    render(<SmartLinkGateBanner mode='unreleased' unreleasedCount={2} />);

    expect(
      screen.getByText('You have 2 upcoming releases')
    ).toBeInTheDocument();
    expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
  });
});
