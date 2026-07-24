import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { AudioWaveformEditor } from './AudioWaveformEditor';

const SAMPLE_RATE = 44_100;
const DURATION_SECONDS = 4;

function createToneWavBlob(): Blob {
  const sampleCount = SAMPLE_RATE * DURATION_SECONDS;
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.sin((Math.PI * index) / sampleCount);
    const sample = Math.sin((2 * Math.PI * 220 * index) / SAMPLE_RATE);
    view.setInt16(
      44 + index * bytesPerSample,
      sample * envelope * 12_000,
      true
    );
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function RealAudioWaveformFixture() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(createToneWavBlob());
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, []);

  if (!audioUrl) {
    return <div className='h-40 w-96' data-testid='audio-fixture-loading' />;
  }

  return (
    <AudioWaveformEditor
      audioUrl={audioUrl}
      initialSnippet={{ startMs: 0, endMs: 4_000 }}
    />
  );
}

const meta: Meta<typeof RealAudioWaveformFixture> = {
  title: 'Features/Release/AudioWaveformEditor',
  component: RealAudioWaveformFixture,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96 rounded-lg bg-surface-1 p-4'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Decodes generated PCM WAV bytes and drives real browser sliders in Chromium. */
export const RealPcmDecodeAndTrim: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const position = await canvas.findByRole(
      'slider',
      {
        name: 'Waveform Position',
      },
      { timeout: 10_000 }
    );
    await expect(position).toHaveAttribute('max', '4000');

    const startHandle = canvas.getByRole('slider', {
      name: 'Adjust Snippet Start',
    });
    await userEvent.click(startHandle);
    await userEvent.keyboard('{ArrowRight}');
    await expect(startHandle).toHaveAttribute('aria-valuenow', '1000');
    await expect(canvas.getByText('Snippet: 0:01 – 0:04')).toBeInTheDocument();
  },
};
