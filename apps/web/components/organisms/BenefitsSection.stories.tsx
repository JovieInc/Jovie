import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BenefitsSection } from './BenefitsSection';

const meta = {
  title: 'Organisms/BenefitsSection',
  component: BenefitsSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof BenefitsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomCopy: Story = {
  args: {
    title: 'Everything you need to grow',
    description: 'Purpose-built tools for independent artists.',
    badgeText: 'Why Jovie',
  },
};

export const TwoBenefits: Story = {
  args: {
    benefits: [
      {
        title: 'Instant setup',
        description: 'Live in under two minutes.',
        metric: '2 min setup',
        accent: 'blue',
      },
      {
        title: 'Real analytics',
        description: 'See exactly where your fans come from.',
        metric: 'Full funnel data',
        accent: 'green',
      },
    ],
  },
};
