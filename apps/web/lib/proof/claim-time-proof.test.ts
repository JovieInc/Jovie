import { describe, expect, it } from 'vitest';
import {
  claimTimeProofFindings,
  isAdmissibleComputedFact,
  resolveComputedProofSlot,
} from './claim-time-proof';

describe('claim-time computed proof', () => {
  it('drops zero, absent and placeholder facts', () => {
    expect(isAdmissibleComputedFact({ label: 'Tracks', value: '42' })).toBe(
      true
    );
    expect(
      isAdmissibleComputedFact({ label: 'Collisions', value: '2 to review' })
    ).toBe(true);
    for (const value of [
      '0 open',
      '0',
      'Not connected',
      'No attested files live',
      'none',
      '',
      '--',
    ]) {
      expect(isAdmissibleComputedFact({ label: 'x', value }), value).toBe(
        false
      );
    }
  });

  it('keeps only completed, non-empty steps with real facts, in step order', () => {
    const findings = claimTimeProofFindings({
      assemble_profile: {
        id: 'assemble_profile',
        status: 'completed',
        artifact: {
          title: 'Profile assembly',
          summary: 'Assembled 2 sections.',
          facts: [
            { label: 'Tracks', value: '12' },
            { label: 'Photo', value: 'On file' },
          ],
        },
      },
      surface_library_opportunities: {
        id: 'surface_library_opportunities',
        status: 'completed',
        artifact: {
          title: 'Work opportunities',
          summary: 'Ready.',
          facts: [
            { label: 'Repair queue', value: '0 open' },
            { label: 'Stats', value: 'Not connected' },
          ],
        },
      },
      research_artist: {
        id: 'research_artist',
        status: 'completed',
        artifact: {
          title: 'Artist research',
          summary: 'Found 1 verified signal.',
          facts: [{ label: 'Spotify', value: 'artist/abc' }],
        },
      },
      generate_smart_link: { id: 'generate_smart_link', status: 'running' },
    });
    expect(findings.map(finding => finding.slot)).toEqual([
      'presence-signals',
      'assembled-profile',
    ]);
    expect(findings[1]?.facts).toHaveLength(2);
  });

  it('hides a slot with no finding instead of showing a placeholder', () => {
    expect(
      resolveComputedProofSlot('live-profile-url', {
        generate_smart_link: {
          id: 'generate_smart_link',
          status: 'completed',
          artifact: {
            title: 'Smart link',
            summary: 'Need a claimed handle.',
            facts: [],
            empty: true,
          },
        },
      })
    ).toBeNull();
  });
});
