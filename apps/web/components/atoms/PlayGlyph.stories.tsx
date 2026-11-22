import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Pause } from 'lucide-react';
import { PlayGlyph, type PlayGlyphSize } from './PlayGlyph';

const SIZES: readonly PlayGlyphSize[] = [12, 14, 16];
const PAUSE_SIZE: Record<PlayGlyphSize, string> = {
  12: 'h-3 w-3',
  14: 'h-3.5 w-3.5',
  16: 'h-4 w-4',
};

/**
 * The play triangle centred in 28px and 40px circles at each app size, with
 * a pause glyph of the same size beside it for comparison.
 */
const meta = {
  title: 'Atoms/PlayGlyph',
  component: PlayGlyph,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof PlayGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sizes: Story = {
  render: () => (
    <div className='flex flex-col gap-4 text-primary-token'>
      {SIZES.map(size => (
        <div key={size} className='flex items-center gap-3'>
          <span className='grid h-7 w-7 place-items-center rounded-full bg-surface-1'>
            <PlayGlyph size={size} fill='currentColor' />
          </span>
          <span className='grid h-10 w-10 place-items-center rounded-full bg-surface-1'>
            <PlayGlyph size={size} fill='currentColor' />
          </span>
          <span className='grid h-7 w-7 place-items-center rounded-full bg-surface-1'>
            <Pause
              aria-hidden='true'
              className={PAUSE_SIZE[size]}
              fill='currentColor'
            />
          </span>
          <span className='text-xs text-secondary-token'>{size}px</span>
        </div>
      ))}
    </div>
  ),
};
