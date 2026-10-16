import '@/styles/system-b-app.css';
import { Button } from '@jovie/ui/atoms/button';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { TOOL_STATUS_PARTS } from './fixtures/tool-status';
import { ToolPartsRenderer } from './tool-ui';
import type { MessagePart } from './types';

const libraryLoadingParts = [
  {
    type: 'dynamic-tool',
    toolName: 'surfaceLibraryOpportunities',
    toolCallId: 'presence-build:surface_library_opportunities',
    state: 'input-available',
    input: { stepId: 'surface_library_opportunities' },
  },
] satisfies readonly MessagePart[];

const libraryReadyParts = [
  {
    type: 'dynamic-tool',
    toolName: 'surfaceLibraryOpportunities',
    toolCallId: 'presence-build:surface_library_opportunities',
    state: 'output-available',
    input: { stepId: 'surface_library_opportunities' },
    output: {
      action: 'presence_build_artifact',
      stepId: 'surface_library_opportunities',
      title: 'Work opportunities',
      summary:
        'Your Work opportunity queue is ready. Findings stay local and nothing was sent.',
      facts: [
        { label: 'Repair queue', value: '1 open' },
        { label: 'Collisions', value: '0 to review' },
        { label: 'Placement opportunities', value: '0 found' },
        { label: 'Rightsholders', value: '0 observed' },
        { label: 'Downloads', value: 'No attested files live' },
        { label: 'Stats', value: 'Not connected' },
      ],
    },
  },
] satisfies readonly MessagePart[];

const libraryErrorParts = [
  {
    type: 'dynamic-tool',
    toolName: 'surfaceLibraryOpportunities',
    toolCallId: 'presence-build:surface_library_opportunities',
    state: 'output-error',
    input: { stepId: 'surface_library_opportunities' },
    errorText: 'Work presence lookup failed.',
  },
] satisfies readonly MessagePart[];

const meta = {
  title: 'Jovie/Components/ToolPartsRenderer',
  component: ToolPartsRenderer,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['profileId', 'hasMessageText', 'feedback'],
    },
  },
  args: {
    variant: 'chat',
    parts: libraryReadyParts,
  },
  decorators: [
    Story => (
      <div className='w-[min(28rem,calc(100vw-2rem))] bg-base p-6'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ToolPartsRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LibraryOpportunitiesReady: Story = {};

export const LibraryOpportunitiesLoading: Story = {
  args: {
    parts: libraryLoadingParts,
  },
};

export const LibraryOpportunitiesError: Story = {
  args: {
    parts: libraryErrorParts,
  },
};

/** Manual event injection: stream result and persistence are separate transitions. */
function ReceiptTransitions() {
  const [stage, setStage] = useState<keyof typeof TOOL_STATUS_PARTS>('working');
  const [active, setActive] = useState(true);
  return (
    <div className='w-full space-y-4'>
      <div className='flex flex-wrap gap-2'>
        {(
          [
            'working',
            'unconfirmed',
            'succeeded',
            'failed',
            'cancelled',
            'pending',
          ] as const
        ).map(state => (
          <Button
            key={state}
            type='button'
            variant='ghost'
            size='sm'
            className='text-xs text-secondary-token focus-ring-themed'
            onClick={() => {
              setStage(state);
              setActive(state === 'working' || state === 'unconfirmed');
            }}
          >
            {state}
          </Button>
        ))}
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='text-xs text-secondary-token focus-ring-themed'
          onClick={() => setActive(false)}
        >
          Interrupt
        </Button>
      </div>
      <ToolPartsRenderer
        parts={TOOL_STATUS_PARTS[stage]}
        variant='chat'
        isStreaming={active}
      />
      <p
        data-testid='status-layout-sentinel'
        className='text-xs text-secondary-token'
      >
        Your next message stays here.
      </p>
    </div>
  );
}

export const ReceiptLifecycle: Story = { render: () => <ReceiptTransitions /> };
export const PersistedStatus: Story = {
  args: { parts: TOOL_STATUS_PARTS.succeeded },
};
export const ApprovalStatus: Story = {
  args: { parts: TOOL_STATUS_PARTS.pending },
};
export const UnconfirmedStatus: Story = {
  args: { parts: TOOL_STATUS_PARTS.unconfirmed },
};
