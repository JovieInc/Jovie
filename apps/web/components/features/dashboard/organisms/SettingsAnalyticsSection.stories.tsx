import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { Artist } from '@/types/db';
import { SettingsAnalyticsSection } from './SettingsAnalyticsSection';

const artist = {
  id: 'profile_123',
  handle: 'sashawaves',
  name: 'Sasha Waves',
  settings: { exclude_self_from_analytics: false },
} as unknown as Artist;

type FetchStub = typeof globalThis.fetch;

/** Replace the settings PUT for one story. */
function stubFetch(next: FetchStub) {
  const original = globalThis.fetch;
  globalThis.fetch = next;
  return () => {
    globalThis.fetch = original;
  };
}

async function pressToggle(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(
    canvas.getByRole('switch', { name: 'Traffic Quality Filtering' })
  );
  return canvas;
}

/**
 * The analytics settings panel: one Traffic Quality Filtering toggle that
 * saves through PUT /api/dashboard/profile. The save states stub that request
 * and press the toggle so the status pill shows the outcome.
 */
const meta = {
  title: 'Dashboard/Settings/SettingsAnalyticsSection',
  component: SettingsAnalyticsSection,
  parameters: { layout: 'padded' },
  args: {
    artist,
    onArtistUpdate: fn(),
    isPro: true,
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className='max-w-3xl'>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof SettingsAnalyticsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Loading: the save never settles, so the toggle stays disabled with Saving…. */
export const LoadingSave: Story = {
  beforeEach: () => stubFetch(() => new Promise<Response>(() => {})),
  play: async ({ canvasElement }) => {
    const canvas = await pressToggle(canvasElement);
    await waitFor(() => expect(canvas.getByText('Saving…')).toBeVisible());
  },
};

/** Error: the server refuses the save, so the toggle rolls back and the pill reports it. */
export const ErrorSaveRejected: Story = {
  beforeEach: () =>
    stubFetch(
      async () =>
        new Response(JSON.stringify({ error: 'Save failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
    ),
  play: async ({ canvasElement }) => {
    const canvas = await pressToggle(canvasElement);
    await waitFor(() =>
      expect(
        canvas.getByRole('switch', { name: 'Traffic Quality Filtering' })
      ).toHaveAttribute('aria-checked', 'false')
    );
  },
};

/** Offline: the save fails at the network and the toggle rolls back. */
export const OfflineSaveFailed: Story = {
  beforeEach: () =>
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    }),
  play: async ({ canvasElement }) => {
    const canvas = await pressToggle(canvasElement);
    await waitFor(() =>
      expect(
        canvas.getByRole('switch', { name: 'Traffic Quality Filtering' })
      ).toHaveAttribute('aria-checked', 'false')
    );
  },
};

/** Partial: a profile whose settings never stored the filter starts at All traffic. */
export const PartialNoStoredSetting: Story = {
  args: {
    artist: { ...artist, settings: {} } as Artist,
  },
};

/** Permission denied: a free plan sees the plan gate instead of the toggle. */
export const PermissionDeniedFreePlan: Story = {
  args: { isPro: false },
};

/** Right-to-left: the panel inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    artist: {
      ...artist,
      settings: { exclude_self_from_analytics: true },
    } as Artist,
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
