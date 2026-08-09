import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContentProse } from './MarketingContentProse';

const meta = {
  title: 'Marketing/Components/MarketingContentProse',
  component: MarketingContentProse,
  parameters: { layout: 'fullscreen' },
  args: {
    ariaLabel: 'Article content',
    html: '<h2 id="release-rhythm">Release rhythm</h2><p>Ship something every Friday. Keep the context, credits, and next action in one calm reading surface.</p><p><a href="/blog">Read more</a></p>',
  },
  render: args => (
    <main className='bg-base p-8 text-primary-token'>
      <MarketingContentProse {...args} />
    </main>
  ),
} satisfies Meta<typeof MarketingContentProse>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Canonical: Story = {};
