import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerSectionHeading } from './DrawerSectionHeading';

const meta: Meta<typeof DrawerSectionHeading> = {
  title: 'Molecules/Drawer/DrawerSectionHeading',
  component: DrawerSectionHeading,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Contact Info',
  },
};

export default meta;
type Story = StoryObj<typeof DrawerSectionHeading>;

export const Default: Story = {};

export const SemanticHeading: Story = {
  args: {
    as: 'h3',
    children: 'Role',
  },
};
