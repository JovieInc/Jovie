import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HIDDEN_FIXTURE, resolvedFixture } from './fixtures/proof-fixtures';
import { ProofStatBanner } from './ProofStatBanner';

const meta = {
  title: 'Marketing/Proof/ProofStatBanner',
  component: ProofStatBanner,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-xl'>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ProofStatBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Publishable: Story = {
  args: { stat: resolvedFixture(), showMethodology: true },
};

export const StaleShowsFallback: Story = {
  args: { stat: HIDDEN_FIXTURE, whenUnavailable: 'fallback' },
};

export const StaleHidden: Story = {
  args: { stat: HIDDEN_FIXTURE },
};
