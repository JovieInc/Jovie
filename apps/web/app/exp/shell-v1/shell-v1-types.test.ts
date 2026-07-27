import { describe, expect, it } from 'vitest';
import { parseCanvasViewParam } from './shell-v1-types';

describe('parseCanvasViewParam', () => {
  it.each([
    null,
    'demo',
    'missing',
  ])('selects the shared chat for the default view value %s', value => {
    expect(parseCanvasViewParam(value)).toBe('demo');
  });

  it.each([
    'releases',
    'tracks',
    'tasks',
    'library',
    'lyrics',
    'settings',
    'thread',
    'onboarding',
  ])('preserves the broad shell view %s', value => {
    expect(parseCanvasViewParam(value)).toBe(value);
  });
});
