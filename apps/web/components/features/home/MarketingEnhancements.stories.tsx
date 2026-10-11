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
          'Idle-loads MarketingScrollUnlock and ScrollRevealInit — both behavior-only (scroll listeners), so this renders no visible DOM once mounted.',
      },
    },
  },
} satisfies Meta<typeof MarketingEnhancements>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
