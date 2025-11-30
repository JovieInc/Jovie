import type { Meta, StoryObj } from '@storybook/react';
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
    docs: {
      description: {
        component:
          'Uploadable Avatar component with radial progress, drag & drop functionality, and accessibility support. Features world-class UX with visual feedback and analytics tracking.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    uploadable: {
      control: 'boolean',
      description: 'Enable upload functionality (controlled by feature flag)',
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl'],
      description: 'Avatar size',
    },
    progress: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
      description: 'Upload progress percentage (0-100)',
    },
    showHoverOverlay: {
      control: 'boolean',
      description: 'Show upload overlay on hover',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Mock upload function for stories
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockUpload = (_file: File): Promise<string> => {
  // File param needed for signature but unused in mock
  return new Promise((resolve, reject) => {
    // Simulate random success/failure for demo
    const shouldSucceed = Math.random() > 0.3; // 70% success rate

    setTimeout(() => {
      if (shouldSucceed) {
        // Return a mock image URL
        resolve(
          `https://images.unsplash.com/photo-${Math.random().toString().substr(2, 9)}?w=100&h=100&fit=crop&crop=face`
        );
      } else {
        reject(new Error('Mock upload failure for demo purposes'));
      }
    }, 2000); // 2 second delay
  });
};

// Interactive Story Component
function InteractiveStory(args: AvatarUploadableProps) {
  const [avatarSrc, setAvatarSrc] = useState<string | null>(
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File): Promise<string> => {
    setError(null);
    setProgress(0);

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + Math.random() * 15;
      });
    }, 200);

    try {
      const newUrl = await mockUpload(file);
      setProgress(100);
      setAvatarSrc(newUrl);
      return newUrl;
    } catch (error) {
      clearInterval(progressInterval);
      const errorMessage =
        error instanceof Error ? error.message : 'Upload failed';
      setError(errorMessage);
      throw error;
    }
  };

  return (
    <div className='space-y-4'>
      <AvatarUploadable
        {...args}
        src={avatarSrc}
        onUpload={handleUpload}
        progress={progress}
        onSuccess={url => console.log('Upload success:', url)}
        onError={err => setError(err)}
      />

      {error && <div className='text-red-600 text-sm mt-2'>Error: {error}</div>}

      <div className='text-sm text-gray-600'>
        Try dragging an image file onto the avatar or clicking to select a file.
        <br />
        <em>Note: This is a demo with simulated upload (70% success rate).</em>
      </div>
    </div>
  );
}

// Interactive upload demo
export const Interactive: Story = {
  render: args => <InteractiveStory {...args} />,
  args: {
    uploadable: true,
    alt: 'Profile photo',
    name: 'John Doe',
    size: 'xl',
    showHoverOverlay: true,
  },
};

// Display-only mode
export const DisplayOnly: Story = {
  args: {
    src: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
    uploadable: false,
    alt: 'User avatar',
    name: 'Jane Smith',
    size: 'lg',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Avatar in display-only mode with no upload functionality - perfect for public profiles and read-only contexts.',
      },
    },
  },
};

// Different sizes with upload enabled
export const UploadableSizes: Story = {
  render: () => {
    const sizes: Array<'sm' | 'md' | 'lg' | 'xl' | '2xl'> = [
      'sm',
      'md',
      'lg',
      'xl',
      '2xl',
    ];

    return (
      <div className='flex items-center space-x-8'>
        {sizes.map(size => (
          <div key={size} className='text-center space-y-2'>
            <AvatarUploadable
              src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
              uploadable={true}
              alt={`Avatar ${size}`}
              name='User'
              size={size}
              onUpload={mockUpload}
            />
            <div className='text-xs text-gray-600'>{size}</div>
          </div>
        ))}
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Uploadable avatars in different sizes, all with hover and interaction states.',
      },
    },
  },
};

// Progress states
export const ProgressStates: Story = {
  render: () => (
    <div className='flex items-center space-x-8'>
      <div className='text-center space-y-2'>
        <AvatarUploadable
          src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
          uploadable={true}
          alt='Uploading'
          name='User'
          size='lg'
          progress={0}
          onUpload={mockUpload}
        />
        <div className='text-xs'>Idle (0%)</div>
      </div>

      <div className='text-center space-y-2'>
        <AvatarUploadable
          src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
          uploadable={true}
          alt='Uploading'
          name='User'
          size='lg'
          progress={25}
          onUpload={mockUpload}
        />
        <div className='text-xs'>25% Progress</div>
      </div>

      <div className='text-center space-y-2'>
        <AvatarUploadable
          src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
          uploadable={true}
          alt='Uploading'
          name='User'
          size='lg'
          progress={75}
          onUpload={mockUpload}
        />
        <div className='text-xs'>75% Progress</div>
      </div>

      <div className='text-center space-y-2'>
        <AvatarUploadable
          src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
          uploadable={true}
          alt='Uploading'
          name='User'
          size='lg'
          progress={100}
          onUpload={mockUpload}
        />
        <div className='text-xs'>Complete (100%)</div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Different progress states showing the radial progress animation.',
      },
    },
  },
};

// Without hover overlay
export const NoHoverOverlay: Story = {
  args: {
    src: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
    uploadable: true,
    alt: 'Profile photo',
    name: 'User Name',
    size: 'lg',
    showHoverOverlay: false,
    onUpload: mockUpload,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Uploadable avatar without hover overlay - still supports drag & drop and click to upload.',
      },
    },
  },
};

// Fallback with upload
export const FallbackUploadable: Story = {
  args: {
    src: null,
    uploadable: true,
    alt: 'Upload profile photo',
    name: 'New User',
    size: 'xl',
    onUpload: mockUpload,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Uploadable avatar starting with no image, showing initials fallback with upload capability.',
      },
    },
  },
};

// Different rounded styles with upload
export const RoundedUploadable: Story = {
  render: () => {
    const roundedOptions: Array<'none' | 'sm' | 'md' | 'lg' | 'full'> = [
      'none',
      'sm',
      'md',
      'lg',
      'full',
    ];

    return (
      <div className='flex items-center space-x-6'>
        {roundedOptions.map(rounded => (
          <div key={rounded} className='text-center space-y-2'>
            <AvatarUploadable
              src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
              uploadable={true}
              alt={`Avatar ${rounded}`}
              name='User'
              size='lg'
              rounded={rounded}
              onUpload={mockUpload}
            />
            <div className='text-xs text-gray-600'>{rounded}</div>
          </div>
        ))}
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Uploadable avatars with different rounded corner styles.',
      },
    },
  },
};
