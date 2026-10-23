import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Privacy' })).toBeVisible();
    await expect(canvas.queryAllByRole('heading')).toHaveLength(0);
  },
};

export const Expanded: Story = {
  render: () => (
    <div className='bg-base'>
      <MarketingFooter variant='expanded' showCta={false} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const navigation = within(
      canvas.getByRole('navigation', { name: 'Footer' })
    );
    for (const name of [
      'Product',
      'Music',
      'Company',
      'Resources',
      'Connect',
    ]) {
      const region = navigation.getByRole('region', { name });
      await expect(region).toBeVisible();
      await expect(within(region).getAllByRole('link').length).toBeGreaterThan(
        0
      );
    }
    await expect(canvas.queryAllByRole('heading')).toHaveLength(0);
  },
};
