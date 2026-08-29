import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContainer } from './MarketingContainer';

const meta = {
  title: 'Marketing/Primitives/MarketingContainer',
  component: MarketingContainer,
  parameters: { layout: 'fullscreen' },
  args: {
    width: 'page',
    children: (
      <div className='rounded-xl border border-subtle bg-surface-1 p-6 text-primary-token'>
        Page-width content
      </div>
    ),
  },
  render: args => (
    <main className='bg-base py-12 text-primary-token'>
      <MarketingContainer {...args} />
    </main>
  ),
} satisfies Meta<typeof MarketingContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {};

export const Landing: Story = {
  args: {
    width: 'landing',
    children: (
      <div className='rounded-xl border border-subtle bg-surface-1 p-6 text-primary-token'>
        Landing-width content
      </div>
    ),
  },
};

export const Prose: Story = {
  args: {
    width: 'prose',
    children: (
      <p className='text-secondary-token'>
        Prose-width content keeps long-form reading comfortable.
      </p>
    ),
  },
};
