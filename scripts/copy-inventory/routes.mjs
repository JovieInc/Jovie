// Public marketing routes in traffic order (highest first). Order is a
// judgement until real route traffic is wired in; rows inherit it, so
// reordering this list reorders the Ovie table and nothing else.
// `prefix` is the speakable ID prefix ("HOME-3", "SL-7"). Prefixes are unique
// and never change once rows exist, because IDs live in ids.gen.json.
export const SITE_CHROME = {
  route: 'site',
  prefix: 'SITE',
  entries: ['app/(marketing)/layout.tsx', 'app/(home)/layout.tsx'],
};

export const ROUTES = [
  { route: '/', prefix: 'HOME', entry: 'app/(home)/page.tsx' },
  {
    route: '/pricing',
    prefix: 'PRICE',
    entry: 'app/(marketing)/pricing/page.tsx',
  },
  {
    route: '/artist-profiles',
    prefix: 'AP',
    entry: 'app/(marketing)/artist-profiles/page.tsx',
  },
  {
    route: '/smart-links',
    prefix: 'SL',
    entry: 'app/(marketing)/smart-links/page.tsx',
  },
  { route: '/claim', prefix: 'CLAIM', entry: 'app/claim/page.tsx' },
  { route: '/waitlist', prefix: 'WAIT', entry: 'app/waitlist/page.tsx' },
  { route: '/pay', prefix: 'PAY', entry: 'app/(marketing)/pay/page.tsx' },
  { route: '/about', prefix: 'ABOUT', entry: 'app/(marketing)/about/page.tsx' },
  {
    route: '/artist-profile',
    prefix: 'ARTP',
    entry: 'app/(marketing)/artist-profile/page.tsx',
  },
  {
    route: '/product',
    prefix: 'PROD',
    entry: 'app/(marketing)/product/page.tsx',
  },
  {
    route: '/download',
    prefix: 'DL',
    entry: 'app/(marketing)/download/page.tsx',
  },
  {
    route: '/launch',
    prefix: 'LAUNCH',
    entry: 'app/(marketing)/launch/page.tsx',
  },
  { route: '/new', prefix: 'NEW', entry: 'app/(marketing)/new/page.tsx' },
  {
    route: '/compare',
    prefix: 'CMP',
    entry: 'app/(marketing)/compare/page.tsx',
  },
  {
    route: '/alternatives',
    prefix: 'ALT',
    entry: 'app/(marketing)/alternatives/page.tsx',
  },
  {
    route: '/integrations',
    prefix: 'INT',
    entry: 'app/(marketing)/integrations/page.tsx',
  },
  {
    route: '/support',
    prefix: 'SUP',
    entry: 'app/(marketing)/support/page.tsx',
  },
  {
    route: '/instant-merch',
    prefix: 'MERCH',
    entry: 'app/(marketing)/instant-merch/page.tsx',
  },
  {
    route: '/artist-notifications',
    prefix: 'NOTIF',
    entry: 'app/(marketing)/artist-notifications/page.tsx',
  },
  { route: '/card', prefix: 'CARD', entry: 'app/(marketing)/card/page.tsx' },
  { route: '/ai', prefix: 'AI', entry: 'app/(marketing)/ai/page.tsx' },
  { route: '/voice', prefix: 'VOICE', entry: 'app/(marketing)/voice/page.tsx' },
  {
    route: '/youtube-thumbnails',
    prefix: 'YT',
    entry: 'app/(marketing)/youtube-thumbnails/page.tsx',
  },
  { route: '/cli', prefix: 'CLI', entry: 'app/(marketing)/cli/page.tsx' },
  {
    route: '/developers',
    prefix: 'DEV',
    entry: 'app/(marketing)/developers/page.tsx',
  },
  {
    route: '/changelog',
    prefix: 'CHG',
    entry: 'app/(marketing)/changelog/page.tsx',
  },
  { route: '/blog', prefix: 'BLOG', entry: 'app/(marketing)/blog/page.tsx' },
  {
    route: '/engineering',
    prefix: 'ENG',
    entry: 'app/(marketing)/engineering/page.tsx',
  },
  {
    route: '/api-versioning',
    prefix: 'APIV',
    entry: 'app/(marketing)/api-versioning/page.tsx',
  },
  {
    route: '/product/dsp-links',
    prefix: 'DSP',
    entry: 'app/(marketing)/product/dsp-links/page.tsx',
  },
  {
    route: '/product/link-analytics',
    prefix: 'LNKA',
    entry: 'app/(marketing)/product/link-analytics/page.tsx',
  },
  {
    route: '/product/pre-save',
    prefix: 'PRES',
    entry: 'app/(marketing)/product/pre-save/page.tsx',
  },
  {
    route: '/product/release-scheduling',
    prefix: 'RELS',
    entry: 'app/(marketing)/product/release-scheduling/page.tsx',
  },
  {
    route: '/product/utm-links',
    prefix: 'UTM',
    entry: 'app/(marketing)/product/utm-links/page.tsx',
  },
  {
    route: '/product/isrc',
    prefix: 'ISRC',
    entry: 'app/(marketing)/product/isrc/page.tsx',
  },
  {
    route: '/product/command-palette',
    prefix: 'CMDP',
    entry: 'app/(marketing)/product/command-palette/page.tsx',
  },
];
