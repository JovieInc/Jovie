import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MarketingSectionsLabClient } from '@/app/exp/marketing-sections/MarketingSectionsLabClient';
import {
  MARKETING_SECTION_FAMILIES,
  MARKETING_SECTION_PAGES,
  MARKETING_SECTION_REGISTRY,
  MARKETING_SECTION_STATUSES,
} from '@/data/marketingSectionRegistry';
import {
  addSectionToPageDraft,
  buildMarketingPageLayoutCopy,
  buildMarketingPageLayoutPrompt,
  createMarketingLayoutDraft,
  getMarketingDraftSections,
  getMarketingPageDraft,
  moveSectionBefore,
  moveSectionByOffset,
  parseMarketingLayoutDraft,
  removeSectionFromPageDraft,
} from '@/lib/marketing/section-builder';
import {
  buildMarketingSectionImplementationPrompt,
  buildMarketingSectionRemixPrompt,
} from '@/lib/marketing/section-remix';

vi.mock('@/features/demo/DemoClientProviders', () => ({
  DemoClientProviders: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/features/profile/StaticArtistPage', () => ({
  StaticArtistPage: ({ mode }: { readonly mode: string }) => (
    <div data-testid={`mock-static-profile-${mode}`}>Static Profile {mode}</div>
  ),
}));

vi.mock('@/features/home/HomeProfileShowcase', () => ({
  HomeProfileShowcase: ({ stateId }: { readonly stateId: string }) => (
    <div data-testid={`mock-profile-state-${stateId}`}>
      Profile State {stateId}
    </div>
  ),
}));

vi.mock('@/components/features/home/HomeTrustSection', () => ({
  HomeTrustSection: () => <div>Trust Strip Preview</div>,
}));

vi.mock('@/components/homepage/HomepageOutcomeCards', () => ({
  HomepageOutcomeCards: () => <div>Outcome Cards Preview</div>,
}));

vi.mock('@/components/marketing/homepage-v2/HomepageSections', () => ({
  HomepageV2CaptureReactivate: () => <div>Capture Preview</div>,
  HomepageV2FinalCta: () => <div>Final CTA Preview</div>,
  HomepageV2Hero: () => <div>Hero Preview</div>,
  HomepageV2Pricing: () => <div>Pricing Preview</div>,
  HomepageV2Spotlight: () => <div>Spotlight Preview</div>,
  HomepageV2SystemOverview: () => <div>System Preview</div>,
}));

vi.mock('@/components/marketing/artist-profile', () => ({
  ArtistProfileAdaptiveSequence: () => <div>Adaptive Preview</div>,
  ArtistProfileFaq: () => <div>FAQ Preview</div>,
  ArtistProfileHero: () => <div>Artist Profile Hero Preview</div>,
  ArtistProfileMonetizationSection: () => <div>Monetization Preview</div>,
  ArtistProfileSpecWall: () => <div>Spec Wall Preview</div>,
}));

vi.mock(
  '@/components/marketing/artist-notifications/ArtistNotificationsBenefitsSection',
  () => ({
    ArtistNotificationsBenefitsSection: () => (
      <div>Notification Benefits Preview</div>
    ),
  })
);

vi.mock(
  '@/components/marketing/artist-notifications/ArtistNotificationsHero',
  () => ({
    ArtistNotificationsHero: () => <div>Notifications Hero Preview</div>,
  })
);

describe('marketing section registry', () => {
  it('uses unique stable section ids', () => {
    const ids = MARKETING_SECTION_REGISTRY.map(section => section.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers the primary marketing page families', () => {
    expect(
      MARKETING_SECTION_REGISTRY.some(section =>
        section.currentPages.includes('Homepage')
      )
    ).toBe(true);
    expect(
      MARKETING_SECTION_REGISTRY.some(section =>
        section.currentPages.includes('Artist Profiles')
      )
    ).toBe(true);
    expect(
      MARKETING_SECTION_REGISTRY.some(section =>
        section.currentPages.includes('Artist Notifications')
      )
    ).toBe(true);
    expect(
      MARKETING_SECTION_REGISTRY.some(section =>
        section.currentPages.includes('Pricing')
      )
    ).toBe(true);
  });

  it('seeds local page drafts from registry current pages', () => {
    const draft = createMarketingLayoutDraft(
      MARKETING_SECTION_REGISTRY,
      MARKETING_SECTION_PAGES
    );
    const homepageSectionIds = getMarketingPageDraft(
      draft,
      'Homepage'
    ).sectionIds;
    const expectedHomepageSectionIds = MARKETING_SECTION_REGISTRY.filter(
      section => section.currentPages.includes('Homepage')
    ).map(section => section.id);

    expect(draft.version).toBe(2);
    expect(draft.pages).toHaveLength(MARKETING_SECTION_PAGES.length);
    expect(homepageSectionIds).toEqual(expectedHomepageSectionIds);
  });

  it('adds, removes, and reorders local page draft sections', () => {
    const draft = createMarketingLayoutDraft(
      MARKETING_SECTION_REGISTRY,
      MARKETING_SECTION_PAGES
    );
    const targetSection = MARKETING_SECTION_REGISTRY.find(
      section => !section.currentPages.includes('Homepage')
    );

    if (!targetSection) {
      throw new Error('Expected a non-homepage marketing section.');
    }

    const addedDraft = addSectionToPageDraft(
      draft,
      'Homepage',
      targetSection.id,
      1
    );
    const addedIds = getMarketingPageDraft(addedDraft, 'Homepage').sectionIds;

    expect(addedIds[1]).toBe(targetSection.id);

    const movedDraft = moveSectionByOffset(
      addedDraft,
      'Homepage',
      targetSection.id,
      1
    );
    const movedIds = getMarketingPageDraft(movedDraft, 'Homepage').sectionIds;

    expect(movedIds[2]).toBe(targetSection.id);

    const removedDraft = removeSectionFromPageDraft(
      movedDraft,
      'Homepage',
      targetSection.id
    );

    expect(
      getMarketingPageDraft(removedDraft, 'Homepage').sectionIds
    ).not.toContain(targetSection.id);
  });

  it('moves dragged page sections before the target section', () => {
    const draft = createMarketingLayoutDraft(
      MARKETING_SECTION_REGISTRY,
      MARKETING_SECTION_PAGES
    );
    const homepageIds = getMarketingPageDraft(draft, 'Homepage').sectionIds;
    const draggedSectionId = homepageIds[0];
    const targetSectionId = homepageIds[2];

    if (!draggedSectionId || !targetSectionId) {
      throw new Error('Expected at least three homepage sections.');
    }

    const movedDraft = moveSectionBefore(
      draft,
      'Homepage',
      draggedSectionId,
      targetSectionId
    );
    const movedIds = getMarketingPageDraft(movedDraft, 'Homepage').sectionIds;

    expect(movedIds[1]).toBe(draggedSectionId);
    expect(movedIds[2]).toBe(targetSectionId);
  });

  it('filters stale local draft data while preserving known order', () => {
    const draft = parseMarketingLayoutDraft(
      JSON.stringify({
        version: 2,
        pages: [
          {
            page: 'Homepage',
            sectionIds: [
              'homepage.hero',
              'missing.section',
              'homepage.hero',
              'homepage.final-cta',
            ],
          },
        ],
      }),
      MARKETING_SECTION_REGISTRY,
      MARKETING_SECTION_PAGES
    );

    expect(getMarketingPageDraft(draft, 'Homepage').sectionIds).toEqual([
      'homepage.hero',
      'homepage.final-cta',
    ]);
  });

  it('builds copyable active-page layout handoff text', () => {
    const draft = createMarketingLayoutDraft(
      MARKETING_SECTION_REGISTRY,
      MARKETING_SECTION_PAGES
    );
    const homepageSections = getMarketingDraftSections(
      draft,
      'Homepage',
      MARKETING_SECTION_REGISTRY
    );
    const layoutCopy = buildMarketingPageLayoutCopy({
      page: 'Homepage',
      sections: homepageSections,
    });
    const layoutPrompt = buildMarketingPageLayoutPrompt({
      page: 'Homepage',
      sections: homepageSections,
      includeDesignGuidance: true,
    });

    expect(layoutCopy).toContain('"page": "Homepage"');
    expect(layoutCopy).toContain('"id": "homepage.hero"');
    expect(layoutPrompt).toContain('Please update the Homepage marketing page');
    expect(layoutPrompt).toContain('homepage.final-cta');
    expect(layoutPrompt).toContain(
      'Keep the locked final CTA visually unchanged'
    );
  });

  it('renders the Design Studio landing pages workspace', () => {
    render(
      <MarketingSectionsLabClient
        sections={MARKETING_SECTION_REGISTRY.slice(0, 3)}
        pages={MARKETING_SECTION_PAGES}
        families={MARKETING_SECTION_FAMILIES}
        statuses={MARKETING_SECTION_STATUSES}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Design Studio' })
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: /Landing Pages/ })).toBeVisible();
    expect(screen.getByRole('tab', { name: /Public Profiles/ })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Component Library' })
    ).toBeVisible();
    expect(screen.getByText('Selected Page')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Landing Canvas' })
    ).toBeVisible();
    expect(screen.getAllByText('Homepage Hero').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Trust Strip').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Outcome Cards').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Design Studio').length).toBeGreaterThan(0);
    expect(screen.getByText('Add Design Reference')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Static' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Live' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy Layout' })).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: 'Copy Build Prompt' }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('checkbox', { name: 'Include Design Guidance' })
    ).toBeChecked();
    expect(
      screen.getAllByRole('button', { name: 'Copy Design Prompt' }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: 'Remix' }).length
    ).toBeGreaterThan(0);
  }, 15_000);

  it('renders the Design Studio public profiles canvas', () => {
    render(
      <MarketingSectionsLabClient
        sections={MARKETING_SECTION_REGISTRY.slice(0, 3)}
        pages={MARKETING_SECTION_PAGES}
        families={MARKETING_SECTION_FAMILIES}
        statuses={MARKETING_SECTION_STATUSES}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /Public Profiles/ }));

    expect(
      screen.getByRole('heading', { name: 'Public Profile Canvas' })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Profile Modes' })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Release States' })
    ).toBeVisible();
    expect(
      screen.getAllByTestId('mock-static-profile-profile').length
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('mock-static-profile-listen')).toBeVisible();
    expect(
      screen.getByTestId('mock-profile-state-subscribe-done')
    ).toBeVisible();
  }, 15_000);

  it('builds copyable remix prompts for implementation handoff', () => {
    const section = MARKETING_SECTION_REGISTRY[0];

    if (!section) {
      throw new Error('Expected at least one marketing section.');
    }

    const designPrompt = buildMarketingSectionRemixPrompt({
      section,
      aspectRatio: '16:9',
      includeDesignGuidance: false,
    });
    const implementationPrompt = buildMarketingSectionImplementationPrompt({
      section,
      aspectRatio: '16:9',
      includeDesignGuidance: false,
      generatedPrompt: designPrompt,
    });

    expect(designPrompt).toContain(section.id);
    expect(designPrompt).toContain('Exploration mode');
    expect(implementationPrompt).toContain('Target section');
    expect(implementationPrompt).toContain('Design generation prompt used');
  });
});
