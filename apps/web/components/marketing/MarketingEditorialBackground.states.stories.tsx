import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingEditorialBackground } from './MarketingEditorialBackground';

const meta = {
  title: 'Marketing/Backgrounds States',
  component: MarketingEditorialBackground,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <section className='relative min-h-svh overflow-hidden bg-base text-primary-token'>
        <Story />
      </section>
    ),
  ],
} satisfies Meta<typeof MarketingEditorialBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the soft master registers no curves, so only the washes paint. */
export const EmptyCurvesSoft: Story = { args: { variant: 'soft' } };
