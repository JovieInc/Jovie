import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShareableLinkRow } from './ShareableLinkRow';

const meta: Meta<typeof ShareableLinkRow> = {
  title: 'Molecules/Drawer/ShareableLinkRow',
  component: ShareableLinkRow,
  parameters: {
    layout: 'centered',
  },
  args: {
    url: 'https://jov.ie/tim',
    density: 'rail',
    surface: 'boxed',
    showOpen: true,
  },
};

export default meta;
type Story = StoryObj<typeof ShareableLinkRow>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    density: 'compact',
  },
};

export const Table: Story = {
  args: {
    density: 'table',
  },
};

export const FlatSurface: Story = {
  args: {
    surface: 'flat',
  },
};

export const HoverActions: Story = {
  args: {
    actionsVisibility: 'hover',
  },
};
