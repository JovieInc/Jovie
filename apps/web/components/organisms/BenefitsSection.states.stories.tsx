import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { BenefitsSection } from './BenefitsSection';

/**
 * State coverage for the marketing benefits grid. These render the same
 * section as BenefitsSection.stories.tsx and change only the caller copy, the
 * benefit list or the document direction.
 */
const meta = {
  title: 'Organisms/BenefitsSection States',
  component: BenefitsSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof BenefitsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a caller that passes no benefits keeps the header and drops the grid items. */
export const EmptyBenefits: Story = {
  args: {
    benefits: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', {
        name: 'Built for musicians, optimized for conversion',
      })
    ).toBeVisible();
    await expect(canvas.queryByText('3.2x Faster Loading')).toBeNull();
  },
};

/** Partial: two of the three benefit slots filled. */
export const PartialTwoBenefits: Story = {
  args: {
    benefits: [
      {
        title: 'Instant setup',
        description: 'Live in under two minutes.',
        metric: '2 min setup',
        accent: 'blue',
      },
      {
        title: 'Real analytics',
        description: 'See exactly where your fans come from.',
        metric: 'Full funnel data',
        accent: 'green',
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Real analytics')).toBeVisible();
  },
};

const LONG_DESCRIPTION =
  'Every element is designed to turn fans into streams, from the first tap on your link to the moment they press play on their favourite service, with nothing in between that slows them down or sends them somewhere else.';

/** Long content: long header copy and six benefits wrap across rows. */
export const LongContentSixBenefits: Story = {
  args: {
    title:
      'Built for independent musicians, DJs and labels, and optimized for every fan conversion',
    description: LONG_DESCRIPTION,
    benefits: Array.from({ length: 6 }, (_, index) => ({
      title: `Benefit ${index + 1} with a deliberately long title that wraps`,
      description:
        'A long benefit description that runs across several lines so each card can be checked for wrapping and equal height.',
      metric: `Metric ${index + 1}`,
      accent: 'purple' as const,
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_DESCRIPTION)).toBeVisible();
  },
};

/** Right-to-left: Arabic header copy inside an RTL document. */
export const RtlArabicCopy: Story = {
  args: {
    title: 'مصمم للموسيقيين',
    description: 'كل عنصر مصمم لتحويل المعجبين إلى مستمعين.',
    badgeText: 'الحل',
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'مصمم للموسيقيين' })
    ).toBeVisible();
  },
};
