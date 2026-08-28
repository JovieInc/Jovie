import { describe, expect, it } from 'vitest';
import {
  evaluateDirectThumbnailMutation,
  NATIVE_YOUTUBE_EXPERIMENT_REQUIRED,
} from './thumbnail-mutation-policy';

describe('evaluateDirectThumbnailMutation', () => {
  it('deliberate red: never authorizes a direct YouTube thumbnail mutation', () => {
    expect(evaluateDirectThumbnailMutation()).toEqual({
      allowed: false,
      reason: NATIVE_YOUTUBE_EXPERIMENT_REQUIRED,
    });
  });
});
