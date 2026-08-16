import { describe, expect, it, vi } from 'vitest';
import {
  type CommandOutput,
  ComposioCommandError,
  type ComposioToolExecutor,
  parseComposioJson,
} from './composio-command';
import {
  createYouTubeComposioAdapter,
  parseYouTubeReplyBatch,
  runYouTubeReplyBatch,
  YOUTUBE_TOOLS,
  type YouTubeReplyAction,
} from './youtube-composio-adapter';
import { parseYouTubeCliArgs } from './youtube-composio-cli';

const ACCOUNT_ID = 'UC90tJdD38139ytPUdEZVl1A';
const PARENT_ID = 'UgzSwJ4mqyaC0Dq1dN94AaABAg';
const REPLY_ID = 'reply-123';
const BODY = 'Radio would have been nice. Thank you.';
const APPROVAL_ID = 'approval-001';

describe('Composio YouTube reply dogfood adapter', () => {
  it('parses JSON after a CLI diagnostic line', () => {
    const parsed = parseComposioJson(
      'warning: using cached tool schema\n{"successful":true,"data":{"items":[]}}\n'
    );

    expect(parsed).toEqual({
      successful: true,
      data: { items: [] },
    });
  });

  it('fails closed when the authenticated YouTube account is unexpected', async () => {
    const execute = mockExecute({
      accountId: 'UC-wrong-account',
      thread: unansweredThread(),
    });
    const adapter = createYouTubeComposioAdapter({
      execute,
      minDelayMs: 0,
    });

    await expect(adapter.preflight({ action: action() })).rejects.toMatchObject(
      {
        name: 'YouTubeAccountMismatchError',
        expectedChannelId: ACCOUNT_ID,
        actualChannelIds: ['UC-wrong-account'],
      }
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(YOUTUBE_TOOLS.verifyAccount, {
      mine: true,
      part: 'snippet,statistics',
    });
  });

  it('marks a failed create as ambiguous and never retries the write', async () => {
    const execute = mockExecute({
      accountId: ACCOUNT_ID,
      thread: unansweredThread(),
      createError: true,
    });
    const adapter = createYouTubeComposioAdapter({
      execute,
      minDelayMs: 0,
    });
    const batch = parseYouTubeReplyBatch({
      accountId: ACCOUNT_ID,
      actions: [
        { sourceItemId: PARENT_ID, body: BODY, approvalId: APPROVAL_ID },
        {
          sourceItemId: 'second-parent',
          body: 'Second approved reply',
          approvalId: APPROVAL_ID,
        },
      ],
    });

    const receipt = await runYouTubeReplyBatch(
      batch,
      adapter,
      { mode: 'execute', approvalId: APPROVAL_ID },
      fixedClock
    );

    expect(receipt.halted).toBe(true);
    expect(receipt.haltReason).toBe('ambiguous_write_inspect_before_retry');
    expect(receipt.items.map(item => item.status)).toEqual([
      'ambiguous',
      'skipped_after_halt',
    ]);
    expect(
      execute.mock.calls.filter(
        ([slug]) => slug === YOUTUBE_TOOLS.createCommentReply
      )
    ).toHaveLength(1);
  });

  it('runs dry-run preflight without invoking the create tool', async () => {
    const execute = mockExecute({
      accountId: ACCOUNT_ID,
      thread: unansweredThread(),
    });
    const adapter = createYouTubeComposioAdapter({
      execute,
      minDelayMs: 0,
    });
    const batch = parseYouTubeReplyBatch({
      accountId: ACCOUNT_ID,
      actions: [{ sourceItemId: PARENT_ID, body: BODY }],
    });

    const receipt = await runYouTubeReplyBatch(
      batch,
      adapter,
      { mode: 'dry-run' },
      fixedClock
    );

    expect(receipt.mode).toBe('dry-run');
    expect(receipt.items[0]?.status).toBe('dry_run_ready');
    expect(
      execute.mock.calls.some(
        ([slug]) => slug === YOUTUBE_TOOLS.createCommentReply
      )
    ).toBe(false);
  });

  it('revalidates immediately before writing and verifies the exact reply', async () => {
    const execute = mockExecute({
      accountId: ACCOUNT_ID,
      thread: unansweredThread(),
      threadAfterWrite: answeredThread(),
    });
    const adapter = createYouTubeComposioAdapter({
      execute,
      minDelayMs: 0,
    });
    const batch = parseYouTubeReplyBatch({
      accountId: ACCOUNT_ID,
      actions: [
        { sourceItemId: PARENT_ID, body: BODY, approvalId: APPROVAL_ID },
      ],
    });

    const receipt = await runYouTubeReplyBatch(
      batch,
      adapter,
      { mode: 'execute', approvalId: APPROVAL_ID },
      fixedClock
    );

    expect(receipt.items[0]?.status).toBe('verified');
    expect(
      execute.mock.calls.filter(
        ([slug]) => slug === YOUTUBE_TOOLS.createCommentReply
      )
    ).toHaveLength(1);
    expect(
      execute.mock.calls.filter(
        ([slug]) => slug === YOUTUBE_TOOLS.verifyAccount
      )
    ).toHaveLength(3);
  });

  it('requires an explicit approval id for execute mode', () => {
    expect(() =>
      parseYouTubeCliArgs(['--batch', 'approved.json', '--execute'])
    ).toThrow('--execute requires --approval-id');
    expect(parseYouTubeCliArgs(['--batch', 'approved.json']).mode).toBe(
      'dry-run'
    );
  });

  it('rejects duplicate source comments in one batch', () => {
    expect(() =>
      parseYouTubeReplyBatch({
        accountId: ACCOUNT_ID,
        actions: [
          { sourceItemId: PARENT_ID, body: 'one' },
          { sourceItemId: PARENT_ID, body: 'two' },
        ],
      })
    ).toThrow('Duplicate');
  });

  it('rejects reply copy duplicated after normalization', () => {
    expect(() =>
      parseYouTubeReplyBatch({
        accountId: ACCOUNT_ID,
        actions: [
          { sourceItemId: 'comment-1', body: 'Same   reply' },
          { sourceItemId: 'comment-2', body: ' same reply ' },
        ],
      })
    ).toThrow('Duplicate reply body after normalization');
  });
});

function action(): YouTubeReplyAction {
  return {
    platform: 'youtube',
    actionId: 'action-001',
    accountId: ACCOUNT_ID,
    sourceItemId: PARENT_ID,
    body: BODY,
    approvalId: APPROVAL_ID,
  };
}

function unansweredThread(parentId = PARENT_ID): Record<string, unknown> {
  return {
    id: parentId,
    snippet: {
      canReply: true,
      isPublic: true,
      totalReplyCount: 0,
    },
    replies: { comments: [] },
  };
}

function answeredThread(parentId = PARENT_ID): Record<string, unknown> {
  return {
    id: parentId,
    snippet: {
      canReply: true,
      isPublic: true,
      totalReplyCount: 1,
    },
    replies: {
      comments: [
        {
          id: REPLY_ID,
          snippet: {
            authorChannelId: ACCOUNT_ID,
            textOriginal: BODY,
          },
        },
      ],
    },
  };
}

function mockExecute(options: {
  readonly accountId: string;
  readonly thread: Record<string, unknown>;
  readonly threadAfterWrite?: Record<string, unknown>;
  readonly createError?: boolean;
}) {
  let writes = 0;
  const execute = vi.fn<ComposioToolExecutor>(async (slug, input) => {
    if (slug === YOUTUBE_TOOLS.verifyAccount) {
      return composioResponse({ items: [{ id: options.accountId }] });
    }
    if (slug === YOUTUBE_TOOLS.listCommentThreads) {
      const parentId = typeof input.id === 'string' ? input.id : PARENT_ID;
      return composioResponse({
        items: [
          parentId === PARENT_ID && options.threadAfterWrite && writes > 0
            ? options.threadAfterWrite
            : parentId === PARENT_ID
              ? options.thread
              : unansweredThread(parentId),
        ],
      });
    }
    if (slug === YOUTUBE_TOOLS.createCommentReply && options.createError) {
      const output: CommandOutput = {
        stdout: '',
        stderr: 'provider connection closed after request',
        exitCode: 1,
      };
      throw new ComposioCommandError(['execute', slug], output, {
        mayHaveSucceeded: true,
      });
    }
    if (slug === YOUTUBE_TOOLS.createCommentReply) {
      writes += 1;
      return composioResponse({ id: REPLY_ID });
    }
    throw new Error(`Unexpected tool ${slug}`);
  });
  return execute;
}

function composioResponse(data: Record<string, unknown>): unknown {
  return { successful: true, data };
}

function fixedClock(): Date {
  return new Date('2026-08-14T20:00:00.000Z');
}
