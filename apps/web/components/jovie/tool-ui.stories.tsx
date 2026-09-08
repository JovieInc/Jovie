import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
      title: 'Library opportunities',
      summary:
        'Your Library presence queue is ready. Findings stay local and nothing was sent.',
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
    errorText: 'Library presence lookup failed.',
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
