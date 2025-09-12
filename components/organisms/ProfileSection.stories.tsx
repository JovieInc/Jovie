import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '@/components/ui/Button';
import { Artist } from '@/types/db';
import { ProfileSection } from './ProfileSection';

const meta: Meta<typeof ProfileSection> = {
  title: 'Organisms/ProfileSection',
  component: ProfileSection,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    containerVariant: {
      control: { type: 'select' },
      options: ['default', 'glass', 'solid'],
    },
    backgroundPattern: {
      control: { type: 'select' },
      options: ['grid', 'dots', 'gradient', 'none'],
    },
    avatarSize: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl', '2xl'],
    },
    nameSize: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockArtist: Artist = {
  id: '1',
  handle: 'taylorswift',
  name: 'Taylor Swift',
  image_url:
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=face',
  tagline:
    'Grammy Award-winning singer-songwriter known for narrative songs about her personal life.',
  is_verified: true,
  owner_user_id: '1',
  spotify_id: '',
  published: true,
  is_featured: false,
  created_at: new Date().toISOString(),
  marketing_opt_out: false,
};

export const Default: Story = {
  args: {
    artist: mockArtist,
  },
};

export const WithSubtitle: Story = {
  args: {
    artist: mockArtist,
    subtitle: 'Live at Madison Square Garden 2024',
  },
};

export const WithActions: Story = {
  args: {
    artist: mockArtist,
    children: (
      <div className='space-y-4 w-full'>
        <Button className='w-full' size='lg'>
          Listen Now
        </Button>
        <div className='grid grid-cols-2 gap-3'>
          <Button variant='outline'>Follow</Button>
          <Button variant='outline'>Share</Button>
        </div>
      </div>
    ),
  },
};

export const GlassVariant: Story = {
  args: {
    artist: mockArtist,
    containerVariant: 'glass',
    children: (
      <Button className='w-full' size='lg'>
        Listen Now
      </Button>
    ),
  },
};

export const SolidVariant: Story = {
  args: {
    artist: mockArtist,
    containerVariant: 'solid',
    children: (
      <Button className='w-full' size='lg'>
        Listen Now
      </Button>
    ),
  },
};

export const DotsBackground: Story = {
  args: {
    artist: mockArtist,
    backgroundPattern: 'dots',
    children: (
      <Button className='w-full' size='lg'>
        Listen Now
      </Button>
    ),
  },
};

export const GradientBackground: Story = {
  args: {
    artist: mockArtist,
    backgroundPattern: 'gradient',
    containerVariant: 'glass',
    children: (
      <Button className='w-full' size='lg'>
        Listen Now
      </Button>
    ),
  },
};

export const NoBackground: Story = {
  args: {
    artist: mockArtist,
    backgroundPattern: 'none',
    showGradientBlurs: false,
    containerVariant: 'solid',
    children: (
      <Button className='w-full' size='lg'>
        Listen Now
      </Button>
    ),
  },
};

export const SmallProfile: Story = {
  args: {
    artist: mockArtist,
    avatarSize: 'sm',
    nameSize: 'sm',
    maxWidthClass: 'w-full max-w-xs',
    children: (
      <Button className='w-full' size='sm'>
        Follow
      </Button>
    ),
  },
};

export const LargeProfile: Story = {
  args: {
    artist: mockArtist,
    avatarSize: 'xl',
    nameSize: 'xl',
    maxWidthClass: 'w-full max-w-lg',
    children: (
      <div className='space-y-6 w-full'>
        <Button className='w-full' size='lg'>
          Listen Now
        </Button>
        <div className='text-center text-gray-600 dark:text-gray-400'>
          <p>Latest album: &quot;Midnights&quot; • 2022</p>
          <p>13 tracks • 44 minutes</p>
        </div>
      </div>
    ),
  },
};

export const CompleteProfile: Story = {
  args: {
    artist: mockArtist,
    children: (
      <div className='space-y-6 w-full'>
        <Button className='w-full' size='lg'>
          Listen Now
        </Button>

        <div className='grid grid-cols-3 gap-3'>
          <Button variant='outline' size='sm'>
            Follow
          </Button>
          <Button variant='outline' size='sm'>
            Share
          </Button>
          <Button variant='outline' size='sm'>
            Tip
          </Button>
        </div>

        <div className='text-center space-y-2'>
          <div className='flex justify-center space-x-4 text-sm text-gray-600 dark:text-gray-400'>
            <span>12.4M followers</span>
            <span>•</span>
            <span>85 releases</span>
          </div>
        </div>
      </div>
    ),
  },
};
