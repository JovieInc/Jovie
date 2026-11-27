import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingEnhancements } from './MarketingEnhancements';

const meta = {
  title: 'Features/Home/MarketingEnhancements',
  component: MarketingEnhancements,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Idle-loads MarketingScrollUnlock. Scroll reveals are CSS-only (view timelines); this mounts no reveal observer.',
      },
    },
  },
} satisfies Meta<typeof MarketingEnhancements>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
