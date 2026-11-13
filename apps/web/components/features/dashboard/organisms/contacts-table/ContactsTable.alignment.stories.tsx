import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useMemo, useState } from 'react';
import { UnifiedTable } from '@/components/organisms/table';
import type { TableRowMode } from '@/components/organisms/table/table.styles';
import type { EditableContact } from '@/types/contacts';
import { createContactColumns } from './columns';

const contacts: EditableContact[] = [
  {
    id: 'synthetic-booking',
    creatorProfileId: 'synthetic-artist',
    personName: 'Alex Example',
    companyName: 'Example Booking',
    role: 'bookings',
    territories: ['Worldwide'],
    email: 'booking@example.com',
    isActive: true,
    sortOrder: 0,
  },
  {
    id: 'synthetic-management',
    creatorProfileId: 'synthetic-artist',
    personName: 'Jordan Example',
    companyName: 'Example Management',
    role: 'management',
    territories: ['Worldwide'],
    email: 'management@example.com',
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'synthetic-press',
    creatorProfileId: 'synthetic-artist',
    personName: 'Sam Example',
    companyName: 'Example Press',
    role: 'press_pr',
    territories: ['Worldwide'],
    email: 'press@example.com',
    isActive: true,
    sortOrder: 2,
  },
];

function ContactRowAlignment({ rowMode }: { readonly rowMode?: TableRowMode }) {
  const [selected, setSelected] = useState('');
  const [actionCount, setActionCount] = useState(0);
  const columns = useMemo(
    () =>
      createContactColumns({
        onDelete: () => setActionCount(value => value + 1),
      }),
    []
  );
  return (
    <div className='p-3'>
      <output aria-label='Selected contact'>{selected || 'None'}</output>
      <output aria-label='Action count'>{actionCount}</output>
      <UnifiedTable
        caption='Synthetic Contacts alignment'
        data={contacts}
        columns={columns}
        rowMode={rowMode}
        getRowId={contact => contact.id}
        getRowTestId={contact => contact.id}
        isRowSelected={contact => contact.id === selected}
        onRowClick={contact => setSelected(contact.id)}
        enableVirtualization={false}
      />
    </div>
  );
}

const meta = {
  title: 'Dashboard/Contacts/RowAlignment',
  component: ContactRowAlignment,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ContactRowAlignment>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Real Contacts columns, UnifiedTable and route CSS; no customer data. */
export const Dense: Story = { args: { rowMode: 'dense' } };
export const Compact: Story = { args: { rowMode: 'compact' } };
export const Default: Story = { args: {} };
