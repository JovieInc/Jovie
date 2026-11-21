import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FilterChip } from './ScreenshotGalleryFilters';

const meta = {
  title: 'Features/Admin/ScreenshotGalleryFilters',
  component: FilterChip,
  args: {
    label: 'Marketing Export',
    pressed: false,
    idleTone: 'bg-surface-1',
    onSelect: () => {},
  },
} satisfies Meta<typeof FilterChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const Pressed: Story = { args: { pressed: true } };
