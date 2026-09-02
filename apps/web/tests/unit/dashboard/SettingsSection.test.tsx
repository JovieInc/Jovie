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
    ).toBeVisible();
    expect(mockMarkNavigationDestinationReady).toHaveBeenCalledExactlyOnceWith(
      'settings'
    );
    expect(heading.closest('section')).toHaveAttribute(
      'aria-label',
      'Artist Profile'
    );
    expect(heading.closest('section')).not.toHaveAttribute('aria-describedby');
    expect(screen.getByText('Content').parentElement).toHaveClass(
      'px-(--app-shell-content-padding-x)',
      'py-(--app-shell-content-padding-y)'
    );
  });

  it('keeps the route-owned header action outside the padded content region', () => {
    render(
      <SettingsSection
        id='billing'
        title='Billing'
        headerAction={<button type='button'>Manage Billing</button>}
      >
        <div>Plan details</div>
      </SettingsSection>
    );

    const action = screen.getByRole('button', { name: 'Manage Billing' });
    const content = screen.getByText('Plan details').parentElement;

    expect(action.parentElement).not.toBe(content);
    expect(
      screen.getByRole('heading', { name: 'Billing' })
    ).toBeInTheDocument();
    expect(screen.getByText('Plan details').closest('section')).toHaveAttribute(
      'aria-label',
      'Billing'
    );
    expect(
      screen.getByText('Plan details').closest('section')
    ).not.toHaveAttribute('aria-describedby');
  });
});
