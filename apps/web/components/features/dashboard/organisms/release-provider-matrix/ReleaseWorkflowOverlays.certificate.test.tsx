import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('./release-lazy-components', () => ({
  SpotifyConnectDialog: ({
    open,
    onOpenChange,
    connected,
    connectedArtistName,
    onConnected,
    onImportStart,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    connected?: boolean;
    connectedArtistName?: string | null;
    onConnected: (releases: ReleaseViewModel[], artistName: string) => void;
    onImportStart: (artistName: string) => void;
  }) =>
    open ? (
      <div role='dialog' aria-label='Connect Spotify'>
        <p>
          {connected ? `Connected as ${connectedArtistName}` : 'Not connected'}
        </p>
        <button type='button' onClick={() => onImportStart('Sasha Waves')}>
          Start Import
        </button>
        <button type='button' onClick={() => onConnected([], 'Sasha Waves')}>
          Finish Connect
        </button>
        <button type='button' onClick={() => onOpenChange(false)}>
          Close Spotify
        </button>
      </div>
    ) : null,
  ArtistSearchCommandPalette: ({
    open,
    onOpenChange,
    provider,
    onArtistSelect,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    provider: string;
    onArtistSelect: (artist: { id: string; name: string }) => void;
  }) =>
    open ? (
      <div role='dialog' aria-label={`Search ${provider}`}>
        <button
          type='button'
          onClick={() => onArtistSelect({ id: 'am-1', name: 'Sasha Waves' })}
        >
          Pick Artist
        </button>
        <button type='button' onClick={() => onOpenChange(false)}>
          Close Search
        </button>
      </div>
    ) : null,
  ReleasePlanWizard: ({
    releaseTitle,
    isGateLoading,
    canGenerateReleasePlans,
    isGeneratingReleasePlan,
    onClose,
    onSubmit,
  }: {
    releaseTitle: string;
    isGateLoading: boolean;
    canGenerateReleasePlans: boolean;
    isGeneratingReleasePlan: boolean;
    onClose: () => void;
    onSubmit: () => void | Promise<void>;
  }) => (
    <div
      role='dialog'
      aria-label={`Plan ${releaseTitle}`}
      data-gate-loading={String(isGateLoading)}
      data-can-generate={String(canGenerateReleasePlans)}
      data-generating={String(isGeneratingReleasePlan)}
    >
      <button type='button' onClick={() => void onSubmit()}>
        Generate
      </button>
      <button type='button' onClick={onClose}>
        Close Plan
      </button>
    </div>
  ),
}));

import { ReleaseWorkflowOverlays } from './ReleaseWorkflowOverlays';

type Props = ComponentProps<typeof ReleaseWorkflowOverlays>;

const releasedRelease = {
  id: 'release-released',
  title: 'Skyline Dreams',
  status: 'released',
  sourceType: 'ingested',
  primaryIsrc: 'USRC17607839',
  providers: [],
} as unknown as ReleaseViewModel;

const draftRelease = {
  id: 'release-draft',
  title: 'Untitled Demo',
  status: 'draft',
  sourceType: 'manual',
  primaryIsrc: null,
  providers: [],
} as unknown as ReleaseViewModel;

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    amPaletteOpen: false,
    setAmPaletteOpen: vi.fn(),
    spotifySearchOpen: false,
    setSpotifySearchOpen: vi.fn(),
    onAppleMusicConnect: vi.fn(),
    onSpotifyConnected: vi.fn(),
    onSpotifyImportStart: vi.fn(),
    postCreateRelease: null,
    isPostCreatePlanModalOpen: false,
    isReleasePlanGateLoading: false,
    canGenerateReleasePlans: false,
    isGeneratingReleasePlan: false,
    closePostCreatePlanModal: vi.fn(),
    onGenerateReleasePlan: vi.fn(),
    deleteTarget: null,
    isDeleting: false,
    closeDeleteDialog: vi.fn(),
    onDeleteConfirm: vi.fn(),
    ...overrides,
  };
}

describe('ReleaseWorkflowOverlays certificate', () => {
  it('renders no overlay while every workflow is idle', async () => {
    const { baseElement } = render(
      <ReleaseWorkflowOverlays {...createProps()} />
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await expectNoA11yViolations(baseElement);
  });

  it('forwards the Apple Music search selection and close', async () => {
    const user = userEvent.setup();
    const props = createProps({ amPaletteOpen: true });
    const { container } = render(<ReleaseWorkflowOverlays {...props} />);

    const search = await screen.findByRole('dialog', {
      name: 'Search apple_music',
    });
    await expectNoA11yViolations(container);
    await user.click(
      within(search).getByRole('button', { name: 'Pick Artist' })
    );
    expect(props.onAppleMusicConnect).toHaveBeenCalledWith({
      id: 'am-1',
      name: 'Sasha Waves',
    });
    await user.click(
      within(search).getByRole('button', { name: 'Close Search' })
    );
    expect(props.setAmPaletteOpen).toHaveBeenCalledWith(false);
  });

  it('forwards the Spotify connect, import start and close callbacks', async () => {
    const user = userEvent.setup();
    const props = createProps({
      spotifySearchOpen: true,
      spotifyConnected: true,
      spotifyArtistName: 'Tim White',
    });
    const { container } = render(<ReleaseWorkflowOverlays {...props} />);

    const dialog = await screen.findByRole('dialog', {
      name: 'Connect Spotify',
    });
    expect(dialog).toHaveTextContent('Connected as Tim White');
    await expectNoA11yViolations(container);

    await user.click(
      within(dialog).getByRole('button', { name: 'Start Import' })
    );
    expect(props.onSpotifyImportStart).toHaveBeenCalledWith('Sasha Waves');
    await user.click(
      within(dialog).getByRole('button', { name: 'Finish Connect' })
    );
    expect(props.onSpotifyConnected).toHaveBeenCalledWith([], 'Sasha Waves');
    await user.click(
      within(dialog).getByRole('button', { name: 'Close Spotify' })
    );
    expect(props.setSpotifySearchOpen).toHaveBeenCalledWith(false);
  });

  it('defaults the Spotify dialog to a disconnected account', async () => {
    render(
      <ReleaseWorkflowOverlays {...createProps({ spotifySearchOpen: true })} />
    );
    expect(
      await screen.findByRole('dialog', { name: 'Connect Spotify' })
    ).toHaveTextContent('Not connected');
  });

  it('opens the post-create plan wizard only with a release and forwards its actions', async () => {
    const user = userEvent.setup();
    const props = createProps({
      postCreateRelease: draftRelease,
      isPostCreatePlanModalOpen: true,
      isReleasePlanGateLoading: true,
      canGenerateReleasePlans: true,
      isGeneratingReleasePlan: true,
    });
    const { container, rerender } = render(
      <ReleaseWorkflowOverlays {...props} />
    );

    const wizard = await screen.findByRole('dialog', {
      name: 'Plan Untitled Demo',
    });
    expect(wizard).toHaveAttribute('data-gate-loading', 'true');
    expect(wizard).toHaveAttribute('data-can-generate', 'true');
    expect(wizard).toHaveAttribute('data-generating', 'true');
    await expectNoA11yViolations(container);

    await user.click(within(wizard).getByRole('button', { name: 'Generate' }));
    expect(props.onGenerateReleasePlan).toHaveBeenCalledTimes(1);
    await user.click(
      within(wizard).getByRole('button', { name: 'Close Plan' })
    );
    expect(props.closePostCreatePlanModal).toHaveBeenCalledTimes(1);

    rerender(<ReleaseWorkflowOverlays {...props} postCreateRelease={null} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('archives a distributed release after confirmation', async () => {
    const user = userEvent.setup();
    const props = createProps({ deleteTarget: releasedRelease });
    render(<ReleaseWorkflowOverlays {...props} />);

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Archive "Skyline Dreams"?',
    });
    expect(dialog).toHaveTextContent('not permanently deleted');
    await expectNoA11yViolations(dialog);

    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() =>
      expect(props.closeDeleteDialog).toHaveBeenCalledTimes(1)
    );
    expect(props.onDeleteConfirm).toHaveBeenCalledTimes(1);
  });

  it('deletes a manual draft, and cancelling closes without deleting', async () => {
    const user = userEvent.setup();
    const props = createProps({ deleteTarget: draftRelease });
    render(<ReleaseWorkflowOverlays {...props} />);

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Delete "Untitled Demo"?',
    });
    expect(dialog).toHaveTextContent(
      'This will permanently remove the release'
    );
    expect(
      within(dialog).getByRole('button', { name: 'Delete' })
    ).toBeEnabled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(props.closeDeleteDialog).toHaveBeenCalledTimes(1);
    expect(props.onDeleteConfirm).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with an alert when the delete rejects', async () => {
    const user = userEvent.setup();
    const props = createProps({
      deleteTarget: draftRelease,
      onDeleteConfirm: vi.fn().mockRejectedValue(new Error('nope')),
    });
    render(<ReleaseWorkflowOverlays {...props} />);

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Action failed. Please try again.'
    );
    expect(props.closeDeleteDialog).not.toHaveBeenCalled();
    await expectNoA11yViolations(dialog);
  });

  it('locks both buttons while a delete is in flight', async () => {
    const user = userEvent.setup();
    const props = createProps({
      deleteTarget: releasedRelease,
      isDeleting: true,
    });
    render(<ReleaseWorkflowOverlays {...props} />);

    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', {
      name: 'Please wait...',
    });
    expect(confirm).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' })
    ).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(props.closeDeleteDialog).not.toHaveBeenCalled();
    expect(props.onDeleteConfirm).not.toHaveBeenCalled();
  });
});
