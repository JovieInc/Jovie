import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableBadge } from './TableBadge';

const meta = {
  title: 'Organisms/Table/Atoms/TableBadge',
  component: TableBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Active',
    variant: 'secondary',
  },
} satisfies Meta<typeof TableBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ConstrainedDestructiveLabel: Story = {
  args: {
    children: 'Destructive action requires review',
    variant: 'error',
  },
  decorators: [
    StoryComponent => (
      <div className='w-28'>
        <StoryComponent />
      </div>
    ),
  ],
};
