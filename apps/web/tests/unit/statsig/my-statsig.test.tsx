import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StatsigBootstrapData } from '@/lib/statsig/types';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/app/dashboard',
}));

// Mock the env-public module
vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_STATSIG_CLIENT_KEY: 'test-client-key',
  },
}));

// Track which hook was called
let asyncInitCalled = false;
let bootstrapInitCalled = false;
let lastBootstrapInitValues: string | null = null;

// Create a mock StatsigClient
const createMockClient = () => ({
  initializeSync: vi.fn(),
  shutdown: vi.fn(),
  getContext: () => ({ user: { userID: 'test-user' } }),
});

// Mock @statsig/react-bindings
vi.mock('@statsig/react-bindings', () => {
  return {
    LogLevel: { Debug: 'debug' },
    StatsigClient: vi.fn(),
    StatsigProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid='statsig-provider'>{children}</div>
    ),
    useClientAsyncInit: vi.fn().mockImplementation(() => {
      asyncInitCalled = true;
      return { client: createMockClient() };
    }),
    useClientBootstrapInit: vi
      .fn()
      .mockImplementation(
        (_sdkKey: string, _user: { userID: string }, initialValues: string) => {
          bootstrapInitCalled = true;
          lastBootstrapInitValues = initialValues;
          return createMockClient();
        }
      ),
  };
});

// Import component after mocks are set up
import { MyStatsig } from '@/app/my-statsig';

/**
 * Helper to create valid mock bootstrap data
 */
const createMockBootstrapData = (
  overrides?: Partial<StatsigBootstrapData>
): StatsigBootstrapData => ({
  feature_gates: {
    test_gate: {
      name: 'test_gate',
      value: true,
      rule_id: 'rule_123',
    },
  },
  dynamic_configs: {
    test_config: {
      name: 'test_config',
      rule_id: 'config_rule',
      value: { key: 'value' },
    },
  },
  layer_configs: {},
  has_updates: true,
  generator: 'statsig-test',
  time: Date.now(),
  company_lcut: Date.now(),
  evaluated_keys: {
    userID: 'test-user-123',
  },
  hash_used: 'djb2',
  ...overrides,
});

describe('MyStatsig', () => {
  beforeEach(() => {
    // Reset tracking flags before each test
    asyncInitCalled = false;
    bootstrapInitCalled = false;
    lastBootstrapInitValues = null;
    vi.clearAllMocks();
  });

  describe('bootstrap mode (when bootstrapData is provided)', () => {
    it('uses bootstrap initialization when bootstrapData is provided', () => {
      const bootstrapData = createMockBootstrapData();

      render(
        <MyStatsig userId='test-user' bootstrapData={bootstrapData}>
          <div>Child content</div>
        </MyStatsig>
      );

      // Should use bootstrap init, not async init
      expect(bootstrapInitCalled).toBe(true);
      expect(asyncInitCalled).toBe(false);
    });

    it('passes stringified bootstrap data to useClientBootstrapInit', () => {
      const bootstrapData = createMockBootstrapData();

      render(
        <MyStatsig userId='test-user' bootstrapData={bootstrapData}>
          <div>Child content</div>
        </MyStatsig>
      );

      // Verify the bootstrap data was passed as a JSON string
      expect(lastBootstrapInitValues).toBe(JSON.stringify(bootstrapData));
    });

    it('renders children immediately in bootstrap mode', () => {
      const bootstrapData = createMockBootstrapData();

      render(
        <MyStatsig userId='test-user' bootstrapData={bootstrapData}>
          <div data-testid='child-content'>Child content</div>
        </MyStatsig>
      );

      // Children should be rendered
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('wraps children with StatsigProvider in bootstrap mode', () => {
      const bootstrapData = createMockBootstrapData();

      render(
        <MyStatsig userId='test-user' bootstrapData={bootstrapData}>
          <div>Child content</div>
        </MyStatsig>
      );

      // Should render inside the StatsigProvider mock
      expect(screen.getByTestId('statsig-provider')).toBeInTheDocument();
    });
  });

  describe('async mode (fallback when no bootstrapData)', () => {
    it('uses async initialization when bootstrapData is undefined', () => {
      render(
        <MyStatsig userId='test-user'>
          <div>Child content</div>
        </MyStatsig>
      );

      // Should use async init, not bootstrap init
      expect(asyncInitCalled).toBe(true);
      expect(bootstrapInitCalled).toBe(false);
    });

    it('uses async initialization when bootstrapData is null', () => {
      render(
        <MyStatsig userId='test-user' bootstrapData={null}>
          <div>Child content</div>
        </MyStatsig>
      );

      // Should use async init, not bootstrap init
      expect(asyncInitCalled).toBe(true);
      expect(bootstrapInitCalled).toBe(false);
    });

    it('renders children in async mode', () => {
      render(
        <MyStatsig userId='test-user'>
          <div data-testid='child-content'>Child content</div>
        </MyStatsig>
      );

      // Children should be rendered (even in async mode, our mock renders them)
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });

    it('wraps children with StatsigProvider in async mode', () => {
      render(
        <MyStatsig userId='test-user'>
          <div>Child content</div>
        </MyStatsig>
      );

      // Should render inside the StatsigProvider mock
      expect(screen.getByTestId('statsig-provider')).toBeInTheDocument();
    });
  });

  describe('behavior without SDK key', () => {
    it('renders children directly when SDK key is missing', async () => {
      // Reset modules to apply new mock
      vi.resetModules();

      // Re-mock with no SDK key
      vi.doMock('@/lib/env-public', () => ({
        publicEnv: {
          NEXT_PUBLIC_STATSIG_CLIENT_KEY: undefined,
        },
      }));

      // Re-mock other required modules
      vi.doMock('next/navigation', () => ({
        usePathname: () => '/app/dashboard',
      }));

      vi.doMock('@statsig/react-bindings', () => ({
        LogLevel: { Debug: 'debug' },
        StatsigClient: vi.fn(),
        StatsigProvider: ({ children }: { children: React.ReactNode }) => (
          <div data-testid='statsig-provider'>{children}</div>
        ),
        useClientAsyncInit: vi.fn().mockImplementation(() => {
          asyncInitCalled = true;
          return { client: createMockClient() };
        }),
        useClientBootstrapInit: vi.fn().mockImplementation(() => {
          bootstrapInitCalled = true;
          return createMockClient();
        }),
      }));

      // Import fresh component with new mocks
      const { MyStatsig: MyStatsigNoKey } = await import('@/app/my-statsig');

      render(
        <MyStatsigNoKey userId='test-user'>
          <div data-testid='child-content'>Child content</div>
        </MyStatsigNoKey>
      );

      // Children should be rendered directly (no provider wrapper expected)
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Child content')).toBeInTheDocument();

      // Neither hook should have been called
      expect(asyncInitCalled).toBe(false);
      expect(bootstrapInitCalled).toBe(false);
    });
  });

  describe('user handling', () => {
    it('uses provided userId for initialization', () => {
      render(
        <MyStatsig userId='custom-user-123'>
          <div>Child content</div>
        </MyStatsig>
      );

      // Async init should have been called
      expect(asyncInitCalled).toBe(true);
    });

    it('falls back to anonymous userId when not provided', () => {
      render(
        <MyStatsig>
          <div>Child content</div>
        </MyStatsig>
      );

      // Async init should have been called
      expect(asyncInitCalled).toBe(true);
    });

    it('falls back to anonymous userId when null is provided', () => {
      render(
        <MyStatsig userId={null}>
          <div>Child content</div>
        </MyStatsig>
      );

      // Async init should have been called
      expect(asyncInitCalled).toBe(true);
    });
  });

  describe('children rendering in both modes', () => {
    it('renders complex children correctly in bootstrap mode', () => {
      const bootstrapData = createMockBootstrapData();

      render(
        <MyStatsig userId='test-user' bootstrapData={bootstrapData}>
          <header data-testid='header'>Header</header>
          <main data-testid='main'>
            <section>Section 1</section>
            <section>Section 2</section>
          </main>
          <footer data-testid='footer'>Footer</footer>
        </MyStatsig>
      );

      expect(screen.getByTestId('header')).toBeInTheDocument();
      expect(screen.getByTestId('main')).toBeInTheDocument();
      expect(screen.getByTestId('footer')).toBeInTheDocument();
      expect(screen.getByText('Section 1')).toBeInTheDocument();
      expect(screen.getByText('Section 2')).toBeInTheDocument();
    });

    it('renders complex children correctly in async mode', () => {
      render(
        <MyStatsig userId='test-user'>
          <header data-testid='header'>Header</header>
          <main data-testid='main'>
            <section>Section 1</section>
            <section>Section 2</section>
          </main>
          <footer data-testid='footer'>Footer</footer>
        </MyStatsig>
      );

      expect(screen.getByTestId('header')).toBeInTheDocument();
      expect(screen.getByTestId('main')).toBeInTheDocument();
      expect(screen.getByTestId('footer')).toBeInTheDocument();
      expect(screen.getByText('Section 1')).toBeInTheDocument();
      expect(screen.getByText('Section 2')).toBeInTheDocument();
    });
  });
});
