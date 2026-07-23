import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import toneMp3Url from '../../tests/fixtures/audio/tone.mp3?url';
import toneWavUrl from '../../tests/fixtures/audio/tone.wav?url';
import { GlobalAudioPreviewAction } from './GlobalAudioPreviewAction';

const meta: Meta<typeof GlobalAudioPreviewAction> = {
  title: 'Audio/GlobalAudioPreviewAction',
  component: GlobalAudioPreviewAction,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Exercises the production singleton with browser-decoded fixture media.
 *
 * Both candidates deliberately share an id. Their typed provenance must keep
 * them distinct while the active surface becomes status-only, leaving exactly
 * one meaningful selection control for the other candidate.
 */
export const SinglePlaybackAuthority: Story = {
  render: () => (
    <div className='flex min-w-72 flex-col gap-3'>
      <GlobalAudioPreviewAction
        id='shared-preview'
        title='Release WAV'
        audioUrl={toneWavUrl}
        sourceKind='release-preview'
      />
      <GlobalAudioPreviewAction
        id='shared-preview'
        title='Upload MP3'
        audioUrl={toneMp3Url}
        sourceKind='chat-upload-preview'
        stopOnUnmount
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Preview Release WAV in player',
      })
    );

    await waitFor(() => {
      expect(canvas.getAllByRole('status')).toHaveLength(1);
      expect(
        canvas.getByRole('button', {
          name: 'Preview Upload MP3 in player',
        })
      ).toBeInTheDocument();
    });

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Preview Upload MP3 in player',
      })
    );

    await waitFor(() => {
      expect(canvas.getAllByRole('status')).toHaveLength(1);
      expect(
        canvas.getByRole('button', {
          name: 'Preview Release WAV in player',
        })
      ).toBeInTheDocument();
    });

    expect(canvas.queryAllByTestId('global-audio-preview-action')).toHaveLength(
      1
    );
    expect(canvasElement.querySelector('audio')).toBeNull();
  },
};
