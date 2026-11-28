import { describe, expect, it } from 'vitest';
import {
  getSidebarThreadAccessibleStatus,
  getSidebarThreadStatus,
  isTimestampAfter,
} from './sidebar-thread-status';

describe('sidebar-thread-status', () => {
  it('maps turn statuses onto running, errored, and complete', () => {
    expect(getSidebarThreadStatus(null)).toBe('complete');
    expect(getSidebarThreadStatus('streaming')).toBe('running');
    expect(getSidebarThreadStatus('failed_network')).toBe('errored');
    expect(getSidebarThreadStatus('completed')).toBe('complete');
  });

  it('names only decision-affecting accessible status cues', () => {
    expect(getSidebarThreadAccessibleStatus('running', false)).toBe('Running');
    expect(getSidebarThreadAccessibleStatus('errored', false)).toBe('Error');
    expect(getSidebarThreadAccessibleStatus('complete', true)).toBe('Unread');
    expect(getSidebarThreadAccessibleStatus('complete', false)).toBeNull();
  });

  it('compares valid and fallback timestamps without marking missing candidates unread', () => {
    expect(isTimestampAfter(undefined, undefined)).toBe(false);
    expect(isTimestampAfter('2026-05-12T00:00:00.000Z', undefined)).toBe(true);
    expect(
      isTimestampAfter('2026-05-12T00:00:00.000Z', '2026-05-13T00:00:00.000Z')
    ).toBe(false);
    expect(isTimestampAfter('zeta', 'alpha')).toBe(true);
  });
});
