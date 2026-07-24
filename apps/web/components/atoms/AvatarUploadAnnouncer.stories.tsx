import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AvatarUploadAnnouncer } from './AvatarUploadAnnouncer';

const meta: Meta<typeof AvatarUploadAnnouncer> = {
  title: 'Atoms/AvatarUploadAnnouncer',
  component: AvatarUploadAnnouncer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A screen-reader-only component that announces avatar upload progress and status.',
      },
    },
  },
  argTypes: {
    progress: {
      control: { type: 'range', min: 0, max: 100, step: 10 },
      description: 'Upload progress percentage',
    },
    status: {
      control: 'select',
      options: ['idle', 'uploading', 'success', 'error'],
      description: 'Current upload status',
    },
  },
};

export default meta;
type Story = StoryObj<typeof AvatarUploadAnnouncer>;

export const Idle: Story = {
  args: {
    progress: 0,
    status: 'idle',
  },
  parameters: {
    docs: {
      description: {
        story: 'No announcement when idle (progress is 0).',
      },
    },
  },
};

export const Uploading: Story = {
  args: {
    progress: 50,
    status: 'uploading',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Announces progress percentage. Check the DOM for sr-only content.',
      },
    },
  },
};

export const Success: Story = {
  args: {
    progress: 100,
    status: 'success',
  },
  parameters: {
    docs: {
      description: {
        story: 'Announces successful upload completion.',
      },
    },
  },
};

export const Error: Story = {
  args: {
    progress: 45,
    status: 'error',
  },
  parameters: {
    docs: {
      description: {
        story: 'Announces upload failure with assertive aria-live.',
      },
    },
  },
};

export const VisualDemo: Story = {
  render: () => (
    <div className='space-y-4'>
      <p className='text-sm text-secondary-token'>
        This component renders screen-reader-only content. Open your browser
        DevTools to inspect the DOM and see the aria-live regions.
      </p>
      <div className='rounded-lg border border-subtle bg-surface-1 p-4'>
        <h3 className='mb-2 font-medium'>Uploading (50%)</h3>
        <AvatarUploadAnnouncer progress={50} status='uploading' />
        <code className='text-xs text-secondary-token'>
          &lt;div aria-live=&quot;polite&quot;&gt;Uploading profile photo: 50%
          complete&lt;/div&gt;
        </code>
      </div>
      <div className='rounded-lg border border-subtle bg-surface-1 p-4'>
        <h3 className='mb-2 font-medium'>Success</h3>
        <AvatarUploadAnnouncer progress={100} status='success' />
        <code className='text-xs text-secondary-token'>
          &lt;div aria-live=&quot;polite&quot;&gt;Profile photo uploaded
          successfully&lt;/div&gt;
        </code>
      </div>
      <div className='rounded-lg border border-subtle bg-surface-1 p-4'>
        <h3 className='mb-2 font-medium'>Error</h3>
        <AvatarUploadAnnouncer progress={45} status='error' />
        <code className='text-xs text-secondary-token'>
          &lt;div aria-live=&quot;assertive&quot;&gt;Profile photo upload
          failed&lt;/div&gt;
        </code>
      </div>
    </div>
  ),
};
