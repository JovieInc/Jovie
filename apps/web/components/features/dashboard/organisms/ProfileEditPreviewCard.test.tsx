import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('renders current and new values', () => {
    renderCard();

    expect(screen.getByText('Old Name')).toBeInTheDocument();
    expect(screen.getByText('New Name')).toBeInTheDocument();
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

    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    await waitFor(() => {
      expect(screen.getByText(/updated/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
  });

  it('transitions to the cancelled state on Cancel', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
  });
});
