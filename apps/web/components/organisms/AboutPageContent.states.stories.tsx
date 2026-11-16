import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { ABOUT_COPY } from '@/data/aboutCopy';
import { marketingFullscreenParameters } from '../marketing/storybook/marketingStoryMeta';
import { AboutPageContent } from './AboutPageContent';

/**
 * State coverage for the /about body. It takes no props and draws fixed
 * ABOUT_COPY, so the reachable variation is the document direction.
 */
const meta = {
  title: 'Marketing/Routes/About States',
  component: AboutPageContent,
  parameters: marketingFullscreenParameters,
} satisfies Meta<typeof AboutPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the label and body grid inside an RTL document. */
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
      canvas.getByRole('heading', { level: 1, name: ABOUT_COPY.headline })
    ).toBeVisible();
  },
};
