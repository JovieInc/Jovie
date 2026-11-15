import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { BrandingBadge } from './BrandingBadge';

/**
 * State coverage for the profile footer badge. The badge takes no props and
 * draws one fixed line, so the only state a caller can change is the
 * document direction around it.
 */
const meta = {
  title: 'Organisms/BrandingBadge States',
  component: BrandingBadge,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof BrandingBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the badge inside an RTL profile footer. */
export const RtlProfileFooter: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='w-80 p-4 text-center'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Made with Jovie')).toBeVisible();
  },
};
