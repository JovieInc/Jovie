export type FeatureIntroAccent = 'accent' | 'blue' | 'orange';

export interface FeatureIntroHighlight {
  readonly id: string;
  readonly title: string;
  readonly oneLine: string;
  readonly ctaTitle: string;
}

export interface FeatureIntroBullet {
  readonly id: string;
  readonly text: string;
  readonly accent: FeatureIntroAccent;
}

export type FeatureIntroVisibleRow =
  | { readonly kind: 'bullet'; readonly bullet: FeatureIntroBullet }
  | { readonly kind: 'andMore' };

export interface FeatureIntroCatalog {
  readonly highlight: FeatureIntroHighlight | null;
  readonly whatsNewID: string;
  readonly whatsNewItems: readonly FeatureIntroBullet[];
}

export type FeatureIntroKind =
  | { readonly kind: 'highlight'; readonly highlight: FeatureIntroHighlight }
  | {
      readonly kind: 'whatsNew';
      readonly id: string;
      readonly rows: readonly FeatureIntroVisibleRow[];
    };

export const FEATURE_INTRO_STORAGE = {
  dismissedHighlightIDKey: 'jovie.featureIntro.dismissedHighlightID',
  dismissedWhatsNewIDKey: 'jovie.featureIntro.dismissedWhatsNewID',
} as const;

export const FEATURE_INTRO_MAX_WHATS_NEW_ROWS = 3;

export function visibleWhatsNewRows(
  items: readonly FeatureIntroBullet[]
): FeatureIntroVisibleRow[] {
  if (items.length <= FEATURE_INTRO_MAX_WHATS_NEW_ROWS) {
    return items.map(bullet => ({ kind: 'bullet', bullet }));
  }

  const kept = items.slice(0, FEATURE_INTRO_MAX_WHATS_NEW_ROWS - 1);
  return [
    ...kept.map(bullet => ({ kind: 'bullet' as const, bullet })),
    { kind: 'andMore' },
  ];
}

export function isFeatureIntroDismissed(
  id: string,
  dismissedID: string | null | undefined
): boolean {
  return Boolean(dismissedID) && dismissedID === id;
}

export function resolveFeatureIntroPresentation({
  catalog,
  dismissedHighlightID,
  dismissedWhatsNewID,
}: {
  readonly catalog: FeatureIntroCatalog;
  readonly dismissedHighlightID: string | null | undefined;
  readonly dismissedWhatsNewID: string | null | undefined;
}): FeatureIntroKind | null {
  if (
    catalog.highlight &&
    !isFeatureIntroDismissed(catalog.highlight.id, dismissedHighlightID)
  ) {
    return { kind: 'highlight', highlight: catalog.highlight };
  }

  if (
    catalog.whatsNewItems.length === 0 ||
    isFeatureIntroDismissed(catalog.whatsNewID, dismissedWhatsNewID)
  ) {
    return null;
  }

  return {
    kind: 'whatsNew',
    id: catalog.whatsNewID,
    rows: visibleWhatsNewRows(catalog.whatsNewItems),
  };
}

export function readFeatureIntroDismissal(key: string): string {
  try {
    return globalThis.localStorage?.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function writeFeatureIntroDismissal(key: string, id: string): void {
  try {
    globalThis.localStorage?.setItem(key, id);
  } catch {
    // Private mode / quota — dismiss still holds in memory for this session.
  }
}
