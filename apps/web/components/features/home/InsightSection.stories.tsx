import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InsightSection } from './InsightSection';

const meta = {
  title: 'Marketing/Sections/InsightSection',
  component: InsightSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof InsightSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
