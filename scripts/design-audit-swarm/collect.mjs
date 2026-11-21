/**
 * Read-only design-audit collectors. Spawn check CLIs — no pen writer/fixer
 * imports and no heavy import-graph coupling into script-contracts.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {'design-governance'|'anti-slop'|'fragmentation'|'pen-parity'|'media-gen-inventory'} DesignAuditRecipeId */

/** @type {readonly {id:DesignAuditRecipeId,title:string,description:string,labels:string[],collectors:string[]}[]} */
export const DESIGN_AUDIT_RECIPES = [
  {
    id: 'design-governance',
    title: 'Design governance drift',
    description: 'Skills, tokens, authority, drift ledger.',
    labels: ['product:jovie'],
    collectors: ['governance'],
  },
  {
    id: 'anti-slop',
    title: 'Anti-slop registry',
    description: 'Registry integrity and prose drift.',
    labels: ['product:jovie'],
    collectors: ['antiSlop'],
  },
  {
    id: 'fragmentation',
    title: 'Token/component fragmentation',
    description: 'Ownership + shared-UI visual-arbitrary debt.',
    labels: ['product:jovie'],
    collectors: ['fragmentation'],
  },
  {
    id: 'pen-parity',
    title: 'Pen↔code parity',
    description: 'Pen binding validate (read-only).',
    labels: ['product:jovie'],
    collectors: ['penParity'],
  },
  {
    id: 'media-gen-inventory',
    title: 'Media-gen surface inventory',
    description: 'Marketing-media adapter inventory.',
    labels: ['product:jovie'],
    collectors: ['mediaGen'],
  },
];

export const DESIGN_AUDIT_RECIPE_BY_ID = Object.fromEntries(
  DESIGN_AUDIT_RECIPES.map(r => [r.id, r])
);

/** @param {string} recipeId */
export function getRecipe(recipeId) {
  const recipe =
    DESIGN_AUDIT_RECIPE_BY_ID[/** @type {DesignAuditRecipeId} */ (recipeId)];
  if (!recipe) throw new Error(`Unknown design audit recipe: ${recipeId}`);
  return recipe;
}

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const MEDIA_GEN_SURFACES = [
  'apps/web/scripts/marketing-media/generate-image.ts',
  'apps/web/scripts/marketing-media/image-adapter.ts',
  'apps/web/scripts/marketing-media/codex-image-adapter.ts',
  'apps/web/scripts/marketing-media/fal-image-adapter.ts',
  'apps/web/scripts/marketing-media/capture-adapter.ts',
  'apps/web/scripts/marketing-media/media-export-seam.ts',
];

/** @param {object} partial */
function finding(partial) {
  return {
    evidencePaths: [],
    kind: 'drift',
    priority: 'P1',
    ...partial,
  };
}

/** @param {string} repoRoot @param {string[]} args */
function runNode(repoRoot, args) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

function collectGovernance(repoRoot) {
  const result = runNode(repoRoot, ['scripts/design-governance-audit.mjs']);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status === 0) return [];
  return [
    finding({
      id: 'gov-audit-failed',
      recipeId: 'design-governance',
      title: 'Design governance audit failed',
      summary:
        output.trim().slice(0, 2000) ||
        'design-governance-audit exited non-zero',
      priority: 'P0',
      kind: 'governance',
      evidencePaths: ['scripts/design-governance-audit.mjs'],
    }),
  ];
}

function collectAntiSlop(repoRoot) {
  const result = runNode(repoRoot, ['scripts/anti-slop/run.mjs', 'validate']);
  if (result.status === 0) return [];
  const detail = (result.stderr || result.stdout || '').trim().slice(0, 2000);
  return [
    finding({
      id: 'anti-slop-validate',
      recipeId: 'anti-slop',
      title: 'Anti-slop registry drift',
      summary: detail || 'anti-slop validate exited non-zero',
      priority: 'P1',
      kind: 'anti-slop',
      evidencePaths: ['docs/design-system/anti-slop-rules.json'],
    }),
  ];
}

function collectFragmentation(repoRoot) {
  /** @type {ReturnType<typeof finding>[]} */
  const findings = [];
  const ownership = runNode(repoRoot, [
    'scripts/component-ownership-check.mjs',
  ]);
  if (ownership.status !== 0) {
    findings.push(
      finding({
        id: 'frag-ownership',
        recipeId: 'fragmentation',
        title: 'Component ownership violation',
        summary: (ownership.stderr || ownership.stdout || '')
          .trim()
          .slice(0, 2000),
        priority: 'P1',
        kind: 'fragmentation',
        evidencePaths: ['docs/design-system/component-ownership.json'],
      })
    );
  }
  const visual = runNode(repoRoot, [
    'scripts/shared-ui-visual-arbitrary-audit.mjs',
  ]);
  if (visual.status !== 0) {
    findings.push(
      finding({
        id: 'frag-shared-ui-visual',
        recipeId: 'fragmentation',
        title: 'Shared-UI visual arbitrary debt grew',
        summary: (visual.stderr || visual.stdout || '').trim().slice(0, 2000),
        priority: 'P1',
        kind: 'fragmentation',
        evidencePaths: ['scripts/shared-ui-visual-arbitrary-audit.mjs'],
      })
    );
  }
  return findings;
}

function collectPenParity(repoRoot) {
  const result = runNode(repoRoot, [
    'scripts/design/pen-bindings.mjs',
    'validate',
  ]);
  if (result.status === 0) return [];
  return [
    finding({
      id: 'pen-parity-validate',
      recipeId: 'pen-parity',
      title: 'Pen binding parity error',
      summary: (result.stderr || result.stdout || '').trim().slice(0, 2000),
      priority: 'P1',
      kind: 'pen-parity',
      evidencePaths: ['scripts/design/pen-bindings.mjs'],
    }),
  ];
}

function collectMediaGen(repoRoot) {
  const missing = MEDIA_GEN_SURFACES.filter(
    relative => !existsSync(path.join(repoRoot, relative))
  );
  const dir = path.join(repoRoot, 'apps/web/scripts/marketing-media');
  const adapters = existsSync(dir)
    ? readdirSync(dir).filter(name => name.endsWith('-adapter.ts'))
    : [];
  /** @type {ReturnType<typeof finding>[]} */
  const findings = [];
  if (missing.length > 0) {
    findings.push(
      finding({
        id: 'media-gen-missing-surfaces',
        recipeId: 'media-gen-inventory',
        title: 'Media-gen surface missing',
        summary: `Expected media-gen files missing: ${missing.join(', ')}`,
        priority: 'P1',
        kind: 'inventory',
        evidencePaths: missing,
      })
    );
  }
  if (adapters.length === 0) {
    findings.push(
      finding({
        id: 'media-gen-no-adapters',
        recipeId: 'media-gen-inventory',
        title: 'No media-gen adapters found',
        summary: 'marketing-media has no *-adapter.ts files.',
        priority: 'P2',
        kind: 'inventory',
        evidencePaths: ['apps/web/scripts/marketing-media'],
      })
    );
  }
  return findings;
}

const COLLECTORS = {
  governance: collectGovernance,
  antiSlop: collectAntiSlop,
  fragmentation: collectFragmentation,
  penParity: collectPenParity,
  mediaGen: collectMediaGen,
};

/**
 * @param {object} [options]
 * @param {string} [options.recipeId]
 * @param {string} [options.repoRoot]
 */
export function collectDesignAuditFindings(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const recipes = options.recipeId
    ? [getRecipe(options.recipeId)]
    : [...DESIGN_AUDIT_RECIPES];
  /** @type {ReturnType<typeof finding>[]} */
  const findings = [];
  for (const recipe of recipes) {
    for (const collectorId of recipe.collectors) {
      const collector = COLLECTORS[collectorId];
      if (!collector) throw new Error(`Unknown collector: ${collectorId}`);
      findings.push(...collector(repoRoot));
    }
  }
  return findings;
}

export const READ_ONLY_CONTRACT = Object.freeze({
  mutatesPen: false,
  mutatesProductCode: false,
  proposesLinearOnly: true,
});
