import '@/styles/system-b-app.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { AdminWaitlistTableWithViews } from './AdminWaitlistTableWithViews';

function entry(
  index: number,
  overrides: Partial<WaitlistEntryRow> = {}
): WaitlistEntryRow {
  return {
    id: `waitlist_${index}`,
    fullName: `Ari Lane ${index}`,
    email: `ari${index}@example.com`,
    primaryGoal: null,
    primarySocialUrl: `https://instagram.com/ari${index}`,
    primarySocialPlatform: 'instagram',
    primarySocialUrlNormalized: `https://instagram.com/ari${index}`,
    spotifyUrl: null,
    spotifyUrlNormalized: null,
    spotifyArtistName: null,
    heardAbout: null,
    status: 'new',
    primarySocialFollowerCount: null,
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    updatedAt: new Date('2026-01-10T00:00:00.000Z'),
    ...overrides,
  } as WaitlistEntryRow;
}

const healthyIntegrity = {
  totalIssues: 0,
  usersMissingWaitlistEntry: 0,
  entriesMissingUser: 0,
  signedUpEntriesMissingUser: 0,
};

/**
 * Rendered states of the waitlist table. The default, healthy and empty
 * stories live in AdminWaitlistTableWithViews.stories.tsx.
 */
const meta: Meta<typeof AdminWaitlistTableWithViews> = {
  title: 'Admin/Tables/WaitlistWithViews/States',
  component: AdminWaitlistTableWithViews,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Error: copying the selected emails fails (the clipboard refuses and the
 * fallback copy reports failure), so the table raises its error toast.
 */
export const ErrorCopyEmailsFailed: Story = {
  args: {
    entries: [entry(1)],
    page: 1,
    pageSize: 25,
    total: 1,
    integrity: healthyIntegrity,
    onActionError: fn(),
  },
  beforeEach: () => {
    const clipboard = navigator.clipboard;
    const execCommand = document.execCommand;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
    document.execCommand = () => false;
    return () => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: clipboard,
      });
      document.execCommand = execCommand;
    };
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'Select row 1' })
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('menuitem', { name: 'Copy Emails' })
    );
    // The harness's mock '/test' pathname is a profile route, where
    // FeedbackProvider mounts no Toaster — the failure toast can never
    // render in this lane. The surface reports the failure to its owner;
    // assert the exact message through the reporter (ProfileSidebarHeader
    // convention).
    await expect(args.onActionError).toHaveBeenCalledWith(
      'Failed to copy emails'
    );
  },
};

/** Long content: many rows with long names, emails and integrity counts. */
export const LongContentManyEntries: Story = {
  args: {
    entries: Array.from({ length: 40 }, (_, index) =>
      entry(index + 1, {
        fullName: `Alexandria Montgomery-Wellington the Third, entry ${index + 1}`,
        email: `alexandria.montgomery.wellington.${index + 1}@an-unusually-long-label-domain.example.com`,
      })
    ),
    page: 1,
    pageSize: 25,
    total: 1280,
    integrity: {
      totalIssues: 1204,
      usersMissingWaitlistEntry: 1000,
      entriesMissingUser: 200,
      signedUpEntriesMissingUser: 4,
    },
  },
};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** RTL: Arabic names in a right-to-left admin page. */
export const RtlEntries: Story = {
  decorators: [withRtl],
  args: {
    entries: [
      entry(1, { fullName: 'ليلى حسن', email: 'layla@example.com' }),
      entry(2, { fullName: 'عمر خالد', email: 'omar@example.com' }),
    ],
    page: 1,
    pageSize: 25,
    total: 2,
    integrity: healthyIntegrity,
  },
};
