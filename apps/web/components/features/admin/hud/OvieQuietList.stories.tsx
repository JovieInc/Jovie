import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OvieQuietList } from './OvieQuietList';

const meta = {
  title: 'Features/Admin/Hud/OvieQuietList',
  component: OvieQuietList,
  parameters: { layout: 'padded' },
  args: {
    rows: [
      {
        id: 'a',
        primary: 'Keep the status feed under the cap',
        secondary: '#23098',
      },
      { id: 'b', primary: 'Retain typed email', secondary: '#23094' },
      { id: 'c', primary: 'Show every agent lane', secondary: '#23101' },
    ],
    more: 84,
    moreLabel: 'merges',
  },
} satisfies Meta<typeof OvieQuietList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NeedsAttention: Story = {
  args: {
    rows: [
      {
        id: 'a',
        primary: 'Spotify artist confirmation',
        secondary: 'failing checks',
        attention: true,
      },
      {
        id: 'b',
        primary: 'Read-only operator role',
        secondary: 'ready to merge',
      },
    ],
    more: 0,
  },
};
