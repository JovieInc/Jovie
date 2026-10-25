import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileMockup } from './ProfileMockup';

describe('ProfileMockup', () => {
  it('renders canonical identity without invented releases or timed CTA claims', () => {
    render(<ProfileMockup />);
    expect(screen.getByTestId('profile-identity-header')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tim White' })).toHaveAttribute(
      'href',
      '/timwhite'
    );
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('Signals')).toBeNull();
  });

  it('uses supplied profile identity in the shared preview', () => {
    render(<ProfileMockup name='Example Creator' handle='example' />);
    expect(
      screen.getByRole('link', { name: 'Example Creator' })
    ).toHaveAttribute('href', '/example');
  });
});
