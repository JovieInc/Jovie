import { describe, expect, it } from 'vitest';

import {
  CHAT_STARTER_ACTION_ORDER,
  CHAT_STARTER_ACTIONS,
  starterActionToSuggestion,
} from '@/components/jovie/starter-actions';

describe('chat starter action catalog', () => {
  it('keeps the approved starter taxonomy canonical and ordered', () => {
    expect(CHAT_STARTER_ACTION_ORDER).toEqual([
      'plan-release',
      'generate-album-art',
      'build-artist-profile',
      'review-signals',
    ]);
    expect(
      CHAT_STARTER_ACTION_ORDER.map(id => CHAT_STARTER_ACTIONS[id].label)
    ).toEqual([
      'Plan a Release',
      'Generate Album Art',
      'Build Artist Profile',
      'Review Signals',
    ]);
  });

  it('derives quick-action vocabulary from the same catalog entries', () => {
    for (const id of CHAT_STARTER_ACTION_ORDER) {
      const action = CHAT_STARTER_ACTIONS[id];
      expect(starterActionToSuggestion(id)).toMatchObject({
        actionId: id,
        label: action.label,
        prompt: action.prompt,
        telemetryKey: action.telemetryKey,
      });
    }
  });
});
