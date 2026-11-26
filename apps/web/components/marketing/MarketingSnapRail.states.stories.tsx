import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingSnapRail } from './MarketingSnapRail';

function Card({ children }: { readonly children: string }) {
  return (
    <div className='min-w-64 rounded-xl border border-subtle bg-surface-1 p-4 text-sm text-primary-token sm:snap-start'>
      {children}
    </div>
  );
}

const meta = {
  title: 'Marketing/MarketingSnapRail/States',
  component: MarketingSnapRail,
  parameters: { layout: 'fullscreen' },
  args: { ariaLabel: 'Release features', children: null },
} satisfies Meta<typeof MarketingSnapRail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a rail with no cards renders an empty scroller. */
export const EmptyNoCards: Story = {};

/** Partial: one card fits the rail, so both controls stay disabled. */
export const PartialSingleCard: Story = {
  args: { children: <Card>Smart links for every release</Card> },
};

/** Long content: many cards with long copy scroll horizontally. */
export const LongContentManyCards: Story = {
  args: {
    showMobileControls: true,
    children: Array.from({ length: 8 }, (_, index) => (
      <Card key={index}>
        {`Feature ${index + 1}: a long description of what this card shows, with enough copy to wrap across several lines`}
      </Card>
    )),
  },
};
