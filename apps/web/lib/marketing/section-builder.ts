import type { MarketingSectionEntry } from '@/data/marketingSectionRegistry';

export const MARKETING_LAYOUT_DRAFT_VERSION = 2;

export interface MarketingPageDraft {
  readonly page: string;
  readonly sectionIds: readonly string[];
}

export interface MarketingLayoutDraft {
  readonly version: number;
  readonly pages: readonly MarketingPageDraft[];
}

interface MarketingPageLayoutPromptInput {
  readonly page: string;
  readonly sections: readonly MarketingSectionEntry[];
  readonly includeDesignGuidance: boolean;
}

interface MarketingPageLayoutCopyInput {
  readonly page: string;
  readonly sections: readonly MarketingSectionEntry[];
}

function uniqueKnownSectionIds(
  sectionIds: readonly string[],
  knownSectionIds: ReadonlySet<string>
): string[] {
  const seen = new Set<string>();

  return sectionIds.filter(sectionId => {
    if (!knownSectionIds.has(sectionId) || seen.has(sectionId)) {
      return false;
    }

    seen.add(sectionId);
    return true;
  });
}

function updatePageDraft(
  draft: MarketingLayoutDraft,
  page: string,
  update: (sectionIds: readonly string[]) => readonly string[]
): MarketingLayoutDraft {
  return {
    ...draft,
    pages: draft.pages.map(pageDraft =>
      pageDraft.page === page
        ? { ...pageDraft, sectionIds: update(pageDraft.sectionIds) }
        : pageDraft
    ),
  };
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

export function createMarketingLayoutDraft(
  sections: readonly MarketingSectionEntry[],
  pages: readonly string[]
): MarketingLayoutDraft {
  return {
    version: MARKETING_LAYOUT_DRAFT_VERSION,
    pages: pages.map(page => ({
      page,
      sectionIds: sections
        .filter(section => section.currentPages.includes(page))
        .map(section => section.id),
    })),
  };
}

export function parseMarketingLayoutDraft(
  raw: string | null,
  sections: readonly MarketingSectionEntry[],
  pages: readonly string[]
): MarketingLayoutDraft {
  const seedDraft = createMarketingLayoutDraft(sections, pages);

  if (!raw) {
    return seedDraft;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MarketingLayoutDraft>;

    if (
      parsed.version !== MARKETING_LAYOUT_DRAFT_VERSION ||
      !Array.isArray(parsed.pages)
    ) {
      return seedDraft;
    }

    const knownSectionIds = new Set(sections.map(section => section.id));
    const parsedPages = new Map(
      parsed.pages
        .filter(
          (pageDraft): pageDraft is MarketingPageDraft =>
            typeof pageDraft?.page === 'string' &&
            Array.isArray(pageDraft.sectionIds)
        )
        .map(pageDraft => [pageDraft.page, pageDraft])
    );

    return {
      version: MARKETING_LAYOUT_DRAFT_VERSION,
      pages: seedDraft.pages.map(seedPage => {
        const storedPage = parsedPages.get(seedPage.page);
        if (!storedPage) {
          return seedPage;
        }

        return {
          page: seedPage.page,
          sectionIds: uniqueKnownSectionIds(
            storedPage.sectionIds,
            knownSectionIds
          ),
        };
      }),
    };
  } catch {
    return seedDraft;
  }
}

export function getMarketingPageDraft(
  draft: MarketingLayoutDraft,
  page: string
): MarketingPageDraft {
  return (
    draft.pages.find(pageDraft => pageDraft.page === page) ?? {
      page,
      sectionIds: [],
    }
  );
}

export function getMarketingDraftSections(
  draft: MarketingLayoutDraft,
  page: string,
  sections: readonly MarketingSectionEntry[]
): MarketingSectionEntry[] {
  const sectionsById = new Map(sections.map(section => [section.id, section]));
  return getMarketingPageDraft(draft, page).sectionIds.flatMap(sectionId => {
    const section = sectionsById.get(sectionId);
    return section ? [section] : [];
  });
}

export function addSectionToPageDraft(
  draft: MarketingLayoutDraft,
  page: string,
  sectionId: string,
  insertIndex?: number
): MarketingLayoutDraft {
  return updatePageDraft(draft, page, sectionIds => {
    const withoutSection = sectionIds.filter(id => id !== sectionId);
    const targetIndex = clampIndex(
      insertIndex ?? withoutSection.length,
      withoutSection.length
    );

    return [
      ...withoutSection.slice(0, targetIndex),
      sectionId,
      ...withoutSection.slice(targetIndex),
    ];
  });
}

export function removeSectionFromPageDraft(
  draft: MarketingLayoutDraft,
  page: string,
  sectionId: string
): MarketingLayoutDraft {
  return updatePageDraft(draft, page, sectionIds =>
    sectionIds.filter(id => id !== sectionId)
  );
}

export function moveSectionInPageDraft(
  draft: MarketingLayoutDraft,
  page: string,
  fromIndex: number,
  toIndex: number
): MarketingLayoutDraft {
  return updatePageDraft(draft, page, sectionIds => {
    if (
      fromIndex < 0 ||
      fromIndex >= sectionIds.length ||
      toIndex < 0 ||
      toIndex >= sectionIds.length ||
      fromIndex === toIndex
    ) {
      return sectionIds;
    }

    const nextSectionIds = [...sectionIds];
    const [movedSectionId] = nextSectionIds.splice(fromIndex, 1);
    if (!movedSectionId) {
      return sectionIds;
    }

    nextSectionIds.splice(toIndex, 0, movedSectionId);
    return nextSectionIds;
  });
}

export function moveSectionByOffset(
  draft: MarketingLayoutDraft,
  page: string,
  sectionId: string,
  offset: -1 | 1
): MarketingLayoutDraft {
  const pageDraft = getMarketingPageDraft(draft, page);
  const fromIndex = pageDraft.sectionIds.indexOf(sectionId);
  if (fromIndex === -1) {
    return draft;
  }

  return moveSectionInPageDraft(
    draft,
    page,
    fromIndex,
    clampIndex(fromIndex + offset, pageDraft.sectionIds.length - 1)
  );
}

export function moveSectionBefore(
  draft: MarketingLayoutDraft,
  page: string,
  sectionId: string,
  beforeSectionId: string
): MarketingLayoutDraft {
  const pageDraft = getMarketingPageDraft(draft, page);
  const fromIndex = pageDraft.sectionIds.indexOf(sectionId);
  const toIndex = pageDraft.sectionIds.indexOf(beforeSectionId);
  const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;

  return moveSectionInPageDraft(draft, page, fromIndex, adjustedToIndex);
}

export function buildMarketingPageLayoutCopy({
  page,
  sections,
}: MarketingPageLayoutCopyInput): string {
  return JSON.stringify(
    {
      page,
      sectionCount: sections.length,
      sections: sections.map((section, index) => ({
        order: index + 1,
        id: section.id,
        label: section.label,
        family: section.family,
        status: section.status,
        testId: section.testId ?? null,
        preview: {
          kind: section.preview.kind,
          headline: section.preview.headline,
          body: section.preview.body ?? null,
        },
        copyVariants: section.copyVariants.map(variant => ({
          id: variant.id,
          label: variant.label,
          headline: variant.headline,
          body: variant.body ?? null,
        })),
        isImageReference: section.id.startsWith('artifact:'),
      })),
    },
    null,
    2
  );
}

export function buildMarketingPageLayoutPrompt({
  page,
  sections,
  includeDesignGuidance,
}: MarketingPageLayoutPromptInput): string {
  return [
    `Please update the ${page} marketing page to match this draft landing page layout.`,
    '',
    'Implementation requirements:',
    '- Use the ordered section ids below as the source of truth for page composition.',
    '- Reuse existing mapped section components where possible and keep fallback sketches out of production routes.',
    '- For any section id beginning with artifact:, treat it as a local image reference from Design Studio. I will attach or paste the corresponding section screenshot/art image with this prompt.',
    '- Keep marketing routes fully static and do not add database, admin, or writable persistence dependencies.',
    '- Keep the locked final CTA visually unchanged if it appears in this layout.',
    includeDesignGuidance
      ? '- Preserve existing Jovie colors, typography direction, and design-system guardrails while adapting the layout.'
      : '- The layout may explore beyond current section styling, but keep product claims truthful and implementation-ready.',
    '- Use browser QA and screenshots to compare the implemented page against the attached references. Iterate until the built page reaches close visual parity while still respecting the design system.',
    '- Before marking done, verify the route renders without critical console errors, no document-level horizontal overflow, and no obvious mismatch against the reference images.',
    '',
    'Active page layout:',
    '```json',
    buildMarketingPageLayoutCopy({ page, sections }),
    '```',
  ].join('\n');
}
