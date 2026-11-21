import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { GroupedLinksManager } from './GroupedLinksManager';

function link(
  id: string,
  name: string,
  category: DetectedLink['platform']['category'],
  url: string
): DetectedLink {
  return {
    platform: {
      id,
      name,
      category,
      icon: id,
      color: '000000',
      placeholder: url,
    },
    normalizedUrl: url,
    originalUrl: url,
    suggestedTitle: name,
    isValid: true,
  };
}

const links: DetectedLink[] = [
  link('spotify', 'Spotify', 'dsp', 'https://open.spotify.com/artist/123'),
  link('instagram', 'Instagram', 'social', 'https://instagram.com/minavale'),
  link('tiktok', 'TikTok', 'social', 'https://tiktok.com/@minavale'),
];

const manyLinks: DetectedLink[] = [
  ...links,
  link('youtube', 'YouTube', 'social', 'https://youtube.com/@minavale'),
  link('soundcloud', 'SoundCloud', 'dsp', 'https://soundcloud.com/minavale'),
  link('bandcamp', 'Bandcamp', 'dsp', 'https://minavale.bandcamp.com'),
  link('twitter', 'X', 'social', 'https://x.com/minavale'),
  link(
    'website',
    'Website',
    'custom',
    'https://www.minavale-official-website-with-a-very-long-domain-name.example.com/press-kit'
  ),
];

const ManagerShell: Decorator = function ManagerShell(Story) {
  return (
    <div className='h-screen w-full max-w-3xl bg-base text-primary-token'>
      <Story />
    </div>
  );
};

const RtlShell: Decorator = function RtlShell(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Dashboard/GroupedLinks/GroupedLinksManager',
  component: GroupedLinksManager,
  parameters: { layout: 'fullscreen' },
  decorators: [ManagerShell],
  args: { initialLinks: links, creatorName: 'Mina Vale' },
} satisfies Meta<typeof GroupedLinksManager>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: a few links with the input pinned at the bottom. */
export const Default: Story = {};

/** Empty: no links yet, so the input sits above the first-link prompt. */
export const EmptyNoLinks: Story = { args: { initialLinks: [] } };

/** Partial: the profile sidebar is open, so only the centred input shows. */
export const PartialSidebarOpen: Story = { args: { sidebarOpen: true } };

/** Long content: eight links, one with a very long URL. */
export const LongContentManyLinks: Story = {
  args: { initialLinks: manyLinks },
};

/** Right-to-left: the manager in a right-to-left document. */
export const RtlLinks: Story = { decorators: [RtlShell] };
