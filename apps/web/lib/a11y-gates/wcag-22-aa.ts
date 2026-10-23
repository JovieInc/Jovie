/**
 * Browser-safe WCAG 2.2 AA tag list and Storybook addon parameters.
 * No Node APIs: Storybook preview bundles this file into the browser.
 * The runtime options inline this same list. The script check compares
 * them so the tag list still has one definition.
 */
export const WCAG_22_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
] as const;

export const STORYBOOK_A11Y_PARAMETERS = {
  test: 'error' as const,
  config: {
    rules: [
      { id: 'color-contrast', enabled: true },
      { id: 'target-size', enabled: true },
    ],
  },
  options: {
    runOnly: {
      type: 'tag' as const,
      values: WCAG_22_AA_TAGS,
    },
  },
};
