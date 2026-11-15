import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { marketingFullscreenParameters } from '../marketing/storybook/marketingStoryMeta';
import { SupportPageContent } from './SupportPageContent';

/**
 * State coverage for the /support body. It takes no props and draws fixed
 * SUPPORT_PAGE_COPY, so the reachable variation is the document direction.
 */
const meta = {
  title: 'Marketing/Routes/Support States',
  component: SupportPageContent,
  parameters: marketingFullscreenParameters,
} satisfies Meta<typeof SupportPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: hero, help paths and email fallback in an RTL document. */
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
      canvas.getByRole('heading', { level: 1, name: "We're here to help." })
    ).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'Browse the Help Center' })
    ).toBeVisible();
  },
};
