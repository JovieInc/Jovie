import { describe, expect, it } from 'vitest';
import { COPY_FALLBACKS } from './copyFallbacks';

describe('missing customer data copy', () => {
  it('provides named resources and explicit missing dates or media without authoring placeholders', () => {
    expect(COPY_FALLBACKS).toMatchObject({
      release: 'Release',
      task: 'Task',
      conversation: 'Conversation',
      date: 'Date not set',
      audio: 'Audio unavailable',
    });
    for (const text of Object.values(COPY_FALLBACKS)) {
      expect(text).not.toMatch(/\b(?:TODO|TBD|Untitled|placeholder)\b/i);
    }
  });
});
