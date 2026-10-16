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
export default meta;
type Story = StoryObj<typeof meta>;
export const LatestRelease: Story = {};
export const Collapsed: Story = { args: { collapsed: true } };
