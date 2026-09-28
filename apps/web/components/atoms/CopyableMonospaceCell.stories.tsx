import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CopyableMonospaceCell } from './CopyableMonospaceCell';

const meta = {
  title: 'Atoms/CopyableMonospaceCell',
  component: CopyableMonospaceCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    value: 'USRC17607839',
    label: 'ISRC',
  },
} satisfies Meta<typeof CopyableMonospaceCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Truncated: Story = {
  args: {
    value: 'USRC17607839-EXTENDED-CATALOG-ID',
    maxWidth: 80,
  },
};

export const Empty: Story = {
  name: 'Empty (no value)',
  args: {
    value: null,
  },
};
