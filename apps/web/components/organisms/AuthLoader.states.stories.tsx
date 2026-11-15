import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { AuthLoader } from './AuthLoader';

/**
 * State coverage for the authenticated-page loader. AuthLoader is itself the
 * loading surface and takes no props; these show it before and after the
 * delayed message, and inside a right-to-left document.
 */
const meta = {
  title: 'Organisms/AuthLoader States',
  component: AuthLoader,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='flex h-64 w-full items-stretch bg-surface-0'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AuthLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the one busy status owner the route shows while it resolves. */
export const LoadingAuthenticatedRoute: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const status = canvas.getByRole('status', { name: 'Loading' });
    await expect(status).toHaveAttribute('aria-busy', 'true');
  },
};

/** Right-to-left: the centered mark and message inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='flex h-64 w-full items-stretch'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status', { name: 'Loading' })).toBeVisible();
  },
};
