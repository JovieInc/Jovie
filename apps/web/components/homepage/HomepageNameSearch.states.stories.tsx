import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HomepageNameSearch } from './HomepageNameSearch';

type FetchStub = (input: RequestInfo | URL) => Promise<Response>;

function stubFetch(stub: FetchStub): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = stub as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function jsonResponse(body: unknown, ok = true): Promise<Response> {
  return Promise.resolve({ ok, json: async () => body } as Response);
}

async function searchFor(canvasElement: HTMLElement, name: string) {
  const canvas = within(canvasElement);
  await userEvent.type(
    canvas.getByRole('textbox', { name: 'Search your name' }),
    name
  );
  await userEvent.click(canvas.getByRole('button', { name: 'Find me' }));
  return canvas;
}

const meta = {
  title: 'Marketing/HomepageNameSearch/States',
  component: HomepageNameSearch,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HomepageNameSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the request never settles, so the button shows its busy label. */
export const LoadingSearching: Story = {
  play: async ({ canvasElement }) => {
    const restore = stubFetch(() => new Promise<Response>(() => {}));
    try {
      const canvas = await searchFor(canvasElement, 'Alex Example');
      await expect(canvas.getByRole('button')).toBeDisabled();
    } finally {
      restore();
    }
  },
};

/** Error: the search service fails and the recovery links show. */
export const ErrorSearchUnavailable: Story = {
  play: async ({ canvasElement }) => {
    const restore = stubFetch(() => jsonResponse({}, false));
    try {
      const canvas = await searchFor(canvasElement, 'Alex Example');
      await expect(await canvas.findByRole('alert')).toBeVisible();
    } finally {
      restore();
    }
  },
};

/** Offline: the network request rejects and the same recovery path shows. */
export const OfflineNetworkRejected: Story = {
  play: async ({ canvasElement }) => {
    const restore = stubFetch(() => Promise.reject(new TypeError('offline')));
    try {
      const canvas = await searchFor(canvasElement, 'Alex Example');
      await expect(await canvas.findByRole('alert')).toBeVisible();
    } finally {
      restore();
    }
  },
};

/** Long content: a long profile name and handle wrap inside the result row. */
export const LongContentResult: Story = {
  play: async ({ canvasElement }) => {
    const restore = stubFetch(() =>
      jsonResponse({
        profiles: [
          {
            username: 'averylonghandlethatkeepsgoing',
            name: 'Alexander Bartholomew Montgomery Featherstonehaugh The Third',
          },
        ],
      })
    );
    try {
      const canvas = await searchFor(canvasElement, 'Alexander');
      await expect(
        await canvas.findByRole('link', { name: /Alexander/ })
      ).toBeVisible();
    } finally {
      restore();
    }
  },
};

/** Permission denied: a limited preview discloses that results are partial. */
export const PermissionDeniedLimitedPreview: Story = {
  play: async ({ canvasElement }) => {
    const restore = stubFetch(() =>
      jsonResponse({ profiles: [], partial: true })
    );
    try {
      const canvas = await searchFor(canvasElement, 'Alex Example');
      await expect(
        await canvas.findByRole('link', { name: 'Sign in' })
      ).toBeVisible();
    } finally {
      restore();
    }
  },
};

/** Right to left: the search pill mirrors under an Arabic direction. */
export const RtlOverflow: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
