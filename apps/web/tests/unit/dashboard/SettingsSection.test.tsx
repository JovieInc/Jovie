import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';

describe('SettingsSection', () => {
  it('renders the heading and description', () => {
    render(
      <SettingsSection
        id='profile'
        title='Artist Profile'
        description='Photo, display name, and username.'
      >
        <div>Content</div>
      </SettingsSection>
    );

    const heading = screen.getByRole('heading', { name: 'Artist Profile' });
    expect(heading).toBeInTheDocument();
    expect(
      screen.getByText('Photo, display name, and username.')
    ).toBeInTheDocument();
  });
});
