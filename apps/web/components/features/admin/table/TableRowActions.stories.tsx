import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableRowActions } from './TableRowActions';

const meta = {
  title: 'Features/Admin/TableRowActions',
  component: TableRowActions,
  parameters: {
    layout: 'centered',
  },
  args: {
    isVerified: false,
    isClaimed: true,
    verificationStatus: 'idle',
    refreshIngestStatus: 'idle',
    onToggleVerification: async () => {},
    onRefreshIngest: async () => {},
  },
} satisfies Meta<typeof TableRowActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unverified: Story = {};

export const Verified: Story = {
  args: {
    isVerified: true,
  },
};

export const Loading: Story = {
  args: {
    verificationStatus: 'loading',
    refreshIngestStatus: 'loading',
  },
};

/** Empty: a row that is neither claimed nor verified. */
export const EmptyUnclaimed: Story = {
  args: { isClaimed: false, isVerified: false },
};

/** Error: the parent reports a failed verification and the control stays usable. */
export const ErrorVerificationFailed: Story = {
  args: { verificationStatus: 'error', refreshIngestStatus: 'error' },
};

/** RTL: the action row mirrors in a right-to-left document. */
export const RtlActions: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
