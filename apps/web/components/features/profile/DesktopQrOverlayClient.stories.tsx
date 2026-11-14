import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DesktopQrOverlayClient } from './DesktopQrOverlayClient';

const meta = {
  title: 'Profile/DesktopQrOverlayClient',
  component: DesktopQrOverlayClient,
  parameters: { layout: 'fullscreen' },
  args: {
    handle: 'tim',
  },
  decorators: [
    Story => (
      <div className='min-h-80 bg-base'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DesktopQrOverlayClient>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Desktop with a fine pointer: the quiet phone icon in the corner. */
export const Desktop: Story = {};

/**
 * Offline: the visitor opens the card but the QR image cannot load, so the
 * card keeps its frame and shows the unavailable fallback. The play function
 * fires the image's error event so the state is fixed.
 */
export const OfflineQrUnavailable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Open On Phone' })
    );
    const image = await canvas.findByRole('img', {
      name: 'Scan To Open This Profile On Your Phone',
    });
    image.dispatchEvent(new Event('error'));
    await waitFor(() =>
      expect(canvas.getByText('QR code unavailable')).toBeVisible()
    );
  },
};
