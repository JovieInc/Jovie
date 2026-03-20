import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerLoadingSkeleton } from '@/components/molecules/drawer/DrawerLoadingSkeleton';

vi.mock('@/components/organisms/RightDrawer', () => ({
  RightDrawer: ({
    children,
    ariaLabel,
  }: {
    children: ReactNode;
    ariaLabel?: string;
  }) => <aside aria-label={ariaLabel}>{children}</aside>,
}));

describe('DrawerLoadingSkeleton', () => {
  it('renders the stacked-card skeleton structure with tabs by default', () => {
    render(
      <DrawerLoadingSkeleton
        ariaLabel='Loading release details'
        contentRows={5}
      />
    );

    expect(
      screen.getByLabelText('Loading release details')
    ).toBeInTheDocument();
    expect(screen.getByTestId('drawer-loading-skeleton')).toBeInTheDocument();
    expect(
      screen.getByTestId('drawer-loading-header-card')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('drawer-loading-analytics-card')
    ).toBeInTheDocument();
    expect(screen.getByTestId('drawer-loading-tabs-card')).toBeInTheDocument();
    expect(screen.getAllByTestId('drawer-loading-content-row')).toHaveLength(5);
  });

  it('omits the tabs card when requested', () => {
    render(<DrawerLoadingSkeleton showTabs={false} contentRows={2} />);

    expect(
      screen.queryByTestId('drawer-loading-tabs-card')
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId('drawer-loading-content-row')).toHaveLength(2);
  });
});
