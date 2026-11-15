import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerLoadingSkeleton } from './DrawerLoadingSkeleton';

const mockUseBreakpointDown = vi.fn();
vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: (...args: unknown[]) => mockUseBreakpointDown(...args),
}));

describe('DrawerLoadingSkeleton', () => {
  beforeEach(() => {
    mockUseBreakpointDown.mockReset();
    mockUseBreakpointDown.mockReturnValue(false);
  });

  it('renders an open, labelled drawer with header, analytics and tabs cards', async () => {
    render(<DrawerLoadingSkeleton />);

    const drawer = screen.getByRole('complementary', {
      name: 'Loading details',
    });
    const skeleton = within(drawer).getByTestId('drawer-loading-skeleton');
    expect(
      within(skeleton).getByTestId('drawer-loading-header-card')
    ).toBeInTheDocument();
    expect(
      within(skeleton).getByTestId('drawer-loading-analytics-card')
    ).toBeInTheDocument();
    expect(
      within(skeleton).getByTestId('drawer-loading-tabs-card')
    ).toBeInTheDocument();
    expect(
      within(skeleton).getAllByTestId('drawer-loading-content-row')
    ).toHaveLength(6);
    await expectNoA11yViolations(drawer);
  });

  it('uses a custom label, hides the tabs and draws the requested rows', async () => {
    render(
      <DrawerLoadingSkeleton
        ariaLabel='Loading release details'
        showTabs={false}
        contentRows={5}
      />
    );

    const drawer = screen.getByRole('complementary', {
      name: 'Loading release details',
    });
    expect(screen.queryByTestId('drawer-loading-tabs-card')).toBeNull();
    const rows = screen.getAllByTestId('drawer-loading-content-row');
    expect(rows).toHaveLength(5);
    // The first four rows are label and value pairs; later rows are lists.
    expect(rows[3]).toHaveClass('grid-cols-[76px_minmax(0,1fr)]');
    expect(rows[4]).toHaveClass('grid-cols-1');
    await expectNoA11yViolations(drawer);
  });

  it('draws no content rows when none are requested', async () => {
    render(<DrawerLoadingSkeleton contentRows={0} />);

    const drawer = screen.getByRole('complementary', {
      name: 'Loading details',
    });
    expect(screen.queryAllByTestId('drawer-loading-content-row')).toHaveLength(
      0
    );
    expect(screen.getByTestId('drawer-loading-header-card')).toBeVisible();
    await expectNoA11yViolations(drawer);
  });

  it('renders as a modal sheet on a mobile breakpoint', async () => {
    mockUseBreakpointDown.mockReturnValue(true);
    render(<DrawerLoadingSkeleton />);

    const drawer = screen.getByLabelText('Loading details');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(
      within(drawer).getByTestId('drawer-loading-skeleton')
    ).toBeInTheDocument();
    await expectNoA11yViolations(drawer);
  });
});
