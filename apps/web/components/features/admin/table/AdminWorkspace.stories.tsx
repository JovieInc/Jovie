import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import { PersonCell } from '@/components/organisms/table/atoms/PersonCell';
import { AppShellRightRail } from '@/components/shell/AppShellRightRail';
import { AdminDetailRail } from '@/features/admin/layout/AdminDetailRail';
import { AdminPage } from '@/features/admin/layout/AdminPage';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import type { ColumnDef } from '@/lib/tanstack-table';
import { AdminDataTable } from './AdminDataTable';
import { AdminTableShell } from './AdminTableShell';

type FixtureRow = { id: string; name: string; status: string };
const rows: FixtureRow[] = Array.from({ length: 200 }, (_, index) => ({
  id: String(index),
  name: index % 2 ? 'A long customer name '.repeat(30) : `Customer ${index}`,
  status: index % 3 ? 'Certified' : '—',
}));
function NameCell({
  row,
}: {
  readonly row: { readonly original: FixtureRow };
}) {
  return (
    <PersonCell name={row.original.name} secondary='customer@example.com' />
  );
}
const columns: ColumnDef<FixtureRow, unknown>[] = [
  { accessorKey: 'name', header: 'Customer', size: 260, cell: NameCell },
  { accessorKey: 'status', header: 'Status', size: 150 },
  {
    accessorKey: 'id',
    header: 'ID',
    size: 100,
  },
];

/** Hostile-content reference for viewport, data-state, scrolling, and inspector QA. */
export function AdminWorkspaceFixture() {
  const isMobile = useBreakpointDown('md');
  const [state, setState] = useState('populated');
  const [selected, setSelected] = useState<FixtureRow | null>(null);
  return (
    <div className='system-b-app relative flex h-dvh min-h-0 flex-col overflow-hidden bg-surface-0'>
      <AdminPage
        title='People'
        layout='workspace'
        testId='fixture-page'
        viewTestId='fixture-view'
        tabs={{
          param: 'view',
          value: 'customers',
          options: [
            { value: 'customers', label: 'Customers' },
            { value: 'creators', label: 'Creators' },
          ],
        }}
      >
        <AdminTableShell
          testId='fixture-table-shell'
          toolbar={
            <div className='flex gap-2 p-2'>
              {['populated', 'loading', 'empty', 'grouped'].map(value => (
                <Button
                  key={value}
                  type='button'
                  variant='ghost'
                  size='sm'
                  aria-pressed={state === value}
                  onClick={() => setState(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          }
          footer={
            <p className='px-3 py-2 text-xs text-secondary-token'>
              200 customers
            </p>
          }
        >
          {() => (
            <AdminDataTable
              columns={columns}
              data={state === 'empty' ? [] : rows}
              isLoading={state === 'loading'}
              rowMode='dense'
              columnVisibility={{ id: !isMobile }}
              minWidth='640px'
              enableVirtualization={state !== 'grouped'}
              onRowClick={setSelected}
              getRowId={row => row.id}
              getRowTestId={row => `fixture-row-${row.id}`}
              groupingConfig={
                state === 'grouped'
                  ? {
                      getGroupKey: row => row.status,
                      getGroupLabel: key => key,
                    }
                  : undefined
              }
              emptyState={
                <p className='p-4 text-xs text-secondary-token'>No customers</p>
              }
            />
          )}
        </AdminTableShell>
      </AdminPage>
      {selected ? (
        <AppShellRightRail>
          <AdminDetailRail
            isOpen
            ariaLabel='Customer details'
            onClose={() => setSelected(null)}
            entityHeader={
              <h2 className='p-3 text-sm text-primary-token'>
                Customer details
              </h2>
            }
            footer={
              <Button type='button' size='sm'>
                Certify
              </Button>
            }
          >
            <DrawerSection title='Evidence'>
              <p className='text-xs'>{selected.name}</p>
            </DrawerSection>
            <DrawerSection title='History'>
              <p className='text-xs'>Customer record</p>
            </DrawerSection>
          </AdminDetailRail>
        </AppShellRightRail>
      ) : null}
    </div>
  );
}
const meta = {
  title: 'Features/Admin/AdminWorkspace',
  component: AdminWorkspaceFixture,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AdminWorkspaceFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const HostileContent: Story = {};
