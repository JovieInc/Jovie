import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Settings, Trash2 } from 'lucide-react';
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

export const Ghost: Story = {
  args: {
    ariaLabel: 'Settings',
    tooltip: 'Settings',
    icon: <Settings />,
  },
};

export const Danger: Story = {
  args: {
    ariaLabel: 'Delete',
    variant: 'danger',
    tooltip: 'Delete',
    icon: <Trash2 />,
  },
};
