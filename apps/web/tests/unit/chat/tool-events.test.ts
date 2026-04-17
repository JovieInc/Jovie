import { describe, expect, it } from 'vitest';
import {
  decodeToolEvents,
  persistedToolEventsSchema,
} from '@/lib/chat/tool-events';
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
    for (const toolName of CHAT_ROUTE_TOOL_NAMES) {
      expect(TOOL_UI_REGISTRY[toolName]).toBeDefined();
    }
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
