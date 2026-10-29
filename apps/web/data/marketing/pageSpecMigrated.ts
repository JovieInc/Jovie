/**
 * Files that render from a content record and must not carry their own copy.
 * A route joins this list in the PR that migrates it to a page spec; the
 * guard (`tests/unit/marketing/page-spec-copy-guard.test.ts`) then fails if
 * any listed file reintroduces a hardcoded sentence. Paths are relative to
 * `apps/web`.
 */
export const PAGE_SPEC_COPY_GUARDED_FILES: readonly string[] = [
  // Site header and footer (site-chrome/main).
  'components/site/MarketingFooter.tsx',
  // The one page-spec renderer.
  'components/marketing/page-spec/PageSpecSections.tsx',
];
