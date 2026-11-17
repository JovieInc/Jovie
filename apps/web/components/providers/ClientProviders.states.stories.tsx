import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ClientProviders } from './ClientProviders';

const LONG_COPY =
  'This deliberately long page copy runs across several lines so the provider can be checked for passing long children through unchanged, without clipping, truncating or reflowing anything it wraps, at every width the app supports.';

const meta = {
  title: 'Providers/ClientProviders States',
  component: ClientProviders,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ClientProviders>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: long children pass through the provider unchanged. */
export const LongContentChildren: Story = {
  args: {
    children: (
      <p className='w-full max-w-md rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-primary-token'>
        {LONG_COPY}
      </p>
    ),
  },
};

/** RTL: right-to-left children keep their direction inside the provider. */
export const RtlChildren: Story = {
  args: {
    children: (
      <p
        dir='rtl'
        lang='ar'
        className='rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-primary-token'
      >
        محتوى الصفحة داخل مزود في مستند من اليمين إلى اليسار.
      </p>
    ),
  },
};

/** Partial: a signed-in bootstrap whose user has not picked a username yet. */
export const PartialBootstrapWithoutUsername: Story = {
  args: {
    authBootstrap: {
      isAuthenticated: true,
      userId: 'user-1',
      email: 'artist@example.com',
      username: null,
      fullName: 'Tim White',
      isAdmin: false,
      persona: 'creator',
    },
    children: (
      <p className='rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-primary-token'>
        Signed-in app shell before onboarding picks a handle
      </p>
    ),
  },
};
