import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { userEvent, within } from 'storybook/test';
import { AddPlatformDialog } from './AddPlatformDialog';

const meta = {
  title: 'Dashboard/Organisms/DspPresence/AddPlatformDialog',
  component: AddPlatformDialog,
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    onClose: () => {},
    existingProviderIds: [],
  },
} satisfies Meta<typeof AddPlatformDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProviderPicker: Story = {};

/** Empty: every platform is already linked, so there is nothing left to add. */
export const EmptyAllPlatformsLinked: Story = {
  args: {
    existingProviderIds: [
      'spotify',
      'apple_music',
      'deezer',
      'youtube_music',
      'tidal',
      'soundcloud',
      'amazon_music',
      'musicbrainz',
    ],
  },
};

/** Partial: a platform is picked and the two fields are still empty. */
export const PartialProviderSelected: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: /Spotify/ }));
  },
};

/** Long content: long values stay inside the two fields. */
export const LongContentFilledForm: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: /Spotify/ }));
    await userEvent.type(
      await body.findByLabelText('Artist name'),
      'An artist name that is far longer than the field can show at once'
    );
    await userEvent.type(
      await body.findByLabelText('Profile URL'),
      'https://open.spotify.com/artist/0123456789abcdefghijklmnopqrstuvwxyz?si=a-long-tracking-parameter'
    );
  },
};

/** RTL: the picker grid and fields mirror in a right-to-left document. */
export const RtlProviderPicker: Story = {
  decorators: [
    function RtlDecorator(Story: () => ReactNode) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
