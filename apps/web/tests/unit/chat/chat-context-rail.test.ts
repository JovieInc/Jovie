import { describe, expect, it } from 'vitest';
import { deriveChatRailContextTargets } from '@/components/jovie/chat-context-rail';

describe('deriveChatRailContextTargets', () => {
  it('uses structured entity tokens and ignores prose-only mentions', () => {
    const targets = deriveChatRailContextTargets({
      messages: [
        {
          id: 'msg-1',
          parts: [
            {
              type: 'text',
              text: 'Look at my profile and @release:rel_1[Midnight Drive]',
            },
          ],
        },
      ],
      profile: { id: 'profile-1', label: 'Tim White' },
    });

    expect(targets).toEqual([
      expect.objectContaining({
        kind: 'release',
        id: 'rel_1',
        label: 'Midnight Drive',
        source: 'message',
      }),
    ]);
    expect(targets).not.toContainEqual(
      expect.objectContaining({ kind: 'profile' })
    );
  });

  it('surfaces profile context and explicit entity ids from tool events', () => {
    const targets = deriveChatRailContextTargets({
      messages: [
        {
          id: 'msg-2',
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'proposeProfileEdit',
              toolCallId: 'tool-1',
              state: 'output-available',
              input: {
                releaseId: 'rel_2',
                releaseTitle: 'The Deep End',
              },
              output: { success: true },
            },
          ],
        },
      ],
      profile: { id: 'profile-1', label: 'Tim White' },
    });

    expect(targets).toEqual([
      expect.objectContaining({
        kind: 'profile',
        id: 'profile-1',
        source: 'tool',
        toolCallId: 'tool-1',
      }),
      expect.objectContaining({
        kind: 'release',
        id: 'rel_2',
        label: 'The Deep End',
        source: 'tool',
        toolCallId: 'tool-1',
      }),
    ]);
  });
});
