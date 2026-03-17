import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Artist } from '@/types/db';
import { ListenNowForm } from './listen-now-form';

// Mock artist data for stories
const mockArtist: Artist = {
  id: 'mock-artist-id',
  owner_user_id: 'mock-user-id',
  handle: 'artisthandle',
  spotify_id: 'spotify123',
  name: 'Artist Name',
  image_url: 'https://placekitten.com/200/200',
  tagline: 'Artist tagline',
  theme: {},
  settings: { hide_branding: false },
  spotify_url: 'https://open.spotify.com/artist/123',
  apple_music_url: 'https://music.apple.com/artist/123',
  youtube_url: 'https://youtube.com/channel/123',
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: new Date().toISOString(),
};

// Mock onUpdate function
const mockOnUpdate = (artist: Artist) => {
  console.log('Artist updated:', artist);
};

const meta: Meta<typeof ListenNowForm> = {
  title: 'Dashboard/Organisms/ListenNowForm',
  component: ListenNowForm,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#1f2937' },
      ],
    },
  },
  tags: ['autodocs'],
  argTypes: {
    artist: { control: 'object' },
    onUpdate: { action: 'updated' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default state
export const Default: Story = {
  args: {
    artist: mockArtist,
    onUpdate: mockOnUpdate,
  },
};

// Empty form state
export const EmptyForm: Story = {
  args: {
    artist: {
      ...mockArtist,
      spotify_url: '',
      apple_music_url: '',
      youtube_url: '',
    },
    onUpdate: mockOnUpdate,
  },
};

// Validation error state
export const ValidationError: Story = {
  args: {
    artist: mockArtist,
    onUpdate: mockOnUpdate,
  },
  play: async ({ canvasElement }) => {
    // This would normally use testing-library to simulate user interaction
    // For Storybook, we'll just manually set the error state
    const form = canvasElement.querySelector('form');
    if (form) {
      const event = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(event);

      // Manually set error state (this would be handled by the component in real usage)
      const errorElement = document.createElement('p');
      errorElement.className = 'text-sm text-red-600 dark:text-red-400';
      errorElement.textContent = 'Failed to update music links';

      const formField = canvasElement.querySelector('.space-y-2');
      if (formField) {
        formField.appendChild(errorElement);
      }
    }
  },
};

// Success state
export const SuccessState: Story = {
  args: {
    artist: mockArtist,
    onUpdate: mockOnUpdate,
  },
  play: async ({ canvasElement }) => {
    // This would normally use testing-library to simulate user interaction
    // For Storybook, we'll just manually set the success state
    const successElement = document.createElement('div');
    successElement.className =
      'bg-green-500/10 border border-green-500/20 rounded-lg p-3';
    successElement.innerHTML =
      '<p class="text-sm text-green-600 dark:text-green-400">Links updated successfully!</p>';

    const form = canvasElement.querySelector('form');
    if (form) {
      form.appendChild(successElement);
    }
  },
};

// Loading state
export const LoadingState: Story = {
  args: {
    artist: mockArtist,
    onUpdate: mockOnUpdate,
  },
  play: async ({ canvasElement }) => {
    // Find the button and set it to loading state
    const button = canvasElement.querySelector('button');
    if (button) {
      button.disabled = true;
      button.textContent = 'Updating...';
    }
  },
};

// Dark mode
export const DarkMode: Story = {
  args: {
    artist: mockArtist,
    onUpdate: mockOnUpdate,
  },
  parameters: {
    backgrounds: { default: 'dark' },
    darkMode: true,
  },
};
