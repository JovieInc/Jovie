import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { listProofStats } from '@/lib/proof-stats/registry';
import { ProofMethodology } from './ProofMethodology';

const meta = {
  title: 'Marketing/Proof/ProofMethodology',
  component: ProofMethodology,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-2xl'>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ProofMethodology>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FromRegistry: Story = {
  args: { stats: listProofStats() },
};
