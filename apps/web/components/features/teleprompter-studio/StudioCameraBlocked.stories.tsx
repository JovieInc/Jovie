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

export const PermissionDenied: Story = {};
export const ErrorNoCamera: Story = { args: { error: 'no-device' } };
export const ErrorInUse: Story = { args: { error: 'in-use' } };
export const ErrorUnsupported: Story = { args: { error: 'unsupported' } };
export const ErrorUnknown: Story = { args: { error: 'unknown' } };
export const Rtl: Story = {
  render: args => (
    <div dir='rtl'>
      <StudioCameraBlocked {...args} />
    </div>
  ),
};
