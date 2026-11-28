import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      throw new Error('no database');
    },
  },
}));
vi.mock('@/lib/spotify', () => ({ getSpotifyArtist: vi.fn() }));

import { HOMEPAGE_EDITORIAL_COPY } from '@/data/homepageEditorialCopy';
import { resolveHomepageHeroPrimaryAction } from '@/data/homepageStartCta';
import { HOME_MARKETING_HEADER_CTA } from '@/data/marketing/headerCta';
import { MARKETING_PAGE_CONTRACTS } from '@/data/marketing/pageContracts';
import {
  buildClaimProfileStartHref,
  CLAIM_PROFILE_STARTER_PROMPT,
  getClaimProfileIntent,
} from '@/data/marketingCtaIntents';
import { decideFallbackTurn } from '@/lib/chat/onboarding-script/engine';
import { createOnboardingTurnState } from '@/lib/chat/tools/onboarding-tool-impls';
import {
  advanceOnboardingProfileDraft,
  emptyOnboardingProfileDraft,
  onboardingDraftQuestion,
} from '@/lib/onboarding/profile-draft';
import { resolveStartEntryHandoff } from '@/lib/onboarding/start-entry-handoff';

const WEB_ROOT = resolve(__dirname, '../../..');

const GOLDEN_PATH_UI_SOURCES = [
  'components/features/onboarding/ChatProposeCheckoutCard.tsx',
  'components/features/onboarding/OnboardingToolArtifacts.tsx',
  'components/features/onboarding/OnboardingSpotifyArtistPickerCard.tsx',
  'components/features/onboarding/OnboardingToolStatusCards.tsx',
  'components/features/onboarding/OnboardingProfileRail.tsx',
  'app/onboarding/checkout/OnboardingCheckoutClient.tsx',
  'app/claim/ClaimArtistSearch.tsx',
  'app/claim/agent/[draftId]/AgentClaimScreen.tsx',
  'app/[username]/_components/PublicClaimBanner.tsx',
  'app/(auth)/signup/SignUpPageClient.tsx',
  'app/(auth)/signin/SignInPageClient.tsx',
  'app/r/[slug]/ReleaseLandingPage.tsx',
] as const;

function readWebSource(relPath: string): string {
  return readFileSync(resolve(WEB_ROOT, relPath), 'utf8');
}

describe('Golden Path UI & UX closed-loop invariants', () => {
  it('forbids same-surface dark:bg-surface-1 primary CTAs inside surface-1 cards', () => {
    for (const relPath of GOLDEN_PATH_UI_SOURCES) {
      const source = readWebSource(relPath);
      expect(
        source,
        `${relPath} must not style an interactive CTA with dark:bg-surface-1 (invisible on surface-1 cards)`
      ).not.toMatch(/\bdark:bg-surface-1(?:\/\d+)?\b/);
    }
  });

  it('forbids filled/bordered icon circles on Golden Path checkout & offer cards (Quiet Surfaces)', () => {
    for (const relPath of [
      'app/onboarding/checkout/OnboardingCheckoutClient.tsx',
      'components/features/onboarding/ChatProposeCheckoutCard.tsx',
    ]) {
      const source = readWebSource(relPath);
      expect(
        source,
        `${relPath} must not wrap decorative icons in rounded-full bg-surface-* circles`
      ).not.toMatch(
        /(?:h-\d+\s+w-\d+|size-\d+)[^'"]*rounded-full\s+bg-surface-\d/
      );
    }
  });

  it('keeps release and catalog artwork uncropped with object-contain (DESIGN.md)', () => {
    const checkoutSource = readWebSource(
      'app/onboarding/checkout/OnboardingCheckoutClient.tsx'
    );
    expect(checkoutSource).toContain('object-contain');
    expect(checkoutSource).not.toContain('object-cover');

    const agentClaimSource = readWebSource(
      'app/claim/agent/[draftId]/AgentClaimScreen.tsx'
    );
    expect(agentClaimSource).toMatch(
      /isRelease\s*\?\s*'[^']*object-contain[^']*'/
    );
  });

  it('forbids deprecated Button size="xl" across Golden Path surfaces', () => {
    for (const relPath of GOLDEN_PATH_UI_SOURCES) {
      const source = readWebSource(relPath);
      expect(source, `${relPath} uses deprecated size="xl"`).not.toMatch(
        /\bsize=['"]xl['"]/
      );
    }
  });

  it('requires every focus-visible:outline-none control to provide a visible focus ring', () => {
    for (const relPath of GOLDEN_PATH_UI_SOURCES) {
      const source = readWebSource(relPath);
      const classStrings = [
        ...source.matchAll(/className=['"`]([^'"`]+)['"`]/g),
      ].map(match => match[1] ?? '');
      for (const cls of classStrings) {
        if (!cls.includes('focus-visible:outline-none')) continue;
        expect(
          cls.includes('focus-visible:ring') ||
            cls.includes('focus-ring-themed') ||
            cls.includes('focus-visible:border'),
          `${relPath} strips focus-visible outline without a replacement ring: "${cls}"`
        ).toBe(true);
      }
    }
  });

  it('forbids synchronous localStorage reads inside useState initializers (SSR hydration safety)', () => {
    for (const relPath of GOLDEN_PATH_UI_SOURCES) {
      const source = readWebSource(relPath);
      expect(
        source,
        `${relPath} reads localStorage in useState initializer (causes React hydration mismatch)`
      ).not.toMatch(/useState\s*\([^;]*?localStorage/);
    }
  });

  it('resolves every literal option offered in onboardingDraftQuestion without looping', () => {
    const prompt = onboardingDraftQuestion(emptyOnboardingProfileDraft());
    const optionsPart = prompt.split(':')[1]?.replace(/\?$/, '') ?? '';
    const options = optionsPart
      .split(',')
      .map(part => part.replace(/^\s*or\s+/i, '').trim())
      .filter(Boolean);

    expect(options.length).toBeGreaterThanOrEqual(5);
    for (const option of options) {
      const next = advanceOnboardingProfileDraft(
        emptyOnboardingProfileDraft(),
        {
          id: `opt-${option}`,
          text: option,
        }
      );
      expect(
        next.activeRole,
        `Option "${option}" from "${prompt}" failed to resolve an activeRole`
      ).not.toBeNull();
      expect(next.awaiting).not.toBe('role');
    }
  });

  it('advances older-catalog artists with no new release out of awaiting="outcome"', () => {
    let draft = advanceOnboardingProfileDraft(emptyOnboardingProfileDraft(), {
      id: 'u1',
      text: 'I make music https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
    });
    expect(draft.activeRole).toBe('artist');
    expect(draft.awaiting).toBe('outcome');

    draft = advanceOnboardingProfileDraft(draft, {
      id: 'u2',
      text: 'I am an indie artist with my older catalog, no new release right now',
    });
    expect(draft.activeRole).toBe('artist');
    expect(draft.outcome).toContain('older catalog');
    expect(draft.awaiting).toBe('review');
  });

  it('opens the Spotify artist picker on turn 1 when openPickerQuery is present even with empty profileDraft', async () => {
    const state = createOnboardingTurnState({
      sessionId: 'artist-turn-1',
      turnCount: 1,
    });
    state.profileDraft = emptyOnboardingProfileDraft();
    const userMsg: UIMessage = {
      id: 'm1',
      role: 'user',
      parts: [{ type: 'text', text: 'Late Night Archive' }],
    };

    const turn = await decideFallbackTurn({
      uiMessages: [userMsg],
      state,
      openPickerQuery: 'Late Night Archive',
    });

    expect(turn.toolEvents).toEqual([
      expect.objectContaining({
        toolName: 'searchSpotifyArtist',
        input: { query: 'Late Night Archive' },
      }),
    ]);
  });

  it('wires homepage hero, header, and handle-close CTAs into non-null resolveStartEntryHandoff openers', () => {
    const heroPrimary = resolveHomepageHeroPrimaryAction(
      HOMEPAGE_EDITORIAL_COPY.hero
    );
    const intent = getClaimProfileIntent();

    for (const [surface, href] of [
      ['homepage hero primary CTA', heroPrimary.href],
      ['claim-profile intent', intent.href],
      ['homepage header CTA', HOME_MARKETING_HEADER_CTA.href],
      [
        'homepage page-contract primary CTA',
        MARKETING_PAGE_CONTRACTS['(home)/page.tsx'].primaryCta.href,
      ],
      ['handle-aware claim builder', buildClaimProfileStartHref('lunaharbor')],
    ] as const) {
      const parsed = new URL(href, 'https://jov.ie');
      expect(parsed.pathname, `${surface} pathname`).toBe('/start');
      const handoff = resolveStartEntryHandoff(
        Object.fromEntries(parsed.searchParams.entries())
      );
      expect(
        handoff,
        `${surface} (${href}) left starterHandoff=null on /start`
      ).not.toBeNull();
    }

    // Native GET submission of HomepageEditorial #homepage-claim-entry with and without typed handle:
    expect(
      resolveStartEntryHandoff({
        starter_prompt: CLAIM_PROFILE_STARTER_PROMPT,
        handle: 'lunaharbor',
      })
    ).toEqual({
      kind: 'prompt',
      prompt: 'I want to claim jov.ie/lunaharbor.',
    });
    expect(
      resolveStartEntryHandoff({
        starter_prompt: CLAIM_PROFILE_STARTER_PROMPT,
        handle: '',
      })
    ).toEqual({
      kind: 'prompt',
      prompt: CLAIM_PROFILE_STARTER_PROMPT,
    });
  });

  it('forbids HomepageEditorial from emitting bare /start links or handle forms without starter_prompt', () => {
    const editorialSource = readWebSource(
      'components/homepage/HomepageEditorial.tsx'
    );
    expect(editorialSource).not.toMatch(/href=['"]\/start['"]/);
    expect(editorialSource).toMatch(
      /type=['"]hidden['"][\s\S]{0,120}?name=['"]starter_prompt['"][\s\S]{0,120}?value=\{CLAIM_PROFILE_STARTER_PROMPT\}/
    );
    // JOV-10127: reject display-name handle= on the native close form.
    // Hyphen must be escaped (`\\-`) so unicodeSets(v) HTML pattern compiles.
    // Pattern must be a JS expression (`pattern={...}`) — JSX string attrs
    // keep `\\` as two literal backslashes and still fail under `v`.
    expect(editorialSource).toMatch(
      /pattern=\{\s*['"]\[A-Za-z0-9\._\\\\-\]\{3,30\}['"]\s*\}/
    );
  });

  it('forbids golden-path E2E from bypassing / with a bare page.goto("/start")', () => {
    const goldenPathSpec = readWebSource('tests/e2e/golden-path.spec.ts');
    expect(goldenPathSpec).not.toMatch(/page\.goto\(\s*['"`]\/start['"`]/);
    expect(goldenPathSpec).toContain(
      "page.getByTestId('homepage-primary-cta').click()"
    );
  });

  it('Keep → auth: golden-path E2E must not wait for social-link after handle confirm', () => {
    const goldenPathSpec = readWebSource('tests/e2e/golden-path.spec.ts');
    // JOV-14011 / #26243: after Keep the journey asserts auth handoff, not
    // the deferred social enrichment card.
    expect(goldenPathSpec).not.toMatch(
      /onboarding-confirm-handle[\s\S]{0,1200}?getByTestId\(['"]onboarding-social-link['"]\)\)\.toBeVisible/
    );
    expect(goldenPathSpec).toContain(
      "getByTestId('onboarding-social-link')).toHaveCount(0)"
    );
    expect(goldenPathSpec).toMatch(
      /x-onboarding-fallback[\s\S]{0,200}instant_access\|golden_path_admitted\|waitlist/
    );
  });

  it('forbids undefined --color-text-primary CSS variable in auth shell and theme styles', () => {
    for (const cssFile of [
      'styles/theme.css',
      'components/features/auth/AuthBackdrop.css',
    ]) {
      const css = readWebSource(cssFile);
      expect(
        css,
        `${cssFile} used undefined --color-text-primary instead of --color-text-primary-token`
      ).not.toMatch(/--color-text-primary(?!-token)/);
    }
  });
});
