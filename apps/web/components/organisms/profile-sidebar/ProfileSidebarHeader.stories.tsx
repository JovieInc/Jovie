import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useProfileHeaderParts } from './ProfileSidebarHeader';

/**
 * Download QR Code fetches the QR image; these stories answer that request
 * so the failure toast shows without leaving the browser.
 */
function stubQrFetch(respond: () => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    String(input).includes('qr') ? respond() : originalFetch(input, init);
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function openMenu({
  canvasElement,
}: {
  readonly canvasElement: HTMLElement;
}) {
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: 'More actions' })
  );
}

/**
 * Opens the overflow menu, triggers the QR download, and waits for the
 * failure toast. Clicking the item closes the menu, so the a11y audit
 * runs on the settled toast state: a held-open modal menu aria-hides the
 * page behind it, which axe reports as aria-hidden-focus.
 */
async function downloadQrAndAwaitToast({
  canvasElement,
}: {
  readonly canvasElement: HTMLElement;
}) {
  await openMenu({ canvasElement });
  await userEvent.click(
    within(document.body).getByRole('menuitem', {
      name: 'Download QR Code',
    })
  );
  await expect(
    await within(document.body).findByText('Unable to download QR code')
  ).toBeVisible();
}

function ProfileSidebarHeaderDemo({
  username,
  displayName,
  profilePath,
}: {
  readonly username: string;
  readonly displayName: string;
  readonly profilePath: string;
}) {
  const { title, actions } = useProfileHeaderParts({
    username,
    displayName,
    profilePath,
  });
  return (
    <div className='flex items-center justify-between gap-2 rounded-lg border border-subtle bg-surface-0 px-3 py-2'>
      {title}
      {actions}
    </div>
  );
}

const meta = {
  title: 'Organisms/ProfileSidebar/ProfileSidebarHeader',
  component: ProfileSidebarHeaderDemo,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    username: 'tim',
    displayName: 'Tim White',
    profilePath: '/tim',
  },
} satisfies Meta<typeof ProfileSidebarHeaderDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PartialUsernameOnly: Story = {
  args: {
    displayName: 'tim',
  },
};

/** No handle or name yet: the header falls back to the Profile label. */
export const EmptyIdentity: Story = {
  args: {
    username: '',
    displayName: '',
    profilePath: '',
  },
};

/** The QR service answers with an error: the menu reports it in a toast. */
export const ErrorQrDownload: Story = {
  beforeEach: () =>
    stubQrFetch(async () => new Response(null, { status: 500 })),
  play: downloadQrAndAwaitToast,
};

/** Offline: the QR request never reaches the service. */
export const OfflineQrDownload: Story = {
  beforeEach: () =>
    stubQrFetch(async () => {
      throw new TypeError('Failed to fetch');
    }),
  play: downloadQrAndAwaitToast,
};

export const LongContentName: Story = {
  args: {
    username: 'the-extraordinarily-long-artist-handle',
    displayName:
      'The Extraordinarily Long Artist Name That Keeps Going Past The Rail',
  },
};

export const RtlName: Story = {
  args: {
    displayName: 'تيم وايت',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
