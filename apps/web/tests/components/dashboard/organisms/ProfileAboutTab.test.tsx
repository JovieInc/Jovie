import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProfileAboutTab } from '@/features/dashboard/organisms/profile-contact-sidebar/ProfileAboutTab';

vi.mock('@/app/app/(shell)/dashboard/actions/creator-profile', () => ({
  updateAllowProfilePhotoDownloads: vi.fn(),
}));

vi.mock('@/components/molecules/GenrePicker', () => ({
  GenrePicker: ({ trigger }: { trigger: React.ReactNode }) => (
    <div data-testid='genre-picker'>{trigger}</div>
  ),
}));

vi.mock('@/components/molecules/LocationPicker', () => ({
  LocationPicker: ({ trigger }: { trigger: React.ReactNode }) => (
    <div data-testid='location-picker'>{trigger}</div>
  ),
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerSection: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div>
      <span>{title}</span>
      {children}
    </div>
  ),
  DrawerAsyncToggle: ({ label }: { label: string }) => (
    <div data-testid='async-toggle'>{label}</div>
  ),
}));

const baseProps = {
  bio: 'I make beats.',
  genres: ['hip-hop', 'electronic'],
  location: 'Los Angeles, CA',
  hometown: 'Chicago, IL',
  activeSinceYear: 2015,
  allowPhotoDownloads: true,
};

describe('ProfileAboutTab', () => {
  describe('read-only mode', () => {
    it('displays bio, location, hometown, activeSinceYear, and genres', () => {
      render(<ProfileAboutTab {...baseProps} />);

      expect(screen.getByText('I make beats.')).toBeInTheDocument();
      expect(screen.getByText('Los Angeles, CA')).toBeInTheDocument();
      expect(screen.getByText('From Chicago, IL')).toBeInTheDocument();
      expect(screen.getByText('Active since 2015')).toBeInTheDocument();
      expect(screen.getByText('hip-hop')).toBeInTheDocument();
      expect(screen.getByText('electronic')).toBeInTheDocument();
    });
  });

  describe('empty state read-only', () => {
    it('shows "No bio yet" placeholder when bio is null', () => {
      render(
        <ProfileAboutTab
          {...baseProps}
          bio={null}
          genres={null}
          location={null}
          hometown={null}
          activeSinceYear={null}
        />
      );

      expect(screen.getByText(/No bio yet/)).toBeInTheDocument();
    });

    it('hides the location section when no metadata and not editable', () => {
      render(
        <ProfileAboutTab
          {...baseProps}
          location={null}
          hometown={null}
          activeSinceYear={null}
        />
      );

      expect(screen.queryByText('Location')).not.toBeInTheDocument();
    });
  });

  describe('editable mode', () => {
    it('shows "Click to add a bio..." placeholder when bio is null', () => {
      render(
        <ProfileAboutTab
          {...baseProps}
          bio={null}
          location={null}
          hometown={null}
          activeSinceYear={null}
          genres={null}
          onBioChange={vi.fn()}
          onLocationChange={vi.fn()}
          onHometownChange={vi.fn()}
          onGenresChange={vi.fn()}
        />
      );

      expect(screen.getByText('Click to add a bio...')).toBeInTheDocument();
    });

    it('shows add buttons for location, hometown, and genres when empty', () => {
      render(
        <ProfileAboutTab
          {...baseProps}
          location={null}
          hometown={null}
          genres={null}
          activeSinceYear={null}
          onBioChange={vi.fn()}
          onLocationChange={vi.fn()}
          onHometownChange={vi.fn()}
          onGenresChange={vi.fn()}
        />
      );

      expect(screen.getByText('Add your location')).toBeInTheDocument();
      expect(screen.getByText('Add your hometown')).toBeInTheDocument();
      expect(screen.getByText('Add genres')).toBeInTheDocument();
    });

    it('shows location section even when no metadata', () => {
      render(
        <ProfileAboutTab
          {...baseProps}
          location={null}
          hometown={null}
          activeSinceYear={null}
          onLocationChange={vi.fn()}
        />
      );

      expect(screen.getByText('Location')).toBeInTheDocument();
    });
  });

  describe('bio editing', () => {
    it('enters edit mode on click, saves on blur', async () => {
      const user = userEvent.setup();
      const onBioChange = vi.fn();

      render(
        <ProfileAboutTab
          {...baseProps}
          bio='Old bio'
          onBioChange={onBioChange}
        />
      );

      await user.click(screen.getByText('Old bio'));

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeInTheDocument();

      await user.clear(textarea);
      await user.type(textarea, 'New bio');
      await user.tab(); // blur

      expect(onBioChange).toHaveBeenCalledWith('New bio');
    });

    it('cancels editing on Escape', async () => {
      const user = userEvent.setup();
      const onBioChange = vi.fn();

      render(
        <ProfileAboutTab
          {...baseProps}
          bio='Original'
          onBioChange={onBioChange}
        />
      );

      await user.click(screen.getByText('Original'));
      const textarea = screen.getByRole('textbox');
      await user.type(textarea, ' extra');
      await user.keyboard('{Escape}');

      expect(onBioChange).not.toHaveBeenCalled();
      expect(screen.getByText('Original')).toBeInTheDocument();
    });
  });

  describe('genre removal', () => {
    it('calls onGenresChange with the genre filtered out', async () => {
      const user = userEvent.setup();
      const onGenresChange = vi.fn();

      render(
        <ProfileAboutTab
          {...baseProps}
          genres={['hip-hop', 'electronic']}
          onGenresChange={onGenresChange}
        />
      );

      await user.click(screen.getByLabelText('Remove hip-hop'));

      expect(onGenresChange).toHaveBeenCalledWith(['electronic']);
    });
  });
});
