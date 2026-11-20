import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { PublicClaimBanner } from '@/app/[username]/_components/PublicClaimBanner';

/**
 * /[username] claim banner states across unclaimed organic visits, manual
 * verification holds, and Better Auth claimed profiles where the banner
 * stays suppressed.
 */
const meta = {
  title: 'Pages/Profile/Public Claim Banner',
  component: PublicClaimBanner,
  parameters: {
    layout: 'padded',
    chromatic: { viewports: [390, 1440] },
  },
  args: {
    profileHandle: 'signalartist',
    displayName: 'Signal Artist',
    directClaimSupported: true,
    claimRequiresVerification: false,
    isClaimed: false,
    visitorState: 'organic_unclaimed',
  },
  decorators: [
    Story => (
      <div className='dark min-h-28 w-full bg-base p-6 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PublicClaimBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnclaimedOrganic: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('link', { name: 'Claim Profile for Signal Artist' })
    ).toHaveAttribute('href', '/signalartist/claim?next=auth');
  },
};

export const VerificationRequiredHold: Story = {
  args: {
    directClaimSupported: false,
    claimRequiresVerification: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('claim-banner')).toHaveTextContent(
      'Verified ownership is required'
    );
    await expect(canvas.queryByRole('link')).toBeNull();
  },
};

export const ClaimedBetterAuthPublic: Story = {
  args: {
    isClaimed: true,
    visitorState: 'claimed_public',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId('claim-banner')).toBeNull();
  },
};

export const ClaimedBetterAuthOwner: Story = {
  args: {
    isClaimed: true,
    visitorState: 'owner',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId('claim-banner')).toBeNull();
  },
};
