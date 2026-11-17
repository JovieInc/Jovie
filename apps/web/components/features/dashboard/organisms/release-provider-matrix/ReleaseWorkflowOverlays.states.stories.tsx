import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { ReleaseWorkflowOverlays } from './ReleaseWorkflowOverlays';

const LONG_TITLE =
  'Skyline Dreams (Tenth Anniversary Remastered Deluxe Edition with Bonus Live Sessions, Demos and Commentary)';

const releasedRelease = {
  id: 'release-released',
  profileId: 'story-profile',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  smartLinkPath: '/r/skyline-dreams--release-released',
  releaseDate: '2024-06-01T00:00:00.000Z',
  status: 'released',
  sourceType: 'ingested',
  primaryIsrc: 'USRC17607839',
  providers: [],
} as unknown as ReleaseViewModel;

/** A manual draft: no release date, ISRC or provider links yet. */
const draftRelease = {
  id: 'release-draft',
  profileId: 'story-profile',
  title: 'Untitled Demo',
  slug: 'untitled-demo',
  smartLinkPath: '/r/untitled-demo--release-draft',
  status: 'draft',
  sourceType: 'manual',
  primaryIsrc: null,
  providers: [],
} as unknown as ReleaseViewModel;

/** Dialogs portal to the body, so the direction is set on the document. */
function setDocumentRtl() {
  const previous = document.documentElement.getAttribute('dir');
  document.documentElement.setAttribute('dir', 'rtl');
  return () => {
    if (previous === null) {
      document.documentElement.removeAttribute('dir');
    } else {
      document.documentElement.setAttribute('dir', previous);
    }
  };
}

const meta = {
  title: 'Dashboard/Releases/ReleaseWorkflowOverlays States',
  component: ReleaseWorkflowOverlays,
  args: {
    amPaletteOpen: false,
    setAmPaletteOpen: fn(),
    spotifySearchOpen: false,
    setSpotifySearchOpen: fn(),
    onAppleMusicConnect: fn(),
    onSpotifyConnected: fn(),
    onSpotifyImportStart: fn(),
    postCreateRelease: null,
    isPostCreatePlanModalOpen: false,
    isReleasePlanGateLoading: false,
    canGenerateReleasePlans: false,
    isGeneratingReleasePlan: false,
    closePostCreatePlanModal: fn(),
    onGenerateReleasePlan: fn(),
    deleteTarget: null,
    isDeleting: false,
    closeDeleteDialog: fn(),
    onDeleteConfirm: fn(),
  },
} satisfies Meta<typeof ReleaseWorkflowOverlays>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: an archive is in flight, so both dialog buttons are disabled. */
export const LoadingDeleteInFlight: Story = {
  args: { deleteTarget: releasedRelease, isDeleting: true },
  play: async () => {
    const dialog = within(
      await within(document.body).findByRole('alertdialog')
    );
    await expect(
      dialog.getByRole('button', { name: 'Please wait...' })
    ).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  },
};

/** Empty: no workflow is active, so no overlay is on screen. */
export const EmptyNoOverlayOpen: Story = {
  play: async () => {
    const body = within(document.body);
    await expect(body.queryByRole('alertdialog')).toBeNull();
    await expect(body.queryByRole('dialog')).toBeNull();
  },
};

/** Error: the confirm handler rejects and the dialog reports the failure. */
export const ErrorDeleteFailed: Story = {
  args: {
    deleteTarget: draftRelease,
    onDeleteConfirm: fn(async () => {
      throw new Error('Delete failed');
    }),
  },
  play: async ({ args }) => {
    const dialog = within(
      await within(document.body).findByRole('alertdialog')
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }));
    await expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Action failed. Please try again.'
    );
    await expect(args.closeDeleteDialog).not.toHaveBeenCalled();
  },
};

/** Partial: a manual draft with no date or ISRC is deleted, not archived. */
export const PartialDraftWithoutDistribution: Story = {
  args: { deleteTarget: draftRelease },
  play: async () => {
    const dialog = await within(document.body).findByRole('alertdialog', {
      name: 'Delete "Untitled Demo"?',
    });
    await expect(dialog).toHaveTextContent(
      'This will permanently remove the release from your dashboard and public profile.'
    );
  },
};

/** Long content: a long release title in the archive confirmation. */
export const LongContentReleaseTitle: Story = {
  args: { deleteTarget: { ...releasedRelease, title: LONG_TITLE } },
  play: async () => {
    const dialog = await within(document.body).findByRole('alertdialog', {
      name: `Archive "${LONG_TITLE}"?`,
    });
    await expect(
      within(dialog).getByRole('button', { name: 'Archive' })
    ).toBeEnabled();
  },
};

/** Right-to-left: the archive confirmation inside an RTL document. */
export const RtlArchiveDialog: Story = {
  args: { deleteTarget: releasedRelease },
  beforeEach: setDocumentRtl,
  play: async ({ args }) => {
    const dialog = within(
      await within(document.body).findByRole('alertdialog', {
        name: 'Archive "Skyline Dreams"?',
      })
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
    await expect(args.closeDeleteDialog).toHaveBeenCalledTimes(1);
  },
};
