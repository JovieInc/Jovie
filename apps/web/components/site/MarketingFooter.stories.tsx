import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { marketingFullscreenParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { MarketingFooter } from './MarketingFooter';

const meta = {
  title: 'Site/MarketingFooter',
  component: MarketingFooter,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component:
          'Adjacent component coverage for the canonical shell.footer story. The central Marketing/Shells catalog owns the registry identity.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarketingFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Minimal: Story = {
  render: () => (
    <div className='bg-base'>
      <MarketingFooter variant='minimal' showCta={false} />
    </div>
  ),
};

export const Expanded: Story = {
  render: () => (
    <div className='bg-base'>
      <MarketingFooter variant='expanded' showCta={false} />
    </div>
  ),
};
