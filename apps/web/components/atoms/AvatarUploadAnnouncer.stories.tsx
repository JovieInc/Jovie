import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AvatarUploadAnnouncer } from './AvatarUploadAnnouncer';

/**
 * `AvatarUploadAnnouncer` renders visually-hidden `aria-live` regions only —
 * there is nothing to see. Each story exposes the live-region text via a
 * visible caption so the announcement content can be reviewed here.
 */
const meta = {
  title: 'Atoms/AvatarUploadAnnouncer',
  component: AvatarUploadAnnouncer,
  parameters: {
    layout: 'centered',
  },
  args: {
    progress: 0,
    status: 'idle',
  },
  render: args => (
    <div className='flex flex-col items-center gap-3 text-app text-secondary-token'>
      <p>Screen-reader-only announcement (sr-only region shown for review):</p>
      <div className='rounded-md border border-subtle bg-surface-1 px-3 py-2 text-primary-token'>
        <AvatarUploadAnnouncer {...args} />
        {args.progress > 0 &&
          `Uploading profile photo: ${Math.round(args.progress)}% complete`}
        {args.status === 'success' && 'Profile photo uploaded successfully'}
        {args.status === 'error' && 'Profile photo upload failed'}
        {args.progress === 0 && args.status === 'idle' && 'No announcement'}
      </div>
    </div>
  ),
} satisfies Meta<typeof AvatarUploadAnnouncer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Uploading: Story = {
  args: {
    progress: 42,
    status: 'uploading',
  },
};

export const Success: Story = {
  args: {
    progress: 100,
    status: 'success',
  },
};

export const Error: Story = {
  args: {
    progress: 0,
    status: 'error',
  },
};
