import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Button } from './button';
import { CinematicMetric } from './cinematic-metric';

const meta = {
  title: 'UI/Atoms/CinematicMetric',
  component: CinematicMetric,
  parameters: { layout: 'padded' },
  args: {
    label: 'In flight',
    value: 12,
    detail: 'Was 10',
    density: 'summary',
    loading: false,
  },
} satisfies Meta<typeof CinematicMetric>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {};
export const Glance: Story = { args: { density: 'glance' } };
export const Dense: Story = { args: { density: 'dense' } };
export const Loading: Story = { args: { loading: true } };
export const Unmeasured: Story = {
  args: { value: null, detail: 'Source unavailable' },
};
export const MeasuredZero: Story = { args: { value: 0, detail: null } };
export const LongContent: Story = {
  args: {
    className: 'w-40',
    label: 'Production changes awaiting verification',
    value: '1,234,567',
    detail: 'Observation time unavailable',
  },
};

function StateTransition() {
  const [state, setState] = useState(0);
  return (
    <div className='flex flex-col gap-6'>
      <Button onClick={() => setState((state + 1) % 4)}>
        Next metric state
      </Button>
      <div className='grid grid-cols-1 gap-6 sm:grid-cols-3'>
        {(['glance', 'summary', 'dense'] as const).map(density => (
          <CinematicMetric
            key={density}
            density={density}
            label={`In flight (${density})`}
            loading={state === 0}
            value={state === 1 ? null : state === 2 ? 0 : '1,234,567'}
            detail={state === 3 ? 'Was 12' : null}
          />
        ))}
      </div>
      <p data-testid='metric-following-content'>Shipping activity</p>
    </div>
  );
}
export const StableStates: Story = { render: StateTransition };
