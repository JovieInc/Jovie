import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { Artist } from '@/types/db';
import { SocialsForm } from './socials-form/SocialsForm';

// Mock artist data for stories
const mockArtist: Artist = {
  id: 'mock-artist-id',
  owner_user_id: 'mock-user-id',
  handle: 'artisthandle',
  spotify_id: 'mock-spotify-id',
  name: 'Mock Artist',
  image_url: 'https://example.com/avatar.jpg',
  tagline: 'Mock artist tagline',
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2023-01-01T00:00:00Z',
};

// Mock social links data
const mockSocialLinks = [
  {
    id: 'link-1',
    platform: 'instagram',
    url: 'https://instagram.com/artisthandle',
  },
  {
    id: 'link-2',
    platform: 'twitter',
    url: 'https://twitter.com/artisthandle',
  },
  {
    id: 'link-3',
    platform: 'youtube',
    url: 'https://youtube.com/@artisthandle',
  },
];

// Mock empty social links for default state
interface SocialLink {
  id: string;
  platform: string;
  url: string;
}

const mockEmptySocialLinks: SocialLink[] = [];

// Mock invalid social links for validation error state
const mockInvalidSocialLinks = [
  { id: 'link-1', platform: 'instagram', url: 'invalid-url' },
];

const meta: Meta<typeof SocialsForm> = {
  title: 'Dashboard/Organisms/SocialsForm',
  component: SocialsForm,
  parameters: {
    layout: 'padded',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#1a1a1a' },
      ],
    },
    a11y: {
      config: {
        rules: [
          {
            // We're mocking the database client, so we can ignore this warning
            id: 'color-contrast',
            enabled: true,
          },
        ],
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div className='max-w-3xl mx-auto p-6 border border-gray-200 dark:border-gray-800 rounded-lg'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Helper to setup fetch mocks for each story
const withFetchMock = (
  Story: React.ComponentType,
  socialLinks: SocialLink[] = [],
  shouldError: boolean = false
) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (
      url.includes('/api/dashboard/social-links') &&
      (!init || init.method === undefined)
    ) {
      // GET
      return Promise.resolve(
        new Response(JSON.stringify({ links: socialLinks }), { status: 200 })
      );
    }
    if (url.includes('/api/dashboard/social-links') && init?.method === 'PUT') {
      if (shouldError) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'Validation error' }), {
            status: 400,
          })
        );
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    }
    return originalFetch!(input as RequestInfo, init);
  }) as typeof fetch;

  const result = <Story />;
  globalThis.fetch = originalFetch!;
  return result;
};

// Default story - empty state
export const Default: Story = {
  decorators: [Story => withFetchMock(Story, mockEmptySocialLinks)],
  args: {
    artist: mockArtist,
  },
};

// Prefilled story - with existing social links
export const Prefilled: Story = {
  decorators: [Story => withFetchMock(Story, mockSocialLinks)],
  args: {
    artist: mockArtist,
  },
};

// Validation error story
export const ValidationError: Story = {
  decorators: [Story => withFetchMock(Story, mockInvalidSocialLinks, true)],
  args: {
    artist: mockArtist,
  },
};

// Dark mode story
export const DarkMode: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
  },
  decorators: [
    Story => (
      <div className='dark'>{withFetchMock(Story, mockSocialLinks)}</div>
    ),
  ],
  args: {
    artist: mockArtist,
  },
};

// Loading state story
export const Loading: Story = {
  decorators: [
    Story => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (
          url.includes('/api/dashboard/social-links') &&
          (!init || init.method === undefined)
        ) {
          // GET that never resolves
          return new Promise<Response>(() => {}) as unknown as ReturnType<
            typeof fetch
          >;
        }
        return originalFetch!(input as RequestInfo, init);
      }) as typeof fetch;

      const result = <Story />;
      globalThis.fetch = originalFetch!;
      return result;
    },
  ],
  args: {
    artist: mockArtist,
  },
};

// Success message story
export const SuccessMessage: Story = {
  decorators: [
    Story => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (
          url.includes('/api/dashboard/social-links') &&
          (!init || init.method === undefined)
        ) {
          // GET
          return Promise.resolve(
            new Response(JSON.stringify({ links: mockSocialLinks }), {
              status: 200,
            })
          );
        }
        if (
          url.includes('/api/dashboard/social-links') &&
          init?.method === 'PUT'
        ) {
          return Promise.resolve(new Response('{}', { status: 200 }));
        }
        return originalFetch!(input as RequestInfo, init);
      }) as typeof fetch;

      // Render the story
      const result = <Story />;

      // Restore the original implementations after rendering
      globalThis.fetch = originalFetch!;

      return result;
    },
  ],
  args: {
    artist: mockArtist,
  },
};
