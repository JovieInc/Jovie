import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContentShell } from './MarketingContentShell';

const meta = {
  title: 'Marketing/Shells/MarketingContentShell',
  component: MarketingContentShell,
  parameters: { layout: 'fullscreen' },
  args: {
    children: (
      <article className='space-y-5'>
        <h1 className='marketing-h2-linear text-primary-token'>
          Release notes
        </h1>
        <p>
          Keep the context, credits, and next action in one calm reading
          surface.
        </p>
        <p>Jovie keeps every release decision close to the work.</p>
      </article>
    ),
  },
  render: args => (
    <main className='bg-base text-primary-token'>
      <MarketingContentShell {...args} />
    </main>
  ),
} satisfies Meta<typeof MarketingContentShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Canonical: Story = {};

export const WithPageHook: Story = {
  args: {
    className: 'marketing-content-page',
  },
};
