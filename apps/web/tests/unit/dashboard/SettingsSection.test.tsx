import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';

const { mockMarkNavigationDestinationReady } = vi.hoisted(() => ({
  mockMarkNavigationDestinationReady: vi.fn(),
}));

vi.mock('@/lib/tracking/navigation-telemetry', () => ({
  markNavigationDestinationReady: mockMarkNavigationDestinationReady,
}));

describe('SettingsSection', () => {
  beforeEach(() => {
    mockMarkNavigationDestinationReady.mockReset();
  });

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
    expect(mockMarkNavigationDestinationReady).toHaveBeenCalledExactlyOnceWith(
      'settings'
    );
  });
});
