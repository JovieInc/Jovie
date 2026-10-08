import { render, screen } from '@testing-library/react';
import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  flag: vi.fn(),
  shell: vi.fn(),
  capture: vi.fn(),
  loadProfiles: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.auth }));
vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: mocks.flag }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('../dashboard/actions', () => ({
  getDashboardShellData: mocks.shell,
}));
vi.mock('../profiles/data', () => ({
  loadProfilesWorkspaceData: mocks.loadProfiles,
}));
vi.mock('../profiles/ProfilesWorkspace', () => ({
  ProfilesWorkspace: () => null,
}));

import PresencePage, { metadata } from './page';

describe('Profiles public page route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'actor-1' });
    mocks.flag.mockResolvedValue(true);
    mocks.shell.mockResolvedValue({
      user: { id: 'database-user-1' },
      selectedProfile: { id: 'identity-1' },
      needsOnboarding: false,
    });
    mocks.loadProfiles.mockResolvedValue({ profileId: 'identity-1' });
  });

  it('names the customer page Profiles while preserving the identity description', () => {
    expect(metadata.title).toBe('Profiles');
    expect(metadata.description).toBe(
      'Manage who you are and how you are represented across public surfaces'
    );
  });

  it('renders and records Profiles-specific shell load failure without loading the inventory', async () => {
    const failure = new Error('dashboard unavailable');
    mocks.shell.mockResolvedValue({ dashboardLoadError: failure });

    render(await PresencePage());

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load Profiles. Please refresh the page.'
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      'Dashboard data load failed on Profiles page',
      failure,
      { route: APP_ROUTES.PRESENCE }
    );
    expect(mocks.loadProfiles).not.toHaveBeenCalled();
    expect(mocks.flag).toHaveBeenCalledWith('PROFILES_WORKSPACE', {
      userId: 'actor-1',
    });
  });

  it('keeps unauthenticated callers out of shell and profile loading', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    await expect(PresencePage()).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mocks.shell).not.toHaveBeenCalled();
    expect(mocks.loadProfiles).not.toHaveBeenCalled();
  });

  it('renders the empty inventory with the unchanged creator scope when no identity is selected', async () => {
    mocks.shell.mockResolvedValue({
      user: { id: 'database-user-1' },
      selectedProfile: null,
      needsOnboarding: false,
    });

    const result = await PresencePage();

    if (!isValidElement(result)) {
      throw new Error('Expected the Profiles workspace element');
    }

    expect(result.props).toEqual({
      data: null,
      scope: {
        actorId: 'actor-1',
        workspaceId: 'no-identity',
        target: 'creator',
      },
    });
    expect(mocks.loadProfiles).not.toHaveBeenCalled();
  });
});
