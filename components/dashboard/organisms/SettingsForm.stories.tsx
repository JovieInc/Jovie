import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Artist } from '@/types/db';
import { SettingsForm } from './SettingsForm';

// Create a mock artist for our stories
const mockArtist: Artist = {
  id: 'artist-123',
  owner_user_id: 'user-123',
  handle: 'artisthandle',
  spotify_id: 'spotify-123',
  name: 'Artist Name',
  image_url: 'https://placekitten.com/200/200',
  tagline: 'Artist tagline',
  theme: {
    primaryColor: '#6366f1',
    backgroundColor: '#ffffff',
  },
  settings: {
    hide_branding: false,
  },
  spotify_url: 'https://spotify.com/artist/123',
  apple_music_url: 'https://music.apple.com/artist/123',
  youtube_url: 'https://youtube.com/channel/123',
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2023-01-01T00:00:00Z',
};

// Mock the updateCreatorProfile function
// This is done in the preview.js file for Storybook
// Here we're just documenting that it's mocked
// The actual implementation would be:
// import { updateCreatorProfile } from '@/app/dashboard/actions';
// updateCreatorProfile = (id, updates) => Promise.resolve({ id, ...updates });

const meta: Meta<typeof SettingsForm> = {
  title: 'Dashboard/Organisms/SettingsForm',
  component: SettingsForm,
  parameters: {
    layout: 'padded',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#f8fafc' },
        { name: 'dark', value: '#1e293b' },
      ],
    },
  },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div className='max-w-3xl mx-auto'>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    artist: {
      control: 'object',
      description: 'Artist data object',
    },
    onUpdate: {
      action: 'onUpdate',
      description: 'Callback when artist data is updated',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default story with marketing opt-out disabled
export const Default: Story = {
  args: {
    artist: mockArtist,
    onUpdate: updatedArtist => console.log('Artist updated:', updatedArtist),
  },
  parameters: {
    mockData: [
      {
        url: '/api/updateCreatorProfile',
        method: 'POST',
        status: 200,
        response: {
          success: true,
          data: { ...mockArtist, marketing_opt_out: true },
        },
        delay: 500,
      },
    ],
  },
};

// Story with marketing opt-out enabled
export const MarketingOptedOut: Story = {
  args: {
    artist: {
      ...mockArtist,
      marketing_opt_out: true,
    },
    onUpdate: updatedArtist => console.log('Artist updated:', updatedArtist),
  },
  parameters: {
    mockData: [
      {
        url: '/api/updateCreatorProfile',
        method: 'POST',
        status: 200,
        response: {
          success: true,
          data: { ...mockArtist, marketing_opt_out: false },
        },
        delay: 500,
      },
    ],
  },
};

// Story with loading state
export const Loading: Story = {
  args: {
    artist: mockArtist,
    onUpdate: updatedArtist => console.log('Artist updated:', updatedArtist),
  },
  parameters: {
    mockData: [
      {
        url: '/api/updateCreatorProfile',
        method: 'POST',
        status: 200,
        response: {
          success: true,
          data: { ...mockArtist, marketing_opt_out: true },
        },
        delay: 2000, // Long delay to show loading state
      },
    ],
  },
  play: async ({ canvasElement }) => {
    // Find the checkbox and click it to trigger loading state
    const checkbox = canvasElement.querySelector(
      '#marketing-opt-out'
    ) as HTMLInputElement;
    if (checkbox) {
      checkbox.click();
    }
  },
};

// Story with success message
export const SuccessMessage: Story = {
  args: {
    artist: mockArtist,
    onUpdate: updatedArtist => console.log('Artist updated:', updatedArtist),
  },
  parameters: {
    mockData: [
      {
        url: '/api/updateCreatorProfile',
        method: 'POST',
        status: 200,
        response: {
          success: true,
          data: { ...mockArtist, marketing_opt_out: true },
        },
        delay: 500,
      },
    ],
  },
  play: async ({ canvasElement }) => {
    // Find the checkbox and click it to trigger success message
    const checkbox = canvasElement.querySelector(
      '#marketing-opt-out'
    ) as HTMLInputElement;
    if (checkbox) {
      checkbox.click();
      // Success message will show automatically after the mock update completes
    }
  },
};

// Story with dark theme
export const DarkTheme: Story = {
  args: {
    artist: mockArtist,
    onUpdate: updatedArtist => console.log('Artist updated:', updatedArtist),
  },
  parameters: {
    backgrounds: { default: 'dark' },
    mockData: [
      {
        url: '/api/updateCreatorProfile',
        method: 'POST',
        status: 200,
        response: {
          success: true,
          data: { ...mockArtist, marketing_opt_out: true },
        },
        delay: 500,
      },
    ],
  },
  decorators: [
    Story => (
      <div className='dark max-w-3xl mx-auto'>
        <Story />
      </div>
    ),
  ],
};

// Story with mobile viewport
export const MobileView: Story = {
  args: {
    artist: mockArtist,
    onUpdate: updatedArtist => console.log('Artist updated:', updatedArtist),
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
    mockData: [
      {
        url: '/api/updateCreatorProfile',
        method: 'POST',
        status: 200,
        response: {
          success: true,
          data: { ...mockArtist, marketing_opt_out: true },
        },
        delay: 500,
      },
    ],
  },
};
