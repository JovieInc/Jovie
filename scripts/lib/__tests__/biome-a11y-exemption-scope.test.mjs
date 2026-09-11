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

function runBiome(paths) {
  return spawnSync(
    'pnpm',
    ['exec', 'biome', 'check', '--reporter=json', ...paths],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
}

describe('Biome a11y exemption scope', () => {
  it('does not disable a11y rules for entire production components', () => {
    expect(BIOME_CONFIG).not.toContain('"useSemanticElements": "off"');
    expect(BIOME_CONFIG).not.toContain('"noStaticElementInteractions": "off"');
    expect(BIOME_CONFIG).not.toContain('"useFocusableInteractive": "off"');
    expect(BIOME_CONFIG).not.toContain('"useAriaPropsSupportedByRole": "off"');
    for (const name of FORMER_WHOLE_FILE_EXEMPTIONS) {
      expect(BIOME_CONFIG).not.toContain(`**/${name}`);
    }
  });

  it('keeps KanbanBoard green after targeted suppressions', () => {
    const result = runBiome([
      'apps/web/components/features/admin/table/organisms/KanbanBoard.tsx',
    ]);
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('fails a new static-element interaction that the old KanbanBoard exemption would have hidden', () => {
    const dir = mkdtempSync(join(tmpdir(), 'biome-a11y-red-'));
    try {
      const file = join(dir, 'KanbanBoard.red.tsx');
      writeFileSync(
        file,
        'export function KanbanBoardDeliberateRed() {\n' +
          '  return (\n' +
          '    <div onClick={() => undefined}>planted a11y violation</div>\n' +
          '  );\n' +
          '}\n'
      );
      const result = runBiome([file]);
      const raw = `${result.stdout ?? ''}`;
      const start = raw.indexOf('{');
      expect(start).toBeGreaterThan(-1);
      const report = JSON.parse(raw.slice(start));
      const cats = (report.diagnostics ?? []).map(item => item.category);
      expect(cats.join('\n')).toMatch(
        /lint\/a11y\/(noStaticElementInteractions|noNoninteractiveElementInteractions|useKeyWithClickEvents)/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
