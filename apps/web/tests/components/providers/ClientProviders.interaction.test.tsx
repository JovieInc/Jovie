/**
 * ClientProviders composition tests.
 *
 * Tests the provider tree composition logic — specifically the
 * skipCoreProviders path that caused the TooltipProvider regression (a518d3fb5).
 *
 * Does NOT duplicate client-providers-query.test.tsx (which tests QueryClient availability).
 * This file tests that the correct providers exist in the tree for each variant.
 *
 * @see apps/web/components/providers/ClientProviders.tsx
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientAuthBootstrap } from '@/lib/auth/dev-test-auth-types';

const { router } = vi.hoisted(() => ({ router: { push: vi.fn() } }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/app/chat',
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

vi.mock('@/hooks/useJovieAuth', () => ({
  JovieAuthDefaultsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='jovie-auth-defaults'>{children}</div>
  ),
  JovieAuthValuesProvider: ({
    children,
    initialUser,
  }: {
    children: React.ReactNode;
    initialUser?: { id: string } | null;
  }) => (
    <div data-testid='jovie-auth-values' data-user-id={initialUser?.id}>
      {children}
    </div>
  ),
}));

// Mock CoreProviders to track rendering without full provider setup
vi.mock('@/components/providers/CoreProviders', () => ({
  CoreProviders: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='core-providers'>{children}</div>
  ),
}));

// Mock QueryProvider to track rendering
vi.mock('@/components/providers/QueryProvider', () => ({
  QueryProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='query-provider'>{children}</div>
  ),
}));

// Mock TooltipProvider to verify it's in the tree
vi.mock('@jovie/ui', () => ({
  TooltipProvider: ({
    children,
    delayDuration,
  }: {
    children: React.ReactNode;
    delayDuration?: number;
  }) => (
    <div data-testid='tooltip-provider' data-delay={delayDuration}>
      {children}
    </div>
  ),
}));

// Import after mocks
import { ClientProviders } from '@/components/providers/ClientProviders';

function TestChild() {
  return <div data-testid='test-child'>Hello</div>;
}

describe('ClientProviders composition', () => {
  it.each([false, true])(
    'routes native commands and releases the subscription with signed-out defaults=%s',
    forceSignedOutDefaults => {
      let navigate: ((path: string) => void) | undefined;
      const unsubscribe = vi.fn();
      const onNavigate = vi.fn((callback: (path: string) => void) => {
        navigate = callback;
        return unsubscribe;
      });
      vi.stubGlobal('electronAPI', { onNavigate });
      const view = render(
        <ClientProviders forceSignedOutDefaults={forceSignedOutDefaults}>
          <TestChild />
        </ClientProviders>
      );

      expect(onNavigate).toHaveBeenCalledTimes(1);
      act(() => navigate?.('/app/settings'));
      expect(router.push).toHaveBeenCalledExactlyOnceWith('/app/settings');
      view.unmount();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
  );

  it('uses signed-out defaults for public surfaces', () => {
    render(
      <ClientProviders forceSignedOutDefaults>
        <TestChild />
      </ClientProviders>
    );

    expect(screen.getByTestId('jovie-auth-defaults')).toBeInTheDocument();
    expect(screen.queryByTestId('jovie-auth-values')).not.toBeInTheDocument();
  });

  describe('skipCoreProviders=false (default)', () => {
    it('renders CoreProviders wrapping children', () => {
      render(
        <ClientProviders>
          <TestChild />
        </ClientProviders>
      );

      expect(screen.getByTestId('core-providers')).toBeInTheDocument();
      expect(screen.getByTestId('test-child')).toBeInTheDocument();
    });
  });

  describe('skipCoreProviders=true (profile pages)', () => {
    it('renders TooltipProvider wrapping children (a518d3fb5 regression)', () => {
      render(
        <ClientProviders skipCoreProviders>
          <TestChild />
        </ClientProviders>
      );

      // The key regression: skipCoreProviders must still include TooltipProvider
      expect(screen.getByTestId('tooltip-provider')).toBeInTheDocument();
      expect(screen.getByTestId('test-child')).toBeInTheDocument();
    });

    it('renders QueryProvider for data fetching', () => {
      render(
        <ClientProviders skipCoreProviders>
          <TestChild />
        </ClientProviders>
      );

      expect(screen.getByTestId('query-provider')).toBeInTheDocument();
    });

    it('does NOT render CoreProviders', () => {
      render(
        <ClientProviders skipCoreProviders>
          <TestChild />
        </ClientProviders>
      );

      expect(screen.queryByTestId('core-providers')).not.toBeInTheDocument();
    });

    it('delegates tooltip timing to the shared provider', () => {
      render(
        <ClientProviders skipCoreProviders>
          <TestChild />
        </ClientProviders>
      );

      expect(screen.getByTestId('tooltip-provider')).not.toHaveAttribute(
        'data-delay'
      );
    });
  });

  describe('Better Auth provider path', () => {
    it('updates the bootstrap user across signed-out and authenticated renders', () => {
      const authBootstrap: ClientAuthBootstrap = {
        isAuthenticated: true,
        userId: 'bootstrap-user',
        email: 'test@example.com',
        username: 'testuser',
        fullName: 'Test User',
        isAdmin: false,
        persona: 'creator',
      };
      const view = render(
        <ClientProviders forceSignedOutDefaults>
          <TestChild />
        </ClientProviders>
      );
      expect(screen.getByTestId('jovie-auth-defaults')).toBeInTheDocument();

      view.rerender(
        <ClientProviders forceSignedOutDefaults authBootstrap={authBootstrap}>
          <TestChild />
        </ClientProviders>
      );
      expect(screen.getByTestId('jovie-auth-values')).toHaveAttribute(
        'data-user-id',
        'bootstrap-user'
      );

      view.rerender(
        <ClientProviders
          forceSignedOutDefaults
          authBootstrap={{ ...authBootstrap, userId: 'replacement-user' }}
        >
          <TestChild />
        </ClientProviders>
      );
      expect(screen.getByTestId('jovie-auth-values')).toHaveAttribute(
        'data-user-id',
        'replacement-user'
      );

      view.rerender(
        <ClientProviders forceSignedOutDefaults>
          <TestChild />
        </ClientProviders>
      );
      expect(screen.getByTestId('jovie-auth-defaults')).toBeInTheDocument();
      expect(screen.queryByTestId('jovie-auth-values')).not.toBeInTheDocument();
    });

    it('wraps with JovieAuthDefaultsProvider when forced signed-out', () => {
      render(
        <ClientProviders forceSignedOutDefaults>
          <TestChild />
        </ClientProviders>
      );

      expect(screen.getByTestId('jovie-auth-defaults')).toBeInTheDocument();
    });

    it('wraps with JovieAuthValuesProvider when a bootstrap session is present', () => {
      render(
        <ClientProviders
          forceSignedOutDefaults
          authBootstrap={{
            isAuthenticated: true,
            userId: 'test-user-id',
            email: 'test@example.com',
            username: 'testuser',
            fullName: 'Test User',
            isAdmin: false,
            persona: 'creator',
          }}
        >
          <TestChild />
        </ClientProviders>
      );

      expect(screen.getByTestId('jovie-auth-values')).toBeInTheDocument();
      expect(
        screen.queryByTestId('jovie-auth-defaults')
      ).not.toBeInTheDocument();
    });
  });
});
