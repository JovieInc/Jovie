import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DropdownEmptyRow } from './DropdownEmptyRow';

const meta = {
  title: 'Molecules/DropdownEmptyRow',
  component: DropdownEmptyRow,
  parameters: {
    layout: 'centered',
  },
  args: {
    message: 'No options found',
  },
} satisfies Meta<typeof DropdownEmptyRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
