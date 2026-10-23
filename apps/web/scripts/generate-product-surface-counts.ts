/**
 * Count product-surface facts from source so marketing pages can import the
 * numbers instead of hard-coding them.
 *
 *   pnpm --filter @jovie/web run product-surface-counts
 *   pnpm --filter @jovie/web run product-surface-counts:check
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCommands,
  COMMANDS,
  type Command,
  isCommandVisible,
} from '../lib/commands/registry';
import {
  FOUNDER_DOOR_SHORTCUT,
  KEYBOARD_SHORTCUTS,
  type ShortcutCategory,
  WORKSPACE_SWITCH_SHORTCUT,
} from '../lib/keyboard-shortcuts';
import { ALL_UTM_PRESETS, UTM_PRESET_CATEGORIES } from '../lib/utm/presets';

const OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../data/marketing/product-surface-counts.gen.json'
);

function countByKind(commands: readonly Command[]) {
  let skill = 0;
  let nav = 0;
  for (const command of commands) {
    if (command.kind === 'skill') skill += 1;
    else nav += 1;
  }
  return { skill, nav, total: commands.length };
}

export function collectProductSurfaceCounts() {
  const byCategory: Record<ShortcutCategory, number> = {
    general: 0,
    navigation: 0,
    actions: 0,
    player: 0,
  };
  for (const shortcut of KEYBOARD_SHORTCUTS) {
    byCategory[shortcut.category] += 1;
  }

  const excludedFromPublicCatalog = [
    WORKSPACE_SWITCH_SHORTCUT,
    FOUNDER_DOOR_SHORTCUT,
  ];
  for (const shortcut of excludedFromPublicCatalog) {
    if (KEYBOARD_SHORTCUTS.some(entry => entry.id === shortcut.id)) {
      throw new Error(
        `${shortcut.id} is in the public shortcut catalog; exclusion is stale`
      );
    }
  }

  const gThenSequences = KEYBOARD_SHORTCUTS.filter(
    shortcut => shortcut.isSequential
  ).map(shortcut => ({
    id: shortcut.id,
    keys: shortcut.keys,
    firstKey: shortcut.firstKey ?? null,
    secondKey: shortcut.secondKey ?? null,
  }));

  const visibleByDefault = COMMANDS.filter(command =>
    isCommandVisible(command, {})
  );
  const flagGatedNavigation = COMMANDS.flatMap(command => {
    if (command.kind !== 'nav' || !command.requiredFlag) return [];
    return [
      {
        id: command.id,
        requiredFlag: command.requiredFlag,
        visibleByDefault: isCommandVisible(command, {}),
      },
    ];
  });

  const defaultIds = new Set(COMMANDS.map(command => command.id));
  const discoverabilityGatedNavigation = (
    [
      [{ youtubeWorkspaceNav: true }, 'YOUTUBE_WORKSPACE_NAV'],
      [{ jovieWorkNav: true }, 'JOVIE_WORK_NAV'],
    ] as const
  ).flatMap(([options, flag]) =>
    buildCommands(options).flatMap(command =>
      defaultIds.has(command.id)
        ? []
        : [{ id: command.id, kind: command.kind, flag }]
    )
  );

  const categories = UTM_PRESET_CATEGORIES.map(category => ({
    id: category.id,
    label: category.label,
    presetCount: category.presets.length,
  }));
  const categoryPresetCount = categories.reduce(
    (sum, category) => sum + category.presetCount,
    0
  );
  if (categoryPresetCount !== ALL_UTM_PRESETS.length) {
    throw new Error(
      `UTM category presets (${categoryPresetCount}) diverge from ALL_UTM_PRESETS (${ALL_UTM_PRESETS.length})`
    );
  }
  const presetIds = ALL_UTM_PRESETS.map(preset => preset.id);
  if (new Set(presetIds).size !== presetIds.length) {
    throw new Error('UTM preset ids are not unique');
  }

  return {
    schemaVersion: 1,
    sources: [
      'apps/web/lib/keyboard-shortcuts.ts',
      'apps/web/lib/commands/registry.ts',
      'apps/web/lib/utm/presets.ts',
    ],
    keyboardShortcuts: {
      publicCatalogCount: KEYBOARD_SHORTCUTS.length,
      byCategory,
      excludedFromPublicCatalog: excludedFromPublicCatalog.map(shortcut => ({
        id: shortcut.id,
        reason: 'Admin-only binding kept outside the public catalog',
      })),
      gThenCount: gThenSequences.length,
      gThenSequences,
    },
    commands: {
      defaultRegistry: countByKind(COMMANDS),
      visibleByDefault: countByKind(visibleByDefault),
      flagGatedNavigation,
      discoverabilityGatedNavigation,
    },
    trackedLinks: {
      presetCount: ALL_UTM_PRESETS.length,
      categoryCount: categories.length,
      categories,
    },
  };
}

export function renderProductSurfaceCounts() {
  return `${JSON.stringify(collectProductSurfaceCounts(), null, 2)}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  const next = renderProductSurfaceCounts();
  if (check) {
    const current = readFileSync(OUTPUT, 'utf8');
    if (current !== next) {
      console.error(
        `Stale product surface counts: ${OUTPUT}\nRun: pnpm --filter @jovie/web run product-surface-counts`
      );
      process.exit(1);
    }
    console.log('product surface counts are current');
    return;
  }
  writeFileSync(OUTPUT, next);
  console.log(`wrote ${OUTPUT}`);
}

const isDirectRun = process.argv[1]?.includes(
  'generate-product-surface-counts'
);
if (isDirectRun) main();
