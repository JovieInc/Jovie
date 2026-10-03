'use client';

import { Button, Input } from '@jovie/ui';
import { Check, Clock3, Loader2, Search, ShieldX, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ChatAlbumArtCard } from '@/components/jovie/components/ChatAlbumArtCard';
import { ChatArtifactErrorCard } from '@/components/jovie/components/ChatArtifactErrorCard';
import { ChatEmptyStateGreeting } from '@/components/jovie/components/ChatEmptyStateGreeting';
import { ChatGenerationArtifactSurface } from '@/components/jovie/components/ChatGenerationArtifactSurface';
import { ChatLinkConfirmationCard } from '@/components/jovie/components/ChatLinkConfirmationCard';
import { ChatMessage } from '@/components/jovie/components/ChatMessage';
import { ChatMessageSkeleton } from '@/components/jovie/components/ChatMessageSkeleton';
import { ChatPresenceArtifactCard } from '@/components/jovie/components/ChatPresenceArtifactCard';
import {
  CHAT_TOOL_CANCELLED_LABEL,
  ChatToolSurface,
} from '@/components/jovie/components/ChatToolSurface';
import { ChatUploadManifest } from '@/components/jovie/components/ChatUploadManifest';
import { ErrorDisplay } from '@/components/jovie/components/ErrorDisplay';
import type { PendingFile } from '@/components/jovie/hooks/useChatFileAttachments';
import type {
  ChatAlbumArtToolResult,
  MessagePart,
} from '@/components/jovie/types';
import {
  type PersistedToolEvent,
  type PersistedToolState,
  toolEventToMessagePart,
} from '@/lib/chat/tool-events';
import { cn } from '@/lib/utils';

export type ChatPlaygroundCoverage =
  | 'message-lifecycle'
  | 'streaming'
  | 'tool-lifecycle'
  | 'grouped-tools'
  | 'approvals'
  | 'connection-terminal'
  | 'image-generation'
  | 'entity-outcomes'
  | 'upload-context'
  | 'long-content'
  | 'shell-states'
  | 'compact-mobile';

type ScenarioGroup = 'Messages' | 'Tools' | 'Artifacts' | 'Resilience';

export interface ChatPlaygroundScenario {
  readonly id: string;
  readonly title: string;
  readonly group: ScenarioGroup;
  readonly summary: string;
  readonly keywords: readonly string[];
  readonly coverage: readonly ChatPlaygroundCoverage[];
  readonly render: () => ReactNode;
}

interface PlaygroundImprovement {
  readonly id: string;
  readonly title: string;
  readonly scenarioIds: readonly string[];
  readonly recommendation: string;
  readonly reevaluateWhen: string;
}

const NOOP = () => undefined;
const ASSISTANT_MESSAGE_PROPS = { role: 'assistant' as const };
const USER_MESSAGE_PROPS = { role: 'user' as const };

function toolPart({
  id,
  toolName,
  state,
  summary,
  errorMessage,
  output,
  approval,
}: Readonly<
  {
    id: string;
    toolName: string;
    errorMessage?: string;
    output?: Record<string, unknown>;
    approval?: PersistedToolEvent['approval'];
  } & (
    | { state: Exclude<PersistedToolState, 'running'>; summary?: string }
    | { state: 'running'; summary?: never }
  )
>): MessagePart {
  // Running SDK parts carry input only; their copy comes from the canonical tool registry.
  return toolEventToMessagePart({
    schemaVersion: 2,
    toolCallId: id,
    toolName,
    state,
    input: { fixture: true },
    output,
    errorMessage,
    retryable: state === 'failed',
    summary,
    uiHint: 'status',
    approval,
  });
}

function StateSample({
  label,
  children,
  className,
}: Readonly<{
  label: string;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <section className={cn('min-w-0', className)} aria-label={label}>
      <p className='mb-2 text-2xs font-medium text-tertiary-token'>{label}</p>
      {children}
    </section>
  );
}

function FixtureGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className='grid gap-6 lg:grid-cols-2'>{children}</div>;
}

function FixtureThread({
  children,
  compact = false,
}: Readonly<{ children: ReactNode; compact?: boolean }>) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-5',
        !compact && 'max-w-3xl'
      )}
      style={compact ? { maxWidth: '22rem' } : undefined}
      data-viewport={compact ? 'compact' : 'responsive'}
    >
      {children}
    </div>
  );
}

function MessageLifecycleFixture() {
  return (
    <FixtureThread>
      <ChatMessage
        {...USER_MESSAGE_PROPS}
        id='playground-lifecycle-user'
        parts={[{ type: 'text', text: 'Plan my next release campaign.' }]}
        skipEntrance
      />
      <ChatMessage
        {...ASSISTANT_MESSAGE_PROPS}
        id='playground-lifecycle-assistant'
        parts={[
          {
            type: 'text',
            text: 'I can turn that into a focused release plan. Let’s start with the date and lead single.',
          },
        ]}
        skipEntrance
      />
    </FixtureThread>
  );
}

function StreamingFixture() {
  return (
    <FixtureGrid>
      <StateSample label='Pending Reply'>
        <ChatMessage
          {...ASSISTANT_MESSAGE_PROPS}
          id='playground-thinking'
          parts={[]}
          isThinking
          skipEntrance
        />
      </StateSample>
      <StateSample label='Streaming Reply'>
        <ChatMessage
          {...ASSISTANT_MESSAGE_PROPS}
          id='playground-streaming'
          parts={[
            {
              type: 'text',
              text: 'Your first-week rollout should focus on the listeners already saving',
            },
          ]}
          isStreaming
          skipEntrance
        />
      </StateSample>
    </FixtureGrid>
  );
}

function ToolLifecycleFixture() {
  return (
    <FixtureGrid>
      <StateSample label='Queued'>
        <ChatToolSurface tone='flat'>
          <div className='flex min-h-12 items-center gap-2 text-secondary-token'>
            <Clock3 className='size-4' aria-hidden='true' />
            <span className='text-xs'>Release research queued</span>
          </div>
        </ChatToolSurface>
      </StateSample>
      <StateSample label='Running'>
        <ChatMessage
          {...ASSISTANT_MESSAGE_PROPS}
          id='playground-tool-running'
          parts={[
            toolPart({
              id: 'tool-running',
              toolName: 'inspectPressSource',
              state: 'running',
            }),
          ]}
          skipEntrance
        />
      </StateSample>
      <StateSample label='Succeeded'>
        <ChatMessage
          {...ASSISTANT_MESSAGE_PROPS}
          id='playground-tool-success'
          parts={[
            toolPart({
              id: 'tool-success',
              toolName: 'submitFeedback',
              state: 'succeeded',
              summary: 'Feedback sent to the product team.',
              output: { success: true },
            }),
          ]}
          skipEntrance
        />
      </StateSample>
      <StateSample label='Failed'>
        <ChatMessage
          {...ASSISTANT_MESSAGE_PROPS}
          id='playground-tool-failed'
          parts={[
            toolPart({
              id: 'tool-failed',
              toolName: 'inspectPressSource',
              state: 'failed',
              errorMessage: 'The source stopped responding.',
            }),
          ]}
          skipEntrance
        />
      </StateSample>
    </FixtureGrid>
  );
}

function GroupedToolsFixture() {
  return (
    <FixtureThread>
      <ChatMessage
        {...ASSISTANT_MESSAGE_PROPS}
        id='playground-grouped-tools'
        parts={[
          {
            type: 'text',
            text: 'I’m checking the release context before I make a recommendation.',
          },
          toolPart({
            id: 'grouped-success',
            toolName: 'checkCanvasStatus',
            state: 'succeeded',
            summary: 'Canvas is ready.',
            output: { success: true },
          }),
          toolPart({
            id: 'grouped-running',
            toolName: 'suggestRelatedArtists',
            state: 'running',
          }),
          toolPart({
            id: 'grouped-failed',
            toolName: 'showUsage',
            state: 'failed',
            errorMessage: 'Usage data is temporarily unavailable.',
          }),
        ]}
        skipEntrance
      />
    </FixtureThread>
  );
}

function ApprovalFixture() {
  return (
    <FixtureGrid>
      <StateSample label='Approval Requested'>
        <ChatMessage
          {...ASSISTANT_MESSAGE_PROPS}
          id='playground-approval-requested'
          parts={[
            toolPart({
              id: 'approval-requested',
              toolName: 'submitFeedback',
              state: 'needs-approval',
              summary: 'Approval required before continuing.',
              approval: { id: 'playground-approval' },
            }),
          ]}
          skipEntrance
        />
      </StateSample>
      <StateSample label='Interactive Proposal'>
        <ChatLinkConfirmationCard
          preview
          profileId='playground-profile'
          platform={{
            id: 'spotify',
            name: 'Spotify',
            icon: 'spotify',
            color: 'green',
          }}
          normalizedUrl='https://open.spotify.com/artist/example'
          originalUrl='https://open.spotify.com/artist/example'
        />
      </StateSample>
      <StateSample label='Approved'>
        <ChatToolSurface tone='success'>
          <div className='flex items-center gap-2 text-success'>
            <Check className='size-4' aria-hidden='true' />
            <span className='text-sm font-medium'>Spotify link added</span>
          </div>
        </ChatToolSurface>
      </StateSample>
      <StateSample label='Cancelled'>
        <ChatToolSurface tone='cancelled'>
          <div className='flex items-center gap-2 text-secondary-token'>
            <X className='size-4' aria-hidden='true' />
            <span className='text-sm'>{CHAT_TOOL_CANCELLED_LABEL}</span>
          </div>
        </ChatToolSurface>
      </StateSample>
    </FixtureGrid>
  );
}

function ConnectionTerminalFixture() {
  return (
    <FixtureGrid>
      <StateSample label='Reconnecting'>
        <ChatToolSurface tone='flat'>
          <div
            className='flex min-h-12 items-center gap-2 text-secondary-token'
            role='status'
          >
            <Loader2
              className='size-4 animate-spin motion-reduce:animate-none'
              aria-hidden='true'
            />
            <span className='text-xs'>Reconnecting to this conversation…</span>
          </div>
        </ChatToolSurface>
      </StateSample>
      <StateSample label='Offline With Recovery'>
        <ErrorDisplay
          chatError={{
            type: 'network',
            message: 'You appear to be offline.',
            failedMessage: 'Plan my next release campaign.',
          }}
          onRetry={NOOP}
          isLoading={false}
          isSubmitting={false}
        />
      </StateSample>
      <StateSample label='Cancelled'>
        <ChatToolSurface tone='cancelled'>
          <div className='flex items-center gap-2 text-secondary-token'>
            <X className='size-4' aria-hidden='true' />
            <span className='text-sm'>Response cancelled</span>
          </div>
        </ChatToolSurface>
      </StateSample>
    </FixtureGrid>
  );
}

const ALBUM_ART_RESULT = {
  success: true,
  state: 'generated',
  releaseId: 'playground-release',
  releaseTitle: 'Midnight Signals',
  artistName: 'Nova Grey',
  generationId: 'playground-generation',
  hasExistingArtwork: false,
  candidates: [
    {
      id: 'candidate-deep-end',
      styleId: 'editorial',
      styleLabel: 'Editorial',
      previewUrl: '/img/releases/the-deep-end.jpg',
      fullResUrl: '/img/releases/the-deep-end.jpg',
    },
    {
      id: 'candidate-take-over',
      styleId: 'kinetic',
      styleLabel: 'Kinetic',
      previewUrl: '/img/releases/take-me-over.jpg',
      fullResUrl: '/img/releases/take-me-over.jpg',
    },
    {
      id: 'candidate-never-say',
      styleId: 'minimal',
      styleLabel: 'Minimal',
      previewUrl: '/img/releases/never-say-a-word.jpg',
      fullResUrl: '/img/releases/never-say-a-word.jpg',
    },
  ],
} satisfies ChatAlbumArtToolResult;

function ImageGenerationFixture() {
  return (
    <div className='grid gap-6 xl:grid-cols-3'>
      <StateSample label='Generating'>
        <ChatGenerationArtifactSurface
          title='Creating album art'
          subtitle='Exploring three directions…'
        >
          <div
            className='grid grid-cols-3 gap-2'
            data-testid='image-generation-loading-grid'
          >
            {[0, 1, 2].map(index => (
              <div
                key={index}
                className='aspect-square animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none'
              />
            ))}
          </div>
        </ChatGenerationArtifactSurface>
      </StateSample>
      <StateSample label='Generated Artifact' className='xl:col-span-2'>
        <ChatAlbumArtCard
          result={ALBUM_ART_RESULT}
          profileId='playground-profile'
        />
      </StateSample>
      <StateSample label='Generation Failed'>
        <ChatArtifactErrorCard
          title='Album Art Failed'
          message='The image provider timed out before returning a result.'
          retryPrompt='Please retry generating album art.'
        />
      </StateSample>
    </div>
  );
}

function EntityOutcomesFixture() {
  return (
    <FixtureGrid>
      <StateSample label='Entity Artifact Success'>
        <ChatPresenceArtifactCard
          state='success'
          title='Release profile'
          summary='Verified from connected catalog data.'
          facts={[
            { label: 'Release', value: 'Midnight Signals' },
            { label: 'Date', value: 'October 24, 2026' },
            { label: 'Catalog', value: 'Spotify and Apple Music connected' },
          ]}
        />
      </StateSample>
      <StateSample label='Entity Artifact Empty'>
        <ChatPresenceArtifactCard
          state='success'
          title='Audience signals'
          summary='No verified signal is available yet.'
          empty
        />
      </StateSample>
      <StateSample label='Insight Entity Outcome' className='lg:col-span-2'>
        <ChatMessage
          {...ASSISTANT_MESSAGE_PROPS}
          id='playground-entity-insight'
          parts={[
            toolPart({
              id: 'entity-insights',
              toolName: 'showTopInsights',
              state: 'succeeded',
              output: {
                success: true,
                title: 'Top signals',
                totalActive: 1,
                insights: [
                  {
                    id: 'insight-chicago',
                    insightType: 'city_growth',
                    category: 'geographic',
                    priority: 'high',
                    title: 'Chicago listeners are growing',
                    description: 'Reachable audience increased week over week.',
                    actionSuggestion:
                      'Target Chicago in the release announcement.',
                    confidence: '0.92',
                    status: 'active',
                    periodStart: '2026-09-01T00:00:00.000Z',
                    periodEnd: '2026-09-30T00:00:00.000Z',
                    createdAt: '2026-10-01T00:00:00.000Z',
                    expiresAt: '2026-10-15T00:00:00.000Z',
                  },
                ],
              },
            }),
          ]}
          skipEntrance
        />
      </StateSample>
    </FixtureGrid>
  );
}

const UPLOAD_FILES: PendingFile[] = [
  {
    id: 'upload-queued',
    name: 'press-notes.pdf',
    size: 420_000,
    mediaType: 'application/pdf',
    kind: 'document',
    progress: 0,
    speed: 0,
    status: 'queued',
    kindLabel: 'Document',
  },
  {
    id: 'upload-active',
    name: 'midnight-signals-master.wav',
    size: 48_600_000,
    mediaType: 'audio/wav',
    kind: 'audio',
    progress: 64,
    speed: 1_200_000,
    status: 'uploading',
    kindLabel: 'Audio',
  },
  {
    id: 'upload-ready',
    name: 'cover-art.jpg',
    size: 2_400_000,
    mediaType: 'image/jpeg',
    kind: 'image',
    progress: 100,
    speed: 0,
    status: 'ready',
    kindLabel: 'Image',
  },
];

function UploadContextFixture() {
  return (
    <FixtureThread>
      <ChatUploadManifest
        files={UPLOAD_FILES}
        aggregate={{
          total: 3,
          done: 1,
          overallPct: 55,
          speed: '1.2 MB/s',
          eta: '18s',
        }}
        isUploading
        onRemove={NOOP}
      />
      <ChatMessage
        {...USER_MESSAGE_PROPS}
        id='playground-upload-context'
        parts={[
          {
            type: 'file',
            mediaType: 'image/jpeg',
            url: '/img/releases/the-deep-end.jpg',
          },
          {
            type: 'text',
            text: 'Use this artwork and the press notes as context for the announcement.',
          },
        ]}
        skipEntrance
      />
    </FixtureThread>
  );
}

const LONG_RESPONSE = `## Release plan

Lead with the story behind **Midnight Signals**, then give every channel one job instead of repeating the same post everywhere.

1. Send core listeners the private preview and ask for one specific reaction.
2. Publish the visualizer when saves begin to slow, not automatically on release day.
3. Keep the profile link focused on the release for the full first week.

### Working note

The useful signal is not raw reach. Watch saves, repeat listens, and replies from people who already know your work. If one city responds faster than the rest, move the next paid test there and preserve the original campaign copy for comparison.

\`\`\`text
Release: Midnight Signals
Primary action: Save the track
Review window: 7 days
\`\`\``;

function LongContentFixture() {
  return (
    <FixtureThread>
      <ChatMessage
        {...ASSISTANT_MESSAGE_PROPS}
        id='playground-long-content'
        parts={[{ type: 'text', text: LONG_RESPONSE }]}
        skipEntrance
      />
    </FixtureThread>
  );
}

function ShellStatesFixture() {
  return (
    <FixtureGrid>
      <StateSample label='Empty Conversation'>
        <div className='min-h-40 pt-6'>
          <ChatEmptyStateGreeting firstName='Alex' insight={null} />
        </div>
      </StateSample>
      <StateSample label='Loading Conversation'>
        <ChatMessageSkeleton />
      </StateSample>
      <StateSample label='Conversation Error'>
        <ErrorDisplay
          chatError={{
            type: 'server',
            message: 'The reply timed out.',
            errorCode: 'CHAT_TIMEOUT',
            requestId: 'req_playground',
            failedMessage: 'Draft my release plan.',
          }}
          onRetry={NOOP}
          isLoading={false}
          isSubmitting={false}
        />
      </StateSample>
      <StateSample label='Permission Denied'>
        <div className='flex gap-2'>
          <ShieldX className='mt-1 size-4 shrink-0 text-error' aria-hidden />
          <ChatMessage
            {...ASSISTANT_MESSAGE_PROPS}
            id='playground-permission-denied'
            parts={[
              toolPart({
                id: 'tool-denied',
                toolName: 'openBillingPortal',
                state: 'denied',
                errorMessage: 'You do not have permission to manage billing.',
              }),
            ]}
            skipEntrance
          />
        </div>
      </StateSample>
    </FixtureGrid>
  );
}

function CompactMobileFixture() {
  return (
    <FixtureThread compact>
      <ChatMessage
        {...USER_MESSAGE_PROPS}
        id='playground-mobile-user'
        parts={[
          {
            type: 'text',
            text: 'What should I do before release day?',
          },
        ]}
        skipEntrance
      />
      <ChatMessage
        {...ASSISTANT_MESSAGE_PROPS}
        id='playground-mobile-assistant'
        parts={[
          {
            type: 'text',
            text: 'Confirm the profile link, artwork, and first listener message.',
          },
          toolPart({
            id: 'mobile-tool',
            toolName: 'checkCanvasStatus',
            state: 'succeeded',
            summary: 'Canvas is ready.',
            output: { success: true },
          }),
        ]}
        skipEntrance
      />
      <ChatArtifactErrorCard
        title='Upload Failed'
        message='The connection dropped. Your message is still here.'
        retryPrompt='Retry the upload.'
      />
    </FixtureThread>
  );
}

export const CHAT_PLAYGROUND_SCENARIOS = [
  {
    id: 'message-lifecycle',
    title: 'Message lifecycle',
    group: 'Messages',
    summary:
      'User and completed assistant turns using the production message renderer.',
    keywords: ['message', 'user', 'assistant', 'complete'],
    coverage: ['message-lifecycle'],
    render: MessageLifecycleFixture,
  },
  {
    id: 'streaming',
    title: 'Thinking and streaming',
    group: 'Messages',
    summary: 'Stable pending and partial-token reply geometry.',
    keywords: ['pending', 'thinking', 'loading', 'streaming'],
    coverage: ['streaming'],
    render: StreamingFixture,
  },
  {
    id: 'long-content',
    title: 'Long content',
    group: 'Messages',
    summary: 'Markdown, lists, emphasis, and code at transcript reading width.',
    keywords: ['long', 'markdown', 'code', 'overflow'],
    coverage: ['long-content'],
    render: LongContentFixture,
  },
  {
    id: 'compact-mobile',
    title: 'Compact and mobile',
    group: 'Messages',
    summary: 'A 352px review frame with messages, tool output, and recovery.',
    keywords: ['compact', 'mobile', 'narrow', 'responsive'],
    coverage: ['compact-mobile'],
    render: CompactMobileFixture,
  },
  {
    id: 'tool-lifecycle',
    title: 'Tool lifecycle',
    group: 'Tools',
    summary: 'Queued, running, succeeded, and failed tool states.',
    keywords: ['tool', 'queued', 'running', 'success', 'error'],
    coverage: ['tool-lifecycle'],
    render: ToolLifecycleFixture,
  },
  {
    id: 'grouped-tools',
    title: 'Grouped tool run',
    group: 'Tools',
    summary: 'Consecutive tool events rendered as one quiet activity run.',
    keywords: ['grouped', 'multiple', 'activity', 'timeline'],
    coverage: ['grouped-tools'],
    render: GroupedToolsFixture,
  },
  {
    id: 'approvals',
    title: 'Approvals and outcomes',
    group: 'Tools',
    summary:
      'Approval request, interactive proposal, confirmed, and cancelled outcomes.',
    keywords: ['approval', 'confirm', 'cancel', 'deny'],
    coverage: ['approvals'],
    render: ApprovalFixture,
  },
  {
    id: 'image-generation',
    title: 'Image generation',
    group: 'Artifacts',
    summary: 'Generating, selectable image artifacts, and provider failure.',
    keywords: ['image', 'generation', 'album art', 'artifact'],
    coverage: ['image-generation'],
    render: ImageGenerationFixture,
  },
  {
    id: 'entity-outcomes',
    title: 'Entity outcomes',
    group: 'Artifacts',
    summary: 'Populated, empty, and insight-backed entity results.',
    keywords: ['entity', 'release', 'insight', 'empty'],
    coverage: ['entity-outcomes'],
    render: EntityOutcomesFixture,
  },
  {
    id: 'upload-context',
    title: 'Upload and context',
    group: 'Artifacts',
    summary:
      'Queued, active, ready uploads and attachment context in a user turn.',
    keywords: ['upload', 'file', 'attachment', 'context'],
    coverage: ['upload-context'],
    render: UploadContextFixture,
  },
  {
    id: 'connection-terminal',
    title: 'Reconnect and cancellation',
    group: 'Resilience',
    summary: 'Reconnecting, offline recovery, and cancelled terminal feedback.',
    keywords: ['reconnect', 'offline', 'network', 'cancelled'],
    coverage: ['connection-terminal'],
    render: ConnectionTerminalFixture,
  },
  {
    id: 'shell-states',
    title: 'Shell and access states',
    group: 'Resilience',
    summary:
      'Empty, loading, conversation error, and permission-denied states.',
    keywords: ['empty', 'loading', 'error', 'permission denied'],
    coverage: ['shell-states'],
    render: ShellStatesFixture,
  },
] as const satisfies readonly ChatPlaygroundScenario[];

export const CHAT_PLAYGROUND_IMPROVEMENTS = [
  {
    id: 'canonical-terminal-contract',
    title: 'Unify queued and connection states',
    scenarioIds: ['tool-lifecycle', 'connection-terminal'],
    recommendation:
      'Add queued, reconnecting, and cancelled to one shared chat presentation contract; today those states are composed around the persisted tool contract.',
    reevaluateWhen:
      'When the next transport or background-tool flow needs one of these states.',
  },
  {
    id: 'artifact-geometry',
    title: 'Normalize artifact lifecycle geometry',
    scenarioIds: ['image-generation', 'entity-outcomes'],
    recommendation:
      'Give loading, success, empty, and error artifacts one shared minimum-height contract so provider transitions do not move adjacent transcript content.',
    reevaluateWhen:
      'When a new generated artifact joins the renderer registry.',
  },
  {
    id: 'approval-outcomes',
    title: 'Converge approval outcomes',
    scenarioIds: ['approvals', 'grouped-tools'],
    recommendation:
      'Move generic approval request, accepted, denied, and cancelled copy into the canonical tool surface instead of leaving outcome wording to each card.',
    reevaluateWhen: 'When a third interactive approval card is added.',
  },
] as const satisfies readonly PlaygroundImprovement[];

const SCENARIO_GROUPS: readonly ScenarioGroup[] = [
  'Messages',
  'Tools',
  'Artifacts',
  'Resilience',
];

function matchesQuery(
  scenario: ChatPlaygroundScenario,
  normalizedQuery: string
): boolean {
  if (!normalizedQuery) return true;
  return [
    scenario.title,
    scenario.summary,
    scenario.group,
    ...scenario.keywords,
    ...scenario.coverage,
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

export function ChatUiPlayground() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(
    CHAT_PLAYGROUND_SCENARIOS[0].id
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredScenarios = useMemo(
    () =>
      CHAT_PLAYGROUND_SCENARIOS.filter(scenario =>
        matchesQuery(scenario, normalizedQuery)
      ),
    [normalizedQuery]
  );
  const selectedScenario =
    CHAT_PLAYGROUND_SCENARIOS.find(scenario => scenario.id === selectedId) ??
    CHAT_PLAYGROUND_SCENARIOS[0];
  const ScenarioPreview = selectedScenario.render;

  return (
    <div className='space-y-6' data-testid='chat-ui-playground'>
      <div className='max-w-3xl'>
        <h2 className='line-clamp-2 text-base font-medium text-primary-token'>
          Scenario Catalog
        </h2>
        <p className='mt-1 text-xs leading-5 text-secondary-token'>
          Select a canonical chat state for visual QA in one step. Search and
          scenario selection keep focus in the catalog while the preview frame
          retains its minimum geometry.
        </p>
      </div>

      <div className='grid items-start gap-6 lg:grid-cols-4'>
        <aside aria-label='Chat Scenarios' className='min-w-0 lg:col-span-1'>
          <label
            htmlFor='chat-playground-search'
            className='text-2xs font-medium text-secondary-token'
          >
            Search Scenarios
          </label>
          <div className='mt-1.5'>
            <Input
              id='chat-playground-search'
              type='search'
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder='Tool, image, error…'
              size='sm'
              trailing={
                <Search
                  className='size-3.5 text-tertiary-token'
                  aria-hidden='true'
                />
              }
            />
          </div>
          <output
            className='mt-2 block text-2xs text-tertiary-token'
            aria-live='polite'
          >
            {filteredScenarios.length} of {CHAT_PLAYGROUND_SCENARIOS.length}{' '}
            scenarios
          </output>

          <div className='mt-4 space-y-4'>
            {SCENARIO_GROUPS.map(group => {
              const groupScenarios = filteredScenarios.filter(
                scenario => scenario.group === group
              );
              if (groupScenarios.length === 0) return null;
              return (
                <section
                  key={group}
                  aria-labelledby={`scenario-group-${group}`}
                >
                  <h3
                    id={`scenario-group-${group}`}
                    className='px-2 text-2xs font-medium text-tertiary-token'
                  >
                    {group}
                  </h3>
                  <div className='mt-1 space-y-0.5'>
                    {groupScenarios.map(scenario => {
                      const isSelected = scenario.id === selectedScenario.id;
                      return (
                        <Button
                          key={scenario.id}
                          type='button'
                          variant={isSelected ? 'secondary' : 'ghost'}
                          size='sm'
                          aria-pressed={isSelected}
                          data-testid={`chat-playground-option-${scenario.id}`}
                          onClick={() => setSelectedId(scenario.id)}
                          className='w-full justify-start'
                        >
                          {scenario.title}
                        </Button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {filteredScenarios.length === 0 ? (
              <p className='px-2 py-4 text-xs text-secondary-token'>
                No scenarios match this search.
              </p>
            ) : null}
          </div>
        </aside>

        <main className='min-w-0 lg:col-span-3'>
          <div className='mb-3'>
            <p className='text-2xs font-medium text-tertiary-token'>
              {selectedScenario.group}
            </p>
            <h3
              id='chat-playground-preview-title'
              className='mt-0.5 text-sm font-medium text-primary-token'
            >
              {selectedScenario.title}
            </h3>
            <p className='mt-1 text-xs text-secondary-token'>
              {selectedScenario.summary}
            </p>
          </div>
          <section
            aria-labelledby='chat-playground-preview-title'
            data-testid='chat-playground-preview'
            data-scenario-id={selectedScenario.id}
            className='overflow-x-hidden rounded-xl border border-subtle bg-base p-4 sm:p-6'
            style={{ minHeight: '42rem' }}
          >
            <ScenarioPreview />
          </section>
        </main>
      </div>

      <section
        aria-labelledby='chat-playground-improvements-title'
        className='border-t border-subtle pt-6'
      >
        <h2
          id='chat-playground-improvements-title'
          className='line-clamp-2 text-sm font-medium text-primary-token'
        >
          Cleanup Proposal
        </h2>
        <p className='mt-1 max-w-3xl text-xs leading-5 text-secondary-token'>
          Ship now: keep this inventory as the comparison surface. Re-evaluate
          the gaps below at their named trigger, then consolidate in production
          primitives before adding another local variant.
        </p>
        <ol className='mt-4 grid gap-4 lg:grid-cols-3'>
          {CHAT_PLAYGROUND_IMPROVEMENTS.map((improvement, index) => (
            <li key={improvement.id} className='border-t border-subtle pt-3'>
              <p className='text-2xs font-medium text-tertiary-token'>
                {index + 1}. {improvement.scenarioIds.join(' + ')}
              </p>
              <h3 className='mt-1 text-xs font-medium text-primary-token'>
                {improvement.title}
              </h3>
              <p className='mt-1 text-xs leading-5 text-secondary-token'>
                {improvement.recommendation}
              </p>
              <p className='mt-2 text-2xs leading-4 text-tertiary-token'>
                Re-evaluate when: {improvement.reevaluateWhen}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
