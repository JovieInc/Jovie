import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TableIconButton } from './TableIconButton';

const RowActionIcon = () => (
  <svg
    aria-hidden='true'
    className='h-4 w-4'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.5'
    viewBox='0 0 16 16'
  >
    <path d='M4 8h8M8 4v8' />
  </svg>
);

const meta = {
  title: 'Organisms/Table/TableIconButton',
  component: TableIconButton,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: {
    ariaLabel: 'Add row action',
    icon: <RowActionIcon />,
    onClick: () => undefined,
  },
} satisfies Meta<typeof TableIconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ghost: Story = {};

export const Danger: Story = {
  args: {
    ariaLabel: 'Delete row',
    variant: 'danger',
  },
};
