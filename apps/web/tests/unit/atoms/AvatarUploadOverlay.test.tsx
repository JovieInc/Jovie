import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AvatarUploadOverlay } from '@/components/atoms/AvatarUploadOverlay';

vi.mock('lucide-react', () => ({
  Upload: ({ size }: any) => <svg data-testid='upload-icon' data-size={size} />,
}));

describe('AvatarUploadOverlay', () => {
  it('renders drag overlay when isDragOver=true', () => {
    render(<AvatarUploadOverlay iconSize={24} isDragOver />);
    expect(
      screen.getByTestId('avatar-uploadable-drag-overlay')
    ).toBeInTheDocument();
  });

  it('renders hover overlay by default (isDragOver=false)', () => {
    render(<AvatarUploadOverlay iconSize={24} />);
    expect(
      screen.getByTestId('avatar-uploadable-hover-overlay')
    ).toBeInTheDocument();
  });

  it('drag overlay has correct data-testid', () => {
    render(<AvatarUploadOverlay iconSize={24} isDragOver />);
    expect(
      screen.getByTestId('avatar-uploadable-drag-overlay')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-uploadable-hover-overlay')).toBeNull();
  });

  it('hover overlay has correct data-testid', () => {
    render(<AvatarUploadOverlay iconSize={24} />);
    expect(
      screen.getByTestId('avatar-uploadable-hover-overlay')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-uploadable-drag-overlay')).toBeNull();
  });

  it('both overlays are aria-hidden="true"', () => {
    const { unmount } = render(
      <AvatarUploadOverlay iconSize={24} isDragOver />
    );
    expect(
      screen.getByTestId('avatar-uploadable-drag-overlay')
    ).toHaveAttribute('aria-hidden', 'true');
    unmount();

    render(<AvatarUploadOverlay iconSize={24} />);
    expect(
      screen.getByTestId('avatar-uploadable-hover-overlay')
    ).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders Upload icon in each overlay', () => {
    const { unmount } = render(
      <AvatarUploadOverlay iconSize={24} isDragOver />
    );
    expect(screen.getByTestId('upload-icon')).toBeInTheDocument();
    unmount();

    render(<AvatarUploadOverlay iconSize={24} />);
    expect(screen.getByTestId('upload-icon')).toBeInTheDocument();
  });
});
