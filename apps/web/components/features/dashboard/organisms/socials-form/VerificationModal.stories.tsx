import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { VerificationModal } from './VerificationModal';

const meta = {
  title: 'Dashboard/Organisms/SocialsForm/VerificationModal',
  component: VerificationModal,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onClose: fn(),
    onVerify: fn(async () => undefined),
    hostname: 'novalane.com',
    verificationToken: 'jovie-verification=3f9c2a71b8d44e5aa6c0d1e2f3a4b5c6',
    verifying: false,
    verificationStatus: 'unverified',
    verificationError: null,
  },
} satisfies Meta<typeof VerificationModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Loading: the DNS check is running. */
export const Loading: Story = {
  args: { verifying: true, verificationStatus: 'pending' },
};

/** Empty: the token has not been issued yet. */
export const Empty: Story = { args: { verificationToken: '' } };

/** Error: the TXT record was not found yet. */
export const ErrorDnsNotFound: Story = {
  args: {
    verificationError: { code: 'dns_not_found', message: 'Record not found' },
  },
};

/** Partial: the domain is already verified, so only the success note shows. */
export const PartialVerified: Story = {
  args: { verificationStatus: 'verified' },
};

/** Long content: a long hostname and token that wrap. */
export const LongContent: Story = {
  args: {
    hostname: 'the-extraordinarily-long-named-artist-website.example.com',
    verificationToken:
      'jovie-verification=3f9c2a71b8d44e5aa6c0d1e2f3a4b5c63f9c2a71b8d44e5aa6c0d1e2f3a4b5c6',
  },
};

/** Rtl: right-to-left layout. */
export const Rtl: Story = {
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
