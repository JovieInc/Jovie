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

export const Loading: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <StatusGlyph state='working' label='Working' />
      <StatusGlyph state='pending' label='Pending' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'In-flight states: working spins its dashed ring while on screen (static under reduced motion); pending holds a dashed empty ring.',
      },
    },
  },
};

export const Empty: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <StatusGlyph state='todo' label='To do' />
      <StatusGlyph state='idle' label='Idle' />
      <StatusGlyph state='unknown' label='Status unknown' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Empty-fill states for work not started or with no known status; unknown uses a dashed ring so it never reads as blank.',
      },
    },
  },
};

export const ErrorState: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <StatusGlyph state='error' label='Error' />
      <StatusGlyph
        state='failed'
        label='Failed'
        tooltipLabel='Distributor rejected the release'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Error and failed render the x glyph in the reserved error tone; tooltipLabel carries the domain-specific reason.',
      },
    },
  },
};

export const Partial: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <StatusGlyph state='in_progress' label='In progress' />
      <StatusGlyph state='in_review' label='In review' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Partially complete work uses the fractional fills: half for in progress, three-quarter for in review.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <div className='w-40'>
      <StatusGlyph
        state='blocked'
        label='Blocked until the label approves the final master and artwork'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long visible label in a narrow container wraps beside the glyph, which keeps its fixed size.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl' lang='ar' className='flex items-center gap-4'>
      <StatusGlyph state='success' label='تم النشر' />
      <StatusGlyph state='in_progress' label='قيد التنفيذ' />
      <StatusGlyph state='error' label='فشلت المزامنة' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Arabic labels follow the glyph from the start (right) edge; the glyphs themselves are not mirrored.',
      },
    },
  },
};
