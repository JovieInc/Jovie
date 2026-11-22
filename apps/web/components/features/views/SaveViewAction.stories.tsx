import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SaveViewAction } from './SaveViewAction';

const meta = {
  title: 'Features/Views/SaveViewAction',
  component: SaveViewAction,
  tags: ['autodocs'],
  args: { token: 'a'.repeat(32), viewerOwnsView: false },
} satisfies Meta<typeof SaveViewAction>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Owned: Story = { args: { viewerOwnsView: true } };
