import { afterEach, describe, expect, it, vi } from 'vitest';
import * as tokens from '@/lib/chat/tokens';
import * as toolEvents from '@/lib/chat/tool-events';
import {
  createChatRailContextProjector,
  deriveChatRailContextTargets,
  type ProjectChatRailContextTargetsInput,
} from './chat-context-rail';
import type { MessagePart } from './types';
import * as utils from './utils';

type RailMessage = ProjectChatRailContextTargetsInput['messages'][number];

function message(
  id: string,
  text = `@release:${id}[Release ${id}]`
): RailMessage {
  return { id, streamRevision: 0, parts: [{ type: 'text', text }] };
}

function toolPart(overrides: Record<string, unknown> = {}): MessagePart {
  return {
    type: 'dynamic-tool',
    toolName: 'proposeProfileEdit',
    toolCallId: 'call-1',
    state: 'output-available',
    input: {},
    output: { releaseId: 'tool-release', releaseTitle: 'From a tool' },
    ...overrides,
  } as MessagePart;
}

const profile = { id: 'profile-1', label: 'Artist' };

afterEach(() => vi.restoreAllMocks());

describe('createChatRailContextProjector', () => {
  it.each([20, 200, 2000])(
    'only parses the changed response during streaming with %i historical messages',
    count => {
      const project = createChatRailContextProjector();
      const history = Array.from({ length: count }, (_, index) => ({
        ...message(`message-${index}`),
        parts: [
          ...message(`message-${index}`).parts,
          toolPart({ toolCallId: `call-${index}` }),
          {
            type: 'file',
            mediaType: 'image/png',
            url: 'https://example.com/cover.png',
          },
        ] as MessagePart[],
      }));
      let active = message('active', 'Starting the answer');
      const extract = vi.spyOn(utils, 'getMessageText');
      const parse = vi.spyOn(tokens, 'parseTokens');
      const encode = vi.spyOn(toolEvents, 'encodeToolEvents');
      const initial = project({
        conversationKey: 'conversation-1',
        messages: [...history, active],
        profile,
      });

      for (const operation of [extract, parse, encode]) {
        expect(operation).toHaveBeenCalledTimes(count + 1);
        operation.mockClear();
      }

      for (let revision = 1; revision <= 5; revision++) {
        active = {
          ...message('active', `Streaming chunk ${revision}`),
          streamRevision: revision,
        };
        expect(
          project({
            conversationKey: 'conversation-1',
            messages: [...history, active],
            profile,
          })
        ).toBe(initial);
      }

      for (const operation of [extract, parse, encode]) {
        expect(operation).toHaveBeenCalledTimes(5);
      }
      expect(initial).toHaveLength(count * 3);
    }
  );

  it('preserves cold derivation order, focus keys, placeholders, and tool deduplication', () => {
    const project = createChatRailContextProjector();
    const input = {
      conversationKey: 'conversation-1',
      profile,
      messages: [
        message('a', '@release:<id>[Placeholder] @release:real[Real]'),
        {
          ...message('b'),
          parts: [
            toolPart({ output: { releaseId: 'old' } }),
            toolPart(),
            toolPart({
              type: 'tool-searchSpotifyArtist',
              toolCallId: 'static-tool',
              input: { artistId: 'artist-1', artistName: 'Artist one' },
            }),
          ],
        },
      ],
    };
    expect(project(input)).toEqual(deriveChatRailContextTargets(input));
    expect(project(input).map(target => target.id)).toEqual([
      'real',
      'profile-1',
      'tool-release',
      'profile-1',
      'tool-release',
      'artist-1',
    ]);
  });

  it('invalidates text changes even when a refetch resets the stream revision', () => {
    const project = createChatRailContextProjector();
    project({ conversationKey: 'one', messages: [message('a')] });
    const updated = message('a', '@release:revised[Revised title]');
    expect(project({ conversationKey: 'one', messages: [updated] })).toEqual([
      expect.objectContaining({ id: 'revised', label: 'Revised title' }),
    ]);
  });

  it('invalidates same-text tool input and output updates', () => {
    const project = createChatRailContextProjector();
    const first = { ...message('a'), parts: [toolPart()] };
    project({ conversationKey: 'one', messages: [first], profile });
    const updated = {
      ...first,
      parts: [toolPart({ output: { releaseId: 'new', releaseTitle: 'New' } })],
    };
    expect(
      project({ conversationKey: 'one', messages: [updated], profile })
    ).toEqual([
      expect.objectContaining({ kind: 'profile' }),
      expect.objectContaining({ id: 'new', label: 'New' }),
    ]);
    const changedInput = {
      ...updated,
      parts: [toolPart({ input: { artistId: 'input-artist' }, output: {} })],
    };
    expect(
      project({ conversationKey: 'one', messages: [changedInput], profile })
    ).toEqual([
      expect.objectContaining({ kind: 'profile' }),
      expect.objectContaining({ id: 'input-artist' }),
    ]);
  });

  it('honors the timeline revision even when a tool delta shares the parts array', () => {
    const project = createChatRailContextProjector();
    const parts = [toolPart({ state: 'input-available', output: undefined })];
    const first = { id: 'tool-message', parts, streamRevision: 0 };
    expect(project({ conversationKey: 'one', messages: [first] })).toEqual([]);
    parts[0] = toolPart();
    expect(
      project({
        conversationKey: 'one',
        messages: [{ ...first, streamRevision: 1 }],
      })
    ).toEqual([expect.objectContaining({ id: 'tool-release' })]);
  });

  it('reuses semantic output across new wrappers, irrelevant prose, and tool state changes', () => {
    const project = createChatRailContextProjector();
    const first = message('a');
    const initial = project({ conversationKey: 'one', messages: [first] });
    const parse = vi.spyOn(tokens, 'parseTokens');
    expect(project({ conversationKey: 'one', messages: [{ ...first }] })).toBe(
      initial
    );
    expect(parse).not.toHaveBeenCalled();
    expect(
      project({
        conversationKey: 'one',
        messages: [message('a', '@release:a[Release a] More prose')],
      })
    ).toBe(initial);

    const tool = {
      ...message('b'),
      parts: [
        toolPart({
          state: 'input-available',
          input: { releaseId: 'a' },
          output: undefined,
        }),
      ],
    };
    const toolTargets = project({ conversationKey: 'one', messages: [tool] });
    expect(
      project({
        conversationKey: 'one',
        messages: [
          {
            ...tool,
            parts: [toolPart({ input: { releaseId: 'a' }, output: {} })],
          },
        ],
      })
    ).toBe(toolTargets);
  });

  it('publishes label and tool focus-key changes with the same entity identity', () => {
    const project = createChatRailContextProjector();
    const first = { ...message('a'), parts: [toolPart()] };
    const initial = project({ conversationKey: 'one', messages: [first] });
    const update = {
      ...first,
      parts: [
        toolPart({
          toolCallId: 'call-2',
          output: { releaseId: 'tool-release', releaseTitle: 'Renamed' },
        }),
      ],
    };
    const revised = project({ conversationKey: 'one', messages: [update] });
    expect(revised).not.toBe(initial);
    expect(revised).toEqual([
      expect.objectContaining({
        label: 'Renamed',
        toolCallId: 'call-2',
        focusKey: 'tool:call-2:entity:release:tool-release',
      }),
    ]);
  });

  it('handles history insertion, removal, reordering, and replacement without stale entries', () => {
    const project = createChatRailContextProjector();
    const a = message('a');
    const b = message('b');
    const c = message('c');
    for (const messages of [[b], [a, b], [b, a], [b], [c], []]) {
      expect(project({ conversationKey: 'one', messages })).toEqual(
        deriveChatRailContextTargets({ messages })
      );
    }
    const parse = vi.spyOn(tokens, 'parseTokens');
    project({ conversationKey: 'one', messages: [a, b] });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('discards removed rows even while other cached rows remain', () => {
    const project = createChatRailContextProjector();
    const messages = [message('a'), message('b')];
    project({ conversationKey: 'one', messages });
    project({ conversationKey: 'one', messages: [messages[1]] });
    const parse = vi.spyOn(tokens, 'parseTokens');
    project({ conversationKey: 'one', messages });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('resets when switching conversations, including reused ids and new chats', () => {
    const project = createChatRailContextProjector();
    const messages = [message('same-id')];
    const parse = vi.spyOn(tokens, 'parseTokens');
    for (const conversationKey of ['one', 'two', 'one', null]) {
      expect(project({ conversationKey, messages })).toEqual(
        deriveChatRailContextTargets({ messages })
      );
    }
    expect(parse).toHaveBeenCalledTimes(8);
    expect(project({ conversationKey: null, messages: [] })).toEqual([]);
  });

  it('refreshes profile identity and label and removes profile context when unavailable', () => {
    const project = createChatRailContextProjector();
    const messages = [
      { ...message('a'), parts: [toolPart({ input: {}, output: {} })] },
    ];
    const first = project({ conversationKey: 'one', messages, profile });
    expect(first[0]).toMatchObject({ id: 'profile-1', label: 'Artist' });
    expect(
      project({
        conversationKey: 'one',
        messages,
        profile: { ...profile, label: 'Renamed' },
      })[0]
    ).toMatchObject({ label: 'Renamed' });
    expect(
      project({
        conversationKey: 'one',
        messages,
        profile: { id: 'profile-2', label: null },
      })[0]
    ).toMatchObject({ id: 'profile-2', label: null });
    expect(
      project({ conversationKey: 'one', messages, profile: null })
    ).toEqual([]);
  });
});
