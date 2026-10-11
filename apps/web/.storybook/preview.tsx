import { TooltipProvider } from '@jovie/ui/atoms/tooltip';
import type { Preview } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import React from 'react';
import { ToastProvider } from '../components/providers/ToastProvider';
import { ThemeProvider } from './next-themes-mock';
import '../app/globals.css';

/**
 * Deterministic Storybook fixtures (Phase 2 visual-testing policy).
 * Fixed clock, stable IDs, disabled animations, seeded data — prevent
 * Chromatic false positives that burn the free-tier snapshot budget.
 * @see https://www.chromatic.com/docs/snapshots/
 * @see docs/VISUAL_TESTING_POLICY.md
 */
const FIXED_NOW = new Date('2026-01-15T12:00:00.000Z');
const STABLE_ID_PREFIX = 'sb-stable';

function installProcessPolyfill(): void {
  // Chromatic story extraction runs in a browser. Vite `define` rewrites most
  // process.env.* references, but a global fallback prevents hard crashes if
  // any residual bare `process` access remains in the story graph.
  const g = globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  };
  if (!g.process) {
    g.process = { env: {} };
  }
  if (!g.process.env) {
    g.process.env = {};
  }
  const env = g.process.env;
  env.NODE_ENV = env.NODE_ENV || 'development';
  env.NEXT_PUBLIC_APP_VERSION =
    env.NEXT_PUBLIC_APP_VERSION || '0.0.0-storybook';
  env.NEXT_PUBLIC_BUILD_SHA = env.NEXT_PUBLIC_BUILD_SHA || 'storybook';
}

function installDeterministicFixtures(): void {
  installProcessPolyfill();
  if (typeof window === 'undefined') return;
  if (
    (window as Window & { __jovieStorybookFixtures?: boolean })
      .__jovieStorybookFixtures
  ) {
    return;
  }
  (
    window as Window & { __jovieStorybookFixtures?: boolean }
  ).__jovieStorybookFixtures = true;

  // Fixed clock — Date.now is the primary source of time drift in snapshots.
  const fixedMs = FIXED_NOW.getTime();
  Date.now = () => fixedMs;

  // Stable Math.random for seeded-looking data in stories that call it.
  let seed = 0x5f3759df;
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  // Stable React useId / crypto.randomUUID for deterministic DOM ids.
  let idSeq = 0;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    crypto.randomUUID = () => {
      idSeq += 1;
      const n = idSeq.toString(16).padStart(12, '0');
      return `00000000-0000-4000-8000-${n.slice(-12)}`;
    };
  }

  // Inject CSS that freezes animation/transition for Chromatic + a11y runs.
  const style = document.createElement('style');
  style.setAttribute('data-jovie-storybook-fixtures', 'true');
  style.textContent = `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      caret-color: transparent !important;
    }
    .skeleton, [data-shimmer], [class*="animate-"] {
      animation: none !important;
    }
  `;
  document.head.appendChild(style);

  // Keep responsive media queries real; only motion is deterministic.
  const nativeMatchMedia = window.matchMedia.bind(window);
  try {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => {
        if (!query.includes('prefers-reduced-motion'))
          return nativeMatchMedia(query);
        const reduced = true;
        return {
          matches: reduced,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        } as MediaQueryList;
      },
    });
  } catch {
    // ignore if already non-configurable
  }

  // Stable id helper for stories that need an explicit id prop.
  (
    window as Window & { __jovieStableId?: (name: string) => string }
  ).__jovieStableId = (name: string) => `${STABLE_ID_PREFIX}-${name}`;
}

// Intercept /api/* fetches to prevent unhandled rejections from TanStack Query
// background refetches that 404 in the Storybook test environment.
if (typeof window !== 'undefined') {
  installDeterministicFixtures();

  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    // Only intercept same-origin /api/* requests; let external APIs through
    const urlObj = new URL(raw, window.location.href);
    if (
      urlObj.origin === window.location.origin &&
      urlObj.pathname.startsWith('/api/')
    ) {
      // Per-story API mocks. Some clients (e.g. better-auth's authClient)
      // pin `fetch` at module init, so swapping `globalThis.fetch` inside a
      // story decorator can never reach them. Registering a handler on
      // `window.__jovieApiMock` works because this pinned wrapper consults
      // the live global on every request. The shared `withSignedInSession`
      // decorator (.storybook/signed-in-session.tsx) registers through this
      // hook; a `?id=` query check cannot work under the vitest browser
      // runner, which owns the page URL.
      const storyApiMock = (
        window as Window & {
          __jovieApiMock?: (request: {
            url: URL;
            init?: RequestInit;
          }) => Response | Promise<Response> | undefined;
        }
      ).__jovieApiMock;
      if (storyApiMock) {
        const mocked = await storyApiMock({ url: urlObj, init });
        if (mocked) return mocked;
      }
      // Better Auth's get-session returns null when signed out.
      if (urlObj.pathname === '/api/auth/get-session') {
        return Response.json(null);
      }
      // Endpoints whose consumers dereference the response shape get a
      // truthful empty/unavailable payload; the generic `{}` below crashed
      // SlashCommandMenu/CmdKPalette (`tools.albumArt`) and DmQueuePanel.
      if (urlObj.pathname === '/api/chat/capabilities') {
        return Response.json({
          tools: {
            albumArt: {
              availability: 'unavailable',
              reason: 'Not available in Storybook.',
              reasonCode: 'storybook',
            },
          },
        });
      }
      if (urlObj.pathname === '/api/admin/outreach') {
        return Response.json({ items: [], total: 0 });
      }
      // Unmocked endpoints answer like an unavailable service. A fabricated
      // `200 {}` let components dereference fields that real responses
      // always carry and crash (OvieLauncherRail, DmQueuePanel, CmdK);
      // every client already has an error state for a failed request.
      return new Response(
        JSON.stringify({ error: 'Not mocked in Storybook' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    return originalFetch(input, init);
  };
}

const preview: Preview = {
  parameters: {
    // Chromatic: pause animations (defense in depth vs CSS above)
    chromatic: {
      pauseAnimationAtEnd: true,
      delay: 0,
      // One Chrome viewport by free-tier policy unless layout truly changes.
      modes: undefined,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    docs: {
      toc: true,
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/test',
        query: {},
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#0D0E12' },
        { name: 'gray', value: '#f3f4f6' },
      ],
    },
    a11y: {
      config: {
        rules: [
          {
            id: 'color-contrast',
            enabled: true,
          },
        ],
      },
      options: {
        runOnly: ['wcag2a', 'wcag2aa'],
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story, context) => {
      const themeOverride = context.parameters?.themes?.themeOverride;
      const [queryClient] = React.useState(
        () =>
          new QueryClient({
            defaultOptions: {
              queries: {
                retry: false,
                staleTime: Infinity,
              },
              mutations: {
                retry: false,
              },
            },
          })
      );

      return (
        <QueryClientProvider client={queryClient}>
          {/* nuqs hooks (e.g. release-table sort params) throw without an
              adapter; the testing adapter emulates URL state in-memory. */}
          <NuqsTestingAdapter>
            <ThemeProvider
              attribute='class'
              defaultTheme='dark'
              forcedTheme={
                themeOverride === 'light' || themeOverride === 'dark'
                  ? themeOverride
                  : undefined
              }
              enableSystem={false}
              storageKey='jovie-theme-storybook'
            >
              <TooltipProvider delayDuration={0} skipDelayDuration={0}>
                <ToastProvider>
                  <Story />
                </ToastProvider>
              </TooltipProvider>
            </ThemeProvider>
          </NuqsTestingAdapter>
        </QueryClientProvider>
      );
    },
  ],
};

export default preview;
