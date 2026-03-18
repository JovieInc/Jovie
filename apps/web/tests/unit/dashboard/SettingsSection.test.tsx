import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';

describe('SettingsSection', () => {
  it('uses the updated typography scale for heading and description', () => {
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
    expect(heading.className).toContain('text-[17px]');
    expect(heading.className).toContain('dashboard-heading');

    const description = screen.getByText('Photo, display name, and username.');
    expect(description.className).toContain('text-[13px]');
    expect(description.className).toContain('dashboard-body');
  });
});
