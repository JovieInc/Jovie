import { TooltipProvider } from '@jovie/ui';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { SmartLinkCell } from './SmartLinkCell';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  releaseType: 'single',
  status: 'released',
  isExplicit: false,
  releaseDate: '2026-01-01',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [],
  spotifyPopularity: null,
  smartLinkPath: '/smart/release-1',
  previewUrl: null,
  primaryIsrc: null,
  upc: null,
};

const LONG_PATH =
  '/sasha-waves-and-the-northern-coastline-orchestra/midnight-signal-extended-orchestral-reprise-deluxe-anniversary-edition';

const withCell: Decorator = Story => (
  <TooltipProvider>
    <div className='w-56'>
      <Story />
    </div>
  </TooltipProvider>
);

const withRtlCell: Decorator = Story => (
  <TooltipProvider>
    <div dir='rtl' className='w-56'>
      <Story />
    </div>
  </TooltipProvider>
);

const meta = {
  title: 'Dashboard/Organisms/Releases/Cells/SmartLinkCell States',
  component: SmartLinkCell,
  parameters: { layout: 'centered' },
  args: { release },
} satisfies Meta<typeof SmartLinkCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: locked with no reason given falls back to the plan upsell. */
export const PartialLockedWithoutReason: Story = {
  args: { locked: true },
  decorators: [withCell],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Smart link (Pro)')).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/** Long content: a long smart link path truncates inside the cell. */
export const LongContentSmartLinkPath: Story = {
  args: { release: { ...release, smartLinkPath: LONG_PATH } },
  decorators: [withCell],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(LONG_PATH)
    ).toBeInTheDocument();
  },
};

/** Right-to-left: a scheduled lock inside an RTL document. */
export const RtlLockedScheduled: Story = {
  args: { locked: true, lockReason: 'scheduled' },
  decorators: [withRtlCell],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Scheduled')).toBeVisible();
  },
};

/** Right-to-left: the copyable link inside an RTL document. */
export const RtlUnlocked: Story = {
  decorators: [withRtlCell],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('/smart/release-1')
    ).toBeInTheDocument();
  },
};
