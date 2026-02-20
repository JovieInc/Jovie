import { TooltipProvider } from '@jovie/ui';
import type { Preview } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import React from 'react';
import { ToastProvider } from '../components/providers/ToastProvider';
import '../app/globals.css';

// Intercept /api/* fetches to prevent unhandled rejections from TanStack Query
// background refetches that 404 in the Storybook test environment.
if (typeof window !== 'undefined') {
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
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };
}

const preview: Preview = {
  parameters: {
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
    Story => {
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
          <ThemeProvider
            attribute='class'
            defaultTheme='dark'
            enableSystem
            disableTransitionOnChange
            storageKey='jovie-theme'
          >
            <TooltipProvider>
              <ToastProvider>
                <Story />
              </ToastProvider>
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
      );
    },
  ],
};

export default preview;
