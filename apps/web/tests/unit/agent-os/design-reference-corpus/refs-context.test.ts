import { describe, expect, it } from 'vitest';

import {
  createDesignReferenceCorpus,
  ingestDesignReference,
  recordFounderReferenceDecision,
} from '@/lib/agent-os/design-reference-corpus/corpus';
import {
  type ArtDirection,
  activeDirectionFor,
  buildDesignRefContext,
  rankReferencesForTask,
} from '@/lib/agent-os/design-reference-corpus/refs-context';
import type { DesignReference } from '@/lib/agent-os/design-reference-corpus/types';

const T0 = '2026-10-03T00:00:00.000Z';

function reference(
  id: string,
  surfaces: string[],
  technique: string[] = []
): DesignReference {
  return {
    id,
    source: {
      kind: 'live-page',
      title: `Site ${id}`,
      url: `https://example.com/${id}`,
      author: null,
      publishedAt: null,
      capturedAt: T0,
    },
    pageType: 'landing',
    sections: [
      {
        id: `${id}-hero`,
        designVariable: 'hero',
        pageType: 'landing',
        summary: `${id} hero`,
        excerpt: null,
        mediaRef: null,
      },
    ],
    notes: null,
    ingestedAt: T0,
    tags: { surfaces, mood: [], technique, palette: [], motion: [] },
  };
}

function direction(overrides: Partial<ArtDirection> = {}): ArtDirection {
  return {
    schema: 'jovie.art-direction/v1',
    id: 'one-light',
    title: 'One Light',
    status: 'active',
    surfaces: ['homepage'],
    thesis: 'One light finds one focal element.',
    referenceIds: ['lit'],
    principles: {
      light: ['one source'],
      composition: ['one focal element'],
      type: ['one dominant step'],
      motion: ['the light moves'],
      color: ['one hue'],
    },
    tokenMap: [{ principle: 'near-black', jovie: '--color-bg-surface-0' }],
    antiGoals: ['two hues'],
    decidedBy: 'test',
    updatedAt: T0,
    ...overrides,
  };
}

function corpus() {
  let value = createDesignReferenceCorpus(T0);
  for (const ref of [
    reference('lit', ['homepage']),
    reference('composer', ['golden-path'], ['single-input']),
    reference('certified', ['homepage']),
    reference('rejected', ['homepage', 'golden-path'], ['single-input']),
  ]) {
    value = ingestDesignReference(value, ref, T0);
  }
  const decide = (id: string, decision: 'approved' | 'rejected') => {
    value = recordFounderReferenceDecision(value, id, {
      id: `decision-${id}`,
      decision,
      reviewer: 'tim',
      rationale: 'test',
      decidedAt: T0,
    });
  };
  decide('certified', 'approved');
  decide('rejected', 'rejected');
  return value;
}

describe('rankReferencesForTask', () => {
  it('puts the direction refs first, then certified, and never returns rejected', () => {
    const ranked = rankReferencesForTask(
      corpus(),
      { surface: 'homepage' },
      direction()
    ).map(entry => entry.record.reference.id);
    expect(ranked).toEqual(['lit', 'certified']);
  });

  it('matches free terms across tags and drops irrelevant refs', () => {
    const ranked = rankReferencesForTask(
      corpus(),
      { surface: 'golden-path', terms: ['single-input'] },
      null
    ).map(entry => entry.record.reference.id);
    expect(ranked).toEqual(['composer']);
  });
});

describe('buildDesignRefContext', () => {
  it('builds a prompt block with the active direction and the anti-copy rule', () => {
    const context = buildDesignRefContext(corpus(), [direction()], {
      surface: 'homepage',
    });
    expect(context.direction?.id).toBe('one-light');
    expect(context.promptBlock).toContain('Active direction: One Light');
    expect(context.promptBlock).toContain('--color-bg-surface-0');
    expect(context.promptBlock).toContain('never layouts');
    expect(context.promptBlock).not.toContain('rejected');
  });

  it('offers proposed directions as candidates when none is active', () => {
    const context = buildDesignRefContext(
      corpus(),
      [direction({ status: 'proposed' })],
      { surface: 'homepage' }
    );
    expect(context.direction).toBeNull();
    expect(context.candidates.map(entry => entry.id)).toEqual(['one-light']);
    expect(context.promptBlock).toContain('No active direction yet');
  });
});

describe('activeDirectionFor', () => {
  it('returns the active direction for a surface, ignoring case and proposals', () => {
    const active = direction({ surfaces: ['Homepage'] });
    const proposed = direction({ id: 'other', status: 'proposed' });
    expect(activeDirectionFor([proposed, active], 'homepage')?.id).toBe(
      'one-light'
    );
    expect(activeDirectionFor([proposed], 'homepage')).toBeNull();
    expect(activeDirectionFor([active], 'golden-path')).toBeNull();
  });
});
