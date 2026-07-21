import { describe, expect, it } from 'vitest';
import {
  buildAuthorityPageDraft,
  buildAuthorityPageDrafts,
} from './wiki-page-draft';

const TIM_CONTEXT = {
  artistName: 'Tim White',
  aliases: ['T. White'],
  genres: ['progressive house', 'trance'],
  jovieUsername: 'tim',
  releases: [
    { title: 'Sample Release', year: '2019', role: 'Producer' },
  ],
  collabs: [
    {
      name: 'Cosmic Gate',
      context: 'Associated artists list',
      unlinkedMention: true,
      sourceUrl: 'https://edm.fandom.com/wiki/Cosmic_Gate',
    },
  ],
  confirmedPress: [
    {
      title: 'Young adults cool with influencers pushing products, not politics',
      outlet: 'NBCLX',
      url: 'https://www.lx.com/politics/example/15880/',
      confirmed: true,
    },
  ],
} as const;

describe('buildAuthorityPageDraft', () => {
  it('builds a Fandom stub with collab evidence and no fabricated facts', () => {
    const draft = buildAuthorityPageDraft('fandom', TIM_CONTEXT);

    expect(draft.platform).toBe('fandom');
    expect(draft.humanGateRequired).toBe(false);
    expect(draft.publishGate).toBe('agent_assisted');
    expect(draft.title).toBe('Tim White');
    expect(draft.bodyMarkdown).toContain('Tim White');
    expect(draft.bodyMarkdown).toContain('Cosmic Gate');
    expect(draft.bodyMarkdown).toContain('unlinked plain-text mention');
    expect(draft.bodyMarkdown).toContain('Sample Release');
    expect(draft.bodyMarkdown).not.toContain('Grammy');
    expect(draft.createUrl).toContain('edm.fandom.com');
    expect(draft.sources).toContain(
      'https://edm.fandom.com/wiki/Cosmic_Gate'
    );
  });

  it('builds a Genius draft with sources section', () => {
    const draft = buildAuthorityPageDraft('genius', TIM_CONTEXT);

    expect(draft.platformLabel).toBe('Genius');
    expect(draft.bodyMarkdown).toContain('## Sources');
    expect(draft.bodyMarkdown).toContain('NBCLX');
    expect(draft.humanGateRequired).toBe(false);
  });

  it('marks Wikipedia drafts as human-gated', () => {
    const draft = buildAuthorityPageDraft('wikipedia', TIM_CONTEXT);

    expect(draft.humanGateRequired).toBe(true);
    expect(draft.publishGate).toBe('human_only');
    expect(draft.bodyMarkdown).toContain('HUMAN GATE');
    expect(draft.checklist.some(item => /human review/i.test(item))).toBe(
      true
    );
  });

  it('throws when artist name is empty', () => {
    expect(() =>
      buildAuthorityPageDraft('genius', { artistName: '   ' })
    ).toThrow(/artistName/i);
  });

  it('builds multiple platform drafts in order', () => {
    const drafts = buildAuthorityPageDrafts(
      ['fandom', 'genius', 'wikipedia'],
      TIM_CONTEXT
    );
    expect(drafts.map(d => d.platform)).toEqual([
      'fandom',
      'genius',
      'wikipedia',
    ]);
  });

  it('omits unconfirmed press from the draft body', () => {
    const draft = buildAuthorityPageDraft('genius', {
      artistName: 'Tim White',
      confirmedPress: [
        {
          title: 'Rumor post',
          confirmed: false,
          url: 'https://example.com/rumor',
        },
        {
          title: 'Real interview',
          confirmed: true,
          outlet: 'Billboard',
          url: 'https://example.com/real',
        },
      ],
    });

    expect(draft.bodyMarkdown).toContain('Real interview');
    expect(draft.bodyMarkdown).not.toContain('Rumor post');
    expect(draft.sources).toEqual(['https://example.com/real']);
  });
});
