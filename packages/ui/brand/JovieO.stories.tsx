import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieO } from './JovieO';
import { JOVIE_O_STATES } from './jovie-o-motion';

const meta: Meta<typeof JovieO> = {
  title: 'UI/Brand/JovieO',
  component: JovieO,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { size: 48, state: 'idle', label: 'Jovie' },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const AllStates: Story = {
  render: () => (
    <div className='flex items-center gap-6 text-primary-token'>
      {JOVIE_O_STATES.map(state => (
        <JovieO key={state} size={48} state={state} label={state} />
      ))}
    </div>
  ),
};

export const PixelMasters: Story = {
  render: () => (
    <div className='flex items-end gap-6 text-primary-token'>
      {[16, 24, 32, 64].map(size => (
        <JovieO key={size} size={size} label={`${size} px`} />
      ))}
    </div>
  ),
};

export const Ovie: Story = {
  args: { variant: 'ov', size: 64, label: 'Ovie' },
};

export const ReducedMotionStill: Story = {
  args: { state: 'loading', still: true },
};
