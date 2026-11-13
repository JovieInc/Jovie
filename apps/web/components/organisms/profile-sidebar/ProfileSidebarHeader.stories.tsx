import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';
import { toast } from '@/components/feedback';
import { useProfileHeaderParts } from './ProfileSidebarHeader';

// The Storybook navigation mock pins pathname '/test', which isProfileRoute
// treats as a profile route — and FeedbackProvider mounts no Toaster on
// profile routes — so the failure toast can never render in this lane.
// Following the ShareableLinkRow convention (the surface reports the failure
// to its owner), these stories assert the error report — the toast.error
// call — instead of the toast DOM. (sb.mock's factory form is unsupported
// here: storybook's mock transform only understands { spy: true }; spying
// the toast object's method directly needs no module machinery.)
const toastErrorSpy = spyOn(toast, 'error');

/**
 * Download QR Code fetches the QR image; these stories answer that request
 * so the failure toast shows without leaving the browser.
 *
 * The QR image is generated locally (#25170): the component fetches a
 * `data:` URL carrying the generated PNG. Match on that scheme — the old
 * `includes('qr')` URL match leaned on the third-party QR service's domain
 * and silently missed the local payload, so the download succeeded and the
 * failure toast never rendered.
 */
function stubQrFetch(respond: () => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    String(input).startsWith('data:') ? respond() : originalFetch(input, init);
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
 * failure report. Clicking the item closes the menu, so the a11y audit
 * runs on the settled state: a held-open modal menu aria-hides the page
 * behind it, which axe reports as aria-hidden-focus.
 */
async function downloadQrAndExpectErrorReport({
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
  await waitFor(() =>
    expect(toastErrorSpy).toHaveBeenCalledWith('Unable to download QR code')
  );
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

/** The QR image read fails: the menu reports it as an error toast. */
export const ErrorQrDownload: Story = {
  beforeEach: () => {
    toastErrorSpy.mockClear();
    return stubQrFetch(async () => new Response(null, { status: 500 }));
  },
  play: downloadQrAndExpectErrorReport,
};

/** Offline: the QR image read never completes. */
export const OfflineQrDownload: Story = {
  beforeEach: () => {
    toastErrorSpy.mockClear();
    return stubQrFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
  },
  play: downloadQrAndExpectErrorReport,
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
