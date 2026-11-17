import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { VoicePageContent } from './VoicePageContent';

/**
 * State coverage for the /voice body. It takes no props and draws fixed
 * copy and VOICE_PAGE_STEPS, so the reachable variation is the document
 * direction.
 */
const meta = {
  title: 'Marketing/Routes/Voice States',
  component: VoicePageContent,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof VoicePageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: hero, steps, consent card and closing band in an RTL document. */
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
      canvas.getByRole('heading', { name: 'Your Voice. Trained. Ready.' })
    ).toBeVisible();
  },
};
