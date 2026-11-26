import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import Link from 'next/link';
import { userEvent, within } from 'storybook/test';
import { MarketingCtaPendingLabel } from './MarketingCtaPendingLabel';

/** Rendered states of the pending CTA label inside a navigating link. */
const meta = {
  title: 'Marketing/Primitives/MarketingCtaPendingLabel/States',
  component: MarketingCtaPendingLabel,
  parameters: { layout: 'centered' },
  args: { children: 'Get started' },
} satisfies Meta<typeof MarketingCtaPendingLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

const inCtaLink: Decorator = function InCtaLink(Story) {
  return (
    <Link
      href='/signup'
      className='relative inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground'
    >
      <Story />
    </Link>
  );
};

const inRtlCtaLink: Decorator = function InRtlCtaLink(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Link
        href='/signup'
        className='relative inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground'
      >
        <Story />
      </Link>
    </div>
  );
};

/** Loading: the link is pressed, so the spinner layer replaces the label. */
export const LoadingNavigationPending: Story = {
  decorators: [inCtaLink],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('link'));
  },
};

/** Empty: a CTA whose label slot is empty, keeping the same footprint. */
export const EmptyLabel: Story = {
  args: { children: null },
  decorators: [inCtaLink],
};

/** Long content: a label that wraps inside a narrow button. */
export const LongContentLabel: Story = {
  args: {
    children: 'Claim your workspace and import every release from your catalog',
  },
  decorators: [
    Story => (
      <div className='max-w-64'>
        <Story />
      </div>
    ),
    inCtaLink,
  ],
};

/** Right-to-left: an Arabic label in an Arabic document. */
export const RtlArabicLabel: Story = {
  args: { children: 'ابدأ الآن' },
  decorators: [inRtlCtaLink],
};
