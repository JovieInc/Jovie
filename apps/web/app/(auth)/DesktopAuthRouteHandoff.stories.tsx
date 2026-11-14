import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DesktopAuthRouteHandoff } from './DesktopAuthRouteHandoff';

/**
 * /signin and /signup inside the Mac app: instead of the web auth form, the
 * route hands the visitor to their browser. Stories never press Continue In
 * Browser, which would open a real window outside the Electron bridge.
 */
const meta = {
  title: 'Auth/Desktop/DesktopAuthRouteHandoff',
  component: DesktopAuthRouteHandoff,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DesktopAuthRouteHandoff>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Long content: the options list opened in the narrowest Mac auth window, the
 * most text the handoff shows at once.
 */
export const LongContentOptionsOpen: Story = {
  decorators: [
    Story => (
      <div className='mx-auto w-80'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const disclosure = canvas.getByRole('button', {
      name: 'Other Sign-in Options',
    });
    await userEvent.click(disclosure);
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await expect(
      canvas.getByRole('button', { name: 'Copy Sign-in Link' })
    ).toBeVisible();
  },
};

/** Right-to-left: the handoff inside an Arabic document direction. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
