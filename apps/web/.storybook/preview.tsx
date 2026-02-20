import { TooltipProvider } from '@radix-ui/react-tooltip';
import type { Preview } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { ToastProvider } from '../components/providers/ToastProvider';
import '../app/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: 0,
    },
  },
});

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
    Story => (
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
    ),
  ],
};

export default preview;
