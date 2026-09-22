import { describe, expect, it } from 'vitest';

import type { ForeignContentCase } from './foreign-content';
import {
  buildRemovalRequestDraft,
  playbookEntryFor,
  REMOVAL_PLAYBOOK,
} from './foreign-content-playbook';

const CASE: ForeignContentCase = {
  caseKey: 'UCvP_6uenaAVETmO1FRJ25NA:HKJoClnIabU',
  videoId: 'HKJoClnIabU',
  title: 'Tim White - Pray On My Child',
  owningChannelId: 'UCvP_6uenaAVETmO1FRJ25NA',
  owningChannelTitle: 'TimWhiteVEVO',
  classification: 'foreign_upload_on_linked_channel',
  status: 'needs_owner_review',
  catalogConflict: false,
  evidence:
    '"Tim White - Pray On My Child" (HKJoClnIabU) is uploaded by linked channel TimWhiteVEVO (UCvP_6uenaAVETmO1FRJ25NA), not by the artist\'s own channels.',
};

const CONTEXT = {
  artistName: 'Tim White',
  artistChannelUrl: 'https://www.youtube.com/@timwhite',
};

describe('REMOVAL_PLAYBOOK', () => {
  it('covers every classification', () => {
    expect(REMOVAL_PLAYBOOK.map(e => e.classification).sort()).toEqual(
      [
        'foreign_upload_on_linked_channel',
        'owned_unwanted',
        'wrong_release_attribution',
      ].sort()
    );
  });

  it('is guided-manual only today (no API-capable route)', () => {
    for (const entry of REMOVAL_PLAYBOOK) {
      expect(entry.apiCapableToday).toBe(false);
      expect(entry.referenceUrl).toMatch(/^https:\/\//);
      expect(entry.steps.length).toBeGreaterThan(0);
    }
  });
});

describe('buildRemovalRequestDraft', () => {
  it('prepares neutral owner review without asserting foreign ownership', () => {
    const draft = buildRemovalRequestDraft(CASE, CONTEXT);
    expect(draft.recipient).toContain('Channel owner review');
    expect(draft.requiresOwnerApproval).toBe(true);
    expect(draft.body).not.toContain('does not belong to me');
    expect(draft.subject).toContain('HKJoClnIabU');
    expect(draft.body).toContain('https://www.youtube.com/watch?v=HKJoClnIabU');
    expect(draft.body).toContain(CASE.evidence);
    expect(draft.body).toContain(CONTEXT.artistChannelUrl);
  });

  it('is deterministic for the same case and context', () => {
    expect(buildRemovalRequestDraft(CASE, CONTEXT)).toEqual(
      buildRemovalRequestDraft(CASE, CONTEXT)
    );
  });

  it('throws for a classification without a playbook entry', () => {
    expect(() => playbookEntryFor('nonexistent' as never)).toThrow(
      'No playbook entry'
    );
  });
});

describe('removal safety', () => {
  it('keeps every classification manual and forbids destructive or false-ownership guidance', () => {
    for (const entry of REMOVAL_PLAYBOOK) {
      const draft = buildRemovalRequestDraft(
        {
          ...CASE,
          classification: entry.classification,
          owningChannelTitle: null,
        },
        CONTEXT
      );
      expect(draft.body).not.toContain('does not belong to me');
      expect(draft.body).toContain('unknown');
      expect(draft.requiresOwnerApproval).toBe(true);
      expect(entry.steps.join(' ')).not.toMatch(/delete forever/i);
      expect(entry.steps.join(' ')).toContain(
        'Although this is my release, remove from channel.'
      );
      expect(entry.steps.join(' ')).toContain('verify every track');
      expect(entry.steps.join(' ')).toContain(
        'Only submit after the owner approves'
      );
    }
  });
  it('blocks conflicting catalog evidence in the draft', () => {
    const draft = buildRemovalRequestDraft(
      { ...CASE, catalogConflict: true },
      CONTEXT
    );
    expect(draft.body).toContain('STOP:');
    expect(draft.body).toContain('Reconcile that evidence');
  });
});
