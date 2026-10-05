import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { WhatsNewBannerView } from './WhatsNewBanner';

const ENTRY = {
  id: '26.9.2',
  title: 'Chat is home',
  date: '2026-09-26',
  summary:
    'Ask Jovie is the first signed-in surface, with the library a swipe away.',
  url: 'https://jov.ie/changelog/26.9.2',
  highlights: ['Library filters', 'Lighter button labels'],
  dogfood: ['Open chat and ask about your latest release'],
} as const;

const meta: Meta<typeof WhatsNewBannerView> = {
  title: 'Organisms/WhatsNewBanner',
  component: WhatsNewBannerView,
  parameters: {
    layout: 'fullscreen',
    // The fetching container is covered by WhatsNewBanner.test.tsx.
    jovie: { uncoveredProps: ['enabled'] },
  },
  decorators: [
    Story => (
      <div
        className='flex h-screen flex-col justify-end border-r border-(--app-shell-border) bg-base pb-12'
        style={{ width: 244 }}
      >
        <Story />
      </div>
    ),
  ],
  args: { onOpen: fn(), onDismiss: fn() },
};

export default meta;
type Story = StoryObj<typeof WhatsNewBannerView>;

export const SingleUpdate: Story = {
  args: { unseen: { entry: ENTRY, unseenCount: 1, href: ENTRY.url } },
};

export const SingleUpdateLight: Story = {
  ...SingleUpdate,
  parameters: { themes: { themeOverride: 'light' } },
};

export const MultipleUpdates: Story = {
  args: {
    unseen: {
      entry: ENTRY,
      unseenCount: 3,
      href: 'https://jov.ie/changelog',
    },
  },
};

export const LongTitle: Story = {
  args: {
    unseen: {
      entry: {
        ...ENTRY,
        title:
          'Library is one catalog with Ideas, In Progress, and Out across every release type',
      },
      unseenCount: 1,
      href: ENTRY.url,
    },
  },
};
