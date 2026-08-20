import { describe, expect, it } from 'vitest';
import {
  FEATURE_INTRO_MAX_WHATS_NEW_ROWS,
  FEATURE_INTRO_STORAGE,
  type FeatureIntroBullet,
  type FeatureIntroCatalog,
  type FeatureIntroHighlight,
  isFeatureIntroDismissed,
  resolveFeatureIntroPresentation,
  visibleWhatsNewRows,
} from './feature-intro-contract';

const highlight: FeatureIntroHighlight = {
  id: 'catalog-in-chat',
  title: 'Your Catalog Is Already In Chat',
  oneLine: 'Ask about a release, a show, or the next move.',
  ctaTitle: 'Ask Something',
};

const fourBullets: FeatureIntroBullet[] = [
  { id: 'one', text: 'Ask Jovie to plan the next release.', accent: 'accent' },
  { id: 'two', text: 'Library stays nearby.', accent: 'blue' },
  {
    id: 'three',
    text: 'Profile and billing stay in Settings.',
    accent: 'orange',
  },
  { id: 'four', text: 'Canceled sign-in is recoverable.', accent: 'accent' },
];

describe('resolveFeatureIntroPresentation', () => {
  it('prefers highlight over what’s new until that highlight is dismissed', () => {
    const catalog: FeatureIntroCatalog = {
      highlight,
      whatsNewID: 'wave-1',
      whatsNewItems: fourBullets.slice(0, 2),
    };

    expect(
      resolveFeatureIntroPresentation({
        catalog,
        dismissedHighlightID: null,
        dismissedWhatsNewID: null,
      })
    ).toEqual({ kind: 'highlight', highlight });

    const afterHighlight = resolveFeatureIntroPresentation({
      catalog,
      dismissedHighlightID: highlight.id,
      dismissedWhatsNewID: null,
    });
    expect(afterHighlight?.kind).toBe('whatsNew');
    if (afterHighlight?.kind !== 'whatsNew') {
      throw new Error('expected what’s new after highlight dismiss');
    }
    expect(afterHighlight.id).toBe('wave-1');
    expect(afterHighlight.rows).toEqual(
      fourBullets.slice(0, 2).map(bullet => ({ kind: 'bullet', bullet }))
    );
  });

  it('uses what’s new when the catalog has no highlight', () => {
    const catalog: FeatureIntroCatalog = {
      highlight: null,
      whatsNewID: 'wave-1',
      whatsNewItems: fourBullets.slice(0, 2),
    };

    const presentation = resolveFeatureIntroPresentation({
      catalog,
      dismissedHighlightID: null,
      dismissedWhatsNewID: null,
    });
    expect(presentation?.kind).toBe('whatsNew');
    if (presentation?.kind !== 'whatsNew') {
      throw new Error('expected what’s new');
    }
    expect(presentation.id).toBe('wave-1');
  });

  it('hides the card after the current highlight and what’s new ids are dismissed', () => {
    const catalog: FeatureIntroCatalog = {
      highlight,
      whatsNewID: 'wave-1',
      whatsNewItems: fourBullets.slice(0, 2),
    };

    expect(
      resolveFeatureIntroPresentation({
        catalog,
        dismissedHighlightID: highlight.id,
        dismissedWhatsNewID: 'wave-1',
      })
    ).toBeNull();
    expect(isFeatureIntroDismissed(highlight.id, highlight.id)).toBe(true);
    expect(isFeatureIntroDismissed(highlight.id, 'other')).toBe(false);
    expect(FEATURE_INTRO_STORAGE.dismissedHighlightIDKey).toBe(
      'jovie.featureIntro.dismissedHighlightID'
    );
    expect(FEATURE_INTRO_STORAGE.dismissedWhatsNewIDKey).toBe(
      'jovie.featureIntro.dismissedWhatsNewID'
    );
  });

  it('caps what’s new at three rows and uses And more when there are more than three items', () => {
    const overflow = visibleWhatsNewRows(fourBullets);
    expect(overflow).toHaveLength(FEATURE_INTRO_MAX_WHATS_NEW_ROWS);
    expect(overflow[0]).toEqual({ kind: 'bullet', bullet: fourBullets[0] });
    expect(overflow[1]).toEqual({ kind: 'bullet', bullet: fourBullets[1] });
    expect(overflow[2]).toEqual({ kind: 'andMore' });

    const three = visibleWhatsNewRows(fourBullets.slice(0, 3));
    expect(three).toEqual(
      fourBullets.slice(0, 3).map(bullet => ({ kind: 'bullet', bullet }))
    );

    const two = visibleWhatsNewRows(fourBullets.slice(0, 2));
    expect(two).toEqual(
      fourBullets.slice(0, 2).map(bullet => ({ kind: 'bullet', bullet }))
    );
  });
});
