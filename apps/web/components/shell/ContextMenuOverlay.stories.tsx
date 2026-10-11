import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContextMenuOverlay } from './ContextMenuOverlay';

const meta = {
  title: 'Shell/ContextMenuOverlay',
  component: ContextMenuOverlay,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['state', 'onClose'],
    },
  },
} satisfies Meta<typeof ContextMenuOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    state: {
      x: 120,
      y: 80,
      items: [
        { label: 'Rename', onSelect: () => {} },
        { kind: 'separator' },
        { label: 'Delete', onSelect: () => {}, tone: 'danger' },
      ],
    },
    onClose: () => {},
  },
};
