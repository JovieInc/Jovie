import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MatchConfidenceBreakdown } from './MatchConfidenceBreakdown';

const mediumBreakdown = {
  isrcMatchScore: 0.6,
  upcMatchScore: 0.5,
  nameSimilarityScore: 0.7,
  followerRatioScore: 0.4,
  genreOverlapScore: 0.5,
};

/**
 * Rendered states of the confidence breakdown. The confidence levels live in
 * MatchConfidenceBreakdown.stories.tsx.
 */
const meta = {
  title: 'Dashboard/Molecules/MatchConfidenceBreakdown/States',
  component: MatchConfidenceBreakdown,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['label', 'score', 'weight', 'description'] },
  },
  args: { breakdown: mediumBreakdown, totalScore: 0.58 },
  render: function BreakdownStory(args) {
    return (
      <div className='w-80'>
        <MatchConfidenceBreakdown {...args} />
      </div>
    );
  },
} satisfies Meta<typeof MatchConfidenceBreakdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no signal matched, so every bar is empty and the total is 0%. */
export const EmptyNoSignals: Story = {
  args: {
    breakdown: {
      isrcMatchScore: 0,
      upcMatchScore: 0,
      nameSimilarityScore: 0,
      followerRatioScore: 0,
      genreOverlapScore: 0,
    },
    totalScore: 0,
  },
};

/** Long content: the rows squeezed into a narrow column so labels wrap. */
export const LongContentNarrowColumn: Story = {
  render: function LongContentNarrowColumnStory(args) {
    return (
      <div className='w-48'>
        <MatchConfidenceBreakdown {...args} />
      </div>
    );
  },
};

/** Right-to-left: the breakdown in an Arabic RTL document. */
export const RtlArabicDocument: Story = {
  render: function RtlArabicDocumentStory(args) {
    return (
      <div dir='rtl' lang='ar' className='w-80'>
        <MatchConfidenceBreakdown {...args} />
      </div>
    );
  },
};
