import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableColumnCompacts } from './TableColumnCompacts';

const meta = {
  title: 'Organisms/Table/TableColumnCompacts',
  component: TableColumnCompacts,
  args: {
    items: [
      { id: 'state', node: 'Active' },
      { id: 'last', node: '2h' },
      { id: 'alerts', node: 'SMS' },
    ],
  },
} satisfies Meta<typeof TableColumnCompacts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Folded: Story = {};

export const Empty: Story = {
  args: { items: [] },
};

/** Long folded values stay on the one compact line beside the primary cell. */
export const LongContent: Story = {
  args: {
    items: [
      { id: 'state', node: 'Awaiting distributor approval' },
      { id: 'last', node: 'Updated 3 weeks ago' },
      { id: 'alerts', node: 'SMS, email and push' },
    ],
  },
};

export const Rtl: Story = {
  args: {
    items: [
      { id: 'state', node: 'نشط' },
      { id: 'last', node: 'منذ ساعتين' },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
