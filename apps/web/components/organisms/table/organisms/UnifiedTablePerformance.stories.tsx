import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Profiler, useRef, useState } from 'react';
import type { CellContext, ColumnDef } from '@/lib/tanstack-table';
import { UnifiedTable } from './UnifiedTable';

type Person = { id: string; name: string };
const people: Person[] = Array.from({ length: 10_000 }, (_, index) => ({
  id: `person-${index}`,
  name: `Person ${index}`,
}));
const filteredPeople = people.slice(0, 25);
let cellRenders = 0;

function recordCellRender() {
  cellRenders += 1;
}

function CountedName({ getValue }: CellContext<Person, unknown>) {
  return (
    <Profiler id='name-cell' onRender={recordCellRender}>
      <span>{String(getValue())}</span>
    </Profiler>
  );
}
const columns: ColumnDef<Person, unknown>[] = [
  { accessorKey: 'name', header: 'Name', cell: CountedName },
];
const getRowId = (row: Person) => row.id;

function VirtualizationStressFixture() {
  const [hidden, setHidden] = useState(false);
  const [filtered, setFiltered] = useState(false);
  const output = useRef<HTMLOutputElement>(null);
  return (
    <div>
      <button type='button' onClick={() => setHidden(value => !value)}>
        Toggle viewport
      </button>
      <button type='button' onClick={() => setFiltered(value => !value)}>
        Toggle filter
      </button>
      <output ref={output} aria-label='Table performance measurements' />
      <div style={{ height: hidden ? 0 : 640, overflow: 'hidden' }}>
        <Profiler
          id='canonical-table'
          onRender={() => {
            if (output.current) {
              output.current.dataset.cellRenders = String(cellRenders);
            }
          }}
        >
          <UnifiedTable
            caption='10,000 people performance fixture'
            data={filtered ? filteredPeople : people}
            columns={columns}
            rowMode='dense'
            columnSnap={false}
            enableKeyboardNavigation
            getRowId={getRowId}
            containerClassName='h-full'
          />
        </Profiler>
      </div>
    </div>
  );
}

const meta = {
  title: 'Organisms/Table/Performance',
  component: UnifiedTable<Person>,
  args: { data: [], columns },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof UnifiedTable<Person>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NavigationStress: Story = {
  render: () => <VirtualizationStressFixture />,
};

export const NavigationStressLight: Story = {
  ...NavigationStress,
  parameters: { themes: { themeOverride: 'light' } },
};
