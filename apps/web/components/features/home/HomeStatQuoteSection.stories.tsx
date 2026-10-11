import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeStatQuoteSection } from './HomeStatQuoteSection';

const meta = {
  title: 'Features/Home/HomeStatQuoteSection',
  component: HomeStatQuoteSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeStatQuoteSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
