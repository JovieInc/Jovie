#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUTTON_SIZE_NAMES,
  BUTTON_VARIANT_NAMES,
} from '../../../packages/ui/atoms/button-contract';
import { MOTION_POLICY } from '../../../packages/ui/theme/motion-policy';
import {
  accent,
  borders,
  radii,
  spacing,
  status,
  surfaces,
  text,
  typography,
} from '../../../packages/ui/theme/tokens';
import {
  listUiAtomComponents,
  parseCssCustomProperties,
} from '../../../scripts/generate-llms-design-manifest.mjs';
import { MARKETING_SPEC_VERSION } from '../data/marketing/composition';
import { MARKETING_RECIPES } from '../data/marketing/recipes';
import release from '../design/system-release.json';
import { assertPublicSafeProjection } from '../lib/brand/public-projection';
import {
  PUBLIC_ACCESSIBILITY_RULES,
  PUBLIC_BRAND_ASSETS,
  PUBLIC_BRAND_MANIFEST,
  PUBLIC_BRAND_SECTION_IDS,
  PUBLIC_DENSITY_MODES,
  PUBLIC_DO_DONT,
  PUBLIC_ICON_RULES,
  PUBLIC_IMAGERY_RULES,
  PUBLIC_LOGO_RULES,
  PUBLIC_MEDIA_FIELDS,
  PUBLIC_MEDIA_POLICY,
  PUBLIC_SCREENSHOT_RULES,
  PUBLIC_SYSTEM_CONSUMERS,
  PUBLIC_VOICE_RULES,
} from '../lib/brand/public-system';

const HERE = dirname(fileURLToPath(import.meta.url));
export const WEB_ROOT = resolve(HERE, '..');
export const REPO_ROOT = resolve(WEB_ROOT, '..', '..');
export const OUTPUT_PATH = join(
  WEB_ROOT,
  'public',
  'brand',
  PUBLIC_BRAND_MANIFEST.file
);

const PAGE_PATH = join(WEB_ROOT, 'app', 'brand', 'page.tsx');
const BRAND_ASSET_DIR = join(WEB_ROOT, 'public', 'brand');
const KNOWN_NON_DOWNLOAD_FILES = new Set([
  PUBLIC_BRAND_MANIFEST.file,
  'Jovie-Logo-Icon-Black.svg',
  'Jovie-Logo-Icon-White.svg',
  'Jovie-Logo-Icon.svg',
  'Jovie-Logo-Wordmark-Alt-Black.svg',
  'Jovie-Logo-Wordmark-Alt-White.svg',
  'jovie-icon-contact-sheet.png',
]);

const SOURCE_FILES = [
  ['public-manifest-builder', fileURLToPath(import.meta.url)],
  ['public-page', PAGE_PATH],
  ['public-page-layout', join(WEB_ROOT, 'app/brand/layout.tsx')],
  ['public-page-styles', join(WEB_ROOT, 'app/brand/brand.css')],
  [
    'canonical-token-parser',
    join(REPO_ROOT, 'scripts/generate-llms-design-manifest.mjs'),
  ],
  ['design-tokens', join(WEB_ROOT, 'design', 'tokens.json')],
  ['live-token-emitter', join(WEB_ROOT, 'styles', 'design-system.css')],
  ['semantic-token-api', join(REPO_ROOT, 'packages/ui/theme/tokens.ts')],
  ['motion-policy', join(REPO_ROOT, 'packages/ui/theme/motion-policy.ts')],
  ['component-registry', join(REPO_ROOT, 'packages/ui/index.ts')],
  ['button-registry', join(REPO_ROOT, 'packages/ui/atoms/button-contract.ts')],
  ['button-contract', join(REPO_ROOT, 'packages/ui/atoms/button.tsx')],
  ['composition-registry', join(WEB_ROOT, 'data/marketing/recipes.ts')],
  ['section-registry', join(WEB_ROOT, 'data/marketing/sections.ts')],
  ['brand-geometry', join(WEB_ROOT, 'lib/brand/tokens.ts')],
  ['brand-asset-pipeline', join(WEB_ROOT, 'scripts/generate-brand-assets.ts')],
  ['design-canon', join(REPO_ROOT, 'DESIGN.md')],
  ['voice-canon', join(REPO_ROOT, 'canon/VOICE.md')],
  ['icon-canon', join(REPO_ROOT, 'docs/ICON_STANDARDS.md')],
  ['icon-enforcement', join(WEB_ROOT, 'eslint-rules/icon-usage.js')],
  ['social-icon-registry', join(WEB_ROOT, 'components/atoms/SocialIcon.tsx')],
  ['public-contract', join(WEB_ROOT, 'lib/brand/public-system.ts')],
  [
    'public-safety-projection',
    join(WEB_ROOT, 'lib/brand/public-projection.ts'),
  ],
  ['release-contract', join(WEB_ROOT, 'design/system-release.json')],
] as const;

const PUBLIC_TOKEN_PREFIXES = [
  '--brand-',
  '--ds-',
  '--public-shell-',
  '--public-content-',
  '--radius-',
  '--text-',
  '--font-',
  '--leading-',
  '--tracking-',
  '--space-',
  '--duration-',
  '--ease-',
  '--color-text-',
  '--color-bg-',
  '--color-border-',
  '--color-btn-',
  '--color-accent',
  '--color-success',
  '--color-warning',
  '--color-error',
  '--color-info',
  '--color-interactive-',
] as const;

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface PublicBrandManifest {
  readonly schema_version: number;
  readonly name: string;
  readonly version: string;
  readonly released_at: string;
  readonly source_digest: string;
  readonly sources: readonly {
    readonly id: string;
    readonly sha256: string;
  }[];
  readonly sections: readonly string[];
  readonly consumers: readonly {
    readonly name: string;
    readonly relationship: string;
  }[];
  readonly tokens: readonly {
    readonly name: string;
    readonly value: string;
  }[];
  readonly semantic_tokens: JsonValue;
  readonly typography: JsonValue;
  readonly density_modes: JsonValue;
  readonly components: {
    readonly catalog: readonly string[];
    readonly button: {
      readonly variants: readonly string[];
      readonly sizes: readonly string[];
    };
    readonly access: string;
  };
  readonly approved_examples: readonly {
    readonly label: string;
    readonly url: string;
  }[];
  readonly composition_spec_version: string;
  readonly assets: readonly {
    readonly label: string;
    readonly file: string;
    readonly href: string;
    readonly kind: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
  readonly media: {
    readonly published: readonly never[];
    readonly public_fields: readonly string[];
    readonly policy: JsonValue;
  };
  readonly motion: JsonValue;
  readonly voice: JsonValue;
  readonly guidance: JsonValue;
  readonly do_dont: JsonValue;
  readonly exceptions: JsonValue;
  readonly changelog: JsonValue;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function listFiles(directory: string, prefix = ''): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? listFiles(join(directory, entry.name), relativePath)
      : [relativePath];
  });
}

function isPublicToken(name: string): boolean {
  return PUBLIC_TOKEN_PREFIXES.some(prefix => name.startsWith(prefix));
}

function readPublicTokens(): readonly { name: string; value: string }[] {
  const liveCss = readFileSync(
    join(WEB_ROOT, 'styles', 'design-system.css'),
    'utf8'
  );
  const generatedCss = readFileSync(
    join(WEB_ROOT, 'styles', 'generated', 'design-tokens.css'),
    'utf8'
  );
  const tokens = parseCssCustomProperties(`${generatedCss}\n${liveCss}`);
  return [...tokens.entries()]
    .filter(([name]) => isPublicToken(name))
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function readSources() {
  return SOURCE_FILES.map(([id, filePath]) => {
    if (!existsSync(filePath)) {
      throw new Error(`Public Brand System source is missing: ${id}`);
    }
    return { id, sha256: sha256(readFileSync(filePath)) };
  });
}

function readAssets() {
  const registered = new Set(PUBLIC_BRAND_ASSETS.map(asset => asset.file));
  const unknown = listFiles(BRAND_ASSET_DIR).filter(
    file => !registered.has(file) && !KNOWN_NON_DOWNLOAD_FILES.has(file)
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unregistered public brand assets:\n${unknown
        .map(file => `- ${file}`)
        .join(
          '\n'
        )}\nAdd public-safe files to PUBLIC_BRAND_ASSETS or classify legacy/supporting files in the drift gate.`
    );
  }

  return PUBLIC_BRAND_ASSETS.map(asset => {
    const filePath = join(BRAND_ASSET_DIR, asset.file);
    if (!existsSync(filePath)) {
      throw new Error(
        `Registered public brand asset is missing: ${asset.file}`
      );
    }
    const bytes = readFileSync(filePath);
    return {
      ...asset,
      bytes: statSync(filePath).size,
      sha256: sha256(bytes),
    };
  });
}

function assertRequiredPageSections(): void {
  const page = readFileSync(PAGE_PATH, 'utf8');
  const missing = PUBLIC_BRAND_SECTION_IDS.filter(
    id => !page.includes(`id='${id}'`) && !page.includes(`id="${id}"`)
  );
  if (missing.length > 0) {
    throw new Error(
      `Public Brand System page is missing required sections: ${missing.join(', ')}.`
    );
  }
}

function assertReleaseContract(): void {
  const current = release.changelog[0];
  if (!/^\d+\.\d+\.\d+$/.test(release.version)) {
    throw new Error('Design System version must be semantic x.y.z.');
  }
  if (
    current?.version !== release.version ||
    current?.date !== release.releasedAt
  ) {
    throw new Error(
      'The newest Design System changelog entry must match version and releasedAt.'
    );
  }
  if (
    release.exceptions.some(
      exception =>
        !exception.founderApproved ||
        !exception.name ||
        !exception.justification
    )
  ) {
    throw new Error(
      'Every Design System exception must be named, justified, versioned, and founder-approved.'
    );
  }
}

export function buildPublicBrandManifest(): PublicBrandManifest {
  assertReleaseContract();
  assertRequiredPageSections();

  const sources = readSources();
  const tokens = readPublicTokens();
  const assets = readAssets();
  const components = listUiAtomComponents(
    join(REPO_ROOT, 'packages', 'ui', 'atoms')
  ).map(component => component.name);
  const provenRecipes = MARKETING_RECIPES.filter(
    recipe => recipe.status === 'proven'
  );
  const approved_examples = provenRecipes.map(recipe => ({
    label: recipe.label,
    url: recipe.referenceRoute ?? '/',
  }));

  const canonicalDigestInput = {
    tokens,
    semantic_tokens: {
      accent,
      borders,
      radii,
      spacing,
      status,
      surfaces,
      text,
    },
    typography,
    components,
    button: {
      variants: BUTTON_VARIANT_NAMES,
      sizes: BUTTON_SIZE_NAMES,
    },
    provenRecipes,
    assets,
    sections: PUBLIC_BRAND_SECTION_IDS,
    motion: MOTION_POLICY,
    mediaPolicy: PUBLIC_MEDIA_POLICY,
    guidance: {
      accessibility: PUBLIC_ACCESSIBILITY_RULES,
      icons: PUBLIC_ICON_RULES,
      imagery: PUBLIC_IMAGERY_RULES,
      logos: PUBLIC_LOGO_RULES,
      screenshots: PUBLIC_SCREENSHOT_RULES,
    },
    sources,
  };

  const manifest: PublicBrandManifest = {
    schema_version: release.schemaVersion,
    name: 'Jovie Brand System',
    version: release.version,
    released_at: release.releasedAt,
    source_digest: sha256(stableJson(canonicalDigestInput)),
    sources,
    sections: PUBLIC_BRAND_SECTION_IDS,
    consumers: PUBLIC_SYSTEM_CONSUMERS,
    tokens,
    semantic_tokens: {
      accent,
      borders,
      radii,
      spacing,
      status,
      surfaces,
      text,
    },
    typography,
    density_modes: PUBLIC_DENSITY_MODES,
    components: {
      catalog: components,
      button: {
        variants: BUTTON_VARIANT_NAMES,
        sizes: BUTTON_SIZE_NAMES,
      },
      access:
        'Rendered reference only for external vendors; repository agents consume the private shared component package.',
    },
    approved_examples,
    composition_spec_version: MARKETING_SPEC_VERSION,
    assets,
    media: {
      published: [],
      public_fields: PUBLIC_MEDIA_FIELDS,
      policy: PUBLIC_MEDIA_POLICY,
    },
    motion: MOTION_POLICY,
    voice: PUBLIC_VOICE_RULES,
    guidance: {
      accessibility: PUBLIC_ACCESSIBILITY_RULES,
      icons: PUBLIC_ICON_RULES,
      imagery: PUBLIC_IMAGERY_RULES,
      logos: PUBLIC_LOGO_RULES,
      screenshots: PUBLIC_SCREENSHOT_RULES,
    },
    do_dont: PUBLIC_DO_DONT,
    exceptions: release.exceptions,
    changelog: release.changelog,
  };

  assertPublicSafeProjection(manifest);
  return manifest;
}

export function validatePublicBrandManifest(
  actual: PublicBrandManifest,
  expected: PublicBrandManifest
): readonly string[] {
  const errors: string[] = [];
  try {
    assertPublicSafeProjection(actual);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const missingSections = expected.sections.filter(
    section => !actual.sections.includes(section)
  );
  if (missingSections.length > 0) {
    errors.push(`Missing required sections: ${missingSections.join(', ')}.`);
  }
  if (stableJson(actual.sections) !== stableJson(expected.sections)) {
    errors.push('Required public sections or their order do not match.');
  }
  if (actual.source_digest !== expected.source_digest) {
    errors.push('Canonical source digest does not match the public manifest.');
  }
  if (stableJson(actual.sources) !== stableJson(expected.sources)) {
    errors.push(
      'Canonical source provenance does not match the public manifest.'
    );
  }
  if (stableJson(actual.tokens) !== stableJson(expected.tokens)) {
    errors.push('Canonical token export does not match the public manifest.');
  }
  if (stableJson(actual.components) !== stableJson(expected.components)) {
    errors.push(
      'Canonical component registry does not match the public manifest.'
    );
  }
  if (
    stableJson(actual.approved_examples) !==
    stableJson(expected.approved_examples)
  ) {
    errors.push(
      'Approved composition examples do not match the public manifest.'
    );
  }
  if (stableJson(actual.assets) !== stableJson(expected.assets)) {
    errors.push('Public asset checksums do not match the public manifest.');
  }
  if (actual.version !== expected.version) {
    errors.push('Design System version does not match the release contract.');
  }
  if (
    actual.released_at !== expected.released_at ||
    actual.schema_version !== expected.schema_version
  ) {
    errors.push('Design System release metadata does not match the contract.');
  }
  if (actual.composition_spec_version !== expected.composition_spec_version) {
    errors.push('Marketing composition spec version does not match.');
  }
  if (stableJson(actual.changelog) !== stableJson(expected.changelog)) {
    errors.push('Design System changelog does not match the release contract.');
  }
  return errors;
}

export function assertVersionProgression(
  previous: PublicBrandManifest,
  next: PublicBrandManifest
): void {
  if (
    previous.source_digest !== next.source_digest &&
    previous.version === next.version
  ) {
    throw new Error(
      'Canonical Brand System sources changed without a Design System version bump and matching newest changelog entry.'
    );
  }
}

export function serializePublicBrandManifest(
  manifest: PublicBrandManifest
): string {
  const sorted = JSON.parse(stableJson(manifest)) as PublicBrandManifest;
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function writePublicBrandManifest(): PublicBrandManifest {
  const next = buildPublicBrandManifest();
  if (existsSync(OUTPUT_PATH)) {
    const previous = JSON.parse(
      readFileSync(OUTPUT_PATH, 'utf8')
    ) as PublicBrandManifest;
    assertVersionProgression(previous, next);
  }
  writeFileSync(OUTPUT_PATH, serializePublicBrandManifest(next));
  return next;
}

export function checkPublicBrandManifest(): void {
  const expected = buildPublicBrandManifest();
  if (!existsSync(OUTPUT_PATH)) {
    throw new Error(
      `Public Brand System manifest is missing. Run: pnpm --filter @jovie/web run brand:build`
    );
  }
  const actual = JSON.parse(
    readFileSync(OUTPUT_PATH, 'utf8')
  ) as PublicBrandManifest;
  const errors = validatePublicBrandManifest(actual, expected);
  if (errors.length > 0) {
    if (
      actual.source_digest !== expected.source_digest &&
      actual.version === expected.version
    ) {
      errors.push(
        'Bump apps/web/design/system-release.json and add the matching newest changelog entry.'
      );
    }
    throw new Error(
      `Public Brand System drift detected:\n${errors
        .map(error => `- ${error}`)
        .join(
          '\n'
        )}\nRun after versioning: pnpm --filter @jovie/web run brand:build`
    );
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    if (process.argv.includes('--check')) {
      checkPublicBrandManifest();
      console.log('Public Brand System manifest is in sync.');
    } else {
      const manifest = writePublicBrandManifest();
      console.log(
        `Wrote ${relative(REPO_ROOT, OUTPUT_PATH)} at version ${manifest.version}.`
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
