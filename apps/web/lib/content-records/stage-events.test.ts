import { describe, expect, it } from 'vitest';
import {
  buildContentStageEvents,
  dataShare,
  editToLiveSeconds,
} from './stage-events';

const at = (s: string) => new Date(`2026-10-29T${s}Z`);

describe('content stage events', () => {
  const versions = [
    {
      id: 'v1',
      kind: 'site-chrome',
      recordKey: 'main',
      version: 1,
      author: 'summer',
      createdAt: at('10:00:00'),
    },
    {
      id: 'v2',
      kind: 'site-chrome',
      recordKey: 'main',
      version: 2,
      author: 'summer',
      createdAt: at('11:00:00'),
    },
  ];
  const events = [
    {
      id: 'e1',
      kind: 'site-chrome',
      recordKey: 'main',
      action: 'publish',
      toVersionId: 'v1',
      actor: 'summer',
      createdAt: at('10:00:03'),
    },
    {
      id: 'e2',
      kind: 'site-chrome',
      recordKey: 'main',
      action: 'rollback',
      toVersionId: 'v1',
      actor: 'tim',
      createdAt: at('12:00:00'),
    },
  ];

  it('emits edit and live stages keyed on kind/key@version', () => {
    const out = buildContentStageEvents(versions, events);
    expect(out.map(e => [e.entityId, e.stage, e.outcome])).toEqual([
      ['site-chrome/main@1', 'data-edit', 'advanced'],
      ['site-chrome/main@1', 'data-live', 'completed'],
      ['site-chrome/main@2', 'data-edit', 'open'],
    ]);
  });

  it('uses the first pointer move as edit-to-live and skips unpublished drafts', () => {
    expect(
      editToLiveSeconds(buildContentStageEvents(versions, events))
    ).toEqual([3]);
  });

  it('computes the data share of marketing changes', () => {
    expect(dataShare(3, 1)).toBe(0.75);
    expect(dataShare(0, 0)).toBeNull();
  });
});
