import { describe, expect, it } from 'vitest';
import { releasePopoverStatus, releaseTrackCount } from './release-popover';

describe('release popover demo fields', () => {
  it('counts singles, EPs, and albums', () => {
    expect(releaseTrackCount('Single')).toBe(1);
    expect(releaseTrackCount('EP')).toBe(5);
    expect(releaseTrackCount('Album')).toBe(11);
  });

  it('prefers a live Spotify listing over pitch readiness', () => {
    expect(releasePopoverStatus('live', false)).toBe('Live');
    expect(releasePopoverStatus('pending', true)).toBe('Ready');
    expect(releasePopoverStatus('missing', false)).toBe('Draft');
  });
});
