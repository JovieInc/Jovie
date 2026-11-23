import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { OStroke } from './OStroke';
import { OSTROKE_POSES, type OStrokePose } from './ostroke-poses';

const meta: Meta<typeof OStroke> = {
  title: 'UI/Brand/OStroke',
  component: OStroke,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { size: 48, pose: 'circle', label: 'Jovie' },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Rest: Story = {};

export const PixelMasters: Story = {
  render: () => (
    <div className='flex items-end gap-6 text-primary-token'>
      {[16, 24, 28, 64].map(size => (
        <OStroke key={size} size={size} label={`${size} px`} />
      ))}
    </div>
  ),
};

export const AllPoses: Story = {
  render: () => (
    <div className='flex items-center gap-6 text-primary-token'>
      {OSTROKE_POSES.map(pose => (
        <OStroke key={pose} size={48} pose={pose} label={pose} phase={0.6} />
      ))}
    </div>
  ),
};

/** Press to morph. A pose change is the only thing that ever runs the loop. */
export const Morph: Story = {
  render: () => {
    const [pose, setPose] = useState<OStrokePose>('circle');
    return (
      <div className='flex flex-col items-center gap-4 text-primary-token'>
        <OStroke size={64} pose={pose} label={pose} />
        <div className='flex flex-wrap gap-2'>
          {OSTROKE_POSES.map(p => (
            <button
              key={p}
              type='button'
              aria-pressed={p === pose}
              onClick={() => setPose(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    );
  },
};
