import { describe, expect, it } from 'vitest';
import {
  type AuthorityRead,
  initialCursors,
  interpretAuthorityRead,
  SHIPPING_SOURCE_SCHEMAS,
} from '@/lib/ovie/shipping-state';

describe('operational task titles from Linear slugs', () => {
  it('titles a task from the last issue-url segment when no title is present', () => {
    const read: AuthorityRead = {
      sourceId: 'symphony-task',
      status: 'ok',
      schema: SHIPPING_SOURCE_SCHEMAS['symphony-task'],
      payload: {
        running: [
          {
            issue: 'JOV-1',
            issue_url: 'https://linear.app/jovie/issue/JOV-1/fix-the-dock',
          },
        ],
      },
      truncated: false,
      sourceTimestamp: '2026-08-22T12:00:00.000Z',
      sourceRevision: 'rev-4',
      sequence: 4,
      eventId: 'symphony-task-4',
    };
    const cursor = initialCursors().get('symphony-task');
    if (cursor == null) {
      throw new Error('missing symphony-task cursor');
    }

    const { observation } = interpretAuthorityRead(
      read,
      cursor,
      '2026-08-22T12:00:01.000Z',
      '2026-08-22T12:00:01.000Z'
    );

    expect(observation.entities[0]?.operationalTask?.title).toBe(
      'Fix The Dock'
    );
    expect(observation.entities[0]?.operationalTask?.linearUrl).toBe(
      'https://linear.app/jovie/issue/JOV-1/fix-the-dock'
    );
  });
});
