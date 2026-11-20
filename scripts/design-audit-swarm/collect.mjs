/**
 * Read-only design-audit collectors. No pen writer / fixer / emit imports.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runValidate } from '../anti-slop/run.mjs';
import {
  checkChromeRepository,
  checkRepository,
} from '../component-ownership-check.mjs';
import { loadBindings, validateBindings } from '../design/pen-bindings-lib.mjs';
import { runDesignGovernanceAudit } from '../design-governance-audit.mjs';
import { evaluateSharedUiVisualArbitraryAudit } from '../shared-ui-visual-arbitrary-audit.mjs';

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

function collectGovernance(repoRoot) {
  const { failed, warned } = runDesignGovernanceAudit(repoRoot, {
    includeAuthorityMap: true,
  });
  return [
    ...failed.map(check =>
      finding({
        id: `gov-${check.id}`,
        recipeId: 'design-governance',
        title: `Governance FAIL: ${check.id}`,
        summary: check.detail,
        priority: 'P0',
        kind: 'governance',
        evidencePaths: ['scripts/design-governance-audit.mjs', check.id],
        surface: check.id,
      })
    ),
    ...warned.map(check =>
      finding({
        id: `gov-warn-${check.id}`,
        recipeId: 'design-governance',
        title: `Governance WARN: ${check.id}`,
        summary: check.detail,
        priority: 'P2',
        kind: 'governance',
        evidencePaths: ['scripts/design-governance-audit.mjs', check.id],
        surface: check.id,
      })
    ),
  ];
}

function collectAntiSlop(repoRoot) {
  return runValidate(repoRoot).errors.map((message, index) =>
    finding({
      id: `anti-slop-${index + 1}`,
      recipeId: 'anti-slop',
      title: 'Anti-slop registry drift',
      summary: message,
      priority: 'P1',
      kind: 'anti-slop',
      evidencePaths: ['docs/design-system/anti-slop-rules.json'],
    })
  );
}

function collectFragmentation() {
  const ownership = [...checkRepository(), ...checkChromeRepository()].slice(
    0,
    25
  );
  const ownershipFindings = ownership.map((violation, index) =>
    finding({
      id: `frag-ownership-${index + 1}`,
      recipeId: 'fragmentation',
      title: 'Component ownership violation',
      summary: `${violation.filePath}: ${violation.reason ?? violation.internal ?? 'ownership drift'}`,
      priority: 'P1',
      kind: 'fragmentation',
      evidencePaths: [
        violation.filePath,
        'docs/design-system/component-ownership.json',
      ],
      surface: violation.filePath,
    })
  );

  const visual = evaluateSharedUiVisualArbitraryAudit();
  if (visual.ok !== false) return ownershipFindings;
  return [
    ...ownershipFindings,
    finding({
      id: 'frag-shared-ui-visual',
      recipeId: 'fragmentation',
      title: 'Shared-UI visual arbitrary debt grew',
      summary:
        (visual.issues ?? []).slice(0, 5).join('; ') ||
        `shared-ui visual-arbitrary ${visual.status}`,
      priority: 'P1',
      kind: 'fragmentation',
      evidencePaths: ['scripts/shared-ui-visual-arbitrary-audit.mjs'],
    }),
  ];
}

function collectPenParity(repoRoot) {
  const errors = validateBindings(loadBindings(repoRoot), { root: repoRoot });
  return errors.map((message, index) =>
    finding({
      id: `pen-parity-${index + 1}`,
      recipeId: 'pen-parity',
      title: 'Pen binding parity error',
      summary: message,
      priority: 'P1',
      kind: 'pen-parity',
      evidencePaths: ['scripts/design/pen-bindings-lib.mjs'],
    })
  );
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
