import { Button, Input } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { WHATS_NEW_DAILY_PATH } from '@/lib/release-communications/prompt';
import { WhatsNewBanner, WhatsNewBannerView } from './WhatsNewBanner';

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
        style={{ width: 'var(--app-shell-sidebar-width)' }}
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

const fixtureFetch: typeof fetch = async input =>
  Response.json(
    String(input) === WHATS_NEW_DAILY_PATH
      ? null
      : {
          version: 1,
          changelogUrl: 'https://jov.ie/changelog',
          entries: [ENTRY],
        }
  );

function ActualContainerFixture() {
  const [enabled, setEnabled] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <Input aria-label='Draft' defaultValue='Keep this draft' />
      <Button
        size='sm'
        data-rail-toggle='left'
        onClick={() => setCollapsed(value => !value)}
      >
        Sidebar
      </Button>
      <Button size='sm' onClick={() => setEnabled(value => !value)}>
        {enabled ? 'Disable updates' : 'Enable updates'}
      </Button>
      <WhatsNewBanner
        enabled={enabled}
        collapsed={collapsed}
        fetchImpl={fixtureFetch}
      />
    </>
  );
}

/** Actual loading/dismissal owner, independent of shell IS_E2E suppression. */
export const ActualContainer: Story = {
  render: () => <ActualContainerFixture />,
};
