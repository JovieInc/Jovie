import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { Artist } from '@/types/db';
import { DataPrivacySection } from './DataPrivacySection';

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

/** Holds the export request open so the section stays in its exporting state. */
function holdExportRequest() {
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  apiMockWindow.__jovieApiMock = request =>
    request.url.pathname === '/api/account/export'
      ? new Promise<Response>(() => {})
      : previous?.(request);
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

const artist = {
  id: '22222222-2222-4222-8222-222222222222',
  owner_user_id: 'owner',
  handle: 'story-artist',
  spotify_id: '',
  name: 'Story Artist',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-10-17T00:00:00Z',
} satisfies Artist;

type SectionMeta = Meta<typeof DataPrivacySection>;

/** Gives every story a fresh query client so a held request never leaks. */
const QueryClientDecorator: NonNullable<SectionMeta['decorators']> =
  function QueryClientDecorator(Story, context) {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const rtl = context.parameters.rtl === true;
    return (
      <QueryClientProvider client={client}>
        <div
          dir={rtl ? 'rtl' : undefined}
          lang={rtl ? 'ar' : undefined}
          className='max-w-2xl'
        >
          <Story />
        </div>
      </QueryClientProvider>
    );
  };

/**
 * Rendered states of the data and privacy settings section. The default
 * section lives in DataPrivacySection.stories.tsx.
 */
const meta = {
  title: 'Dashboard/Organisms/DataPrivacySection/States',
  component: DataPrivacySection,
  args: { artist, onArtistUpdate: fn() },
  parameters: { layout: 'padded' },
  decorators: [QueryClientDecorator],
} satisfies SectionMeta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the data export is in flight, so its button reads Exporting and is disabled. */
export const LoadingExport: Story = {
  beforeEach: holdExportRequest,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Export data' }));
    await expect(
      await canvas.findByRole('button', { name: 'Exporting...' })
    ).toBeDisabled();
  },
};

/** Empty: no profile is selected, so only the account actions show. */
export const EmptyNoSelectedProfile: Story = {
  args: { artist: null },
};

/** Partial: an unpublished profile that has never set its discovery preference. */
export const PartialUnpublishedProfile: Story = {
  args: { artist: { ...artist, published: false } },
};

/** Long content: a profile with a very long name and handle. */
export const LongContentProfileName: Story = {
  args: {
    artist: {
      ...artist,
      name: 'The Extremely Long Official Name Of This Artist Profile And Band',
      handle: 'the-extremely-long-official-handle-of-this-artist-profile',
    },
  },
};

/** Right-to-left: an Arabic profile in an RTL document. */
export const RtlArabicProfile: Story = {
  args: { artist: { ...artist, name: 'فنان القصة' } },
  parameters: { rtl: true },
};
