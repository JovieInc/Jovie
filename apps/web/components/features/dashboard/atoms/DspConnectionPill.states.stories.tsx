import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DspConnectionPill } from './DspConnectionPill';

const meta = {
  title: 'Dashboard/Atoms/DspConnectionPill/States',
  component: DspConnectionPill,
  parameters: { layout: 'centered' },
  args: { provider: 'spotify', connected: false },
  decorators: [
    function PillFrame(Story) {
      return (
        <div className='w-64'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof DspConnectionPill>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the provider is not connected yet. */
export const EmptyNotConnected: Story = {
  args: { connected: false, onClick: () => undefined },
};

/** Partial: connected without an artist name resolved. */
export const PartialConnectedNoName: Story = {
  args: { connected: true, artistName: null },
};

/** Long content: a long artist name truncates inside the pill. */
export const LongContentArtistName: Story = {
  args: {
    connected: true,
    artistName: 'An artist with an extraordinarily long profile name',
    onSyncNow: () => undefined,
    onDisconnect: () => undefined,
  },
};

/** Rtl: the pill in a right-to-left container. */
export const RtlPill: Story = {
  args: { connected: true, artistName: 'ليلى' },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
