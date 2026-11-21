import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { TipLinkSection, VenmoConnectDialog } from './DashboardPay.parts';

const noop = () => undefined;

const meta = {
  title: 'Features/Dashboard/DashboardPay/Parts',
  component: VenmoConnectDialog,
  parameters: { layout: 'centered' },
  args: {
    open: true,
    onClose: noop,
    venmoHandle: '',
    onVenmoHandleChange: noop,
    onSave: noop,
    isSaving: false,
    saveSuccess: null,
  },
} satisfies Meta<typeof VenmoConnectDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: no username typed yet, so Connect is disabled. */
export const EmptyUsername: Story = {};

/** Long content: a long username stays inside the field. */
export const LongContentUsername: Story = {
  args: { venmoHandle: 'a-very-long-venmo-username-for-layout-testing' },
};

/** Loading: the connection is being saved. */
export const LoadingSaving: Story = {
  args: { venmoHandle: 'artist', isSaving: true },
};

/** RTL: the dialog mirrors in a right-to-left document. */
export const RtlDialog: Story = {
  args: { venmoHandle: 'artist', saveSuccess: 'Venmo connected' },
  decorators: [
    function RtlDecorator(Story: () => ReactNode) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};

/** The pay link card on its own, with a long URL. */
export const LongContentPayLink: StoryObj<typeof TipLinkSection> = {
  render: () => (
    <div className='w-96'>
      <TipLinkSection
        tipUrl='https://jov.ie/an-artist-with-a-long-handle/pay?source=link'
        tipRelativePathLink='/an-artist-with-a-long-handle/pay?source=link'
      />
    </div>
  ),
};
