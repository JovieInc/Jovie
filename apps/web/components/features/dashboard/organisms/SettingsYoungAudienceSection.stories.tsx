import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { Artist } from '@/types/db';
import { SettingsYoungAudienceSection } from './SettingsYoungAudienceSection';

const artist = {
  id: '11111111-1111-4111-8111-111111111111',
  owner_user_id: 'owner-fixture',
  handle: 'story-artist',
  spotify_id: '',
  name: 'Story Artist',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-10-17T00:00:00Z',
} satisfies Artist;

const meta = {
  title: 'Dashboard/Organisms/SettingsYoungAudienceSection',
  component: SettingsYoungAudienceSection,
  parameters: {
    layout: 'padded',
  },
  beforeEach: ({ parameters }) => {
    const mockWindow = window as Window & {
      __jovieApiMock?: (request: {
        url: URL;
        init?: RequestInit;
      }) => Response | Promise<Response> | undefined;
    };
    const previous = mockWindow.__jovieApiMock;
    mockWindow.__jovieApiMock = request => {
      if (
        request.url.pathname !== '/api/dashboard/profile' ||
        request.init?.method !== 'PUT'
      ) {
        return previous?.(request);
      }
      return parameters.saveFailure
        ? Response.json({ error: 'Unavailable' }, { status: 503 })
        : Response.json({ success: true });
    };
    return () => {
      mockWindow.__jovieApiMock = previous;
    };
  },
  args: { artist, onArtistUpdate: fn() },
  decorators: [
    Story => {
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
} satisfies Meta<typeof SettingsYoungAudienceSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  args: { artist: { ...artist, settings: { youngAudience: false } } },
};

export const On: Story = {
  args: { artist: { ...artist, settings: { youngAudience: true } } },
};

export const ToggleSaves: Story = {
  args: { artist: { ...artist, settings: { youngAudience: false } } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole('switch', { name: 'Young audience' });
    await userEvent.click(control);
    await waitFor(() => expect(canvas.getByText('Saved')).toBeInTheDocument());
    expect(args.onArtistUpdate).toHaveBeenCalled();
  },
};
