import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingSectionIntro } from './MarketingSectionIntro';

const meta = {
  title: 'Marketing/Primitives/MarketingSectionIntro',
  component: MarketingSectionIntro,
  parameters: { layout: 'fullscreen' },
  args: {
    eyebrow: 'Artist profiles',
    title: 'One profile for every fan.',
    titleId: 'marketing-section-intro-story-title',
    description:
      'Show the release, link, or action that fits where each fan came from and what they came to do.',
    badges: [
      { label: 'Release context', testId: 'badge-release-context' },
      { label: 'Direct action', testId: 'badge-direct-action' },
    ],
    aside: (
      <div className='rounded-xl border border-subtle bg-surface-1 p-6 text-sm text-secondary-token'>
        Profile preview
      </div>
    ),
  },
  render: args => (
    <main className='bg-base p-8 text-primary-token'>
      <MarketingSectionIntro {...args} />
    </main>
  ),
} satisfies Meta<typeof MarketingSectionIntro>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithBadgesAndAside: Story = {};

export const CopyOnly: Story = {
  args: {
    badges: [],
    aside: undefined,
  },
};
