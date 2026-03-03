import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AvatarUploadAnnouncer } from '@/components/atoms/AvatarUploadAnnouncer';
import { expectNoA11yViolations } from '../../utils/a11y';

describe('AvatarUploadAnnouncer', () => {
  it('renders nothing visible when progress=0 and status="idle"', () => {
    const { container } = render(
      <AvatarUploadAnnouncer progress={0} status='idle' />
    );
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('renders polite aria-live with progress percentage when progress > 0', () => {
    render(<AvatarUploadAnnouncer progress={50} status='uploading' />);
    const region = screen.getByText(/50% complete/);
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('renders polite aria-live success message when status="success"', () => {
    render(<AvatarUploadAnnouncer progress={100} status='success' />);
    const region = screen.getByText('Profile photo uploaded successfully');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('renders assertive aria-live error message when status="error"', () => {
    render(<AvatarUploadAnnouncer progress={0} status='error' />);
    const region = screen.getByText('Profile photo upload failed');
    expect(region).toHaveAttribute('aria-live', 'assertive');
  });

  it('progress message rounds to nearest integer', () => {
    render(<AvatarUploadAnnouncer progress={45.7} status='uploading' />);
    expect(screen.getByText(/46% complete/)).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <AvatarUploadAnnouncer progress={0} status='idle' />
    );
    await expectNoA11yViolations(container);
  });
});
