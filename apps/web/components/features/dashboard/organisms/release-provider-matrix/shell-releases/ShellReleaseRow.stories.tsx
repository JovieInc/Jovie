import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu/types';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { ShellReleaseRow } from './ShellReleaseRow';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Lost in the Light',
  artistNames: ['Bahamas'],
  status: 'released',
  artworkUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f',
  slug: 'lost-in-the-light',
  smartLinkPath: '/lost-in-the-light',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  totalDurationMs: 214_000,
  releaseDate: '2026-06-15',
  weeklyStreams: 12_400,
  previewUrl: null,
  primaryIsrc: null,
  upc: null,
};

const actionMenuItems: TableActionMenuItem[] = [
  { id: 'copy', label: 'Copy link' },
  { id: 'edit', label: 'Edit release' },
];

const meta = {
  title: 'Dashboard/Releases/ShellReleaseRow',
  component: ShellReleaseRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full min-w-[48rem] max-w-4xl bg-surface-0 p-3 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    release,
    isSelected: false,
    onSelect: fn(),
    actionMenuItems,
  },
} satisfies Meta<typeof ShellReleaseRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
  args: {
    isSelected: true,
  },
};

export const Syncing: Story = {
  args: {
    syncStatus: 'refreshing',
  },
};

export const SmartLinkLocked: Story = {
  args: {
    smartLinkLockReason: 'scheduled',
  },
};
