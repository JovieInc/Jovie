import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarDockBridge } from './SidebarDockBridge';

const meta = {
  title: 'Organisms/SidebarDockBridge',
  component: SidebarDockBridge,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-57 bg-sidebar p-2'>
        <Story />
      </div>
    ),
  ],
  args: {
    userId: 'dock-bridge-story',
    collapsed: false,
    children: () => null,
    fetchImpl: async () =>
      Response.json({
        version: 1,
        changelogUrl: '/changelog',
        entries: [
          {
            id: 'bridge-release',
            title: 'Your latest releases',
            date: '2026-10-15',
            summary: '',
            url: '/changelog',
            highlights: [],
            dogfood: [],
          },
        ],
      }),
  },
} satisfies Meta<typeof SidebarDockBridge>;

function feedWith(entry: Record<string, unknown> | null) {
  return async () =>
    Response.json({
      version: 1,
      changelogUrl: '/changelog',
      entries: entry
        ? [
            {
              id: 'bridge-release',
              date: '2026-10-15',
              summary: '',
              url: '/changelog',
              highlights: [],
              dogfood: [],
              ...entry,
            },
          ]
        : [],
    });
}
export default meta;
type Story = StoryObj<typeof meta>;
export const LatestRelease: Story = {};
export const Collapsed: Story = { args: { collapsed: true } };

/** The feed has no entries yet: the dock stays empty. */
export const EmptyFeed: Story = { args: { fetchImpl: feedWith(null) } };

/** A failed feed load is silent: the dock never shows a broken card. */
export const ErrorFeedUnavailable: Story = {
  args: {
    fetchImpl: async () => new Response(null, { status: 503 }),
  },
};

/** A release that carries only its title: no summary or highlights. */
export const PartialTitleOnly: Story = {
  args: { fetchImpl: feedWith({ title: 'Smart links' }) },
};

export const LongContentReleaseTitle: Story = {
  args: {
    fetchImpl: feedWith({
      title:
        'Release planning for extraordinarily long album titles, deluxe anniversary remastered editions and every territory',
    }),
  },
};

export const RtlRelease: Story = {
  args: { fetchImpl: feedWith({ title: 'أحدث إصداراتك' }) },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
