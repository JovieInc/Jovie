import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Artist } from '@/types/db';
import { ProfileForm } from './profile-form/ProfileForm';

// Mock artist data for stories
const mockArtist: Artist = {
  id: 'mock-id-123',
  owner_user_id: 'user-123',
  handle: 'artisthandle',
  spotify_id: 'spotify-123',
  name: 'Artist Name',
  image_url: 'https://via.placeholder.com/150',
  tagline:
    'This is a sample artist tagline that showcases their music style and personality.',
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

// Mock function for onUpdate
const mockOnUpdate = (artist: Artist) => {
  console.log('Artist updated:', artist);
};

// Mock modules
// Note: In a real implementation, you would use proper mocking with
// jest.mock or MSW, but for Storybook we'll use this approach
const MockedProfileForm = (props: React.ComponentProps<typeof ProfileForm>) => {
  // Override the actual component with our mocked version for Storybook
  return <ProfileForm {...props} />;
};

const meta: Meta<typeof ProfileForm> = {
  title: 'Dashboard/Organisms/ProfileForm',
  component: MockedProfileForm as typeof ProfileForm,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#1f2937' },
      ],
    },
    // Disable actual network calls in Storybook
    mockData: [
      {
        url: '/api/images/sign-upload',
        method: 'POST',
        status: 200,
        response: {
          cloudName: 'mock-cloud',
          apiKey: 'mock-key',
          timestamp: Date.now(),
          signature: 'mock-signature',
          upload_preset: 'mock-preset',
        },
      },
    ],
    a11y: {
      // Enable accessibility checks
      config: {
        rules: [
          {
            id: 'color-contrast',
            enabled: true,
          },
        ],
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    artist: {
      control: 'object',
    },
    onUpdate: {
      action: 'updated',
    },
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

// Empty fields state
export const EmptyFields: Story = {
  args: {
    artist: {
      ...mockArtist,
      name: '',
      tagline: '',
      image_url: '',
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
    // Simulate form submission with validation error
    const form = canvasElement.querySelector('form');
    const nameInput = canvasElement.querySelector(
      'input[placeholder="Your Artist Name"]'
    );

    if (nameInput instanceof HTMLInputElement) {
      nameInput.value = '';
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (form) {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
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
    // Simulate successful form submission
    const form = canvasElement.querySelector('form');

    if (form) {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );

      // Mock the success state
      setTimeout(() => {
        const successElement = document.createElement('div');
        successElement.className =
          'bg-green-500/10 border border-green-500/20 rounded-lg p-3';

        const successText = document.createElement('p');
        successText.className = 'text-sm text-green-600 dark:text-green-400';
        successText.textContent = 'Profile updated successfully!';

        successElement.appendChild(successText);
        form.appendChild(successElement);
      }, 100);
    }
  },
};

// Long text fields
export const LongTextFields: Story = {
  args: {
    artist: {
      ...mockArtist,
      name: 'This is a very long artist name that should test how the form handles overflow and wrapping of text in the name field',
      tagline:
        'This is an extremely long tagline that should test how the form handles overflow and wrapping of text in the tagline field. It contains multiple sentences to ensure we have enough content to test the layout and styling of the form with long text inputs.',
    },
    onUpdate: mockOnUpdate,
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
    themes: {
      themeOverride: 'dark',
    },
  },
};
