import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerPropertyRow } from './DrawerPropertyRow';

const meta = {
  title: 'Molecules/Drawer/DrawerPropertyRow',
  component: DrawerPropertyRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => <div className='w-full max-w-md bg-surface-0 p-3'>{Story()}</div>,
  ],
  args: {
    label: 'Release status',
    value: 'Ready for review',
  },
} satisfies Meta<typeof DrawerPropertyRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnly: Story = {};

export const Interactive: Story = {
  args: {
    interactive: true,
    onClick: () => undefined,
    label: 'Open release',
    value: 'Summer EP',
  },
};

export const Compact: Story = {
  args: {
    size: 'sm',
    align: 'start',
    labelWidth: 120,
    label: 'Description',
    value: 'A short release summary.',
  },
};
