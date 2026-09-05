import { describe, expect, it } from 'vitest';
import {
  evaluateAllReleasePitchRuleCases,
  evaluateReleasePitchRuleCase,
  gateReleasePitch,
  RELEASE_PITCH_RULE_CASE_IDS,
  RELEASE_PITCH_RULES,
} from '@/lib/services/pitch/pitch-rules';

describe('release pitch no-draft / no-invent gate', () => {
  it('encodes deliberate-red rule cases', () => {
    expect(RELEASE_PITCH_RULE_CASE_IDS.length).toBeGreaterThanOrEqual(2);
    for (const result of evaluateAllReleasePitchRuleCases()) {
      expect(result.passed, result.reason).toBe(true);
    }
    for (const id of RELEASE_PITCH_RULE_CASE_IDS) {
      expect(evaluateReleasePitchRuleCase(id).passed, id).toBe(true);
    }
  });

  it('holds the draft when the curator checklist is unresolved', () => {
    const gated = gateReleasePitch({
      checklist: {
        artistName: 'Luna Waves',
        title: 'Neon Reef',
        genres: ['dream pop'],
        releaseDate: '2026-06-19',
        targetPlaylists: null,
        whyText: null,
        instructions: null,
      },
      proposedDraft: {
        body: 'Listen https://open.spotify.com/track/inventedlisten',
      },
    });

    expect(gated.disposition).toBe('ask');
    expect(gated.drafted).toBe(false);
    expect(gated.body).toBeNull();
    expect(gated.firstMissing?.id).toBe('whyTwoSentences');
    expect(JSON.stringify(gated)).not.toContain('inventedlisten');
    expect(RELEASE_PITCH_RULES).toContain(
      'Do not draft until the curator checklist'
    );
  });

  it('omits invented listen URL, @handle, and private email', () => {
    const listen = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';
    const gated = gateReleasePitch({
      checklist: {
        artistName: 'Luna Waves',
        title: 'Neon Reef',
        genres: ['dream pop'],
        releaseDate: '2026-06-19',
        targetPlaylists: ['Pollen'],
        whyText: 'I wrote it after a night swim in Miami.',
        instructions: `Private link ${listen} belongs on Pollen.`,
      },
      proposedDraft: {
        body: `Listen ${listen} and https://open.spotify.com/track/inventedlisten. DM @curator_inbox or private@label-inbox.example.`,
      },
    });

    expect(gated.disposition).toBe('draft');
    expect(gated.body).toContain(listen);
    expect(gated.body).not.toContain('inventedlisten');
    expect(gated.body).not.toContain('@curator_inbox');
    expect(gated.body).not.toContain('private@label-inbox.example');
    expect(gated.omittedInvented).toEqual(
      expect.arrayContaining(['listenUrl', 'handle', 'email'])
    );
  });
});
