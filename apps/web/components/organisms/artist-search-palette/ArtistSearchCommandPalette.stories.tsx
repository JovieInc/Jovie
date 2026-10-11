import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { ArtistSearchCommandPalette } from './ArtistSearchCommandPalette';

function QueryProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Organisms/ArtistSearchPalette/ArtistSearchCommandPalette',
  component: ArtistSearchCommandPalette,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <QueryProvider>
        <Story />
      </QueryProvider>
    ),
  ],
  args: {
    open: true,
    onOpenChange: fn(),
    provider: 'spotify',
    onArtistSelect: fn(),
  },
} satisfies Meta<typeof ArtistSearchCommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Spotify: Story = {};

export const AppleMusic: Story = {
  args: {
    provider: 'apple_music',
  },
};

export const CustomCopy: Story = {
  args: {
    title: 'Connect your artist profile',
    description: 'Search for your artist name to link your catalog.',
  },
};
