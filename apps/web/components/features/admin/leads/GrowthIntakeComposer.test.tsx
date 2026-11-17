import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { GrowthIntakeComposer } from './GrowthIntakeComposer';

const ingestProfile = vi.fn();
const batchIngest = vi.fn();
const queueUrls = vi.fn();
const search = vi.fn();
const clear = vi.fn();
let queuePending = false;
let searchState: {
  results: { id: string; name: string; url: string }[];
  state: string;
};

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => ({ ...searchState, search, clear }),
  useIngestProfileMutation: () => ({
    mutateAsync: ingestProfile,
    isPending: false,
  }),
  useBatchIngestMutation: () => ({
    mutateAsync: batchIngest,
    isPending: false,
  }),
  useQueueLeadUrlsMutation: () => ({
    mutateAsync: queueUrls,
    isPending: queuePending,
  }),
}));

describe('GrowthIntakeComposer', () => {
  beforeEach(() => {
    for (const mock of [ingestProfile, batchIngest, queueUrls, search, clear])
      mock.mockReset();
    queuePending = false;
    searchState = { results: [], state: 'idle' };
  });

  it('creates a single profile from a handle and reports success', async () => {
    const user = userEvent.setup();
    ingestProfile.mockResolvedValue({ profile: { username: 'ari' } });
    const { container } = render(<GrowthIntakeComposer />);

    await user.type(screen.getByLabelText('Single Profile Input'), 'ari');
    await user.click(screen.getByRole('button', { name: 'Create Profile' }));

    expect(ingestProfile).toHaveBeenCalledWith({
      url: expect.stringContaining('ari'),
    });
    expect(
      await screen.findByText('Created creator profile @ari.')
    ).toBeVisible();
    expect(screen.getByLabelText('Single Profile Input')).toHaveValue('');
    await expectNoA11yViolations(container);
  });

  it('shows the error banner when single ingest fails', async () => {
    const user = userEvent.setup();
    ingestProfile.mockRejectedValue(new Error('Profile already exists'));
    render(<GrowthIntakeComposer />);

    await user.type(screen.getByLabelText('Single Profile Input'), 'ari');
    await user.click(screen.getByRole('button', { name: 'Create Profile' }));

    expect(await screen.findByText('Profile already exists')).toBeVisible();
    expect(screen.getByLabelText('Single Profile Input')).toHaveValue('ari');
  });

  it('runs a batch import and summarises the result', async () => {
    const user = userEvent.setup();
    batchIngest.mockResolvedValue({
      summary: { success: 2, skipped: 1, error: 0 },
    });
    const { container } = render(<GrowthIntakeComposer initialMode='batch' />);

    await user.type(
      screen.getByLabelText('Batch URLs Input'),
      'https://linktr.ee/a{enter}https://linktr.ee/b'
    );
    expect(screen.getByText('2 URLs parsed')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Run Batch Import' }));

    expect(batchIngest).toHaveBeenCalledWith({
      urls: ['https://linktr.ee/a', 'https://linktr.ee/b'],
    });
    expect(
      await screen.findByText('Batch complete: 2 created, 1 skipped, 0 errors.')
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('starts the queue empty with its action disabled', async () => {
    const { container } = render(<GrowthIntakeComposer initialMode='queue' />);

    expect(screen.getByText('0 URLs ready for intake')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Queue Lead URLs' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('keeps the queue paste and shows the reason when queueing fails', async () => {
    const user = userEvent.setup();
    queueUrls.mockRejectedValue(new Error('Failed to fetch'));
    const { container } = render(<GrowthIntakeComposer initialMode='queue' />);

    await user.type(screen.getByLabelText('Queue URLs Input'), 'linktr.ee/a');
    await user.click(screen.getByRole('button', { name: 'Queue Lead URLs' }));

    expect(await screen.findByText('Failed to fetch')).toBeVisible();
    expect(screen.getByLabelText('Queue URLs Input')).toHaveValue(
      'linktr.ee/a'
    );
    await expectNoA11yViolations(container);
  });

  it('labels the queue action Queueing while a request is pending', () => {
    queuePending = true;
    render(<GrowthIntakeComposer initialMode='queue' />);

    expect(screen.getByRole('button', { name: 'Queueing…' })).toBeDisabled();
  });

  it('clears the banner when switching modes', async () => {
    const user = userEvent.setup();
    queueUrls.mockResolvedValue({
      summary: { created: 1, duplicate: 0, invalid: 0 },
    });
    render(<GrowthIntakeComposer initialMode='queue' />);

    await user.type(screen.getByLabelText('Queue URLs Input'), 'linktr.ee/a');
    await user.click(screen.getByRole('button', { name: 'Queue Lead URLs' }));
    expect(
      await screen.findByText('Queued 1 URL for lead intake.')
    ).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Batch URLs' }));
    await waitFor(() =>
      expect(screen.queryByText('Queued 1 URL for lead intake.')).toBeNull()
    );
    expect(screen.getByLabelText('Batch URLs Input')).toBeVisible();
  });

  it('keeps typed input and focus across a re-render and Escape', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GrowthIntakeComposer initialMode='batch' />);

    await user.type(screen.getByLabelText('Batch URLs Input'), 'linktr.ee/a');
    rerender(<GrowthIntakeComposer initialMode='batch' />);
    await user.keyboard('{Escape}');

    expect(screen.getByLabelText('Batch URLs Input')).toHaveValue(
      'linktr.ee/a'
    );
    expect(screen.getByLabelText('Batch URLs Input')).toHaveFocus();
  });

  it('stays axe-clean inside a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <GrowthIntakeComposer />
      </div>
    );

    expect(screen.getByLabelText('Single Profile Input')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
