import { act, fireEvent, render, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PresenceRemovalPrincipal } from '@/components/features/presence/types';
import {
  QueryProvider,
  resetBrowserQueryClientForTests,
} from '@/components/providers/QueryProvider';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import {
  applyCacheScope,
  getCacheGeneration,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';
import { data, row, scope } from './presence-removal-test-fixtures';
import { usePresenceRemoval } from './usePresenceRemoval';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/lib/auth/client', () => ({
  authClient: { useSession: () => mocks.session() },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/feedback', () => ({
  toast: { error: mocks.error, success: vi.fn() },
}));
const principal = {
  appActorId: 'actor',
  authUserId: 'ba-actor',
  sessionId: 'session',
  impersonationSubject: null,
};
const bootstrap = {
  id: 'ba-actor',
  email: 'synthetic@example.com',
  name: 'Synthetic Artist',
};
function Harness({
  binding,
}: {
  readonly binding: PresenceRemovalPrincipal | null;
}) {
  useLayoutEffect(() => {
    applyCacheScope({ profileId: data.profileId });
  }, []);
  const removal = usePresenceRemoval(data, scope, row.id, undefined, binding);
  return (
    <>
      <button type='button' onClick={() => removal.request(row)}>
        Inspect removal
      </button>
      {removal.dialog}
    </>
  );
}
function tree(binding: PresenceRemovalPrincipal | null = principal) {
  return (
    <JovieAuthValuesProvider initialUser={bootstrap}>
      <QueryProvider>
        <Harness binding={binding} />
      </QueryProvider>
    </JovieAuthValuesProvider>
  );
}
function settled(userId = 'ba-actor', sessionId = 'session') {
  mocks.session.mockReturnValue({
    isPending: false,
    data: {
      user: { ...bootstrap, id: userId },
      session: { id: sessionId, userId },
    },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  resetCacheIsolationForTests();
  resetBrowserQueryClientForTests();
  settled();
});
it('opens confirmation for a linked app actor with a distinct Better Auth principal through real providers', () => {
  render(tree());
  fireEvent.click(screen.getByRole('button', { name: 'Inspect removal' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent(row.url);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it('waits for bootstrap to settle into the server-bound principal and session', () => {
  mocks.session.mockReturnValue({ isPending: true, data: null });
  const view = render(tree());
  fireEvent.click(screen.getByRole('button', { name: 'Inspect removal' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  const bootstrapGeneration = getCacheGeneration();
  settled();
  view.rerender(tree());
  expect(getCacheGeneration()).toBe(bootstrapGeneration);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect removal' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent(row.url);
});

it('accepts equal IDs without conflating the identity namespaces', () => {
  settled('actor');
  render(tree({ ...principal, authUserId: 'actor' }));
  fireEvent.click(screen.getByRole('button', { name: 'Inspect removal' }));
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
});
it.each([
  ['missing binding', null],
  ['different application actor', { ...principal, appActorId: 'other' }],
  ['different authentication principal', { ...principal, authUserId: 'other' }],
  ['different server session', { ...principal, sessionId: 'old-session' }],
  ['empty server session', { ...principal, sessionId: '' }],
  ['stale impersonation', { ...principal, impersonationSubject: 'actor' }],
] as const)(
  'rejects initial %s without a network request',
  (_name, binding) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(tree(binding));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect removal' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  }
);
it.each(['account', 'session'] as const)(
  'does not rebind stale server props after a live %s change',
  change => {
    const view = render(tree());
    fireEvent.click(screen.getByRole('button', { name: 'Inspect removal' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    settled(
      change === 'account' ? 'other-auth-user' : 'ba-actor',
      change === 'session' ? 'other-session' : 'session'
    );
    view.rerender(tree());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect removal' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  }
);
it.each(['profile', 'impersonation', 'away and back'] as const)(
  'cancels an open intent on %s fencing',
  change => {
    render(tree());
    fireEvent.click(screen.getByRole('button', { name: 'Inspect removal' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    act(() => {
      applyCacheScope(
        change === 'impersonation'
          ? { impersonationSubject: 'other-app-actor' }
          : { profileId: 'other-profile' }
      );
      if (change === 'away and back')
        applyCacheScope({ profileId: data.profileId });
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  }
);
it('requires the captured impersonation subject at initial entry', () => {
  render(tree());
  act(() => {
    applyCacheScope({ impersonationSubject: 'actor' });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Inspect removal' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
});
it('allows an explicitly server-bound impersonated app actor', () => {
  render(tree({ ...principal, impersonationSubject: 'actor' }));
  act(() => {
    applyCacheScope({ impersonationSubject: 'actor' });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Inspect removal' }));
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
});

it('closes intent when refreshed server binding no longer matches the current session', () => {
  const view = render(tree());
  fireEvent.click(screen.getByRole('button', { name: 'Inspect removal' }));
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  view.rerender(tree({ ...principal, sessionId: 'different-server-session' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
});
