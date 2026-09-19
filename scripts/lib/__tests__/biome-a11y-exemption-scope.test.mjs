import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const BIOME_CONFIG = readFileSync(resolve(REPO_ROOT, 'biome.json'), 'utf8');
const FORMER_WHOLE_FILE_EXEMPTIONS = [
  'LoadingSpinner.tsx',
  'LogoLoader.tsx',
  'StatusBadge.tsx',
  'ProfileSkeleton.tsx',
  'EmptyState.tsx',
  'StarterEmptyState.tsx',
  'ProfileForm.tsx',
  'OnboardingHandleStep.tsx',
  'ComboboxDropdown.tsx',
  'SmartHandleInput.tsx',
  'CopyToClipboardButton.tsx',
  'UniversalLinkInputUrlMode.tsx',
  'OptimisticProgress.tsx',
  'ProgressIndicator.tsx',
  'TipSelector.tsx',
  'DashboardOverviewToolbar.tsx',
  'ProfileLinkCategorySelector.tsx',
  'KanbanBoard.tsx',
  'TableCheckboxCell.tsx',
  'AudienceCreatedAtCell.tsx',
  'AudienceLastSeenCell.tsx',
  'AudienceRowSelectionCell.tsx',
  'CreatorProfileTableRow.tsx',
  'WaitlistSocialStep.tsx',
  'WaitlistSpotifySearch.tsx',
  'UniversalLinkInputArtistSearchMode.tsx',
  'UniversalLinkInput.tsx',
  'ComboboxOptionItem.tsx',
  'ReleasesEmptyState.tsx',
  'AvatarUploadable.tsx',
  'PlatformPill.tsx',
  'YouTubeCrossCategoryPrompt.tsx',
];

const PRODUCTION_A11Y_PATHS = [
  'apps/web/components/organisms/table/atoms/AudienceRowSelectionCell.tsx',
  'apps/web/components/organisms/table/atoms/TableCheckboxCell.tsx',
  'apps/web/components/features/admin/CreatorProfileTableRow.tsx',
  'apps/web/components/features/admin/table/organisms/KanbanBoard.tsx',
];

const GREEN_FIXTURE_PATHS = [
  'apps/web/components/organisms/table/atoms/fixtures/button-click.a11y-green.tsx',
  'apps/web/components/features/admin/table/organisms/fixtures/drop-zone.a11y-green.tsx',
];

const RED_FIXTURE_PATHS = [
  'apps/web/components/organisms/table/atoms/fixtures/static-click.a11y-red.tsx',
  'apps/web/components/features/admin/fixtures/static-click.a11y-red.tsx',
  'apps/web/components/features/admin/table/organisms/fixtures/static-click.a11y-red.tsx',
];

const REMAINING_GLOB_A11Y_INCLUDES = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.stories.tsx',
  '**/tests/**',
  '**/.storybook/**',
  '**/scripts/**',
  '**/*TableUnified.tsx',
  '**/*ProfilesUnified.tsx',
];

function runBiome(paths) {
  return spawnSync(
    'pnpm',
    ['exec', 'biome', 'check', '--reporter=json', ...paths],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
}

function parseBiomeReport(result) {
  const raw = `${result.stdout ?? ''}`;
  const start = raw.indexOf('{');
  expect(start).toBeGreaterThan(-1);
  return JSON.parse(raw.slice(start));
}

function a11yCategories(report) {
  return (report.diagnostics ?? []).map(item => item.category);
}

describe('Biome a11y exemption scope', () => {
  it('inventories remaining glob a11y offs and forbids production file-level offs', () => {
    expect(BIOME_CONFIG).not.toContain('"useSemanticElements": "off"');
    expect(BIOME_CONFIG).not.toContain('"useFocusableInteractive": "off"');
    expect(BIOME_CONFIG).not.toContain('"useAriaPropsSupportedByRole": "off"');
    expect(BIOME_CONFIG).not.toContain('"noStaticElementInteractions": "off"');
    expect(BIOME_CONFIG).toContain('"!**/*.a11y-red.tsx"');

    for (const name of FORMER_WHOLE_FILE_EXEMPTIONS) {
      expect(BIOME_CONFIG).not.toContain(`**/${name}`);
      expect(BIOME_CONFIG).not.toContain(`/${name}"`);
    }

    const config = JSON.parse(BIOME_CONFIG);
    const a11yOverrides = (config.overrides ?? []).filter(
      override => override.linter?.rules?.a11y
    );
    expect(a11yOverrides).toHaveLength(1);
    expect(a11yOverrides[0].includes).toEqual(REMAINING_GLOB_A11Y_INCLUDES);
    expect(a11yOverrides[0].linter.rules.a11y).toEqual({
      noNoninteractiveElementInteractions: 'off',
      useAltText: 'off',
    });
  });

  it('keeps the former whole-file production components green via targeted ignores', () => {
    const result = runBiome(PRODUCTION_A11Y_PATHS);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    for (const rel of PRODUCTION_A11Y_PATHS) {
      const source = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
      expect(source).toMatch(/biome-ignore lint\/a11y\//);
    }
  });

  it('keeps legitimate neighboring green fixtures passing', () => {
    const result = runBiome(GREEN_FIXTURE_PATHS);
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('fails committed deliberate-red siblings when biome actually sees them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'biome-a11y-red-'));
    try {
      for (const rel of RED_FIXTURE_PATHS) {
        const source = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
        expect(source).toContain('data-deliberate-red');
        const file = join(dir, `${rel.replaceAll('/', '__')}.probe.tsx`);
        writeFileSync(file, source);
        const result = runBiome([file]);
        const cats = a11yCategories(parseBiomeReport(result));
        expect(cats.join('\n')).toMatch(
          /lint\/a11y\/(noStaticElementInteractions|noNoninteractiveElementInteractions|useKeyWithClickEvents)/
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
