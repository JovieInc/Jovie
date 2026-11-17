import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { TableMetaProvider, useTableMeta } from '@/contexts/TableMetaContext';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminCreatorsPageWrapper } from './AdminCreatorsPageWrapper';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  tableCalls: [] as unknown[],
}));

vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: mocks.refresh,
    prefetch: vi.fn(),
  }),
}));

// The unified table owns its own query, rows and tests; the wrapper forwards
// the page props and wires the header actions and batch-ingest modal.
vi.mock('./AdminCreatorProfilesUnified', () => ({
  AdminCreatorProfilesUnified: (props: {
    readonly profiles: AdminCreatorProfileRow[];
    readonly sort: string;
  }) => {
    mocks.tableCalls.push(props);
    return (
      <p data-testid='admin-creators-table'>
        {props.profiles.length} creators sorted by {props.sort}
      </p>
    );
  },
}));

vi.mock('@/features/admin/BatchIngestModal', () => ({
  BatchIngestModal: ({
    open,
    onOpenChange,
    onComplete,
  }: {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly onComplete: () => void;
  }) =>
    open ? (
      <section aria-label='Batch ingest'>
        <button type='button' onClick={onComplete}>
          Finish batch
        </button>
        <button type='button' onClick={() => onOpenChange(false)}>
          Close batch
        </button>
      </section>
    ) : null,
}));

vi.mock('@/features/admin/ingest-profile-dropdown', () => ({
  IngestProfileDropdown: ({
    onIngestPending,
  }: {
    readonly onIngestPending: () => void;
  }) => (
    <button type='button' onClick={onIngestPending}>
      Ingest profile
    </button>
  ),
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
  profiles: [] as AdminCreatorProfileRow[],
  page: 2,
  pageSize: 25,
  total: 0,
  search: 'midnight',
  sort: 'created_desc',
} as const;

describe('AdminCreatorsPageWrapper', () => {
  beforeEach(() => {
    mocks.refresh.mockClear();
    mocks.tableCalls.length = 0;
  });

  it('forwards the page props to the unified table', async () => {
    const { container } = render(
      <Shell>
        <AdminCreatorsPageWrapper {...props} basePath='/app/admin/people' />
      </Shell>
    );
    expect(screen.getByTestId('admin-creators-table')).toHaveTextContent(
      '0 creators sorted by created_desc'
    );
    expect(mocks.tableCalls.at(-1)).toEqual({
      ...props,
      basePath: '/app/admin/people',
    });
    await expectNoA11yViolations(container);
  });

  it('opens the batch ingest modal from the header and refreshes on completion', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Shell>
        <AdminCreatorsPageWrapper {...props} />
      </Shell>
    );
    const header = screen.getByRole('region', { name: 'Page header' });
    const batch = screen.getByRole('button', { name: 'Batch Ingest' });
    expect(header).toContainElement(batch);
    expect(
      screen.queryByRole('region', { name: 'Batch ingest' })
    ).not.toBeInTheDocument();

    await user.click(batch);
    expect(
      screen.getByRole('region', { name: 'Batch ingest' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Finish batch' }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Close batch' }));
    expect(
      screen.queryByRole('region', { name: 'Batch ingest' })
    ).not.toBeInTheDocument();
  });

  it('refreshes the route when a single-profile ingest is queued', async () => {
    const user = userEvent.setup();
    render(
      <Shell>
        <AdminCreatorsPageWrapper {...props} />
      </Shell>
    );
    await user.click(screen.getByRole('button', { name: 'Ingest profile' }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('registers a drawer toggle that toggles the details rail', async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    render(
      <Shell toggle={toggle}>
        <AdminCreatorsPageWrapper {...props} />
      </Shell>
    );
    const header = screen.getByRole('region', { name: 'Page header' });
    const button = await screen.findByRole('button', {
      name: 'Toggle details sidebar',
    });
    expect(header).toContainElement(button);
    await user.click(button);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('clears its header actions on unmount', () => {
    function Toggleable({ show }: { readonly show: boolean }) {
      return (
        <Shell>{show ? <AdminCreatorsPageWrapper {...props} /> : null}</Shell>
      );
    }
    const { rerender } = render(<Toggleable show />);
    expect(
      screen.getByRole('button', { name: 'Batch Ingest' })
    ).toBeInTheDocument();
    rerender(<Toggleable show={false} />);
    expect(
      screen.queryByRole('button', { name: 'Batch Ingest' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Toggle details sidebar' })
    ).not.toBeInTheDocument();
  });
});
