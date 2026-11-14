import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, fn, within } from 'storybook/test';
import { StarRating } from './StarRating';

/** State coverage for the star rating: no rating yet, and an RTL document. */
const meta = {
  title: 'Features/Admin/Lists/StarRating States',
  component: StarRating,
  parameters: { layout: 'centered' },
  args: { value: 3, label: 'Rating for Ava', onChange: fn() },
} satisfies Meta<typeof StarRating>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no rating yet, so no star is pressed and each offers to rate. */
export const EmptyUnrated: Story = {
  args: { value: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stars = canvas.getAllByRole('button');
    await expect(stars).toHaveLength(5);
    for (const star of stars) {
      await expect(star).toHaveAttribute('aria-pressed', 'false');
    }
  },
};

function RtlDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** Right-to-left: the stars fill from the right edge. */
export const RtlRated: Story = {
  args: { label: 'تقييم ليلى' },
  decorators: [RtlDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Clear 3-star rating' })
    ).toHaveAttribute('aria-pressed', 'true');
  },
};
