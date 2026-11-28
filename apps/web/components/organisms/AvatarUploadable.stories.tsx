import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import {
  AvatarUploadable,
  type AvatarUploadableProps,
} from './AvatarUploadable';

const meta: Meta<typeof AvatarUploadable> = {
  title: 'Molecules/AvatarUploadable',
  component: AvatarUploadable,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#0a0a0a' },
      ],
    },
  },
  args: {
    alt: 'Profile photo',
    name: 'Jordan Lee',
    size: 'lg',
    uploadable: true,
    showHoverOverlay: true,
  },
};

export default meta;
type Story = StoryObj<typeof AvatarUploadable>;

function WithState(props: AvatarUploadableProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&auto=format&fit=crop'
  );
  const [progress, setProgress] = useState(0);

  const handleUpload = async (file: File) => {
    setProgress(0);
    await new Promise<void>(resolve => {
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            resolve();
            return 90;
          }
          return prev + 15;
        });
      }, 120);
    });

    const url = URL.createObjectURL(file);
    setAvatarUrl(url);
    setProgress(100);
    return url;
  };

  return (
    <div className='space-y-3 text-center'>
      <AvatarUploadable
        {...props}
        src={avatarUrl}
        onUpload={handleUpload}
        onSuccess={url => setAvatarUrl(url)}
        progress={progress}
      />
      <p className='text-sm text-secondary-token'>
        Simulated upload with progress
      </p>
    </div>
  );
}

export const Uploadable: Story = {
  render: args => <WithState {...args} />,
};

export const ReadOnly: Story = {
  args: {
    src: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&auto=format&fit=crop',
    uploadable: false,
  },
};

/** Rejected upload face — progress ring settles on error. */
export const ErrorUploadFailed: Story = {
  render: args => {
    const fail = async () => {
      await new Promise(r => setTimeout(r, 80));
      throw new globalThis.Error('Upload failed — try again');
    };
    return (
      <AvatarUploadable
        {...args}
        src={null}
        uploadable
        onUpload={fail}
        onError={() => undefined}
      />
    );
  },
};

/** Mid-upload with optional props left sparse (no hover overlay). */
export const Partial: Story = {
  args: {
    src: null,
    name: 'A',
    alt: 'A',
    uploadable: true,
    showHoverOverlay: false,
    progress: 42,
    onUpload: async () => {
      await new Promise(r => setTimeout(r, 10_000));
      return 'https://example.com/avatar.jpg';
    },
  },
};

/** Long accessible name pressure on the upload control. */
export const LongContent: Story = {
  args: {
    name: 'Jordan Alexandra Montgomery-Lee of the Northern Lights Collective Ensemble',
    alt: 'Jordan Alexandra Montgomery-Lee of the Northern Lights Collective Ensemble profile photo',
    src: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&auto=format&fit=crop',
    uploadable: true,
    onUpload: async file => URL.createObjectURL(file),
  },
};

/** RTL frame with a long name. */
export const Rtl: Story = {
  render: args => (
    <div dir='rtl' className='w-40'>
      <AvatarUploadable
        {...args}
        name='فنان الموسيقى التجريبية المعاصرة'
        alt='صورة الملف الشخصي لفنان الموسيقى التجريبية المعاصرة'
        src='https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&auto=format&fit=crop'
        uploadable
        onUpload={async file => URL.createObjectURL(file)}
      />
    </div>
  ),
};
