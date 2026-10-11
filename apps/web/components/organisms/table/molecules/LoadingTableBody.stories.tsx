import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LoadingTableBody } from './LoadingTableBody';

const meta = {
  title: 'Organisms/Table/Molecules/LoadingTableBody',
  component: LoadingTableBody,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <table className='w-96'>
        <Story />
      </table>
    ),
  ],
  args: {
    rows: 3,
    columns: 4,
  },
} satisfies Meta<typeof LoadingTableBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithColumnConfig: Story = {
  args: {
    rows: 3,
    columns: 3,
    columnConfig: [
      { width: '48px', variant: 'avatar' },
      { width: '160px', variant: 'text' },
      { width: '80px', variant: 'badge' },
    ],
  },
};
