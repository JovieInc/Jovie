import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MutationCache,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useState } from 'react';
import { userEvent, within } from 'storybook/test';
import { TourDatesEmptyState } from './TourDatesEmptyState';

/** A client whose mutations stay pending, so the in-flight state can be seen. */
function makePendingClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onMutate: () => new Promise<never>(() => {}),
    }),
    defaultOptions: { mutations: { retry: false } },
  });
}

async function typeAndSubmit(
  canvasElement: HTMLElement,
  placeholder: string,
  text: string,
  button: string
) {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByPlaceholderText(placeholder), text);
  await userEvent.click(canvas.getByRole('button', { name: button }));
}

const meta = {
  title: 'Dashboard/Organisms/TourDatesEmptyState/States',
  component: TourDatesEmptyState,
  parameters: { layout: 'centered' },
  args: { profileId: 'storybook-profile', hasApiKey: false },
} satisfies Meta<typeof TourDatesEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the API key is being saved; the field and button are disabled. */
export const LoadingSavingApiKey: Story = {
  decorators: [
    function PendingMutations(Story) {
      const [client] = useState(makePendingClient);
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
  play: async ({ canvasElement }) =>
    typeAndSubmit(
      canvasElement,
      'Your Bandsintown API key',
      'bit_demo_key',
      'Save API Key'
    ),
};

/** Empty: nothing typed yet, so Save API Key stays disabled. */
export const EmptyApiKeyField: Story = {};

/** Error: the save request fails and an error toast is shown. */
export const ErrorSaveFailed: Story = {
  play: async ({ canvasElement }) =>
    typeAndSubmit(
      canvasElement,
      'Your Bandsintown API key',
      'bit_demo_key',
      'Save API Key'
    ),
};

/** Partial: the API key is saved but no artist is connected yet. */
export const PartialKeySavedArtistPending: Story = {
  args: { hasApiKey: true },
};

/** Long content: a long artist name in the connect field. */
export const LongContentArtistName: Story = {
  args: { hasApiKey: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByPlaceholderText('Your artist name on Bandsintown'),
      'The Extraordinarily Long Named Touring Collective and Friends Live Band'
    );
  },
};

/** Offline: the connect request is paused until the network returns. */
export const OfflineConnectPaused: Story = {
  args: { hasApiKey: true },
  beforeEach: () => {
    onlineManager.setOnline(false);
    return () => onlineManager.setOnline(true);
  },
  play: async ({ canvasElement }) =>
    typeAndSubmit(
      canvasElement,
      'Your artist name on Bandsintown',
      'Sasha Waves',
      'Connect Bandsintown'
    ),
};

/** Right-to-left: the setup step in an Arabic document direction. */
export const RtlArabicDocument: Story = {
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
