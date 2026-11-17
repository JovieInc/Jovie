import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HIDDEN_FIXTURE, resolvedFixture } from './fixtures/proof-fixtures';
import { ProofStatBanner } from './ProofStatBanner';

const meta = {
  title: 'Marketing/Proof/ProofStatBanner States',
  component: ProofStatBanner,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function WithProofPage(Story) {
      return (
        <div className='bg-base px-6 py-16 text-primary-token'>
          <div className='mx-auto max-w-xl'>
            <Story />
          </div>
        </div>
      );
    },
  ],
  args: { stat: resolvedFixture() },
} satisfies Meta<typeof ProofStatBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no resolved stat, so the banner renders nothing. */
export const EmptyNoStat: Story = {
  args: { stat: null, whenUnavailable: 'fallback' },
};

/** Partial: a publishable sentence without a methodology link. */
export const PartialNoMethodology: Story = {
  args: {
    stat: resolvedFixture({ methodology: null }),
    showMethodology: true,
  },
};

/** Long content: a long sentence wraps beside its methodology link. */
export const LongContentSentence: Story = {
  args: {
    stat: resolvedFixture({
      sentence:
        'Trusted by 100k+ artists, managers, labels and the teams behind every release, on every continent',
    }),
    showMethodology: true,
  },
};

/** Long content: a long fallback line for a stale stat. */
export const LongContentFallback: Story = {
  args: {
    stat: {
      ...HIDDEN_FIXTURE,
      fallback:
        'Built for artists, managers, labels and the teams behind them, from the first demo to the tour',
    },
    whenUnavailable: 'fallback',
  },
};

/** Right-to-left: an Arabic sentence in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    stat: resolvedFixture({ sentence: 'يثق بنا أكثر من 100 ألف فنان' }),
    showMethodology: true,
  },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
