import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { TableMetaProvider, useTableMeta } from '@/contexts/TableMetaContext';
import type { AdminReleaseRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminReleasesPageWrapper } from './AdminReleasesPageWrapper';

const tableProps = vi.hoisted(() => ({ calls: [] as unknown[] }));

// The unified table owns its own query, rows and tests; the wrapper's job is
// to forward the page props and register the drawer toggle header action.
vi.mock('./AdminReleasesTableUnified', () => ({
  AdminReleasesTableUnified: (props: {
    readonly releases: AdminReleaseRow[];
    readonly sort: string;
  }) => {
    tableProps.calls.push(props);
    return (
      <p data-testid='admin-releases-table'>
        {props.releases.length} releases sorted by {props.sort}
      </p>
    );
  },
}));

function HeaderSlot() {
  const { headerActions } = useHeaderActions();
  return <section aria-label='Page header'>{headerActions}</section>;
}

function DrawerToggleSource({ toggle }: { readonly toggle: () => void }) {
  const { setTableMeta } = useTableMeta();
  useEffect(() => {
    setTableMeta({ rowCount: 0, toggle, rightPanelWidth: 0 });
  }, [setTableMeta, toggle]);
  return null;
}

function Shell({
  children,
  toggle = vi.fn(),
}: {
  readonly children: ReactNode;
  readonly toggle?: () => void;
}) {
  return (
    <TooltipProvider>
      <TableMetaProvider>
        <HeaderActionsProvider>
          <DrawerToggleSource toggle={toggle} />
          <HeaderSlot />
          <main>{children}</main>
        </HeaderActionsProvider>
      </TableMetaProvider>
    </TooltipProvider>
  );
}

const props = {
  releases: [] as AdminReleaseRow[],
  pageSize: 25,
  total: 0,
  search: 'midnight',
  sort: 'release_date_desc',
} as const;

describe('AdminReleasesPageWrapper', () => {
  it('forwards the page props to the unified table', async () => {
    tableProps.calls.length = 0;
    const { container } = render(
      <Shell>
        <AdminReleasesPageWrapper {...props} basePath='/ignored' />
      </Shell>
    );
    expect(screen.getByTestId('admin-releases-table')).toHaveTextContent(
      '0 releases sorted by release_date_desc'
    );
    expect(tableProps.calls.at(-1)).toEqual({
      releases: [],
      pageSize: 25,
      total: 0,
      search: 'midnight',
      sort: 'release_date_desc',
    });
    await expectNoA11yViolations(container);
  });

  it('registers a drawer toggle in the header that toggles the details rail', async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    const { container } = render(
      <Shell toggle={toggle}>
        <AdminReleasesPageWrapper {...props} />
      </Shell>
    );
    const header = screen.getByRole('region', { name: 'Page header' });
    const button = await screen.findByRole('button', {
      name: 'Toggle details sidebar',
    });
    expect(header).toContainElement(button);
    await user.click(button);
    expect(toggle).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('clears its header action on unmount', () => {
    function Toggleable({ show }: { readonly show: boolean }) {
      return (
        <Shell>{show ? <AdminReleasesPageWrapper {...props} /> : null}</Shell>
      );
    }
    const { rerender } = render(<Toggleable show />);
    expect(
      screen.getByRole('button', { name: 'Toggle details sidebar' })
    ).toBeInTheDocument();
    rerender(<Toggleable show={false} />);
    expect(
      screen.queryByRole('button', { name: 'Toggle details sidebar' })
    ).not.toBeInTheDocument();
  });
});
