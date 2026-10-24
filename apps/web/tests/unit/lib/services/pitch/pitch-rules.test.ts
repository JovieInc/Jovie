import { describe, expect, it } from 'vitest';
import type { PitchChecklistInput } from '@/lib/services/pitch/curator-checklist';
import {
  evaluateAllReleasePitchRuleCases,
  evaluateReleasePitchRuleCase,
  gateReleasePitch,
  RELEASE_PITCH_RULE_CASE_IDS,
  RELEASE_PITCH_RULES,
} from '@/lib/services/pitch/pitch-rules';

const LISTEN = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';
const INVENTED = 'https://open.spotify.com/track/inventedlisten';

const checklist = (
  over: Partial<PitchChecklistInput> = {}
): PitchChecklistInput => ({
  artistName: 'Luna Waves',
  title: 'Neon Reef',
  genres: ['dream pop'],
  releaseDate: '2026-06-19',
  targetPlaylists: ['Pollen'],
  whyText: 'I wrote it after a night swim in Miami.',
  instructions: `Private link ${LISTEN} belongs on Pollen.`,
  ...over,
});

const draftBody = (body: string, over: Partial<PitchChecklistInput> = {}) =>
  gateReleasePitch({ checklist: checklist(over), proposedDraft: { body } });

describe('gateReleasePitch: unresolved checklist', () => {
  it('holds the draft and asks for the first missing field', () => {
    const gated = gateReleasePitch({
      checklist: checklist({
        targetPlaylists: null,
        whyText: null,
        instructions: null,
      }),
      proposedDraft: {
        subject: 'Pitch',
        body: `Listen ${INVENTED} @curator_inbox`,
      },
    });
    expect(gated).toEqual({
      disposition: 'ask',
      drafted: false,
      draftable: false,
      firstMissing: expect.objectContaining({
        id: 'whyTwoSentences',
        status: 'unknown',
      }),
      subject: null,
      body: null,
      omittedInvented: [],
      reason:
        'Do not draft until the curator checklist is resolved. Ask for: 1–2 sentences on why this release exists.',
    });
  });

  it('asks for the listen link when none is supplied or marked unknown', () => {
    const gated = gateReleasePitch({
      checklist: checklist({ instructions: 'belongs on Pollen' }),
    });
    expect(gated.disposition).toBe('ask');
    expect(gated.firstMissing?.id).toBe('listenLink');
    expect(gated.reason).toBe(
      'Do not draft until the curator checklist is resolved. Ask for: Spotify or private listen link.'
    );
  });
});

describe('gateReleasePitch: resolved checklist', () => {
  it('drafts with no proposal and nothing omitted', () => {
    expect(gateReleasePitch({ checklist: checklist() })).toEqual({
      disposition: 'draft',
      drafted: true,
      draftable: true,
      firstMissing: null,
      subject: null,
      body: null,
      omittedInvented: [],
      reason: 'Curator checklist is resolved; draft may proceed',
    });
  });

  it('drafts when a missing field is explicitly marked UNKNOWN', () => {
    const gated = gateReleasePitch({
      checklist: checklist({
        instructions: 'UNKNOWN: listenLink. FFO Beach House.',
      }),
      proposedDraft: { body: `Listen ${INVENTED} now` },
    });
    expect(gated).toMatchObject({
      disposition: 'draft',
      draftable: true,
      firstMissing: expect.objectContaining({ id: 'listenLink' }),
      body: 'Listen now',
      omittedInvented: ['listenUrl'],
    });
  });

  it('keeps the supplied listen link and strips invented contacts', () => {
    const gated = draftBody(
      `Listen ${LISTEN} and ${INVENTED} DM @curator_inbox or private@label-inbox.example`
    );
    expect(gated.body).toBe(`Listen ${LISTEN} and DM or`);
    expect(gated.omittedInvented).toEqual(['listenUrl', 'handle', 'email']);
    expect(gated.reason).toBe(
      'Draft allowed; invented listen URL, @handle, or private email omitted'
    );
  });

  it('matches supplied contacts case-insensitively', () => {
    const gated = draftBody(`Listen ${LISTEN.toUpperCase()}`);
    expect(gated.body).toBe(`Listen ${LISTEN.toUpperCase()}`);
    expect(gated.omittedInvented).toEqual([]);
  });

  it('keeps handles and emails the artist supplied in the why text', () => {
    const gated = draftBody(
      'Follow @lunawaves or mail luna@waves.example now',
      {
        whyText: 'I wrote it at sea. Reach @lunawaves or luna@waves.example',
      }
    );
    expect(gated.body).toBe('Follow @lunawaves or mail luna@waves.example now');
    expect(gated.omittedInvented).toEqual([]);
  });

  it('does not report an email local part as an invented handle', () => {
    const gated = draftBody('Write private@label-inbox.example today');
    expect(gated.body).toBe('Write today');
    expect(gated.omittedInvented).toEqual(['email']);
  });

  it('reports each invented field kind once', () => {
    const gated = draftBody(
      `${INVENTED} https://evil.example/a @one @two x@a.example y@b.example`
    );
    expect(gated.body).toBe('');
    expect(gated.omittedInvented).toEqual(['listenUrl', 'handle', 'email']);
  });

  it('strips trailing punctuation from detected contacts', () => {
    const gated = draftBody(
      'DM @curator_inbox. Listen https://evil.example/x).'
    );
    expect(gated.body).toBe('DM . Listen ).');
    expect(gated.omittedInvented).toEqual(['listenUrl', 'handle']);
  });

  it('cleans the subject and drops it when nothing remains', () => {
    const cleaned = gateReleasePitch({
      checklist: checklist(),
      proposedDraft: { subject: 'Add  @curator_inbox  today', body: 'Hi' },
    });
    expect(cleaned.subject).toBe('Add today');
    expect(cleaned.body).toBe('Hi');
    const emptied = gateReleasePitch({
      checklist: checklist(),
      proposedDraft: { subject: '@curator_inbox', body: '' },
    });
    expect(emptied.subject).toBeNull();
    expect(emptied.body).toBeNull();
    expect(emptied.omittedInvented).toEqual(['handle']);
  });

  it('collapses whitespace left behind by removals', () => {
    expect(draftBody(`  Hello   ${INVENTED}   world  `).body).toBe(
      'Hello world'
    );
  });
});

describe('release pitch rule cases', () => {
  it('states the no-draft / no-invent rules', () => {
    expect(RELEASE_PITCH_RULES).toBe(
      'Do not draft until the curator checklist is resolved, or the artist explicitly marks a field UNKNOWN. Never invent a listen URL, @handle, or private email. Include the listen link only when supplied.'
    );
  });

  it('passes every registered rule case with its success reason', () => {
    expect(RELEASE_PITCH_RULE_CASE_IDS).toEqual([
      'unresolved-checklist-holds-draft',
      'invented-contact-refused',
    ]);
    expect(evaluateAllReleasePitchRuleCases()).toEqual([
      {
        id: 'unresolved-checklist-holds-draft',
        passed: true,
        reason:
          'Unresolved checklist holds the draft and does not invent contact fields',
      },
      {
        id: 'invented-contact-refused',
        passed: true,
        reason:
          'Invented listen URL, @handle, and private email are omitted; supplied listen URL is kept',
      },
    ]);
    expect(
      evaluateReleasePitchRuleCase('invented-contact-refused').passed
    ).toBe(true);
  });
});
