import { describe, expect, it } from 'vitest';
import {
  getLibraryLifecycleOwnerKind,
  resolveLibraryRemovalPolicy,
} from '@/lib/library/lifecycle-policy';

describe('Library lifecycle policy (JOV-3374)', () => {
  it.each([
    ['ingested', { isIngested: true }],
    ['isrc', { hasIsrc: true }],
    ['published', { hasBeenPublished: true }],
    ['analytics', { hasAnalytics: true }],
  ] as const)('archives durable %s evidence', (reason, evidence) => {
    expect(
      resolveLibraryRemovalPolicy({
        itemKind: 'release',
        isDraftOrNeverPublished: true,
        ...evidence,
      })
    ).toEqual({ mode: 'archive', reason });
  });

  it('allows deletion only when draft/never-published eligibility is explicit', () => {
    expect(
      resolveLibraryRemovalPolicy({
        itemKind: 'release',
        isDraftOrNeverPublished: true,
      })
    ).toEqual({ mode: 'delete', reason: null });

    expect(
      resolveLibraryRemovalPolicy({
        itemKind: 'release',
        isDraftOrNeverPublished: false,
      })
    ).toEqual({
      mode: 'archive',
      reason: 'delete_eligibility_unproven',
    });
  });

  it.each([
    'image',
    'video',
    'audio',
  ] as const)('keeps %s on the parent release lifecycle until it has an independent identity', itemKind => {
    expect(getLibraryLifecycleOwnerKind(itemKind)).toBe('release');
  });

  it('does not invent a release owner for independent tracks or merch', () => {
    expect(getLibraryLifecycleOwnerKind('track')).toBe('track');
    expect(getLibraryLifecycleOwnerKind('merch')).toBe('merch');
  });
});
