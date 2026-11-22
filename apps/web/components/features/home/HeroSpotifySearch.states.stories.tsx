import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HeroSpotifySearch } from './HeroSpotifySearch';

type FetchStub = (input: RequestInfo | URL) => Promise<Response>;

function stubFetch(stub: FetchStub): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = stub as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: async () => body,
  } as Response);
}

async function typeQuery(canvasElement: HTMLElement, text: string) {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByRole('combobox'), text);
  return canvas;
}

const meta = {
  title: 'Marketing/Sections/HeroSpotifySearch/States',
  component: HeroSpotifySearch,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HeroSpotifySearch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the request never settles, so the skeleton rows show. */
export const LoadingSearching: Story = {
  play: async ({ canvasElement }) => {
    const restore = stubFetch(() => new Promise<Response>(() => {}));
    try {
      const canvas = await typeQuery(canvasElement, 'Alex Example');
      await expect(canvas.getByRole('combobox')).toBeVisible();
    } finally {
      restore();
    }
  },
};

/** Empty: the search finds nobody and offers to paste a link instead. */
export const EmptyNoArtists: Story = {
  play: async ({ canvasElement }) => {
    const restore = stubFetch(() => jsonResponse([]));
    try {
      const canvas = await typeQuery(canvasElement, 'Zzzz Nobody');
      await expect(await canvas.findByText('No artists found')).toBeVisible();
    } finally {
      restore();
    }
  },
};

/** Error: the search service fails and a retry action shows. */
export const ErrorSearchFailed: Story = {
  play: async ({ canvasElement }) => {
    const restore = stubFetch(() => jsonResponse({}, false, 500));
    try {
      const canvas = await typeQuery(canvasElement, 'Alex Example');
      await expect(await canvas.findByRole('alert')).toBeVisible();
    } finally {
      restore();
    }
  },
};

/** Offline: the request rejects and the same retry path shows. */
export const OfflineNetworkRejected: Story = {
  play: async ({ canvasElement }) => {
    const restore = stubFetch(() => Promise.reject(new TypeError('offline')));
    try {
      const canvas = await typeQuery(canvasElement, 'Alex Example');
      await expect(await canvas.findByRole('alert')).toBeVisible();
    } finally {
      restore();
    }
  },
};

/** Partial: an artist with no follower count or image still renders a row. */
export const PartialSparseArtist: Story = {
  play: async ({ canvasElement }) => {
    const restore = stubFetch(() =>
      jsonResponse([
        {
          id: 'sparse',
          name: 'New Artist',
          popularity: 1,
          url: 'https://open.spotify.com/artist/sparse',
        },
      ])
    );
    try {
      const canvas = await typeQuery(canvasElement, 'New Artist');
      await expect(await canvas.findByText('New Artist')).toBeVisible();
    } finally {
      restore();
    }
  },
};

/** Long content: a long artist name truncates inside its row. */
export const LongContentName: Story = {
  play: async ({ canvasElement }) => {
    const restore = stubFetch(() =>
      jsonResponse([
        {
          id: 'long',
          name: 'An Artist Whose Name Is Far Too Long To Fit In A Single Row Of Results',
          popularity: 50,
          url: 'https://open.spotify.com/artist/long',
        },
      ])
    );
    try {
      const canvas = await typeQuery(canvasElement, 'An Artist');
      await expect(await canvas.findByText(/An Artist Whose/)).toBeVisible();
    } finally {
      restore();
    }
  },
};

/** Permission denied: a rate limit tells the visitor to wait. */
export const PermissionDeniedRateLimited: Story = {
  play: async ({ canvasElement }) => {
    const restore = stubFetch(() => jsonResponse({}, false, 429));
    try {
      const canvas = await typeQuery(canvasElement, 'Alex Example');
      await expect(await canvas.findByRole('alert')).toBeVisible();
    } finally {
      restore();
    }
  },
};

/** Right to left: the field and dropdown under an Arabic document direction. */
export const RtlField: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar' className='w-120'>
          <Story />
        </div>
      );
    },
  ],
};
