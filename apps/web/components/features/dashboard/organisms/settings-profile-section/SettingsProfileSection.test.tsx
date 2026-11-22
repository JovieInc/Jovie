import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { SettingsProfileSection } from './SettingsProfileSection';

const { flushSaveMock, saveProfileMock } = vi.hoisted(() => ({
  flushSaveMock: vi.fn(),
  saveProfileMock: vi.fn(),
}));

vi.mock('./useSettingsProfile', () => ({
  useSettingsProfile: () => {
    const [formData, setFormData] = useState({
      displayName: '',
      username: 'ada',
      location: '',
      hometown: '',
      careerHighlights: '',
      targetPlaylists: '',
    });
    return {
      formData,
      setFormData,
      profileSaveStatus: { saving: false, success: null, error: null },
      setProfileSaveStatus: vi.fn(),
      handleAvatarUpload: vi.fn(),
      handleAvatarUpdate: vi.fn(),
      saveProfile: saveProfileMock,
      flushSave: flushSaveMock,
    };
  },
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

  it('keeps its loading-skeleton panel name instead of repeating the page title', () => {
    render(
      <SettingsProfileSection
        artist={
          { name: 'Ada', handle: 'ada', image_url: null } as unknown as Artist
        }
        onRefresh={vi.fn()}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Identity' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Profile' })
    ).not.toBeInTheDocument();
  });
});

const artist = {
  id: 'profile-1',
  owner_user_id: 'user-1',
  handle: 'ada',
  name: 'Ada',
  image_url: undefined,
  published: true,
} as Artist;

describe('SettingsProfileSection behaviour', () => {
  it('keeps typed text, saves on change and flushes on blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SettingsProfileSection artist={artist} onRefresh={vi.fn()} />
    );
    const name = screen.getByLabelText('Display name');
    await user.type(name, 'Ada L');
    rerender(<SettingsProfileSection artist={artist} onRefresh={vi.fn()} />);
    expect(screen.getByLabelText('Display name')).toHaveValue('Ada L');
    expect(saveProfileMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ displayName: 'Ada L' })
    );
    await user.tab();
    expect(flushSaveMock).toHaveBeenCalled();
    expect(screen.getByLabelText('Display name')).toHaveValue('Ada L');
  });

  it('counts career highlights in the shared Textarea atom', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SettingsProfileSection artist={artist} onRefresh={vi.fn()} />
    );
    const highlights = screen.getByLabelText('Career highlights');
    expect(highlights.tagName).toBe('TEXTAREA');
    await user.type(highlights, 'Radio play');
    expect(screen.getByText('10/2000')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('warns about a low resolution photo with the warning token', async () => {
    const { container } = render(
      <SettingsProfileSection
        artist={artist}
        avatarQuality={{ status: 'low', width: 200, height: 200 }}
        onRefresh={vi.fn()}
      />
    );
    const notice = screen.getByText(/This photo is only 200x200/);
    expect(notice.parentElement?.className).toContain('border-warning/30');
    expect(notice.parentElement?.className).not.toContain('amber');
    await expectNoA11yViolations(container);
  });
});
