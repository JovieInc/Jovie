import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerBackButton } from './DrawerBackButton';

const meta = {
  title: 'Molecules/Drawer/DrawerBackButton',
  component: DrawerBackButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Back to artist',
    onClick: () => undefined,
  },
} satisfies Meta<typeof DrawerBackButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongLabel: Story = {
  args: {
    label: 'Back to the artist release workspace',
  },
};
