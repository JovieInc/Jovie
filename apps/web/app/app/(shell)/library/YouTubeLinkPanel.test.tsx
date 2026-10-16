import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  approvalFromPlan,
  sourceVersionFor,
} from '@/lib/youtube-library/link-apply';
import type { YouTubeLinkPreview } from '@/lib/youtube-library/link-contract';
import { inspectYouTubeLink } from '@/lib/youtube-library/link-inspect';
import { YouTubeLinkPanel } from './YouTubeLinkPanel';

const fetcher = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queries/fetch', () => ({ fetchWithTimeout: fetcher }));
const plan = inspectYouTubeLink({
  description: 'Credits',
  expectedUrl: 'https://jov.ie/artist',
  videoUrl: 'https://youtube.com/watch?v=video',
});
const preview: YouTubeLinkPreview = {
  plan,
  approval: approvalFromPlan({
    videoId: 'video',
    plan,
    sourceVersion: sourceVersionFor('Credits', 'v1'),
  }),
  rollback: null,
};
function mount(disabled = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <YouTubeLinkPanel
        profileId='profile'
        videoId='video'
        disabled={disabled}
      />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  fetcher.mockReset();
  fetcher.mockResolvedValue(preview);
});

describe('Library YouTube link approval', () => {
  it('previews without writing and binds consent to the displayed source version', async () => {
    mount();
    expect(await screen.findByText('Missing')).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: 'Description Preview' })
    ).toHaveValue(plan.proposedDescription);
    expect(
      screen.getByText('Destination: https://jov.ie/artist')
    ).toBeVisible();
    const apply = screen.getByRole('button', { name: 'Apply Link' });
    expect(apply).toBeDisabled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'I approve applying this preview.' })
    );
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            action: 'apply',
            creatorProfileId: 'profile',
            approval: preview.approval,
          }),
        })
      )
    );
    await waitFor(() => expect(apply).toBeDisabled());
  });
  it('reserves preview and control slots through loading and failure, then retries without consent', async () => {
    let fail!: (error: Error) => void;
    fetcher.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      })
    );
    mount();
    const textbox = screen.getByRole('textbox', {
      name: 'Description Preview',
    });
    const status = screen.getByRole('status');
    expect(textbox).toHaveAttribute('rows', '6');
    expect(status).toHaveClass('h-10');
    fail(new Error('offline'));
    expect(
      await screen.findByText(/description may have changed/)
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Description Preview' })).toBe(
      textbox
    );
    expect(screen.getByRole('status')).toBe(status);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Preview' }));
    expect(await screen.findByText('Missing')).toBeVisible();
    expect(
      screen.getByRole('checkbox', { name: 'I approve applying this preview.' })
    ).not.toBeChecked();
  });
  it('requires separate approval of the saved original before restore', async () => {
    const rollback = {
      operationKey: 'operation',
      originalDescription: 'Original credits',
      sourceVersion: sourceVersionFor('Applied', 'v2'),
    };
    fetcher.mockResolvedValue({ ...preview, rollback });
    mount();
    await screen.findByText('Missing');
    fireEvent.click(screen.getByText('Restore original'));
    expect(
      screen.getByRole('textbox', { name: 'Original Description' })
    ).toHaveValue('Original credits');
    const restore = screen.getByRole('button', { name: 'Restore Description' });
    expect(restore).toBeDisabled();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'I approve restoring this original.',
      })
    );
    fireEvent.click(restore);
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            action: 'rollback',
            creatorProfileId: 'profile',
            approved: true,
            operationKey: 'operation',
            sourceVersion: rollback.sourceVersion,
          }),
        })
      )
    );
  });
});
