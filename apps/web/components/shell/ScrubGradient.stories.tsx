import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { ScrubGradient } from './ScrubGradient';

const meta = {
  title: 'Shell/ScrubGradient',
  component: ScrubGradient,
  parameters: { layout: 'padded' },
  args: {
    currentTime: 78,
    duration: 213,
    onSeek: fn(),
    cues: [
      { at: 12, label: 'Intro' },
      { at: 31, label: 'Verse' },
    ],
    loopMode: 'off',
  },
} satisfies Meta<typeof ScrubGradient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SectionLoop: Story = {
  args: { loopMode: 'section', loopSection: { from: 25, to: 50 } },
  play: ({ canvasElement }) => {
    const band = canvasElement.querySelector('rect.text-accent');
    expect(band).toHaveAttribute('fill', 'currentColor');
    expect(band).toHaveAttribute('x', '250');
    expect(band).toHaveAttribute('width', '250');
  },
};

export const TrackLoop: Story = {
  args: { loopMode: 'track', loopSection: { from: 25, to: 50 } },
  play: ({ canvasElement }) => {
    expect(canvasElement.querySelector('rect.text-accent')).toBeNull();
  },
};

export const AwaitingMetadata: Story = {
  args: { currentTime: 0, duration: 0, cues: [] },
  play: ({ canvas }) => {
    expect(
      canvas.getByRole('slider', { name: 'Seek Track Waveform' })
    ).toBeDisabled();
    expect(canvas.getAllByText('0:00')).toHaveLength(2);
  },
};

export const ReadOnly: Story = {
  args: { onSeek: undefined },
  play: ({ canvas }) => {
    expect(canvas.queryByRole('slider')).not.toBeInTheDocument();
  },
};
