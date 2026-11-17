import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ComponentType } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { ConnectedAccountsCard } from './ConnectedAccountsCard';
import type { ClerkExternalAccountResource, ClerkUserResource } from './types';

const account = (
  overrides: Partial<ClerkExternalAccountResource>
): ClerkExternalAccountResource => ({
  id: 'ext-google',
  provider: 'oauth_google',
  emailAddress: 'tim@example.com',
  verification: { status: 'verified' },
  destroy: async () => undefined,
  ...overrides,
});

const user = (
  externalAccounts: ClerkExternalAccountResource[]
): ClerkUserResource => ({
  primaryEmailAddressId: null,
  emailAddresses: [],
  externalAccounts,
  createEmailAddress: async () => {
    throw new Error('Not available in stories');
  },
  update: async () => undefined,
  reload: async () => undefined,
});

function withColumn(Story: ComponentType) {
  return (
    <div className='w-full max-w-xl'>
      <Story />
    </div>
  );
}

function withRtl(Story: ComponentType) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Dashboard/Organisms/AccountSettings/ConnectedAccountsCard',
  component: ConnectedAccountsCard,
  parameters: { layout: 'padded' },
  decorators: [withColumn],
  args: {
    user: user([
      account({}),
      account({
        id: 'ext-spotify',
        provider: 'oauth_spotify',
        emailAddress: undefined,
        username: 'timwhite',
        verification: null,
      }),
    ]),
  },
} satisfies Meta<typeof ConnectedAccountsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

/** Empty: no OAuth provider is linked. */
export const Empty: Story = {
  args: { user: user([]) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('No connected accounts yet.')
    ).toBeVisible();
  },
};

/** Error: the provider refuses the disconnect, so the row stays. */
export const ErrorDisconnectFailed: Story = {
  args: {
    user: user([
      account({
        destroy: async () => {
          throw new Error('Could not disconnect Google. Try again.');
        },
      }),
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Disconnect' }));
    const dialog = await within(document.body).findByRole('alertdialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Disconnect' })
    );
    await expect(await canvas.findByText('tim@example.com')).toBeVisible();
  },
};

/** Long content: a long identifier truncates beside the action. */
export const LongContentIdentifier: Story = {
  args: {
    user: user([
      account({
        emailAddress:
          'tim.white.official.artist.account.for.bookings@international-music-collective.example.com',
      }),
      account({
        id: 'ext-custom',
        provider: 'oauth_an_extremely_long_custom_identity_provider_name',
        emailAddress: undefined,
        firstName: 'Bartholomew Maximilian',
        lastName: 'Montgomery-Fitzgerald',
        verification: null,
      }),
    ]),
  },
};

/** Right-to-left: the provider rows inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [withRtl],
};
