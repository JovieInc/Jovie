import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { SmartLinkCell, WeeklyStreamsCell } from './shell-release-row-cells';

const release = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Lost in the Light',
  artistNames: ['Bahamas'],
  status: 'released',
  slug: 'lost-in-the-light',
  smartLinkPath: '/lost-in-the-light',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  totalDurationMs: 214_000,
  releaseDate: '2026-06-15',
  weeklyStreams: 12_400,
} satisfies ReleaseViewModel;

const meta = {
  title: 'Dashboard/Releases/ShellReleaseRowCells',
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SmartLinkOpen: Story = {
  render: () => (
    <SmartLinkCell
      release={release}
      smartLinkLockReason={null}
      smartLinkPath='/lost-in-the-light'
    />
  ),
};

export const WeeklyStreams: Story = {
  render: () => <WeeklyStreamsCell weeklyStreams={12_400} />,
};
