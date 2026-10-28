import { describe, expect, it } from 'vitest';
import {
  parseYouTubeCandidate,
  pickOwnedCandidateChannel,
  readYouTubeCandidateFromSettings,
  resolveYouTubeVerificationState,
} from './youtube-verification';

const candidate = {
  channelId: 'UCabcdefghijklmnopqrstuv',
  title: 'Lena Hart',
  url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
  cadenceQualified: true as const,
};

describe('YouTube verification states', () => {
  it('is none without a candidate, unverified without an ownership match, verified with one', () => {
    expect(resolveYouTubeVerificationState(null, [candidate.channelId])).toBe(
      'none'
    );
    expect(resolveYouTubeVerificationState(candidate, [])).toBe('unverified');
    expect(
      resolveYouTubeVerificationState(candidate, ['UCsomeoneelse000000000000'])
    ).toBe('unverified');
    expect(
      resolveYouTubeVerificationState(candidate, [candidate.channelId])
    ).toBe('verified');
  });

  it('only accepts well-formed, https youtube.com, cadence-qualified candidates', () => {
    expect(parseYouTubeCandidate(candidate)).toEqual(candidate);
    expect(
      parseYouTubeCandidate({ ...candidate, cadenceQualified: false })
    ).toBe(null);
    expect(parseYouTubeCandidate({ ...candidate, channelId: 'nope' })).toBe(
      null
    );
    expect(
      parseYouTubeCandidate({ ...candidate, url: 'https://evil.example/x' })
    ).toBe(null);
    expect(
      parseYouTubeCandidate({ ...candidate, url: 'http://youtube.com/x' })
    ).toBe(null);
    expect(parseYouTubeCandidate('UCabcdefghijklmnopqrstuv')).toBe(null);
  });

  it('reads the candidate from profile settings and tolerates junk', () => {
    expect(
      readYouTubeCandidateFromSettings({
        onboarding: { youtubeCandidate: candidate },
      })
    ).toEqual(candidate);
    expect(readYouTubeCandidateFromSettings(null)).toBe(null);
    expect(readYouTubeCandidateFromSettings({ onboarding: [] })).toBe(null);
  });

  it('picks the owned channel matching the candidate, else null', () => {
    const owned = [
      { id: 'UCother0000000000000000a' },
      { id: candidate.channelId },
    ];
    expect(pickOwnedCandidateChannel(owned, candidate)?.id).toBe(
      candidate.channelId
    );
    expect(pickOwnedCandidateChannel([owned[0]!], candidate)).toBe(null);
    expect(pickOwnedCandidateChannel(owned, null)).toBe(null);
  });
});
