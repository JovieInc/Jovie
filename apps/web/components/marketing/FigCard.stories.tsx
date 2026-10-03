import { Music, Rocket, Users } from 'lucide-react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FigCard } from './FigCard';

// Real /home ValuePropsSection cards (apps/web/components/features/home/ValuePropsSection.tsx).
const meta = {
  title: 'Marketing/FigCard',
  component: FigCard,
  args: {
    title: 'Built for artists',
    description:
      'Built around how independent artists launch, with one home for every release moment.',
    icon: <Music className='h-5 w-5' />,
  },
} satisfies Meta<typeof FigCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuiltForArtists: Story = {};

export const AutomatedReleases: Story = {
  args: {
    title: 'Automated releases',
    description:
      'Smart links and launch follow-up trigger the moment a release goes live.',
    icon: <Rocket className='h-5 w-5' />,
  },
};

export const FanIntelligence: Story = {
  args: {
    title: 'Fan intelligence',
    description:
      'See who shows up, where they came from, and what converts before the next push.',
    icon: <Users className='h-5 w-5' />,
  },
};

export const NoIcon: Story = {
  args: {
    icon: undefined,
  },
};
