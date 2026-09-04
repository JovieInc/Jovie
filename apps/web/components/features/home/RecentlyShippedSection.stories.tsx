import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RecentlyShippedSection } from './RecentlyShippedSection';

const meta = {
  title: 'Marketing/RecentlyShippedSection',
  component: RecentlyShippedSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof RecentlyShippedSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
