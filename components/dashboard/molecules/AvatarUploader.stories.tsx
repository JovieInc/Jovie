import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Image from 'next/image';
import { useState } from 'react';

// Mock component that mimics AvatarUploader but doesn't rely on the actual implementation
// This allows us to show different states without modifying the original component
const MockAvatarUploader = ({
  state = 'default',
  size = 'default',
  onUploaded,
  className,
}: {
  state?: 'default' | 'withAvatar' | 'uploading' | 'error' | 'disabled';
  size?: 'default' | 'small' | 'large';
  onUploaded?: (result: {
    public_id: string;
    secure_url: string;
    width: number;
    height: number;
  }) => void;
  folder?: string;
  className?: string;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(
    state === 'withAvatar'
      ? 'https://res.cloudinary.com/demo/image/upload/v1/avatars/existing-avatar.jpg'
      : null
  );
  const [loading, setLoading] = useState(state === 'uploading');
  const [error, setError] = useState(state === 'error');
  const disabled = state === 'disabled';

  const sizeClass =
    size === 'small'
      ? 'transform scale-75 origin-top-left'
      : size === 'large'
        ? 'transform scale-125 origin-top-left'
        : '';

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f) {
      // In a real component, we'd use URL.createObjectURL
      // Here we just use a placeholder image
      setPreview(
        'https://res.cloudinary.com/demo/image/upload/v1/avatars/selected-avatar.jpg'
      );
    } else {
      setPreview(null);
    }
  };

  const onUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(false);

    // Simulate API call
    setTimeout(() => {
      if (state === 'error') {
        setError(true);
        setLoading(false);
        console.error('Mock upload error');
        return;
      }

      if (state !== 'uploading') {
        // If not stuck in uploading state
        setLoading(false);
        onUploaded?.({
          public_id: 'avatars/mock-image',
          secure_url:
            'https://res.cloudinary.com/demo/image/upload/v1/avatars/mock-image.jpg',
          width: 200,
          height: 200,
        });
      }
    }, 1000);
  };

  if (disabled) {
    return (
      <div className={`${className} ${sizeClass}`}>
        <p className='text-sm text-neutral-500'>
          Avatar uploads are currently disabled.
        </p>
      </div>
    );
  }

  return (
    <div className={`${className} ${sizeClass}`}>
      <div className='flex items-center gap-4'>
        {preview ? (
          <Image
            src={preview}
            alt='Preview'
            width={80}
            height={80}
            className='rounded-full object-cover'
          />
        ) : (
          <div className='w-20 h-20 rounded-full bg-neutral-200 dark:bg-neutral-800' />
        )}
        <div className='flex flex-col gap-2'>
          <input
            type='file'
            accept='image/*'
            onChange={onSelect}
            className='block text-sm cursor-pointer'
            aria-label='Choose profile image'
          />
          <button
            type='button'
            onClick={onUpload}
            disabled={!file || loading}
            className='px-3 py-1.5 rounded bg-black text-white disabled:opacity-50 dark:bg-white dark:text-black'
          >
            {loading ? 'Uploading…' : 'Upload'}
          </button>
          {error && (
            <p className='text-sm text-red-500'>
              Upload failed. Please try again.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const meta: Meta<typeof MockAvatarUploader> = {
  title: 'Dashboard/Molecules/AvatarUploader',
  component: MockAvatarUploader,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#1a1a1a' },
      ],
    },
  },
  tags: ['autodocs'],
  argTypes: {
    state: {
      control: 'select',
      options: ['default', 'withAvatar', 'uploading', 'error', 'disabled'],
      description: 'The state of the uploader',
    },
    size: {
      control: 'select',
      options: ['default', 'small', 'large'],
      description: 'The size of the uploader',
    },
    className: {
      control: 'text',
      description: 'Additional CSS classes to apply to the component',
    },
    folder: {
      control: 'text',
      description: 'Cloudinary folder to upload the image to',
    },
    onUploaded: {
      action: 'uploaded',
      description: 'Callback function when an image is successfully uploaded',
    },
  },
  args: {
    state: 'default',
    size: 'default',
    folder: 'avatars',
  },
  decorators: [
    Story => (
      <div style={{ width: '400px', padding: '1rem' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MockAvatarUploader>;

// Default story - no avatar
export const Default: Story = {
  args: {
    state: 'default',
  },
};

// With existing avatar
export const WithExistingAvatar: Story = {
  args: {
    state: 'withAvatar',
  },
};

// Uploading state
export const Uploading: Story = {
  args: {
    state: 'uploading',
  },
};

// Error state
export const Error: Story = {
  args: {
    state: 'error',
  },
  parameters: {
    docs: {
      description: {
        story: 'This story simulates an error during the upload process.',
      },
    },
  },
};

// Disabled state
export const Disabled: Story = {
  args: {
    state: 'disabled',
  },
};

// Different sizes
export const Small: Story = {
  args: {
    size: 'small',
  },
};

export const Large: Story = {
  args: {
    size: 'large',
  },
};
