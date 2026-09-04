import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingSectionIntro } from './MarketingSectionIntro';

const meta = {
  title: 'Marketing/Primitives/MarketingSectionIntro',
  component: MarketingSectionIntro,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base px-6 py-16 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarketingSectionIntro>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    eyebrow: 'Inside Jovie',
    title: 'Your release work, connected.',
    description:
      'A shared view of releases, profiles, and fan activity so the next useful action is always in reach.',
  },
};

export const WithBadges: Story = {
  args: {
    eyebrow: 'The platform',
    title: 'One profile for every fan.',
    titleId: 'marketing-section-intro-badges',
    description:
      'Show the next useful release, link, or action without bolting on a separate stack.',
    badges: [
      { label: 'Presaves' },
      { label: 'Release day' },
      { label: 'Fan capture' },
    ],
  },
};

export const WithAside: Story = {
  args: {
    eyebrow: 'Fan intelligence',
    title: 'Know every fan by name.',
    description:
      'Carry source, context, and the next follow-up in the same surface the artist already uses.',
    aside: (
      <div className='rounded-2xl border border-subtle bg-surface-1 p-6 text-sm text-secondary-token'>
        Capture intent before release day and convert it into day-one streams.
      </div>
    ),
  },
};
