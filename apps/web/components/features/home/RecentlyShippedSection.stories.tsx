import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RecentlyShippedSection } from './RecentlyShippedSection';

const meta = {
  title: 'Marketing/RecentlyShippedSection',
  component: RecentlyShippedSection,
  parameters: {
    layout: 'fullscreen',
  },
  // Server component that reads CHANGELOG.md through node:fs while
  // rendering; the browser a11y runner cannot load it. Its rendered output
  // is covered by RecentlyShippedSection.test.tsx.
  tags: ['no-vitest'],
} satisfies Meta<typeof RecentlyShippedSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
