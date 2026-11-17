import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import {
  createDashboardQueryClient,
  DASHBOARD_FIXTURE_PROFILE_ID,
  DashboardStoryProviders,
} from '@/.storybook/dashboard-fixtures';
import { queryKeys } from '@/lib/queries/keys';
import type { BillingStatusData } from '@/lib/queries/useBillingStatusQuery';
import type { DashboardContact } from '@/types/contacts';
import type { Artist } from '@/types/db';
import { SettingsContactsSection } from './SettingsContactsSection';

const artist = {
  id: DASHBOARD_FIXTURE_PROFILE_ID,
  owner_user_id: 'story-user',
  handle: 'sashawaves',
  spotify_id: '',
  name: 'Sasha Waves',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies Artist;

const billing: BillingStatusData = {
  isPro: true,
  plan: 'pro',
  hasStripeCustomer: true,
  stripeSubscriptionId: 'sub_story',
  stale: false,
  staleReason: null,
  trialStartedAt: null,
  trialEndsAt: null,
  trialNotificationsSent: 0,
};

const contact = (overrides: Partial<DashboardContact>): DashboardContact => ({
  id: 'contact-1',
  creatorProfileId: DASHBOARD_FIXTURE_PROFILE_ID,
  role: 'management',
  customLabel: null,
  personName: 'Kelly Strickland',
  companyName: 'North Star Management',
  territories: [],
  email: 'kelly@example.com',
  phone: null,
  preferredChannel: 'email',
  isActive: true,
  sortOrder: 0,
  ...overrides,
});

const CONTACTS = [
  contact({}),
  contact({
    id: 'contact-2',
    role: 'bookings',
    personName: 'Ari Booker',
    companyName: 'Wavelength Agency',
    email: 'ari@example.com',
    sortOrder: 1,
  }),
];

type Seed = 'loading' | 'error' | readonly DashboardContact[];

function seedClient(seed: Seed): QueryClient {
  const client = createDashboardQueryClient();
  client.setQueryData(queryKeys.billing.status(), billing);
  const key = queryKeys.contacts.list(artist.id);
  if (seed === 'loading') {
    // A never-settling fetch keeps the query loading.
    void client.prefetchQuery({
      queryKey: key,
      queryFn: () => new Promise<DashboardContact[]>(() => {}),
    });
  } else if (seed === 'error') {
    client
      .getQueryCache()
      .build<DashboardContact[], Error>(client, { queryKey: key })
      .setState({
        status: 'error',
        error: new Error('Contacts could not be loaded'),
        fetchStatus: 'idle',
      });
  } else {
    client.setQueryData(key, [...seed]);
  }
  return client;
}

function ContactsShell({
  seed,
  children,
}: {
  readonly seed: Seed;
  readonly children: ReactNode;
}) {
  return (
    <DashboardStoryProviders queryClient={seedClient(seed)}>
      <div className='max-w-2xl'>{children}</div>
    </DashboardStoryProviders>
  );
}

const meta = {
  title: 'Dashboard/Organisms/SettingsContactsSection',
  component: SettingsContactsSection,
  parameters: { layout: 'padded' },
  args: { artist },
} satisfies Meta<typeof SettingsContactsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithContacts: Story = {
  decorators: [
    function WithContactsDecorator(Story) {
      return (
        <ContactsShell seed={CONTACTS}>
          <Story />
        </ContactsShell>
      );
    },
  ],
};

/** Loading: the panel keeps its header while the contact list loads. */
export const Loading: Story = {
  decorators: [
    function LoadingDecorator(Story) {
      return (
        <ContactsShell seed='loading'>
          <Story />
        </ContactsShell>
      );
    },
  ],
};

/** Empty: no contacts yet. */
export const Empty: Story = {
  decorators: [
    function EmptyDecorator(Story) {
      return (
        <ContactsShell seed={[]}>
          <Story />
        </ContactsShell>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No contacts yet')).toBeVisible();
  },
};

/** Error: the list failed to load and offers a retry. */
export const ErrorLoadFailed: Story = {
  decorators: [
    function ErrorLoadFailedDecorator(Story) {
      return (
        <ContactsShell seed='error'>
          <Story />
        </ContactsShell>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Try Again' })
    ).toBeVisible();
  },
};

/** Long content: long names and companies in each row. */
export const LongContentNames: Story = {
  decorators: [
    function LongContentNamesDecorator(Story) {
      return (
        <ContactsShell
          seed={[
            contact({
              personName:
                'Alexandria Montgomery-Fitzgerald the Third of Westminster',
              companyName:
                'International Worldwide Touring and Artist Management Partners Limited',
              email:
                'alexandria.montgomery.fitzgerald@international-touring-partners.example.com',
            }),
          ]}
        >
          <Story />
        </ContactsShell>
      );
    },
  ],
};

/** Right-to-left: the contact list inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <ContactsShell
            seed={[
              contact({ personName: 'كيلي ستريكلاند', companyName: null }),
            ]}
          >
            <Story />
          </ContactsShell>
        </div>
      );
    },
  ],
};
