import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingEditorialBackground } from './MarketingEditorialBackground';

/**
 * Editorial-background masters (JOV-6249). Both variants render behind the
 * same approved homepage copy at desktop (1440), intermediate (768), and
 * mobile (390) widths; the receiving section keeps its own typography and
 * geometry (no second type scale), and the dark-glass frame story renders
 * beside them for material contrast.
 */
const meta = {
  title: 'Marketing/Primitives/MarketingEditorialBackground',
  component: MarketingEditorialBackground,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MarketingEditorialBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Receiving copy mirrors the locked homepage hero lines (read-only). */
const RECEIVING_COPY = {
  headline: 'Control how the world sees you.',
  support: 'Find what the internet knows. Turn it into relationships.',
} as const;

function ReceivingSection() {
  return (
    <div
      className='mx-auto flex min-h-svh w-full max-w-public-content flex-col items-center justify-center gap-4 px-6 py-24 text-primary-token sm:px-8 lg:px-10'
      data-layer='receiving-content'
    >
      <h1 className='text-4xl font-bold text-wrap:balance'>
        {RECEIVING_COPY.headline}
      </h1>
      <p className='max-w-prose-canonical text-secondary-token'>
        {RECEIVING_COPY.support}
      </p>
    </div>
  );
}

export const SoftBehindContent: Story = {
  args: { variant: 'soft', testId: 'editorial-background-soft' },
  render: args => (
    <div className='relative isolate min-h-svh w-full overflow-hidden bg-base'>
      <MarketingEditorialBackground {...args} />
      <ReceivingSection />
    </div>
  ),
};

export const FlowingBehindContent: Story = {
  args: { variant: 'flowing', testId: 'editorial-background-flowing' },
  render: args => (
    <div className='relative isolate min-h-svh w-full overflow-hidden bg-base'>
      <MarketingEditorialBackground {...args} />
      <ReceivingSection />
    </div>
  ),
};

/** Negative composition references for adversarial review are NOT shipped as
 *  stories; the contract test pins the anti-patterns textually instead. */
export const SoftOnly: Story = {
  args: { variant: 'soft' },
};

export const FlowingOnly: Story = {
  args: { variant: 'flowing' },
};
