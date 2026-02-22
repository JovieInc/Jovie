import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ProfileEditPreview,
  ProfileEditPreviewCard,
} from '@/components/dashboard/organisms/ProfileEditPreviewCard';
import { fastRender } from '@/tests/utils/fast-render';

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
  fieldLabel: 'Display name shown on your profile',
  currentValue: 'Old Name',
  newValue: 'New Name',
  reason: 'Better branding',
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

    expect(screen.getByText('Old Name')).toBeDefined();
    expect(screen.getByText('New Name')).toBeDefined();
  });

  it('renders field label in the header', () => {
    renderCard();

    expect(
      screen.getByText('Update Display name shown on your profile')
    ).toBeDefined();
  });

  it('renders reason text when provided', () => {
    renderCard();

    expect(screen.getByText('Better branding')).toBeDefined();
  });

  it('shows "Not set" for null current value', () => {
    const preview: ProfileEditPreview = {
      ...basePreview,
      currentValue: null,
    };
    renderCard(preview);

    expect(screen.getByText('Not set')).toBeDefined();
  });

  it('calls mutate with correct args when Apply is clicked', () => {
    renderCard();

    const applyButton = screen.getByRole('button', { name: /apply/i });
    fireEvent.click(applyButton);

    expect(mockMutate).toHaveBeenCalledWith(
      {
        profileId: 'profile-123',
        field: 'displayName',
        newValue: 'New Name',
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('transitions to success state after apply succeeds', async () => {
    // Simulate successful mutation by calling onSuccess immediately
    mockMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.();
    });

    renderCard();

    const applyButton = screen.getByRole('button', { name: /apply/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(screen.getByText(/updated/i)).toBeDefined();
    });

    // Apply and Cancel buttons should no longer be present
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
  });

  it('transitions to cancelled state when Cancel is clicked', () => {
    renderCard();

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(screen.getByText('Edit cancelled')).toBeDefined();

    // Apply button should no longer be present
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
  });

  it('works with bio field', () => {
    const bioPreview: ProfileEditPreview = {
      field: 'bio',
      fieldLabel: 'Artist bio/description',
      currentValue: 'Old bio',
      newValue: 'New bio about the artist',
    };

    renderCard(bioPreview);

    expect(screen.getByText('Old bio')).toBeDefined();
    expect(screen.getByText('New bio about the artist')).toBeDefined();
    expect(screen.getByText('Update Artist bio/description')).toBeDefined();
  });

  it('fires onApply callback after successful mutation', () => {
    const onApply = vi.fn();
    mockMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.();
    });

    fastRender(
      <ProfileEditPreviewCard
        preview={basePreview}
        profileId='profile-123'
        onApply={onApply}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    expect(onApply).toHaveBeenCalledOnce();
  });

  it('fires onCancel callback when cancelled', () => {
    const onCancel = vi.fn();

    fastRender(
      <ProfileEditPreviewCard
        preview={basePreview}
        profileId='profile-123'
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
