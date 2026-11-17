import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ReleaseFields } from './ReleaseFields';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-72'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='w-72'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the release field chips. The canonical stories stay in
 * ReleaseFields.stories.tsx; these change which fields are known, their
 * length and the document direction.
 */
const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseFields States',
  component: ReleaseFields,
  parameters: {
    layout: 'centered',
  },
  decorators: [Frame],
  args: {
    releaseDate: '2026-11-14',
    releaseType: 'single',
    totalTracks: 1,
    platformCount: 6,
  },
} satisfies Meta<typeof ReleaseFields>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing is known yet, so only the "No Release Date" pill shows. */
export const EmptyNoDetails: Story = {
  args: {
    releaseDate: undefined,
    releaseType: undefined,
    totalTracks: undefined,
    platformCount: undefined,
  },
};

/** Partial: a type and date but no track or platform counts yet. */
export const PartialTypeAndDateOnly: Story = {
  args: { releaseType: 'ep', totalTracks: 0, platformCount: 0 },
};

/** Long content: an unmapped long release type, many tracks and a reveal date. */
export const LongContentFields: Story = {
  args: {
    releaseType: 'extended-deluxe-anniversary-reissue',
    totalTracks: 148,
    platformCount: 32,
    revealDate: '2026-11-01',
  },
};

/** Right-to-left: the chips inside an RTL document. */
export const RtlDocument: Story = {
  args: { releaseType: 'album', totalTracks: 12, revealDate: '2026-11-01' },
  decorators: [RtlFrame],
};
