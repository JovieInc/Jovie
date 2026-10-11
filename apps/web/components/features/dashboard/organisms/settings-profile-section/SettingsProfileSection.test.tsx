import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';
import { SettingsProfileSection } from './SettingsProfileSection';

vi.mock('./useSettingsProfile', () => ({
  useSettingsProfile: () => ({
    formData: {
      displayName: '',
      username: 'ada',
      location: '',
      hometown: '',
      careerHighlights: '',
      targetPlaylists: '',
    },
    setFormData: vi.fn(),
    profileSaveStatus: { saving: false, success: null, error: null },
    setProfileSaveStatus: vi.fn(),
    handleAvatarUpload: vi.fn(),
    handleAvatarUpdate: vi.fn(),
    saveProfile: vi.fn(),
    flushSave: vi.fn(),
  }),
}));

vi.mock('@/components/organisms/AvatarUploadable', () => ({
  AvatarUploadable: () => <div data-testid='avatar' />,
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('SettingsProfileSection', () => {
  it('asks for the name on the profile', () => {
    render(
      <SettingsProfileSection
        artist={
          { name: 'Ada', handle: 'ada', image_url: null } as unknown as Artist
        }
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Display name')).toHaveAttribute(
      'placeholder',
      'The name on your profile'
    );
  });
});
