import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  type OperationObservation,
  resolveOperationStatus,
} from '../lib/utils';
import { STATUS_GLYPH_STATES, StatusGlyph } from './status-glyph';

const meta: Meta<typeof StatusGlyph> = {
  title: 'UI/Atoms/StatusGlyph',
  component: StatusGlyph,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      {STATUS_GLYPH_STATES.map(state => (
        <StatusGlyph key={state} state={state} />
      ))}
    </div>
  ),
};

export const WithLabels: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      {STATUS_GLYPH_STATES.map(state => (
        <StatusGlyph key={state} state={state} label={state} />
      ))}
    </div>
  ),
};

export const Small: Story = {
  render: () => (
    <div className='flex items-center gap-3'>
      {STATUS_GLYPH_STATES.map(state => (
        <StatusGlyph key={state} state={state} size='sm' />
      ))}
    </div>
  ),
};

const OPERATION_FIXTURES: readonly OperationObservation[] = [
  { operationKey: 'not-started', state: 'idle', active: false },
  { operationKey: 'awaiting-approval', state: 'pending', active: false },
  { operationKey: 'live-tool-call', state: 'working', active: true },
  {
    operationKey: 'saved-tool-call',
    state: 'succeeded',
    active: false,
    receipt: {
      operationKey: 'saved-tool-call',
      state: 'succeeded',
      persisted: true,
    },
  },
  { operationKey: 'failed-tool-call', state: 'failed', active: false },
  { operationKey: 'denied-tool-call', state: 'cancelled', active: false },
  { operationKey: 'interrupted-tool-call', state: 'working', active: false },
];

/** Each state is derived from a seeded operation observation, never a timer. */
function OperationMatrix({ dense = false }: { readonly dense?: boolean }) {
  return (
    <div className='flex flex-col gap-3 p-4'>
      {OPERATION_FIXTURES.map(observation => {
        const state = resolveOperationStatus(observation);
        return (
          <div
            key={observation.operationKey}
            className='flex items-center gap-3'
          >
            <StatusGlyph state={state} size={dense ? 'sm' : 'md'} />
            <span className='text-xs text-secondary-token'>{state}</span>
          </div>
        );
      })}
    </div>
  );
}

export const OperationStates: Story = { render: () => <OperationMatrix /> };
export const OperationsDense: Story = {
  render: () => <OperationMatrix dense />,
};
export const OperationsLight: Story = {
  ...OperationStates,
  globals: { theme: 'light' },
};
export const OperationsDark: Story = {
  ...OperationStates,
  globals: { theme: 'dark' },
};
export const OperationsReducedMotion: Story = {
  ...OperationStates,
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
};
