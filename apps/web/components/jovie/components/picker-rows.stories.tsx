import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Paperclip } from 'lucide-react';
import { fn } from 'storybook/test';
import { PickerRow } from './picker-rows';

const meta = {
  title: 'Jovie/Components/PickerRows',
  component: PickerRow,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: ['rowId', 'onMouseEnter'],
    },
  },
  args: {
    item: {
      kind: 'action',
      action: {
        id: 'attach-files',
        label: 'Attach Files',
        description: 'Drop or browse',
        icon: Paperclip,
        onSelect: fn(),
      },
    },
    index: 0,
    isActive: true,
    onMouseEnter: fn(),
    onCommit: fn(),
  },
} satisfies Meta<typeof PickerRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AttachFiles: Story = {};
