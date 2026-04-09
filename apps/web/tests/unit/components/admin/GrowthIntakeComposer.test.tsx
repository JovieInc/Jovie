import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GrowthIntakeComposer } from '@/features/admin/leads/GrowthIntakeComposer';

const refreshMock = vi.fn();
const ingestMutateAsyncMock = vi.fn();
const batchMutateAsyncMock = vi.fn();
const queueMutateAsyncMock = vi.fn();
const artistSearchMock = vi.fn();
const artistClearMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@jovie/ui');

  return {
    ...actual,
    Button: ({
      children,
      type = 'button',
      ...props
    }: React.ComponentProps<'button'>) => (
      <button type={type} {...props}>
        {children}
      </button>
    ),
    Input: ({
      inputSize: _inputSize,
      ...props
    }: React.ComponentProps<'input'> & { inputSize?: string }) => (
      <input {...props} />
    ),
    Textarea: (props: React.ComponentProps<'textarea'>) => (
      <textarea {...props} />
    ),
    SegmentControl: ({
      value,
      onValueChange,
      options,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      options: Array<{ value: string; label: string }>;
    }) => (
      <div>
        {options.map(option => (
          <button
            key={option.value}
            type='button'
            aria-pressed={value === option.value}
            onClick={() => onValueChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    ),
  };
});

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => ({
    results: [
      {
        id: 'artist-1',
        name: 'Phoebe Bridgers',
        url: 'https://open.spotify.com/artist/2p89gzrWQ9x04sXIs2WnUm',
      },
    ],
    search: artistSearchMock,
    clear: artistClearMock,
  }),
  useIngestProfileMutation: () => ({
    mutateAsync: ingestMutateAsyncMock,
    isPending: false,
  }),
  useBatchIngestMutation: () => ({
    mutateAsync: batchMutateAsyncMock,
    isPending: false,
  }),
  useQueueLeadUrlsMutation: () => ({
    mutateAsync: queueMutateAsyncMock,
    isPending: false,
  }),
}));

describe('GrowthIntakeComposer', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    ingestMutateAsyncMock.mockReset();
    batchMutateAsyncMock.mockReset();
    queueMutateAsyncMock.mockReset();
    artistSearchMock.mockReset();
    artistClearMock.mockReset();
  });

  it('uses queue mode when requested initially and queues normalized URLs', async () => {
    queueMutateAsyncMock.mockResolvedValue({
      summary: { created: 1, duplicate: 0, invalid: 0 },
    });

    const user = userEvent.setup();
    render(<GrowthIntakeComposer initialMode='queue' />);

    const queueInput = screen.getByLabelText('Queue URLs input');
    await user.type(queueInput, 'instagram.com/testartist');
    await user.click(screen.getByRole('button', { name: 'Queue Lead URLs' }));

    await waitFor(() => {
      expect(queueMutateAsyncMock).toHaveBeenCalledWith([
        'https://instagram.com/testartist',
      ]);
    });

    expect(refreshMock).toHaveBeenCalled();
    expect(
      screen.getByText('Queued 1 URL for lead intake.')
    ).toBeInTheDocument();
  });

  it('runs batch imports and shows the parsed batch summary', async () => {
    batchMutateAsyncMock.mockResolvedValue({
      summary: { success: 2, skipped: 1, error: 0 },
    });

    const user = userEvent.setup();
    render(<GrowthIntakeComposer />);

    await user.click(screen.getByRole('button', { name: 'Batch URLs' }));
    await user.type(
      screen.getByLabelText('Batch URLs input'),
      'https://instagram.com/artistone{enter}https://instagram.com/artisttwo'
    );
    await user.click(screen.getByRole('button', { name: 'Run Batch Import' }));

    await waitFor(() => {
      expect(batchMutateAsyncMock).toHaveBeenCalledWith({
        urls: [
          'https://instagram.com/artistone',
          'https://instagram.com/artisttwo',
        ],
      });
    });

    expect(
      screen.getByText('2 created, 1 skipped, 0 errors.')
    ).toBeInTheDocument();
  });

  it('uses the selected Spotify result for single-profile ingest', async () => {
    ingestMutateAsyncMock.mockResolvedValue({
      profile: { username: 'phoebebridgers' },
    });

    const user = userEvent.setup();
    render(<GrowthIntakeComposer />);

    await user.click(screen.getByRole('button', { name: 'Spotify' }));
    await user.type(screen.getByLabelText('Single profile input'), 'phoebe');

    await waitFor(() => {
      expect(artistSearchMock).toHaveBeenCalledWith('phoebe');
    });

    await user.click(
      screen.getByRole('button', { name: 'Phoebe Bridgers Use' })
    );
    await user.click(screen.getByRole('button', { name: 'Create Profile' }));

    await waitFor(() => {
      expect(ingestMutateAsyncMock).toHaveBeenCalledWith({
        url: 'https://open.spotify.com/artist/2p89gzrWQ9x04sXIs2WnUm',
      });
    });

    expect(
      screen.getByText('Created creator profile @phoebebridgers.')
    ).toBeInTheDocument();
  });
});
