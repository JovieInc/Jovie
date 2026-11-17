import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { WrappedLinkMissingState } from './WrappedLinkMissingState';

/**
 * State coverage for the missing wrapped-link page. It takes no props and
 * draws fixed recovery copy, so the reachable variation is the document
 * direction around it.
 */
const meta = {
  title: 'Public/Routes/WrappedLinkMissingState States',
  component: WrappedLinkMissingState,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof WrappedLinkMissingState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the recovery card inside an RTL document. */
export const RtlDocument: Story = {
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
      canvas.getByRole('heading', { level: 2, name: 'Link Not Found' })
    ).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'Return Home' })
    ).toHaveAttribute('href', '/');
  },
};
