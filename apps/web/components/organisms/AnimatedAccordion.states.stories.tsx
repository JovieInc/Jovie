import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { AnimatedAccordion } from './AnimatedAccordion';

/**
 * State coverage for the animated disclosure body. These render the open
 * accordion from AnimatedAccordion.stories.tsx and change only how much the
 * caller passes inside it or the document direction.
 */
const meta = {
  title: 'Organisms/AnimatedAccordion States',
  component: AnimatedAccordion,
  parameters: {
    layout: 'centered',
  },
  args: {
    isOpen: true,
    children: null,
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnimatedAccordion>;

export default meta;
type Story = StoryObj<typeof meta>;

const LONG_ANSWER =
  'Yes. Every profile includes unlimited links, release pages, fan capture and analytics on the free plan. Pro removes the Jovie badge, adds custom domains and advanced audience insights, and you can switch plans at any time without losing a single link, subscriber or stat. This answer runs long on purpose so the panel can be checked for clean wrapping and height.';

/** Long content: a long answer grows the open panel without clipping. */
export const LongContentAnswer: Story = {
  args: {
    children: (
      <div className='rounded-lg border border-subtle bg-surface-1 p-4'>
        <p className='text-sm text-secondary-token'>{LONG_ANSWER}</p>
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(LONG_ANSWER)).toBeVisible();
  },
};

/** Right-to-left: an open Arabic answer inside an RTL document. */
export const RtlArabicAnswer: Story = {
  args: {
    children: (
      <div className='rounded-lg border border-subtle bg-surface-1 p-4'>
        <p className='text-sm text-secondary-token'>
          جوفي منصة روابط للفنانين والمبدعين.
        </p>
      </div>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' className='w-80'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('جوفي منصة روابط للفنانين والمبدعين.')
    ).toBeVisible();
  },
};
