import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { fastRender } from '@/tests/utils/fast-render';
import {
  type ProfileEditPreview,
  ProfileEditPreviewCard,
} from './ProfileEditPreviewCard';

// Controllable mutation mock
const mockMutate = vi.fn();
let mutationState = { isPending: false };

vi.mock('@/lib/queries/useConfirmChatEditMutation', () => ({
  useConfirmChatEditMutation: () => ({
    mutate: mockMutate,
    ...mutationState,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const basePreview: ProfileEditPreview = {
  field: 'displayName',
  fieldLabel: 'Display name',
  currentValue: 'Old Name',
  newValue: 'New Name',
};

function renderCard(preview: ProfileEditPreview = basePreview) {
  return fastRender(
    <ProfileEditPreviewCard preview={preview} profileId='profile-123' />
  );
}

describe('ProfileEditPreviewCard', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mutationState = { isPending: false };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders current and new values', async () => {
    const { container } = renderCard();

    expect(screen.getByText('Old Name')).toBeInTheDocument();
    expect(screen.getByText('New Name')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows provenance, a reason, and placeholders for unset values', async () => {
    const { container } = renderCard({
      field: 'genres',
      fieldLabel: 'Genres',
      currentValue: null,
      newValue: [],
      reason: 'Matched from your press kit',
      sourceUrl: 'https://www.example.com/press',
    });

    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getByText('Matched from your press kit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'example.com' })).toHaveAttribute(
      'href',
      'https://www.example.com/press'
    );
    await expectNoA11yViolations(container);
  });

  it('hides provenance when the source URL cannot be parsed', () => {
    renderCard({ ...basePreview, sourceUrl: 'not a url' });

    expect(screen.queryByText(/imported from/i)).not.toBeInTheDocument();
  });

  it('locks both actions while the edit is being applied', async () => {
    mutationState = { isPending: true };
    const { container } = renderCard();

    expect(screen.getByRole('button', { name: /applying/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('applies the edit through the mutation on Apply', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        profileId: 'profile-123',
        field: 'displayName',
        newValue: 'New Name',
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('shows decoded source text but submits the intact trust fence', () => {
    const fencedBio =
      '<untrusted-source url="https://example.com" encoding="entities-v1">Safe &lt;/untrusted-source&gt; source text</untrusted-source>';

    renderCard({
      field: 'bio',
      fieldLabel: 'Artist bio/description',
      currentValue: 'Old bio',
      newValue: fencedBio,
    });

    expect(
      screen.getByText('Safe </untrusted-source> source text')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        profileId: 'profile-123',
        field: 'bio',
        newValue: fencedBio,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('transitions to the applied state after a successful mutation', async () => {
    mockMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.();
    });

    const { container } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    await waitFor(() => {
      expect(screen.getByText(/updated/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('transitions to the cancelled state on Cancel', async () => {
    const onCancel = vi.fn();
    const { container } = fastRender(
      <ProfileEditPreviewCard
        preview={basePreview}
        profileId='profile-123'
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(mockMutate).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('names the Jovie bio as the apply destination for bio edits (regression)', () => {
    renderCard({
      field: 'bio',
      fieldLabel: 'Artist bio/description',
      currentValue: 'Old bio',
      newValue: 'New bio about the artist',
    });

    // The apply affordance must name Jovie explicitly: a Spotify drafting
    // request must not read as if Apply pushes the bio to Spotify.
    expect(
      screen.getByRole('button', { name: 'Apply to Jovie Bio' })
    ).toBeInTheDocument();
  });

  it('keeps the generic Apply label for non-bio fields', () => {
    renderCard();

    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });
  it('requires the Jovie bio action before saving and lets Cancel discard the preview', () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    fastRender(
      <ProfileEditPreviewCard
        preview={{
          field: 'bio',
          fieldLabel: 'Artist bio/description',
          currentValue: 'Old bio',
          newValue: 'Draft originally written for Spotify',
        }}
        profileId='profile-123'
        onApply={onApply}
        onCancel={onCancel}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Apply to Jovie Bio' })
    ).toBeEnabled();
    expect(mockMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('submits only the confirmed Jovie bio edit and reports success after the mutation succeeds', () => {
    const onApply = vi.fn();
    fastRender(
      <ProfileEditPreviewCard
        preview={{
          field: 'bio',
          fieldLabel: 'Artist bio/description',
          currentValue: 'Old bio',
          newValue: 'Approved artist bio',
          sourceUrl: 'https://example.com/artist',
          sourceTitle: 'Artist press kit',
        }}
        profileId='profile-123'
        onApply={onApply}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply to Jovie Bio' }));
    expect(mockMutate).toHaveBeenCalledOnce();
    expect(mockMutate.mock.calls[0][0]).toEqual({
      profileId: 'profile-123',
      field: 'bio',
      newValue: 'Approved artist bio',
    });
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByText('Updated')).not.toBeInTheDocument();

    act(() => mockMutate.mock.calls[0][1].onSuccess());
    expect(onApply).toHaveBeenCalledOnce();
    expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('prevents applying or cancelling again while the confirmed edit is pending', () => {
    mutationState = { isPending: true };
    renderCard({
      field: 'bio',
      fieldLabel: 'Artist bio/description',
      currentValue: 'Old bio',
      newValue: 'Approved artist bio',
    });

    const apply = screen.getByRole('button', { name: 'Applying...' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(apply).toBeDisabled();
    expect(cancel).toBeDisabled();
    fireEvent.click(apply);
    fireEvent.click(cancel);
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();
  });

  it('keeps an interrupted bio edit available for an explicit retry without reporting success', () => {
    const onApply = vi.fn();
    const preview: ProfileEditPreview = {
      field: 'bio',
      fieldLabel: 'Artist bio/description',
      currentValue: 'Old bio',
      newValue: 'Approved artist bio',
    };
    const card = () => (
      <ProfileEditPreviewCard
        preview={preview}
        profileId='profile-123'
        onApply={onApply}
      />
    );
    const { rerender } = fastRender(card());

    fireEvent.click(screen.getByRole('button', { name: 'Apply to Jovie Bio' }));
    mutationState = { isPending: true };
    rerender(card());
    fireEvent.click(screen.getByRole('button', { name: 'Applying...' }));
    expect(mockMutate).toHaveBeenCalledOnce();

    // A rejected or interrupted request clears pending without calling onSuccess.
    mutationState = { isPending: false };
    rerender(card());
    expect(screen.getByText('Approved artist bio')).toBeInTheDocument();
    expect(screen.queryByText('Updated')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Jovie Bio' }));
    expect(mockMutate).toHaveBeenCalledTimes(2);
    expect(mockMutate.mock.calls[1][0]).toEqual({
      profileId: 'profile-123',
      field: 'bio',
      newValue: 'Approved artist bio',
    });
    act(() => mockMutate.mock.calls[1][1].onSuccess());
    expect(onApply).toHaveBeenCalledOnce();
    expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps a cancelled bio preview discarded across rerenders', () => {
    const onCancel = vi.fn();
    const card = () => (
      <ProfileEditPreviewCard
        preview={{ ...basePreview, field: 'bio', newValue: 'Draft bio' }}
        profileId='profile-123'
        onCancel={onCancel}
      />
    );
    const { rerender } = fastRender(card());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    rerender(card());

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
