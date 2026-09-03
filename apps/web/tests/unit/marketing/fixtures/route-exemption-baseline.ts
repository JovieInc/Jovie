/**
 * Independently reviewed, decrease-only exemption ledger for JOV-5650.
 *
 * Keep this outside the production manifest so adding an exemption cannot be
 * hidden by incrementing a colocated count. Removing entries is allowed; a new
 * glob must be explicitly admitted here with its governance review.
 */
export const SANCTIONED_EXEMPTION_BASELINE = [
  '(marketing)/developers/page.tsx',
  '(marketing)/api-versioning/page.tsx',
  'waitlist/invite/page.tsx',
  '(marketing)/ai/page.tsx',
  '(marketing)/blog/[slug]/page.tsx',
  '(marketing)/blog/authors/[username]/page.tsx',
  '(marketing)/changelog/page.tsx',
  '(marketing)/changelog/[version]/page.tsx',
  '(marketing)/demo/video/page.tsx',
  '(marketing)/demovideo/page.tsx',
  '(marketing)/investors/page.tsx',
  '(marketing)/renders/page.tsx',
  '(marketing)/renders/[state]/page.tsx',
  '(marketing)/renders/profile-admission/page.tsx',
  '(marketing)/renders/surfaces/[surface]/page.tsx',
  '(marketing)/engineering/page.tsx',
  '(marketing)/engineering/[slug]/page.tsx',
  '(marketing)/engineering/preview/page.tsx',
  '(marketing)/engineering/preview/[slug]/page.tsx',
] as const;
