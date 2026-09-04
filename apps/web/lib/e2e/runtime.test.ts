import { afterEach, describe, expect, it, vi } from 'vitest';
import { isVisualCaptureSyntheticAuthEnabled } from './runtime';

describe('e2e runtime', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('treats secretless visual capture as an explicit env gate', () => {
    expect(isVisualCaptureSyntheticAuthEnabled()).toBe(false);
    vi.stubEnv('E2E_VISUAL_CAPTURE_SYNTHETIC_AUTH', '1');
    expect(isVisualCaptureSyntheticAuthEnabled()).toBe(true);
  });
});
