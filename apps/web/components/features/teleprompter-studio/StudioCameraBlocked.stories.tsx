import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StudioCameraBlocked } from './StudioCameraBlocked';

const meta = {
  title: 'Features/TeleprompterStudio/StudioCameraBlocked',
  component: StudioCameraBlocked,
  parameters: { layout: 'fullscreen', themes: { themeOverride: 'dark' } },
  decorators: [
    Story => (
      <div className='min-h-96 bg-base p-8 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: { error: 'denied', onRetry: () => {}, onClose: () => {} },
} satisfies Meta<typeof StudioCameraBlocked>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Denied: Story = {};
export const NoCamera: Story = { args: { error: 'no-device' } };
export const InUse: Story = { args: { error: 'in-use' } };
export const Unsupported: Story = { args: { error: 'unsupported' } };
