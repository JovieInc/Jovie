import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { TableIconButton } from './TableIconButton';

const meta: Meta<typeof TableIconButton> = {
  title: 'Organisms/Table/TableIconButton',
  component: TableIconButton,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['className'],
    },
  },
  args: {
    onClick: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof TableIconButton>;

export const Default: Story = {
  args: {
    ariaLabel: 'More Actions',
    tooltip: 'More Actions',
    icon: <MoreHorizontal aria-hidden='true' />,
  },
};

export const Danger: Story = {
  args: {
    ariaLabel: 'Delete Row',
    tooltip: 'Delete Row',
    variant: 'danger',
    icon: <Trash2 aria-hidden='true' />,
  },
};
