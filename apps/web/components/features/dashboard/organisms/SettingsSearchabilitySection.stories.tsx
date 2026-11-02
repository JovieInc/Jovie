import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { Artist } from '@/types/db';
import { SettingsSearchabilitySection } from './SettingsSearchabilitySection';

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
  title: 'Dashboard/Organisms/SettingsSearchabilitySection',
  component: SettingsSearchabilitySection,
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
    Story => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        <div className='max-w-2xl'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof SettingsSearchabilitySection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LegacyChoice: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole('switch', {
      name: 'Show in Jovie discovery',
    });
    await expect(control).toBeChecked();
    await userEvent.click(control);
    await expect(await canvas.findByText('Saved')).toBeVisible();
    await expect(control).not.toBeChecked();
    await expect(control).toBeEnabled();
    await expect(args.onArtistUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ settings: { searchable: false } })
    );
  },
};
export const Searchable: Story = {
  args: { artist: { ...artist, settings: { searchable: true } } },
};
export const Unlisted: Story = {
  args: { artist: { ...artist, settings: { searchable: false } } },
};
export const PrivateProfile: Story = {
  args: {
    artist: { ...artist, published: false, settings: { searchable: false } },
  },
};
export const SaveFailure: Story = {
  parameters: {
    saveFailure: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole('switch', {
      name: 'Show in Jovie discovery',
    });
    await userEvent.click(control);
    await expect(
      await canvas.findByText('Could not save discovery preference. Try again.')
    ).toBeVisible();
    await waitFor(() => expect(control).toBeChecked());
    await expect(control).toBeEnabled();
  },
};
