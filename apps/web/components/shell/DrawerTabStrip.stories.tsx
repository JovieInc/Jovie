import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerTabStrip } from './DrawerTabStrip';

const meta = {
  title: 'Shell/DrawerTabStrip',
  component: DrawerTabStrip,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof DrawerTabStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    tabs: [
      { value: 'details', label: 'Details' },
      { value: 'activity', label: 'Activity' },
    ],
    active: 'details',
    onChange: () => {},
  },
};
