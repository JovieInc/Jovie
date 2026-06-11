import { describe, expect, it } from 'vitest';
import {
  capPersistedToolOutput,
  decodeToolEvents,
  encodeToolEvents,
  PERSISTED_TOOL_OUTPUT_MAX_BYTES,
  persistedToolEventsSchema,
  preparePersistedToolEventsForTurnFinish,
  resolvePersistedToolEventsForDisplay,
  STALE_RUNNING_TOOL_EVENT_MS,
  terminalizeRunningToolEvents,
  toolEventToMessagePart,
} from '@/lib/chat/tool-events';
import { ONBOARDING_TOOLS } from '@/lib/chat/tool-schemas';
import { TOOL_UI_REGISTRY } from '@/lib/chat/tool-ui-registry';
import {
  getBackfillDecision,
  parseBackfillArgs,
} from '@/scripts/backfill-chat-tool-events';

const CHAT_ROUTE_TOOL_NAMES = [
  'proposeAvatarUpload',
  'proposeSocialLink',
  'proposeSocialLinkRemoval',
  'submitFeedback',
  'showTopInsights',
  'proposeProfileEdit',
  'importBioFromUrl',
  'checkCanvasStatus',
  'suggestRelatedArtists',
  'writeWorldClassBio',
  'generateCanvasPlan',
  'generateAlbumArt',
  'createPromoStrategy',
  'markCanvasUploaded',
  'formatLyrics',
  'createRelease',
  'generateReleasePitch',
] as const;

describe('tool event contract', () => {
  it('passes through persisted v2 events unchanged', () => {
    const toolCalls = [
      {
        schemaVersion: 2,
        toolCallId: 'tool-1',
        toolName: 'showTopInsights',
        state: 'succeeded',
        output: { success: true, title: 'Top Signals' },
        summary: 'Top Signals',
        uiHint: 'artifact',
      },
    ];

    const decoded = decodeToolEvents(toolCalls);

    expect(decoded.source).toBe('v2');
    expect(persistedToolEventsSchema.parse(decoded.events)).toEqual(toolCalls);
  });

  it('maps failed legacy results to failed persisted events', () => {
    const decoded = decodeToolEvents([
      {
        type: 'tool-invocation',
        toolInvocation: {
          toolCallId: 'legacy-1',
          toolName: 'generateReleasePitch',
          state: 'result',
          result: {
            success: false,
            error: 'Pitch provider unavailable',
          },
        },
      },
    ]);

    expect(decoded.source).toBe('legacy');
    expect(decoded.events).toEqual([
      expect.objectContaining({
        toolCallId: 'legacy-1',
        toolName: 'generateReleasePitch',
        state: 'failed',
        errorMessage: 'Pitch provider unavailable',
        uiHint: 'artifact',
      }),
    ]);
  });

  it('covers every chat tool in the shared UI registry', () => {
    for (const toolName of [...CHAT_ROUTE_TOOL_NAMES, ...ONBOARDING_TOOLS]) {
      expect(TOOL_UI_REGISTRY[toolName]).toBeDefined();
    }
  });

  it('terminalizes running tool events for aborted turn persistence', () => {
    const toolCalls = preparePersistedToolEventsForTurnFinish({
      isAborted: true,
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'showTopInsights',
          toolCallId: 'tool-running',
          state: 'input-available',
          input: { profileId: 'profile-1' },
        },
        {
          type: 'dynamic-tool',
          toolName: 'submitFeedback',
          toolCallId: 'tool-done',
          state: 'output-available',
          input: { feedback: 'Ship it' },
          output: { success: true },
        },
      ],
    });

    expect(toolCalls).toEqual([
      expect.objectContaining({
        toolCallId: 'tool-running',
        state: 'failed',
        errorMessage:
          'This tool was interrupted when the chat disconnected. Retry when you are ready.',
      }),
      expect.objectContaining({
        toolCallId: 'tool-done',
        state: 'succeeded',
      }),
    ]);
  });

  it('resolves canceled-turn running tools for replay and reload', () => {
    const runningEvent = {
      schemaVersion: 2 as const,
      toolCallId: 'tool-running',
      toolName: 'showTopInsights',
      state: 'running' as const,
      uiHint: 'artifact' as const,
    };

    expect(
      resolvePersistedToolEventsForDisplay([runningEvent], {
        turnStatus: 'canceled',
        messageCreatedAt: new Date('2026-06-10T12:00:00Z'),
        observedAt: new Date('2026-06-10T12:00:10Z'),
      })
    ).toEqual([
      expect.objectContaining({
        toolCallId: 'tool-running',
        state: 'failed',
      }),
    ]);
  });

  it('terminalizes stale running tools after the hydration grace window', () => {
    const runningEvent = {
      schemaVersion: 2 as const,
      toolCallId: 'tool-stale',
      toolName: 'showTopInsights',
      state: 'running' as const,
      uiHint: 'artifact' as const,
    };
    const createdAt = new Date('2026-06-10T12:00:00Z');

    expect(
      resolvePersistedToolEventsForDisplay([runningEvent], {
        messageCreatedAt: createdAt,
        observedAt: new Date(
          createdAt.getTime() + STALE_RUNNING_TOOL_EVENT_MS + 1_000
        ),
      })
    ).toEqual([
      expect.objectContaining({
        toolCallId: 'tool-stale',
        state: 'failed',
        errorMessage:
          'This tool call timed out before it could finish. Retry when you are ready.',
      }),
    ]);
  });

  it('terminalizeRunningToolEvents only rewrites running entries', () => {
    const runningEvent = {
      schemaVersion: 2 as const,
      toolCallId: 'tool-active',
      toolName: 'showTopInsights',
      state: 'running' as const,
      uiHint: 'artifact' as const,
    };
    const succeededEvent = {
      ...runningEvent,
      toolCallId: 'tool-done',
      state: 'succeeded' as const,
      output: { success: true },
    };

    expect(
      terminalizeRunningToolEvents([runningEvent, succeededEvent], {
        errorMessage: 'Interrupted',
      })
    ).toEqual([
      expect.objectContaining({
        toolCallId: 'tool-active',
        state: 'failed',
        errorMessage: 'Interrupted',
      }),
      succeededEvent,
    ]);
  });

  it('leaves in-flight running tools untouched while the turn is still active', () => {
    const runningEvent = {
      schemaVersion: 2 as const,
      toolCallId: 'tool-active',
      toolName: 'showTopInsights',
      state: 'running' as const,
      uiHint: 'artifact' as const,
    };

    expect(
      resolvePersistedToolEventsForDisplay([runningEvent], {
        turnStatus: 'streaming',
        messageCreatedAt: new Date('2026-06-10T12:00:00Z'),
        observedAt: new Date('2026-06-10T12:00:10Z'),
      })
    ).toEqual([runningEvent]);
  });

  it('caps oversized persisted tool outputs with summary and refetchable id', () => {
    const oversizedOutput = {
      success: true,
      releaseId: 'release-123',
      summary: 'Generated album art',
      candidates: Array.from({ length: 200 }, (_, index) => ({
        id: `candidate-${index}`,
        previewUrl: `https://example.com/preview-${index}.jpg`,
        fullResUrl: `https://example.com/full-${index}.jpg`,
        prompt: 'x'.repeat(500),
      })),
    };

    const capped = capPersistedToolOutput(oversizedOutput);

    expect(capped).toEqual(
      expect.objectContaining({
        success: true,
        truncated: true,
        summary: 'Generated album art',
        refetchableId: 'release-123',
      })
    );
    expect(
      new TextEncoder().encode(JSON.stringify(capped)).byteLength
    ).toBeLessThanOrEqual(PERSISTED_TOOL_OUTPUT_MAX_BYTES);
  });

  it('encodes oversized tool outputs within the persisted byte budget', () => {
    const [event] =
      encodeToolEvents([
        {
          type: 'dynamic-tool',
          toolName: 'generateAlbumArt',
          toolCallId: 'album-art-1',
          state: 'output-available',
          input: { releaseTitle: 'Midnight' },
          output: {
            success: true,
            generationId: 'gen-1',
            summary: 'Generated album art',
            candidates: Array.from({ length: 200 }, (_, index) => ({
              id: `candidate-${index}`,
              previewUrl: `https://example.com/preview-${index}.jpg`,
              fullResUrl: `https://example.com/full-${index}.jpg`,
              prompt: 'x'.repeat(500),
            })),
          },
        },
      ]) ?? [];

    expect(event?.output).toEqual(
      expect.objectContaining({
        truncated: true,
        refetchableId: 'gen-1',
      })
    );
    expect(
      new TextEncoder().encode(JSON.stringify(event?.output)).byteLength
    ).toBeLessThanOrEqual(PERSISTED_TOOL_OUTPUT_MAX_BYTES);
  });

  it('preserves approval responses through persistence and hydration', () => {
    const [event] =
      encodeToolEvents([
        {
          type: 'dynamic-tool',
          toolName: 'submitFeedback',
          toolCallId: 'approval-1',
          state: 'approval-responded',
          input: { feedback: 'Ship it' },
          approval: {
            id: 'approval-1-state',
            approved: true,
            reason: 'Reviewed by user',
          },
        },
      ]) ?? [];

    expect(event).toEqual(
      expect.objectContaining({
        toolCallId: 'approval-1',
        state: 'needs-approval',
        approval: {
          id: 'approval-1-state',
          approved: true,
          reason: 'Reviewed by user',
        },
      })
    );

    expect(toolEventToMessagePart(event)).toEqual({
      type: 'dynamic-tool',
      toolName: 'submitFeedback',
      toolCallId: 'approval-1',
      state: 'approval-responded',
      input: { feedback: 'Ship it' },
      approval: {
        id: 'approval-1-state',
        approved: true,
        reason: 'Reviewed by user',
      },
    });
  });
});

describe('chat tool event backfill helpers', () => {
  it('parses dry-run, limit, and cursor arguments', () => {
    expect(
      parseBackfillArgs(['--dry-run', '--limit', '25', '--cursor', 'msg-25'])
    ).toEqual({
      dryRun: true,
      limit: 25,
      cursor: 'msg-25',
    });
  });

  it('returns legacy rows for backfill and skips already migrated rows', () => {
    expect(
      getBackfillDecision([
        {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'legacy-2',
            toolName: 'showTopInsights',
            state: 'result',
            result: { success: true, title: 'Top Signals' },
          },
        },
      ])
    ).toEqual({
      source: 'legacy',
      events: [
        {
          schemaVersion: 2,
          toolCallId: 'legacy-2',
          toolName: 'showTopInsights',
          state: 'succeeded',
          input: undefined,
          output: { success: true, title: 'Top Signals' },
          errorMessage: undefined,
          summary: 'Top Signals',
          uiHint: 'artifact',
        },
      ],
    });

    expect(
      getBackfillDecision([
        {
          schemaVersion: 2,
          toolCallId: 'tool-2',
          toolName: 'showTopInsights',
          state: 'succeeded',
          output: { success: true, title: 'Top Signals' },
          summary: 'Top Signals',
          uiHint: 'artifact',
        },
      ])
    ).toEqual({
      source: 'v2',
      events: null,
    });
  });
});
