import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { WHATS_NEW_DAILY_PATH } from '@/lib/release-communications/prompt';
import { WhatsNewBanner, WhatsNewBannerView } from './WhatsNewBanner';

const ENTRY = {
  id: '26.9.2',
  title: 'Chat is home',
  date: '2026-09-26',
  summary:
    'Ask Jovie is the first signed-in surface, with the library a swipe away.',
  url: 'https://jov.ie/changelog/26.9.2',
  highlights: [],
  dogfood: [],
} as const;

/** Past the container's 1.5s settle delay, so a silent state is final. */
const SETTLE_MS = 1700;
const settle = () => new Promise(resolve => setTimeout(resolve, SETTLE_MS));

const neverResolves: typeof fetch = () => new Promise<Response>(() => {});
const emptyFeed: typeof fetch = async input =>
  Response.json(
    String(input) === WHATS_NEW_DAILY_PATH
      ? null
      : { version: 1, changelogUrl: 'https://jov.ie/changelog', entries: [] }
  );
const serverError: typeof fetch = async () =>
  new Response('Unavailable', { status: 503 });
const networkDown: typeof fetch = () =>
  Promise.reject(new TypeError('Failed to fetch'));

/**
 * State coverage for the sidebar What's New card. The container stories use
 * the real WhatsNewBanner with a fetchImpl, which is silent while loading,
 * when nothing is unseen and on any failure; the view stories change only the
 * entry copy or the document direction.
 */
const meta: Meta<typeof WhatsNewBannerView> = {
  title: 'Organisms/WhatsNewBanner States',
  component: WhatsNewBannerView,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    function SidebarDock(Story) {
      return (
        <div
          className='flex h-screen flex-col justify-end border-r border-(--app-shell-border) bg-base pb-12'
          style={{ width: 'var(--app-shell-sidebar-width)' }}
        >
          <Story />
        </div>
      );
    },
  ],
  args: {
    unseen: { entry: ENTRY, unseenCount: 1, href: ENTRY.url },
    onOpen: fn(),
    onDismiss: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof WhatsNewBannerView>;

/** Loading: the check has not answered, so the dock stays empty. */
export const LoadingCheck: Story = {
  render: function LoadingCheckStory() {
    return <WhatsNewBanner enabled fetchImpl={neverResolves} />;
  },
  play: async ({ canvasElement }) => {
    await settle();
    await expect(
      within(canvasElement).queryByTestId('whats-new-banner')
    ).toBeNull();
  },
};

/** Empty: nothing unseen in the feed, so no card. */
export const EmptyNothingUnseen: Story = {
  render: function EmptyNothingUnseenStory() {
    return <WhatsNewBanner enabled fetchImpl={emptyFeed} />;
  },
  play: async ({ canvasElement }) => {
    await settle();
    await expect(
      within(canvasElement).queryByTestId('whats-new-banner')
    ).toBeNull();
  },
};

/** Error: the feed answers 503, and the card stays silent. */
export const ErrorServerFailure: Story = {
  render: function ErrorServerFailureStory() {
    return <WhatsNewBanner enabled fetchImpl={serverError} />;
  },
  play: async ({ canvasElement }) => {
    await settle();
    await expect(
      within(canvasElement).queryByTestId('whats-new-banner')
    ).toBeNull();
  },
};

/** Offline: the request never reaches the network, and the card stays silent. */
export const OfflineNetworkFailure: Story = {
  render: function OfflineNetworkFailureStory() {
    return <WhatsNewBanner enabled fetchImpl={networkDown} />;
  },
  play: async ({ canvasElement }) => {
    await settle();
    await expect(
      within(canvasElement).queryByTestId('whats-new-banner')
    ).toBeNull();
  },
};

/** Partial: an entry with no summary keeps the title and the link. */
export const PartialNoSummary: Story = {
  args: {
    unseen: {
      entry: { ...ENTRY, summary: '' },
      unseenCount: 1,
      href: ENTRY.url,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Chat is home')).toBeVisible();
    await expect(canvas.getByTestId('whats-new-banner-link')).toBeVisible();
  },
};

/** Right-to-left: an Arabic entry inside an RTL document. */
export const RtlEntry: Story = {
  args: {
    unseen: {
      entry: {
        ...ENTRY,
        title: 'الدردشة هي الصفحة الرئيسية',
        summary: 'اسأل Jovie أولًا، ثم افتح المكتبة.',
      },
      unseenCount: 2,
      href: 'https://jov.ie/changelog',
    },
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
