import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LegacySocialLink } from '@/types/db';
import { SocialBar } from './SocialBar';

const socialLinks: LegacySocialLink[] = [
  {
    id: 'l1',
    artist_id: 'artist-1',
    platform: 'instagram',
    url: 'https://instagram.com/jovie',
    clicks: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'l2',
    artist_id: 'artist-1',
    platform: 'tiktok',
    url: 'https://tiktok.com/@jovie',
    clicks: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

const meta = {
  title: 'Organisms/SocialBar',
  component: SocialBar,
  parameters: {
    layout: 'centered',
  },
  args: {
    handle: 'jovie',
    artistName: 'Jovie',
    socialLinks,
  },
} satisfies Meta<typeof SocialBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    socialLinks: [],
  },
};
