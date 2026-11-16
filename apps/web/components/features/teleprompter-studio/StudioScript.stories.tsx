import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StudioScript } from './StudioScript';

const WORDS =
  "It's release day. Save the Night is out everywhere, and I made it for the late drives home when the city goes quiet and the radio is the only one still talking."
    .split(/\s+/)
    .filter(Boolean);

const meta = {
  title: 'Features/TeleprompterStudio/StudioScript',
  component: StudioScript,
  parameters: { layout: 'fullscreen', themes: { themeOverride: 'dark' } },
  decorators: [
    Story => (
      <div className='relative h-96 bg-base px-12 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: { words: WORDS, nextWordIndex: 0, onSeek: () => {} },
} satisfies Meta<typeof StudioScript>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Start: Story = {};
export const MidScript: Story = { args: { nextWordIndex: 9 } };
export const Finished: Story = { args: { nextWordIndex: WORDS.length } };
