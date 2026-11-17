import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';
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

type SaveMode = 'ok' | 'fail' | 'hang';

function withQueryClient(Story: ComponentType) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <div className='max-w-2xl'>
        <Story />
      </div>
    </QueryClientProvider>
  );
}

function withRtl(Story: ComponentType) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** State coverage for the discovery toggle; answers the same profile PUT as the base stories. */
const meta = {
  title: 'Dashboard/Organisms/SettingsSearchabilitySection States',
  component: SettingsSearchabilitySection,
  parameters: { layout: 'padded' },
  beforeEach: ({ parameters }) => {
    const mockWindow = window as Window & {
      __jovieApiMock?: (request: {
        url: URL;
        init?: RequestInit;
      }) => Response | Promise<Response> | undefined;
    };
    const previous = mockWindow.__jovieApiMock;
    const mode = (parameters.saveMode as SaveMode | undefined) ?? 'ok';
    mockWindow.__jovieApiMock = request => {
      if (
        request.url.pathname !== '/api/dashboard/profile' ||
        request.init?.method !== 'PUT'
      ) {
        return previous?.(request);
      }
      if (mode === 'hang') return new Promise<Response>(() => {});
      return mode === 'fail'
        ? Response.json({ error: 'Unavailable' }, { status: 503 })
        : Response.json({ success: true });
    };
    return () => {
      mockWindow.__jovieApiMock = previous;
    };
  },
  args: { artist, onArtistUpdate: fn() },
  decorators: [withQueryClient],
} satisfies Meta<typeof SettingsSearchabilitySection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the save is in flight, so the pill reads Saving and the switch is busy. */
export const LoadingSave: Story = {
  parameters: { saveMode: 'hang' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole('switch', {
      name: 'Show in Jovie discovery',
    });
    await userEvent.click(control);
    await expect(await canvas.findByText('Saving…')).toBeVisible();
    await expect(control).toHaveAttribute('aria-busy', 'true');
  },
};

/** Error: the save fails, the error shows and the switch reverts. */
export const ErrorSaveFailed: Story = {
  parameters: { saveMode: 'fail' },
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
  },
};

/** Right-to-left: the discovery toggle inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [withRtl],
};
