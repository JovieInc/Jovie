import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Artist, LegacySocialLink } from '@/types/db';
import { ProfileShell } from './profile-shell/ProfileShell';

// Mock data for the stories
const mockArtist: Artist = {
  id: '1',
  owner_user_id: 'user123',
  handle: 'artistname',
  spotify_id: 'spotify123',
  name: 'Artist Name',
  image_url: 'https://placehold.co/400x400',
  tagline: 'Music producer and songwriter',
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2023-01-01T00:00:00Z',
  settings: {
    hide_branding: false,
  },
};

const mockSocialLinks: LegacySocialLink[] = [
  {
    id: '1',
    artist_id: '1',
    platform: 'instagram',
    url: 'https://instagram.com/artistname',
    clicks: 120,
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    artist_id: '1',
    platform: 'twitter',
    url: 'https://twitter.com/artistname',
    clicks: 85,
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '3',
    artist_id: '1',
    platform: 'spotify',
    url: 'https://open.spotify.com/artist/123',
    clicks: 210,
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '4',
    artist_id: '1',
    platform: 'youtube',
    url: 'https://youtube.com/c/artistname',
    clicks: 150,
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '5',
    artist_id: '1',
    platform: 'tiktok',
    url: 'https://tiktok.com/@artistname',
    clicks: 95,
    created_at: '2023-01-01T00:00:00Z',
  },
];

// Create a placeholder component for child content
const PlaceholderSection = ({ title }: { title: string }) => (
  <div className='w-full p-4 bg-white/20 dark:bg-gray-800/20 rounded-lg border border-gray-200/30 dark:border-gray-700/30 backdrop-blur-sm'>
    <h3 className='text-lg font-medium text-gray-800 dark:text-gray-200 mb-2'>
      {title}
    </h3>
    <div className='space-y-3'>
      <div className='h-4 bg-gray-200/50 dark:bg-gray-700/50 rounded w-3/4'></div>
      <div className='h-4 bg-gray-200/50 dark:bg-gray-700/50 rounded'></div>
      <div className='h-4 bg-gray-200/50 dark:bg-gray-700/50 rounded w-5/6'></div>
    </div>
  </div>
);

const meta: Meta<typeof ProfileShell> = {
  title: 'Organisms/ProfileShell',
  component: ProfileShell,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    artist: {
      control: 'object',
    },
    socialLinks: {
      control: 'object',
    },
    subtitle: {
      control: 'text',
    },
    showSocialBar: {
      control: 'boolean',
    },
    showTipButton: {
      control: 'boolean',
    },
    showBackButton: {
      control: 'boolean',
    },
    showFooter: {
      control: 'boolean',
    },
    showNotificationButton: {
      control: 'boolean',
    },
    maxWidthClass: {
      control: 'text',
    },
    backgroundPattern: {
      control: {
        type: 'select',
        options: ['grid', 'dots', 'gradient', 'none'],
      },
    },
    showGradientBlurs: {
      control: 'boolean',
    },
    children: {
      control: false,
    },
  },
  args: {
    artist: mockArtist,
    socialLinks: mockSocialLinks,
    subtitle: 'Music producer and songwriter',
    showSocialBar: true,
    showTipButton: true,
    showBackButton: false,
    showFooter: true,
    showNotificationButton: false,
    maxWidthClass: 'w-full max-w-md',
    backgroundPattern: 'grid',
    showGradientBlurs: true,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default story with placeholder content
export const Default: Story = {
  render: args => (
    <ProfileShell {...args}>
      <div className='space-y-6'>
        <PlaceholderSection title='Music' />
        <PlaceholderSection title='About' />
        <PlaceholderSection title='Upcoming Shows' />
      </div>
    </ProfileShell>
  ),
};

// Story with back button enabled
export const WithBackButton: Story = {
  args: {
    showBackButton: true,
  },
  render: args => (
    <ProfileShell {...args}>
      <div className='space-y-6'>
        <PlaceholderSection title='Music' />
        <PlaceholderSection title='About' />
      </div>
    </ProfileShell>
  ),
};

// Story with notification button (only visible in development)
export const WithNotificationButton: Story = {
  args: {
    showNotificationButton: true,
  },
  render: args => (
    <ProfileShell {...args}>
      <div className='space-y-6'>
        <PlaceholderSection title='Music' />
        <PlaceholderSection title='About' />
      </div>
    </ProfileShell>
  ),
};

// Story with different background pattern
export const WithDotsPattern: Story = {
  args: {
    backgroundPattern: 'dots',
  },
  render: args => (
    <ProfileShell {...args}>
      <div className='space-y-6'>
        <PlaceholderSection title='Music' />
        <PlaceholderSection title='About' />
      </div>
    </ProfileShell>
  ),
};

// Story with gradient background pattern
export const WithGradientPattern: Story = {
  args: {
    backgroundPattern: 'gradient',
  },
  render: args => (
    <ProfileShell {...args}>
      <div className='space-y-6'>
        <PlaceholderSection title='Music' />
        <PlaceholderSection title='About' />
      </div>
    </ProfileShell>
  ),
};

// Story with no background pattern
export const WithNoPattern: Story = {
  args: {
    backgroundPattern: 'none',
    showGradientBlurs: false,
  },
  render: args => (
    <ProfileShell {...args}>
      <div className='space-y-6'>
        <PlaceholderSection title='Music' />
        <PlaceholderSection title='About' />
      </div>
    </ProfileShell>
  ),
};

// Story with custom width
export const WithWiderLayout: Story = {
  args: {
    maxWidthClass: 'w-full max-w-2xl',
  },
  render: args => (
    <ProfileShell {...args}>
      <div className='space-y-6'>
        <PlaceholderSection title='Music' />
        <PlaceholderSection title='About' />
        <PlaceholderSection title='Upcoming Shows' />
      </div>
    </ProfileShell>
  ),
};

// Story with no social bar or tip button
export const MinimalControls: Story = {
  args: {
    showSocialBar: false,
    showTipButton: false,
  },
  render: args => (
    <ProfileShell {...args}>
      <div className='space-y-6'>
        <PlaceholderSection title='Music' />
        <PlaceholderSection title='About' />
      </div>
    </ProfileShell>
  ),
};

// Story with no footer
export const WithoutFooter: Story = {
  args: {
    showFooter: false,
  },
  render: args => (
    <ProfileShell {...args}>
      <div className='space-y-6'>
        <PlaceholderSection title='Music' />
        <PlaceholderSection title='About' />
      </div>
    </ProfileShell>
  ),
};

// Story with custom subtitle
export const CustomSubtitle: Story = {
  args: {
    subtitle: 'Grammy-nominated producer & DJ',
  },
  render: args => (
    <ProfileShell {...args}>
      <div className='space-y-6'>
        <PlaceholderSection title='Music' />
        <PlaceholderSection title='About' />
      </div>
    </ProfileShell>
  ),
};

// Story with multiple content sections to demonstrate scrolling
export const WithMultipleSections: Story = {
  render: args => (
    <ProfileShell {...args}>
      <div className='space-y-6'>
        <PlaceholderSection title='Music' />
        <PlaceholderSection title='About' />
        <PlaceholderSection title='Upcoming Shows' />
        <PlaceholderSection title='Merchandise' />
        <PlaceholderSection title='Videos' />
        <PlaceholderSection title='Photos' />
        <PlaceholderSection title='Contact' />
      </div>
    </ProfileShell>
  ),
};

// Story with responsive layout demonstration
export const ResponsiveLayout: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  render: args => (
    <ProfileShell {...args}>
      <div className='space-y-6'>
        <div className='p-4 bg-white/20 dark:bg-gray-800/20 rounded-lg border border-gray-200/30 dark:border-gray-700/30 backdrop-blur-sm'>
          <h3 className='text-lg font-medium text-gray-800 dark:text-gray-200 mb-2'>
            Responsive Demo
          </h3>
          <p className='text-gray-600 dark:text-gray-400 mb-3'>
            This profile layout adapts to different screen sizes. Try viewing on
            mobile, tablet, and desktop.
          </p>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <div className='h-24 bg-gray-200/50 dark:bg-gray-700/50 rounded flex items-center justify-center'>
              <span className='text-gray-500 dark:text-gray-400'>Item 1</span>
            </div>
            <div className='h-24 bg-gray-200/50 dark:bg-gray-700/50 rounded flex items-center justify-center'>
              <span className='text-gray-500 dark:text-gray-400'>Item 2</span>
            </div>
          </div>
        </div>
        <PlaceholderSection title='About' />
      </div>
    </ProfileShell>
  ),
};
