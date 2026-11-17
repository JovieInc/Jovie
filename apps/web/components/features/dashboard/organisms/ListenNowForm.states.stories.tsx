import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, userEvent, within } from 'storybook/test';
import type { Artist } from '@/types/db';
import { ListenNowForm } from './ListenNowForm';

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

/** Answers the profile save the way a story asks; returns a restore. */
function stubProfileSave(respond: () => Promise<Response>) {
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  apiMockWindow.__jovieApiMock = request =>
    request.url.pathname === '/api/dashboard/profile'
      ? respond()
      : previous?.(request);
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

const storyArtist = {
  id: 'story-listen-now-states',
  owner_user_id: 'story-user',
  handle: 'story-artist',
  spotify_id: '',
  name: 'Mina Vale',
  tagline: 'Independent producer and vocalist',
  image_url: '',
  spotify_url: 'https://open.spotify.com/artist/story',
  apple_music_url: 'https://music.apple.com/artist/story',
  youtube_url: '',
  settings: {},
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies Artist;

type FormMeta = Meta<typeof ListenNowForm>;
type FormStory = StoryObj<typeof ListenNowForm>;

/** A fresh query client per story and a form-width column. */
const FormColumnDecorator: NonNullable<FormMeta['decorators']> =
  function FormColumnDecorator(Story, context) {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const rtl = context.parameters.rtl === true;
    return (
      <QueryClientProvider client={client}>
        <div
          dir={rtl ? 'rtl' : undefined}
          lang={rtl ? 'ar' : undefined}
          className='w-full max-w-96'
        >
          <Story />
        </div>
      </QueryClientProvider>
    );
  };

/** Submits the form so the save request starts. */
const submitLinks: FormStory['play'] = async function submitLinks({
  canvasElement,
}) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Update Links' }));
};

/**
 * Rendered states of the legacy Listen Now links form. The default form
 * lives in ListenNowForm.stories.tsx.
 */
const meta = {
  title: 'Dashboard/Organisms/LegacyListenNowForm/States',
  component: ListenNowForm,
  parameters: { layout: 'centered' },
  decorators: [FormColumnDecorator],
  args: { artist: storyArtist, onUpdate: () => undefined },
} satisfies FormMeta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the save is in flight, so the submit button shows its loading state. */
export const LoadingSave: Story = {
  beforeEach: () => stubProfileSave(() => new Promise<Response>(() => {})),
  play: submitLinks,
};

/** Empty: a profile with no music links yet. */
export const EmptyNoLinks: Story = {
  args: {
    artist: {
      ...storyArtist,
      spotify_url: '',
      apple_music_url: '',
      youtube_url: '',
    },
  },
};

/** Error: the save fails, so the form keeps the links and shows the failure. */
export const ErrorSaveFailed: Story = {
  beforeEach: () =>
    stubProfileSave(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'Internal error' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      )
    ),
  play: async function playErrorSaveFailed(context) {
    await submitLinks?.(context);
    const canvas = within(context.canvasElement);
    await expect(
      await canvas.findByText('Failed to update music links')
    ).toBeVisible();
  },
};

/** Offline: the request cannot reach the network and reports the same failure. */
export const OfflineSave: Story = {
  beforeEach: () =>
    stubProfileSave(() => Promise.reject(new TypeError('Failed to fetch'))),
  play: async function playOfflineSave(context) {
    await submitLinks?.(context);
    const canvas = within(context.canvasElement);
    await expect(
      await canvas.findByText('Failed to update music links')
    ).toBeVisible();
  },
};

/** Long content: very long links in every field. */
export const LongContentUrls: Story = {
  args: {
    artist: {
      ...storyArtist,
      spotify_url:
        'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb?si=a-very-long-share-identifier-from-the-app',
      apple_music_url:
        'https://music.apple.com/us/artist/an-extremely-long-artist-name-slug/1234567890?l=en-GB&app=music',
      youtube_url:
        'https://www.youtube.com/channel/UC-a-very-long-channel-identifier-for-this-artist-profile',
    },
  },
};

/** Right-to-left: the form in an Arabic RTL document. */
export const RtlArabicForm: Story = {
  parameters: { rtl: true },
};
