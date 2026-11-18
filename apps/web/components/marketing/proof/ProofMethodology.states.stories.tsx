import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { listProofStats } from '@/lib/proof-stats/registry';
import { ProofMethodology } from './ProofMethodology';

const PUBLIC_STATS = listProofStats().filter(
  stat => stat.visibility === 'public'
);

const meta = {
  title: 'Marketing/Proof/ProofMethodology States',
  component: ProofMethodology,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function WithProofPage(Story) {
      return (
        <div className='bg-base px-6 py-16 text-primary-token'>
          <div className='mx-auto max-w-2xl'>
            <Story />
          </div>
        </div>
      );
    },
  ],
  args: { stats: PUBLIC_STATS },
} satisfies Meta<typeof ProofMethodology>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no public stat, so the rules and benchmark copy stand alone. */
export const EmptyRegistry: Story = {
  args: { stats: [] },
};

/** Long content: every public method written out at twice its length. */
export const LongContentMethods: Story = {
  args: {
    stats: PUBLIC_STATS.map(stat => ({
      ...stat,
      label: `${stat.label}, measured across every public profile`,
      publicMethod: `${stat.publicMethod ?? ''} ${stat.publicMethod ?? ''}`,
    })),
  },
};

/** Right-to-left: the methodology in an Arabic document direction. */
export const RtlDocument: Story = {
  args: { stats: PUBLIC_STATS.slice(0, 2) },
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
