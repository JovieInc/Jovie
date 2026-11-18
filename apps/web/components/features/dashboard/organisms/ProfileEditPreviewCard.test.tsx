import { fireEvent, screen, waitFor } from '@testing-library/react';
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
});
