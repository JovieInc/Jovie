import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import snapshot from '@/lib/agent-distribution/generated/tools-list.snapshot.json';
import { LISTING } from '@/lib/agent-distribution/listing';
import { AgentConnectorDocs } from './AgentConnectorDocs';

/**
 * State coverage for the agent connector docs page. The canonical stories stay
 * in AgentConnectorDocs.stories.tsx; these change only the tools list or the
 * document direction.
 */
const meta = {
  title: 'Features/Developers/AgentConnectorDocs States',
  component: AgentConnectorDocs,
  parameters: { layout: 'fullscreen' },
  args: {
    listing: LISTING,
    toolsListHash: snapshot.toolsListHash,
    tools: snapshot.tools,
  },
} satisfies Meta<typeof AgentConnectorDocs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a tools snapshot with no tools in it. */
export const EmptyTools: Story = {
  args: { tools: [] },
};

/** Partial: tools without titles or annotations fall back to their names. */
export const PartialToolMetadata: Story = {
  args: {
    tools: [
      { name: 'list_releases', description: 'Lists your releases.' },
      {
        name: 'update_profile_bio',
        description: 'Updates the bio on your profile.',
        annotations: { idempotentHint: true },
      },
    ],
  },
};

/** Long content: a tool with a long title and description. */
export const LongContentTool: Story = {
  args: {
    tools: [
      {
        name: 'create_release_presave_campaign_with_tracked_links',
        title:
          'Create a release pre-save campaign with tracked links for every store',
        description:
          'Creates a pre-save campaign for an upcoming release, builds a tracked link for each store the release is going to, and returns the campaign page so you can share it with fans before the release date. Nothing is sent to fans until you publish the campaign yourself.',
        annotations: { readOnlyHint: false, idempotentHint: false },
      },
      ...snapshot.tools,
    ],
  },
};

/** Right-to-left: the docs page inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
