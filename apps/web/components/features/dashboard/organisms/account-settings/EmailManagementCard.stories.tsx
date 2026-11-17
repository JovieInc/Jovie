import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { EmailManagementCard } from './EmailManagementCard';
import type { ClerkEmailAddressResource, ClerkUserResource } from './types';

function email(
  id: string,
  emailAddress: string,
  verified: boolean
): ClerkEmailAddressResource {
  return {
    id,
    emailAddress,
    verification: { status: verified ? 'verified' : 'unverified' },
    prepareVerification: async () => undefined,
    attemptVerification: async () => ({
      id,
      emailAddress,
      verification: { status: 'verified' },
      prepareVerification: async () => undefined,
      attemptVerification: async () => {
        throw new Error('Already verified');
      },
      destroy: async () => undefined,
    }),
    destroy: async () => undefined,
  } as ClerkEmailAddressResource;
}

function user(
  emails: ClerkEmailAddressResource[],
  createEmailAddress: ClerkUserResource['createEmailAddress'] = async args =>
    email('new', args.email, false)
): ClerkUserResource {
  return {
    primaryEmailAddressId: emails[0]?.id ?? null,
    emailAddresses: emails,
    externalAccounts: [],
    createEmailAddress,
    update: async () => undefined,
    reload: async () => undefined,
  };
}

const defaultEmails = [
  email('primary', 'artist@example.com', true),
  email('backup', 'backup@example.com', true),
  email('pending', 'new@example.com', false),
];

const CardShell: Decorator = function CardShell(Story) {
  return (
    <div className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

const RtlShell: Decorator = function RtlShell(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

async function submitNewEmail(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.type(
    canvas.getByLabelText('Add email address'),
    'fan@example.com'
  );
  await userEvent.click(canvas.getByRole('button', { name: 'Add' }));
  return canvas;
}

const meta = {
  title: 'Dashboard/Organisms/AccountSettings/EmailManagementCard',
  component: EmailManagementCard,
  parameters: { layout: 'padded' },
  decorators: [CardShell],
  args: { user: user(defaultEmails) },
} satisfies Meta<typeof EmailManagementCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: a primary, a verified backup and an unverified address. */
export const Default: Story = {};

/** Empty: the account has no email addresses yet, only the add form. */
export const EmptyNoEmails: Story = { args: { user: user([]) } };

/** Error: the provider rejects the new address and the form shows why. */
export const ErrorAddressRejected: Story = {
  args: {
    user: user(defaultEmails, async () => {
      throw new Error('That email address is taken. Please try another.');
    }),
  },
  play: async function playRejected({ canvasElement }) {
    const canvas = await submitNewEmail(canvasElement);
    await waitFor(() =>
      expect(
        canvas.getByText('That email address is taken. Please try another.')
      ).toBeInTheDocument()
    );
  },
};

/** Offline: the request to add the address never reaches the server. */
export const OfflineAddFailed: Story = {
  args: {
    user: user(defaultEmails, async () => {
      throw new TypeError('Failed to fetch');
    }),
  },
  play: async function playOffline({ canvasElement }) {
    const canvas = await submitNewEmail(canvasElement);
    await waitFor(() =>
      expect(canvas.getByLabelText('Add email address')).toHaveValue(
        'fan@example.com'
      )
    );
  },
};

/** Long content: many addresses, one far longer than the row. */
export const LongContentManyEmails: Story = {
  args: {
    user: user([
      email(
        'long',
        'a.very.long.address.for.the.booking.and.management.team@extremely-long-domain-name.example.com',
        true
      ),
      ...defaultEmails,
      email('press', 'press@example.com', true),
      email('label', 'label-contact@example.com', false),
    ]),
  },
};

/** Right-to-left: the card in a right-to-left document. */
export const RtlEmails: Story = { decorators: [RtlShell] };
