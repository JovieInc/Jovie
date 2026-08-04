export const PUBLIC_BRAND_SECTION_IDS = [
  'hero',
  'system',
  'logos',
  'typography',
  'color',
  'spacing-density',
  'surfaces',
  'controls',
  'icons',
  'imagery',
  'screenshots',
  'motion',
  'accessibility',
  'voice',
  'archetypes',
  'do-dont',
  'downloads',
  'changelog',
] as const;

export type PublicBrandSectionId = (typeof PUBLIC_BRAND_SECTION_IDS)[number];

export const PUBLIC_BRAND_MANIFEST = {
  file: 'Jovie-Brand-System.json',
  relative_path: 'generated/Jovie-Brand-System.json',
  href: '/brand/generated/Jovie-Brand-System.json',
} as const;

type PublicBrandAssetKind = 'mark' | 'wordmark' | 'lockup' | 'app-icon';

function definePublicBrandAsset<
  const Label extends string,
  const File extends string,
  const Kind extends PublicBrandAssetKind,
>(label: Label, file: File, kind: Kind) {
  return {
    label,
    file,
    href: `/brand/${file}` as const,
    kind,
  } as const;
}

function definePublicBrandSvgPair<
  const Label extends string,
  const FileStem extends string,
  const Kind extends Exclude<PublicBrandAssetKind, 'app-icon'>,
>(label: Label, fileStem: FileStem, kind: Kind) {
  return [
    definePublicBrandAsset(
      `Jovie ${label} — ink SVG`,
      `${fileStem}-Black.svg`,
      kind
    ),
    definePublicBrandAsset(
      `Jovie ${label} — cream SVG`,
      `${fileStem}-Cream.svg`,
      kind
    ),
  ] as const;
}

function definePublicBrandAppIcon<const Size extends 192 | 512 | 1024>(
  size: Size
) {
  return definePublicBrandAsset(
    `Jovie app icon — ${size} PNG`,
    `app-icons/jovie-app-icon-${size}.png`,
    'app-icon'
  );
}

export const PUBLIC_BRAND_ASSETS = [
  ...definePublicBrandSvgPair('mark', 'Jovie-Logo-Mark', 'mark'),
  ...definePublicBrandSvgPair('wordmark', 'Jovie-Wordmark', 'wordmark'),
  ...definePublicBrandSvgPair('horizontal lockup', 'Jovie-Lockup', 'lockup'),
  definePublicBrandAppIcon(192),
  definePublicBrandAppIcon(512),
  definePublicBrandAppIcon(1024),
] as const;

export const PUBLIC_SYSTEM_CONSUMERS = [
  {
    name: 'Jovie product',
    relationship: 'Direct canonical web consumer',
  },
  {
    name: 'Jovie marketing',
    relationship: 'Editorial composition mode over the same foundation',
  },
  {
    name: 'LogYourBody native',
    relationship: 'Platform adapter contract; no independent visual authority',
  },
  {
    name: 'LogYourBody marketing',
    relationship: 'Editorial composition mode; no independent visual authority',
  },
] as const;

export const PUBLIC_DENSITY_MODES = [
  {
    name: 'Product',
    summary: 'Compact, task-led composition using the shared token scale.',
  },
  {
    name: 'Editorial',
    summary:
      'More breathing room and narrative pacing without changing type, color, radius, icon, or control contracts.',
  },
] as const;

export const PUBLIC_LOGO_RULES = [
  'Use the supplied vector or raster original without redrawing its geometry.',
  'Keep the mark one color and preserve clear contrast against its surface.',
  'Treat the wordmark as artwork; never recreate it with a font.',
  'Use the horizontal lockup when context is limited and the mark alone only when Jovie is already clear.',
] as const;

export const PUBLIC_ICON_RULES = [
  'Use Lucide for interface actions, navigation, and state.',
  'Use the shared SocialIcon registry for social networks, services, and music platforms.',
  'Reserve custom SVGs for approved brand symbols or a documented gap in the shared libraries.',
  'Give an interactive icon an accessible name; hide a redundant decorative icon from assistive technology.',
] as const;

export const PUBLIC_IMAGERY_RULES = [
  'Start with an independently useful product-led static composition.',
  'Use editorial media only when it adds truthful context the interface cannot provide.',
  'Use video only after the static and editorial tiers work on their own.',
  'Keep selection and governance metadata private; publish only reviewed alt text and coarse provenance and rights status.',
] as const;

export const PUBLIC_SCREENSHOT_RULES = [
  'Capture a current canonical product surface; do not reconstruct product UI in a graphics tool.',
  'Use only seeded or explicitly approved public-safe content.',
  'Record the capture source and system version before publication, then expose only public-safe provenance.',
  'Withhold the image when identity, release state, or rights cannot be verified.',
] as const;

export const PUBLIC_ACCESSIBILITY_RULES = [
  'Preserve semantic heading order, landmarks, keyboard access, and visible focus.',
  'Use semantic color roles and verify contrast in the final composition.',
  'Keep controls at canonical sizes and preserve their full touch targets.',
  'Honor reduced motion and provide the same meaning in the static state.',
  'Write alt text only for truthful visible content needed to understand the published image.',
] as const;

export const PUBLIC_MEDIA_FIELDS = [
  'url',
  'alt',
  'provenance_status',
  'rights_status',
] as const;

export const PUBLIC_MEDIA_POLICY = {
  default: 'withhold',
  alt: 'Human-reviewed and limited to visibly relevant content needed to understand the published image.',
  provenance_status: 'Publish only a coarse verified or unknown status.',
  rights_status: 'Publish only a coarse cleared or withheld status.',
  analytics:
    'Never attach media-governance or selection metadata to public analytics.',
} as const;

export const PUBLIC_VOICE_RULES = [
  'Lead with the artist outcome, then explain the mechanism.',
  'Use specific, verifiable language. Remove filler and inflated claims.',
  'Write controls as direct actions in Title Case; write guidance in sentence case.',
  'Never imply a feature, result, customer, or proof point that is not public and current.',
] as const;

export const PUBLIC_DO_DONT = [
  {
    do: 'Use the supplied mark, wordmark, lockups, and checksummed app icons unchanged.',
    dont: 'Redraw, stretch, rotate, outline, shade, or decorate the logo.',
  },
  {
    do: 'Use semantic tokens and the canonical control family.',
    dont: 'Sample colors from screenshots or recreate buttons from visual memory.',
  },
  {
    do: 'Let artist media carry the expression while Jovie provides structure.',
    dont: 'Add generic AI gradients, floating decoration, emoji tiles, or ornamental dashboards.',
  },
  {
    do: 'Ship a complete static experience before considering editorial motion or video.',
    dont: 'Add an effect because a numeric delight ceiling has room.',
  },
] as const;
