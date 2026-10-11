import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MatchConfidenceBreakdown } from './MatchConfidenceBreakdown';

const meta = {
  title: 'Dashboard/Molecules/MatchConfidenceBreakdown',
  component: MatchConfidenceBreakdown,
  parameters: {
    layout: 'centered',
    // label/score/weight/description aren't props of MatchConfidenceBreakdown
    // itself — the required-props scanner also picks up the internal, non-
    // exported ScoreRowProps interface in the same file.
    jovie: { uncoveredProps: ['label', 'score', 'weight', 'description'] },
  },
  render: args => (
    <div className='w-80'>
      <MatchConfidenceBreakdown {...args} />
    </div>
  ),
} satisfies Meta<typeof MatchConfidenceBreakdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HighConfidence: Story = {
  args: {
    breakdown: {
      isrcMatchScore: 0.95,
      upcMatchScore: 0.9,
      nameSimilarityScore: 0.98,
      followerRatioScore: 0.8,
      genreOverlapScore: 0.85,
    },
    totalScore: 0.92,
  },
};

export const MediumConfidence: Story = {
  args: {
    breakdown: {
      isrcMatchScore: 0.6,
      upcMatchScore: 0.5,
      nameSimilarityScore: 0.7,
      followerRatioScore: 0.4,
      genreOverlapScore: 0.55,
    },
    totalScore: 0.6,
  },
};

export const LowConfidence: Story = {
  args: {
    breakdown: {
      isrcMatchScore: 0.1,
      upcMatchScore: 0.05,
      nameSimilarityScore: 0.4,
      followerRatioScore: 0.2,
      genreOverlapScore: 0.15,
    },
    totalScore: 0.2,
  },
};
