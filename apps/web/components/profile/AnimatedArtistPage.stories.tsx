import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Artist, LegacySocialLink } from '@/types/db';
import { AnimatedArtistPage } from './animated-artist-page/AnimatedArtistPage';

const meta: Meta<typeof AnimatedArtistPage> = {
  title: 'Profile/AnimatedArtistPage',
  component: AnimatedArtistPage,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    mode: {
      control: { type: 'select' },
      options: ['profile', 'listen', 'tip'],
    },
    showTipButton: {
      control: { type: 'boolean' },
    },
    showBackButton: {
      control: { type: 'boolean' },
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

const mockSocialLinks: LegacySocialLink[] = [
  {
    id: '1',
    artist_id: '1',
    platform: 'instagram',
    url: 'https://instagram.com/taylorswift',
    clicks: 0,
    created_at: '',
  },
  {
    id: '2',
    artist_id: '1',
    platform: 'twitter',
    url: 'https://twitter.com/taylorswift13',
    clicks: 0,
    created_at: '',
  },
  {
    id: '3',
    artist_id: '1',
    platform: 'venmo',
    url: 'https://venmo.com/u/taylorswift',
    clicks: 0,
    created_at: '',
  },
];

export const ProfileMode: Story = {
  args: {
    mode: 'profile',
    artist: mockArtist,
    socialLinks: mockSocialLinks,
    subtitle: 'The Eras Tour • Live from London',
    showTipButton: true,
    showBackButton: false,
  },
};

export const ListenMode: Story = {
  args: {
    mode: 'listen',
    artist: mockArtist,
    socialLinks: mockSocialLinks,
    subtitle: 'The Eras Tour • Live from London',
    showTipButton: false,
    showBackButton: true,
  },
};

export const TipMode: Story = {
  args: {
    mode: 'tip',
    artist: mockArtist,
    socialLinks: mockSocialLinks,
    subtitle: 'The Eras Tour • Live from London',
    showTipButton: false,
    showBackButton: true,
  },
};

export const TipModeWithoutVenmo: Story = {
  args: {
    mode: 'tip',
    artist: mockArtist,
    socialLinks: mockSocialLinks.filter(link => link.platform !== 'venmo'),
    subtitle: 'The Eras Tour • Live from London',
    showTipButton: false,
    showBackButton: true,
  },
};

export const VerifiedArtist: Story = {
  args: {
    mode: 'profile',
    artist: { ...mockArtist, is_verified: true },
    socialLinks: mockSocialLinks,
    subtitle: 'Grammy Winner • Multi-Platinum Artist',
    showTipButton: true,
    showBackButton: false,
  },
};

export const UnverifiedArtist: Story = {
  args: {
    mode: 'profile',
    artist: { ...mockArtist, is_verified: false, name: 'Rising Artist' },
    socialLinks: mockSocialLinks.slice(0, 2), // No Venmo
    subtitle: 'New Music Coming Soon',
    showTipButton: false,
    showBackButton: false,
  },
};

export const MinimalSocials: Story = {
  args: {
    mode: 'profile',
    artist: mockArtist,
    socialLinks: [mockSocialLinks[0]], // Only Instagram
    subtitle: 'The Eras Tour • Live from London',
    showTipButton: false,
    showBackButton: false,
  },
};

export const NoSocials: Story = {
  args: {
    mode: 'profile',
    artist: mockArtist,
    socialLinks: [],
    subtitle: 'The Eras Tour • Live from London',
    showTipButton: false,
    showBackButton: false,
  },
};

export const LongArtistName: Story = {
  args: {
    mode: 'profile',
    artist: {
      ...mockArtist,
      name: 'Florence + The Machine',
      tagline:
        'British indie rock band known for powerful vocals and ethereal soundscapes.',
    },
    socialLinks: mockSocialLinks,
    subtitle: 'Dance Fever World Tour 2024',
    showTipButton: true,
    showBackButton: false,
  },
};

export const ShortArtistName: Story = {
  args: {
    mode: 'profile',
    artist: {
      ...mockArtist,
      name: 'Zedd',
      tagline: 'German DJ and music producer.',
    },
    socialLinks: mockSocialLinks,
    subtitle: 'Clarity Tour',
    showTipButton: true,
    showBackButton: false,
  },
};

export const InteractiveDemo: Story = {
  render: function InteractiveDemoRender() {
    const [mode, setMode] = React.useState<'profile' | 'listen' | 'tip'>(
      'profile'
    );

    return (
      <div>
        <div className='fixed top-4 left-4 z-50 flex gap-2'>
          <button
            type='button'
            onClick={() => setMode('profile')}
            className={`px-3 py-1 rounded text-sm ${
              mode === 'profile'
                ? 'bg-btn-primary text-btn-primary-foreground'
                : 'bg-surface-0 text-secondary-token border border-subtle'
            }`}
          >
            Profile
          </button>
          <button
            type='button'
            onClick={() => setMode('listen')}
            className={`px-3 py-1 rounded text-sm ${
              mode === 'listen'
                ? 'bg-btn-primary text-btn-primary-foreground'
                : 'bg-surface-0 text-secondary-token border border-subtle'
            }`}
          >
            Listen
          </button>
          <button
            type='button'
            onClick={() => setMode('tip')}
            className={`px-3 py-1 rounded text-sm ${
              mode === 'tip'
                ? 'bg-btn-primary text-btn-primary-foreground'
                : 'bg-surface-0 text-secondary-token border border-subtle'
            }`}
          >
            Tip
          </button>
        </div>

        <AnimatedArtistPage
          mode={mode}
          artist={mockArtist}
          socialLinks={mockSocialLinks}
          subtitle='Interactive Demo Mode'
          showTipButton={mode === 'profile'}
          showBackButton={mode !== 'profile'}
        />
      </div>
    );
  },
};
