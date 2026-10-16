import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentMetricCardSkeleton } from './ContentMetricCardSkeleton';

const meta = {
  title: 'Molecules/ContentMetricCardSkeleton',
  component: ContentMetricCardSkeleton,
  parameters: { layout: 'centered' },
  args: {
    className: 'w-64',
    showIcon: true,
    showSubtitle: true,
    subtitleWidth: 'w-24',
  },
} satisfies Meta<typeof ContentMetricCardSkeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const WithoutSubtitle: Story = {
  args: { showIcon: false, showSubtitle: false },
};
export const IconChip: Story = {
  args: { layout: 'icon-chip' },
};
export const CompactIconChip: Story = {
  args: { layout: 'icon-chip', density: 'compact', showSubtitle: false },
};
export const InlineIconChip: Story = {
  args: { layout: 'icon-chip-inline', showSubtitle: false },
};
