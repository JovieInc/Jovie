import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import { ContactsTable } from './ContactsTable';

const meta: Meta<typeof ContactsTable> = {
  title: 'Dashboard/Contacts/ContactsTable',
  component: ContactsTable,
  decorators: [
    Story => (
      <HeaderActionsProvider>
        <RightPanelProvider>
          <TableMetaProvider>
            <Story />
          </TableMetaProvider>
        </RightPanelProvider>
      </HeaderActionsProvider>
    ),
  ],
  args: {
    artistName: 'Tim White',
    contacts: [],
    onUpdate: fn(),
    onSave: fn(async () => undefined),
    onDelete: fn(),
    onAddContact: fn(),
  },
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: args => (
    <div className='h-[32rem] bg-(--app-shell-content-surface)'>
      <ContactsTable {...args} />
    </div>
  ),
};

export const EmptyNarrow: Story = {
  render: args => (
    <div className='h-[32rem] w-80 bg-(--app-shell-content-surface)'>
      <ContactsTable {...args} />
    </div>
  ),
};
