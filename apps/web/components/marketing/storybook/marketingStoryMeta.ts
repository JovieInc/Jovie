import type { Meta } from '@storybook/nextjs-vite';

/**
 * Shared Storybook parameters for marketing catalog stories (JOV-4420).
 *
 * Marketing surfaces are dark-only System A, fully static (`revalidate = false`),
 * and must render product compositions — never design-studio fakes or pure-black
 * story chrome (see scripts/storybook-story-quality-guard.mjs).
 */
export const MARKETING_STORY_DESCRIPTION = [
  'System A marketing surface (dark-only).',
  'Production routes use `export const revalidate = false` (fully static).',
  'Proof/trust sections only render with verified or fixture-safe data; zero-proof path omits the section.',
  'Visual entry after Brief → resolveComposition (see docs/marketing/AGENT_GUIDE.md).',
].join(' ');

export const marketingFullscreenParameters = {
  layout: 'fullscreen' as const,
  docs: {
    description: {
      component: MARKETING_STORY_DESCRIPTION,
    },
  },
  chromatic: {
    // TurboSnap-friendly: stable viewport set for recipe compositions
    modes: {
      desktop: { viewport: 'desktop' },
      mobile: { viewport: 'mobile1' },
    },
  },
  viewport: {
    defaultViewport: 'desktop',
  },
  backgrounds: {
    default: 'dark',
  },
};

export const marketingCenteredParameters = {
  layout: 'fullscreen' as const,
  docs: {
    description: {
      component: MARKETING_STORY_DESCRIPTION,
    },
  },
  backgrounds: {
    default: 'dark',
  },
};

/** Viewports for recipe page stories (mobile + desktop). */
export const recipeViewports = {
  desktop: {
    name: 'Desktop',
    styles: { width: '1440px', height: '900px' },
  },
  mobile: {
    name: 'Mobile',
    styles: { width: '390px', height: '844px' },
  },
};

export function marketingMeta<T>(
  partial: Meta<T> & { readonly title: string }
): Meta<T> {
  return {
    parameters: marketingFullscreenParameters,
    ...partial,
  };
}
