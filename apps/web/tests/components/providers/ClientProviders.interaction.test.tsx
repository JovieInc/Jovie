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
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { availabilityState } = vi.hoisted(() => ({
  availabilityState: {
    shouldBypass: true,
  },
}));

// Mock Clerk and env to avoid real auth setup
vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='clerk-provider'>{children}</div>
  ),
}));
vi.mock('@clerk/ui', () => ({
  ui: {},
}));
vi.mock('@/hooks/useClerkSafe', () => ({
  ClerkSafeBootstrapProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='clerk-safe-bootstrap'>{children}</div>
  ),
  ClerkSafeDefaultsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='clerk-safe-defaults'>{children}</div>
  ),
  ClerkSafeValuesProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='clerk-safe-values'>{children}</div>
  ),
}));
vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_CLERK_MOCK: 'true',
  },
}));
vi.mock('@/components/providers/clerkAvailability', () => ({
  shouldBypassClerk: () => availabilityState.shouldBypass,
  getClerkProxyUrl: () => '/__clerk',
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
  beforeEach(() => {
    availabilityState.shouldBypass = true;
  });

  it('supports route-level forced Clerk bypass for public surfaces', () => {
    availabilityState.shouldBypass = false;

    render(
      <ClientProviders publishableKey='pk_live_example' forceBypassClerk>
        <TestChild />
      </ClientProviders>
    );

    expect(screen.queryByTestId('clerk-provider')).not.toBeInTheDocument();
    expect(screen.getByTestId('clerk-safe-defaults')).toBeInTheDocument();
  });

  describe('skipCoreProviders=false (default)', () => {
    it('renders CoreProviders wrapping children', () => {
      render(
        <ClientProviders publishableKey={undefined}>
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
        <ClientProviders publishableKey={undefined} skipCoreProviders>
          <TestChild />
        </ClientProviders>
      );

      // The key regression: skipCoreProviders must still include TooltipProvider
      expect(screen.getByTestId('tooltip-provider')).toBeInTheDocument();
      expect(screen.getByTestId('test-child')).toBeInTheDocument();
    });

    it('renders QueryProvider for data fetching', () => {
      render(
        <ClientProviders publishableKey={undefined} skipCoreProviders>
          <TestChild />
        </ClientProviders>
      );

      expect(screen.getByTestId('query-provider')).toBeInTheDocument();
    });

    it('does NOT render CoreProviders', () => {
      render(
        <ClientProviders publishableKey={undefined} skipCoreProviders>
          <TestChild />
        </ClientProviders>
      );

      expect(screen.queryByTestId('core-providers')).not.toBeInTheDocument();
    });

    it('TooltipProvider has correct delay duration', () => {
      render(
        <ClientProviders publishableKey={undefined} skipCoreProviders>
          <TestChild />
        </ClientProviders>
      );

      expect(screen.getByTestId('tooltip-provider')).toHaveAttribute(
        'data-delay',
        '1200'
      );
    });
  });

  describe('Clerk bypass path', () => {
    it('wraps with ClerkSafeDefaultsProvider when no auth bootstrap', () => {
      render(
        <ClientProviders publishableKey={undefined}>
          <TestChild />
        </ClientProviders>
      );

      expect(screen.getByTestId('clerk-safe-defaults')).toBeInTheDocument();
    });

    it('wraps with ClerkSafeBootstrapProvider when auth bootstrap provided', () => {
      render(
        <ClientProviders
          publishableKey={undefined}
          authBootstrap={{
            isAuthenticated: true,
            userId: 'test-user-id',
            sessionId: 'test-session-id',
          }}
        >
          <TestChild />
        </ClientProviders>
      );

      expect(screen.getByTestId('clerk-safe-bootstrap')).toBeInTheDocument();
    });
  });
});
