import { describe, expect, it } from 'vitest';

import {
  canTransitionMediaLifecycle,
  isMediaLifecycleState,
  isMediaLifecycleTerminal,
  MEDIA_LIFECYCLE_STATES,
} from './lifecycle';

describe('media lifecycle contract', () => {
  it('defines every required lifecycle state', () => {
    expect(MEDIA_LIFECYCLE_STATES).toEqual([
      'uploading',
      'processing',
      'ready',
      'failed',
      'cancelled',
    ]);
    expect(isMediaLifecycleState('processing')).toBe(true);
    expect(isMediaLifecycleState('queued')).toBe(false);
  });

  it('allows only forward progress or terminal cancellation/failure', () => {
    expect(canTransitionMediaLifecycle('uploading', 'processing')).toBe(true);
    expect(canTransitionMediaLifecycle('uploading', 'ready')).toBe(true);
    expect(canTransitionMediaLifecycle('processing', 'ready')).toBe(true);
    expect(canTransitionMediaLifecycle('processing', 'failed')).toBe(true);
    expect(canTransitionMediaLifecycle('uploading', 'cancelled')).toBe(true);
    expect(canTransitionMediaLifecycle('ready', 'processing')).toBe(false);
    expect(canTransitionMediaLifecycle('failed', 'ready')).toBe(false);
    expect(canTransitionMediaLifecycle('cancelled', 'uploading')).toBe(false);
  });

  it('treats ready, failed, and cancelled as terminal', () => {
    expect(isMediaLifecycleTerminal('ready')).toBe(true);
    expect(isMediaLifecycleTerminal('failed')).toBe(true);
    expect(isMediaLifecycleTerminal('cancelled')).toBe(true);
    expect(isMediaLifecycleTerminal('uploading')).toBe(false);
    expect(isMediaLifecycleTerminal('processing')).toBe(false);
  });
});
