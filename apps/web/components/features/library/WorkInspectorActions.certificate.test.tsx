import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { toast } from '@/components/feedback';
import type { WorkLaunchSummary } from '@/lib/library/work-actions';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WorkInspectorActions } from './WorkInspectorActions';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/feedback', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const asset = {
  id: 'release-1',
  title: 'Take Me Over',
  artist: 'Tim White',
  smartLinkPath: '/tim/take-me-over',
  releaseDate: '2026-04-28T00:00:00.000Z',
  releaseType: 'single',
  status: 'released',
  approvalStatus: 'draft',
  profileVisibility: 'visible',
  providers: [],
  assetKinds: [],
  genres: [],
} as unknown as LibraryReleaseAsset;

const launch = {
  id: 'launch-1',
  workId: 'release-1',
  title: 'Take Me Over launch',
  kitStatus: 'ready',
  pressKitHref: '/app/releases/release-1/press-kit',
  pressReleaseHref: '/app/releases/release-1/press-release',
  launchHref: '/app/releases/release-1/tasks',
} as WorkLaunchSummary;

function mount(
  props: Partial<Parameters<typeof WorkInspectorActions>[0]> = {}
) {
  return render(
    <WorkInspectorActions
      asset={asset}
      canPublish
      onSharePrivately={vi.fn()}
      onAskJovie={vi.fn()}
      {...props}
    />
  );
}

afterEach(() => vi.clearAllMocks());

describe('WorkInspectorActions certificate', () => {
  it('copies the live page link and confirms it', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    const { container } = mount();

    await user.click(screen.getByRole('button', { name: 'Share Page' }));

    expect(writeText).toHaveBeenCalledWith(
      `${globalThis.location.origin}/tim/take-me-over`
    );
    expect(toast.success).toHaveBeenCalledWith('Page link copied');
    expect(
      await screen.findByRole('button', { name: 'Copied' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reports a failed copy', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied')
    );
    mount();

    await user.click(screen.getByRole('button', { name: 'Share Page' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not copy link')
    );
    expect(
      screen.getByRole('button', { name: 'Share Page' })
    ).toBeInTheDocument();
  });

  it('asks Jovie about the selected work, and disables Ask with no handler', async () => {
    const user = userEvent.setup();
    const onAskJovie = vi.fn();
    const { container, rerender } = mount({ onAskJovie });

    await user.click(screen.getByRole('button', { name: 'Ask Jovie' }));
    expect(onAskJovie).toHaveBeenCalledTimes(1);

    rerender(
      <WorkInspectorActions
        asset={asset}
        canPublish
        onSharePrivately={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Ask Jovie' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('retries a failed press kit with that launch', async () => {
    const user = userEvent.setup();
    const onRetryLaunchKit = vi.fn();
    const failed = {
      ...launch,
      kitStatus: 'failed',
      kitStatusDetail: 'Artwork missing',
    } as WorkLaunchSummary;
    const { container } = mount({ launches: [failed], onRetryLaunchKit });

    expect(screen.getByTestId('work-launch-status-launch-1')).toHaveTextContent(
      'Press kit generation failed: Artwork missing'
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryLaunchKit).toHaveBeenCalledWith(failed);
    await expectNoA11yViolations(container);
  });

  it('shows preparing and needs-input launches as status lines', async () => {
    const { container } = mount({
      launches: [
        { ...launch, id: 'l-prep', kitStatus: 'preparing' },
        {
          ...launch,
          id: 'l-input',
          kitStatus: 'needs_input',
          kitStatusDetail: 'add a press photo',
        },
      ] as WorkLaunchSummary[],
    });

    expect(screen.getByText('Preparing press kit…')).toHaveAttribute(
      'role',
      'status'
    );
    expect(
      screen.getByText('Press kit needs input: add a press photo')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the publish blocker when the viewer cannot publish', async () => {
    const { container } = mount({
      asset: {
        ...asset,
        status: 'draft',
        smartLinkPath: '',
      } as LibraryReleaseAsset,
      canPublish: false,
    });

    expect(screen.getByTestId('work-action-blocker')).toBeInTheDocument();
    expect(screen.getByTestId('work-action-review-publish')).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('shares a private work privately', async () => {
    const user = userEvent.setup();
    const onSharePrivately = vi.fn();
    const { container } = mount({
      asset: { ...asset, profileVisibility: 'hidden' } as LibraryReleaseAsset,
      onSharePrivately,
    });

    await user.click(screen.getByRole('button', { name: 'Share Privately' }));
    expect(onSharePrivately).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps a long and an Arabic launch title axe-clean', async () => {
    const longTitle =
      'Take Me Over (Extended Sunrise Mix featuring the Whole Band) worldwide launch';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <WorkInspectorActions
          asset={asset}
          canPublish
          onSharePrivately={vi.fn()}
          launches={[
            { ...launch, title: longTitle },
            { ...launch, id: 'launch-2', title: 'إطلاق خذني' },
          ]}
        />
      </div>
    );

    expect(screen.getByText(longTitle)).toHaveClass('truncate');
    expect(screen.getByText('إطلاق خذني')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
