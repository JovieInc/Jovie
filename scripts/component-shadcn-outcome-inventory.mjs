#!/usr/bin/env node
/** Shadcn/Typeset outcome inventory (JOV-5438). Public references only. */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runComparativeQualityBar } from './component-comparative-quality-bar.mjs';
import {
  listComponentsInRoot,
  REPO_ROOT as POLICY_REPO_ROOT,
} from './component-ship-policy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = POLICY_REPO_ROOT ?? resolve(__dirname, '..');
export const OUTCOME_INVENTORY_SCHEMA = 'jovie.shadcn-outcome-inventory/v1';
export const ENROLLMENT_BATCH = 'batch-1';
export const PRODUCT_CONTEXTS = Object.freeze([
  'artist-profiles',
  'smart-links',
  'embedded-mobile',
]);
export const DISPOSITIONS = Object.freeze(['keep', 'improve', 'diverge']);
export const INVENTORY_LAYERS = Object.freeze(['atom', 'molecule', 'system']);
export const BENCHMARK_DIMENSIONS = Object.freeze([
  'select-layout-stability',
  'keyboard-shortcut',
  'button-affordance',
  'toggle-state',
  'compact-navigation',
  'card-bento',
  'form-control',
  'typography-rhythm',
  'typography-overflow',
]);
export const APPROVED_ENROLLMENT_BATCH_IDS = Object.freeze([
  'atom.select',
  'atom.kbd',
  'atom.button',
  'atom.switch',
  'molecule.sidebar-nav-item',
  'atom.card',
  'atom.field',
  'typography.system-b',
]);
export const CATALOG_ROOTS = Object.freeze([
  Object.freeze({ root: 'packages/ui/atoms', layer: 'atom' }),
  Object.freeze({ root: 'apps/web/components/molecules', layer: 'molecule' }),
]);
export const OUTCOME_PROVENANCE = Object.freeze({
  license: 'MIT',
  licenseUrl: 'https://github.com/shadcn-ui/ui/blob/main/LICENSE.md',
  boundary:
    'Public outcome references only. Jovie does not import Shadcn or Typeset source, CSS, fonts, assets, or packages. Comparison is outcome-only against Jovie primitives.',
  references: Object.freeze([
    Object.freeze({
      name: 'shadcn/ui',
      url: 'https://ui.shadcn.com/docs/components',
      license: 'MIT',
      role: 'component-outcome-baseline',
    }),
    Object.freeze({
      name: 'shadcn/ui typography',
      url: 'https://ui.shadcn.com/docs/components/typography',
      license: 'MIT',
      role: 'typography-outcome-baseline',
    }),
    Object.freeze({
      name: 'Typeset',
      concepts: Object.freeze(['rhythm', 'overflow', 'measure']),
      role: 'typography-outcome-concepts',
      note: 'Named public typography outcome concepts. No Typeset implementation, font, or CSS is imported.',
    }),
  ]),
  forbiddenImplementationImports: Object.freeze([
    'shadcn',
    'shadcn/ui',
    '@shadcn/ui',
    'shadcn-ui',
    'typeset',
    '@typeset',
  ]),
});

const DIMENSION_SET = new Set(BENCHMARK_DIMENSIONS);
const DISPOSITION_SET = new Set(DISPOSITIONS);
const CONTEXT_SET = new Set(PRODUCT_CONTEXTS);
const LAYER_SET = new Set(INVENTORY_LAYERS);
const APPROVED_SET = new Set(APPROVED_ENROLLMENT_BATCH_IDS);
const PUBLIC_PATTERN_HOSTS = new Set(['ui.shadcn.com']);
const LAYOUT_CONTRACTS = new Set([
  'static',
  'reserved-geometry',
  'bounded-local-disclosure',
]);
const BUTTON_VARIANTS = new Set([
  'primary',
  'secondary',
  'tertiary',
  'ghost',
  'destructive',
  'outline',
  'link',
  'default',
]);
const COLOR_NAME_VARIANT =
  /^(blue|green|purple|orange|red|gray|grey|yellow|pink|cyan)$/i;
const FORBIDDEN_IMPORT_RE =
  /(?:from|import\()\s*['"](?:@?shadcn(?:\/ui)?(?:\/[^'"]*)?|shadcn-ui|@?typeset(?:\/[^'"]*)?)['"]/;
const SHARED_REASONS = Object.freeze({
  'select-layout-stability': 'owned by atom.select overlay geometry',
  'keyboard-shortcut': 'owned by atom.kbd',
  'button-affordance': 'owned by atom.button',
  'toggle-state': 'owned by atom.switch',
  'compact-navigation': 'owned by molecule.sidebar-nav-item',
  'card-bento': 'owned by atom.card',
  'form-control': 'owned by atom.field',
  'typography-rhythm': 'owned by typography.system-b',
  'typography-overflow': 'owned by typography.system-b',
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function kebabName(base) {
  return String(base || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}
function finding(dimension, detail) {
  return { dimension, detail };
}
function csv(value) {
  return value ? value.split(',').filter(Boolean) : [];
}
function dimensionContract(applicable, reasons = SHARED_REASONS) {
  const applicableSet = new Set(applicable);
  return {
    applicable: Object.freeze([...applicable]),
    notApplicable: Object.freeze(
      BENCHMARK_DIMENSIONS.filter(id => !applicableSet.has(id)).map(id =>
        Object.freeze({
          invariant: id,
          reason: reasons[id] ?? 'not applicable to this owner or sample',
        })
      )
    ),
  };
}

function parseEntries(raw) {
  return raw
    .trim()
    .split('\n')
    .map(line => {
      const [
        id,
        layer,
        source,
        exportName,
        slug,
        disposition,
        applicable,
        related,
        story,
        test,
        invariant,
      ] = line.split('|');
      const evidence =
        story === 'DESIGN.md'
          ? { canon: story, tokens: test }
          : { story, test };
      return Object.freeze({
        id,
        layer,
        source,
        exportName,
        enrolled: true,
        enrollmentBatch: ENROLLMENT_BATCH,
        nearestPublicPattern: Object.freeze({
          name: exportName,
          url: `https://ui.shadcn.com/docs/components/${slug}`,
          license: 'MIT',
        }),
        disposition,
        productContexts: PRODUCT_CONTEXTS,
        related: Object.freeze(csv(related)),
        evidence: Object.freeze(evidence),
        outcomeInvariants: Object.freeze(invariant.split(';;')),
        ...dimensionContract(csv(applicable)),
      });
    });
}

export const OUTCOME_INVENTORY = Object.freeze({
  schema: OUTCOME_INVENTORY_SCHEMA,
  enrollmentBatch: ENROLLMENT_BATCH,
  provenance: OUTCOME_PROVENANCE,
  productContexts: PRODUCT_CONTEXTS,
  benchmarkDimensions: BENCHMARK_DIMENSIONS,
  entries: Object.freeze(
    parseEntries(
      `
atom.select|atom|packages/ui/atoms/select.tsx|Select|select|improve|select-layout-stability|atom.native-select,atom.field|packages/ui/atoms/select.stories.tsx|packages/ui/atoms/select.test.tsx|Trigger geometry stays reserved while the listbox opens.;;Overlay is portaled or a bounded local disclosure; siblings do not shift.
atom.kbd|atom|packages/ui/atoms/kbd.tsx|Kbd|kbd|keep|keyboard-shortcut|atom.tooltip-shortcut|packages/ui/atoms/kbd.stories.tsx|packages/ui/atoms/kbd.test.tsx|Shortcut glyphs stay named, unique in the sample, and source-blind.
atom.button|atom|packages/ui/atoms/button.tsx|Button|button|diverge|button-affordance|atom.icon-button|packages/ui/atoms/button.stories.tsx|packages/ui/atoms/button.test.tsx|Pill CTA with a semantic variant and a stable static layout contract.
atom.switch|atom|packages/ui/atoms/switch.tsx|Switch|switch|keep|toggle-state||packages/ui/atoms/switch.stories.tsx|packages/ui/atoms/switch.test.tsx|Named switch state changes without shifting surrounding geometry.
molecule.sidebar-nav-item|molecule|apps/web/components/shell/SidebarNavItem.tsx|SidebarNavItem|sidebar|diverge|compact-navigation|atom.segment-control|apps/web/components/shell/SidebarNavItem.stories.tsx|apps/web/components/shell/SidebarNavItem.test.tsx|Compact shell rows keep an accessible name when collapsed.;;No decorative hover translation.
atom.card|atom|packages/ui/atoms/card.tsx|Card|card|keep|card-bento||packages/ui/atoms/Card.stories.tsx|packages/ui/atoms/card.test.tsx|Single card surface; nested card-in-card compositions are blocked.
atom.field|atom|packages/ui/atoms/field.tsx|Field|field|keep|form-control|atom.input,atom.textarea,atom.checkbox,atom.label|packages/ui/atoms/field.stories.tsx|packages/ui/atoms/field.test.tsx|Labeled control; error/description reserve geometry and stay described.
typography.system-b|system|DESIGN.md|Typography|typography|diverge|typography-rhythm,typography-overflow||DESIGN.md|apps/web/styles/design-system.css|Heading leading stays near 1.3; body leading stays near 1.5.;;Long copy wraps; clip/visible overflow fails closed.
`.trim()
    )
  ),
});

export function ownerIdFromSource(sourceRel, layer) {
  return `${layer}.${kebabName(basename(sourceRel, '.tsx'))}`;
}
export function listScalableOwners(repoRoot = REPO_ROOT) {
  const owners = [];
  for (const { root, layer } of CATALOG_ROOTS) {
    for (const component of listComponentsInRoot(root, repoRoot)) {
      owners.push(
        Object.freeze({
          id: ownerIdFromSource(component.sourceRel, layer),
          layer,
          source: component.sourceRel,
          enrolled: false,
        })
      );
    }
  }
  return owners.sort((a, b) => a.id.localeCompare(b.id));
}

// biome-ignore format: compact fail-closed dimension contract
function collectNamedDimensions(record, issues, label) {
  const applicable = Array.isArray(record.applicable) ? record.applicable : [];
  const notApplicable = Array.isArray(record.notApplicable)
    ? record.notApplicable
    : [];
  const named = [];
  for (const id of applicable) {
    if (!DIMENSION_SET.has(id)) {
      issues.push(`${label}: unknown applicable benchmark dimension: ${id}`);
    }
    named.push(id);
  }
  for (const item of notApplicable) {
    const id = isObject(item) ? item.invariant : item;
    const reason = isObject(item) ? item.reason : '';
    if (!DIMENSION_SET.has(id)) issues.push(`${label}: unknown not-applicable benchmark dimension: ${id}`);
    else if (typeof reason !== 'string' || reason.trim() === '') {
      issues.push(`${label}: ${id} not-applicable requires an explicit reason; silent skips fail closed`);
    }
    named.push(id);
  }
  if (new Set(named).size !== named.length) {
    issues.push(`${label}: each benchmark dimension may be applicable or not-applicable, not both`);
  }
  for (const id of BENCHMARK_DIMENSIONS) {
    if (!named.includes(id)) {
      issues.push(`${label}: benchmark dimension ${id} is neither applicable nor explicitly not-applicable; fail closed`);
    }
  }
  return new Set(applicable.filter(id => DIMENSION_SET.has(id)));
}

function evidencePaths(evidence) {
  return isObject(evidence)
    ? Object.values(evidence).filter(
        value => typeof value === 'string' && value.trim() !== ''
      )
    : [];
}

function publicUrlOk(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && PUBLIC_PATTERN_HOSTS.has(url.host);
  } catch {
    return false;
  }
}

// biome-ignore format: compact provenance + inventory checks
function validateProvenance(provenance, issues) {
  if (!isObject(provenance)) { issues.push('provenance is required'); return; }
  const boundary = typeof provenance.boundary === 'string' ? provenance.boundary : '';
  if (provenance.license !== 'MIT' || !/does not import/i.test(boundary)) {
    issues.push('provenance must declare the MIT license boundary and that no third-party implementation is imported');
  }
  const references = Array.isArray(provenance.references) ? provenance.references : [];
  if (references.length === 0) issues.push('provenance requires public outcome references');
  for (const reference of references) {
    if (!isObject(reference) || typeof reference.name !== 'string') issues.push('provenance reference requires a name');
    else if (typeof reference.url === 'string' && !publicUrlOk(reference.url)) {
      issues.push(`provenance reference ${reference.name} is not a public Shadcn outcome URL`);
    }
  }
}

// biome-ignore format: compact inventory validation
export function evaluateOutcomeInventory(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const inventory = options.inventory ?? OUTCOME_INVENTORY;
  const issues = [];
  if (!isObject(inventory) || inventory.schema !== OUTCOME_INVENTORY_SCHEMA) issues.push(`inventory schema must be ${OUTCOME_INVENTORY_SCHEMA}`);
  if (inventory?.enrollmentBatch !== ENROLLMENT_BATCH) issues.push(`enrollment batch must be ${ENROLLMENT_BATCH}`);
  validateProvenance(inventory?.provenance, issues);
  const entries = Array.isArray(inventory?.entries) ? inventory.entries : [];
  if (entries.length === 0) issues.push('inventory entries are missing; fail closed');
  const ids = [];
  const enrolledIds = [];
  for (const item of entries) {
    if (!isObject(item) || typeof item.id !== 'string' || !item.id) { issues.push('inventory entry requires a stable id'); continue; }
    ids.push(item.id);
    if (!LAYER_SET.has(item.layer)) issues.push(`${item.id}: unknown layer ${item.layer}`);
    if (!DISPOSITION_SET.has(item.disposition)) issues.push(`${item.id}: unknown disposition ${item.disposition}`);
    const contexts = Array.isArray(item.productContexts) ? item.productContexts : [];
    if (contexts.length === 0) issues.push(`${item.id}: product contexts are required`);
    for (const context of contexts) {
      if (!CONTEXT_SET.has(context)) issues.push(`${item.id}: unknown product context ${context}`);
    }
    const pattern = item.nearestPublicPattern;
    if (!isObject(pattern) || typeof pattern.url !== 'string' || !publicUrlOk(pattern.url)) {
      issues.push(`${item.id}: nearest public Shadcn pattern is required`);
    }
    if (pattern?.license !== 'MIT') issues.push(`${item.id}: pattern license must be MIT`);
    if (!Array.isArray(item.outcomeInvariants) || item.outcomeInvariants.length === 0) issues.push(`${item.id}: outcome invariants are required`);
    if (item.enrolled === true) {
      enrolledIds.push(item.id);
      if (!APPROVED_SET.has(item.id)) issues.push(`${item.id}: unapproved enrollment; batch-1 is closed`);
      collectNamedDimensions(item, issues, item.id);
      for (const relativePath of [item.source, ...evidencePaths(item.evidence)].filter(Boolean)) {
        if (!existsSync(resolve(repoRoot, relativePath))) issues.push(`${item.id}: missing evidence path ${relativePath}`);
        else if (FORBIDDEN_IMPORT_RE.test(readFileSync(resolve(repoRoot, relativePath), 'utf8'))) {
          issues.push(`${relativePath}: forbidden Shadcn/Typeset implementation import`);
        }
      }
    } else if (item.applicable || item.notApplicable) {
      collectNamedDimensions(item, issues, item.id);
    }
  }
  if (new Set(ids).size !== ids.length) issues.push('inventory ids must be unique');
  for (const id of APPROVED_ENROLLMENT_BATCH_IDS) {
    if (!enrolledIds.includes(id)) issues.push(`approved batch member ${id} is not enrolled`);
  }
  const catalog = listScalableOwners(repoRoot);
  if (catalog.length === 0) issues.push('scalable atom/molecule catalog is empty; fail closed');
  return {
    ok: issues.length === 0,
    issues,
    enrolledIds,
    catalogCount: catalog.length,
    unenrolledCount: catalog.filter(owner => !enrolledIds.includes(owner.id)).length,
  };
}

function nameOf(node, index) {
  return node.copy || node.accessibleName || `node ${index}`;
}
function accessibleName(node) {
  return typeof node.accessibleName === 'string'
    ? node.accessibleName.trim()
    : '';
}
function rhythmBounds(role) {
  return role === 'heading' ? { min: 1.25, max: 1.4 } : { min: 1.4, max: 1.65 };
}

// biome-ignore format: keep the source-blind evaluator compact for PR size
export function evaluateOutcomeSample(sample) {
  const findings = [];
  const add = (dimension, detail) => findings.push(finding(dimension, detail));
  if (!isObject(sample) || typeof sample.id !== 'string' || !sample.id) {
    return { ok: false, findings: [finding('select-layout-stability', 'sample requires a stable id')] };
  }
  const namedIssues = [];
  const applicableSet = collectNamedDimensions(sample, namedIssues, sample.id);
  for (const detail of namedIssues) {
    const match = detail.match(/benchmark dimension(?:s)?[: ]+([a-z-]+)/i);
    add(match?.[1] && DIMENSION_SET.has(match[1]) ? match[1] : 'select-layout-stability', detail);
  }
  const nodes = Array.isArray(sample.nodes) ? sample.nodes : [];
  if (nodes.length === 0) add('select-layout-stability', `${sample.id}: rendered sample requires at least one node`);
  const check = id => applicableSet.has(id);
  const shortcuts = new Set();
  for (const [index, node] of nodes.entries()) {
    if (!isObject(node)) { add('select-layout-stability', `${sample.id}: node ${index} is not an object`); continue; }
    const label = nameOf(node, index);
    const contract = node.layoutContract;
    const geo = isObject(node.geometry) ? node.geometry : {};
    const typography = isObject(node.typography) ? node.typography : null;
    if (contract && !LAYOUT_CONTRACTS.has(contract)) {
      add(check('select-layout-stability') ? 'select-layout-stability' : 'compact-navigation', `${label}: unknown layout contract ${contract}`);
    }
    if (check('select-layout-stability')) {
      if ((node.slot === 'trigger' || node.role === 'combobox') && contract !== 'reserved-geometry' && contract !== 'static') {
        add('select-layout-stability', `${label}: select trigger must reserve geometry`);
      }
      if (node.open === true && (node.slot === 'content' || node.role === 'listbox') && node.portal !== true && contract !== 'bounded-local-disclosure') {
        add('select-layout-stability', `${label}: open select content must portal or stay a bounded local disclosure`);
      }
      if (typeof geo.siblingShiftPx === 'number' && geo.siblingShiftPx !== 0) {
        add('select-layout-stability', `${label}: open select shifted siblings by ${geo.siblingShiftPx}px`);
      }
      if (typeof geo.triggerShiftPx === 'number' && geo.triggerShiftPx !== 0) {
        add('select-layout-stability', `${label}: open select shifted the trigger by ${geo.triggerShiftPx}px`);
      }
    }
    if (check('keyboard-shortcut')) {
      const copy = typeof node.copy === 'string' ? node.copy.trim() : '';
      if (!copy || !accessibleName(node)) add('keyboard-shortcut', `${label}: shortcut copy and accessible name are required`);
      if (copy) {
        if (shortcuts.has(copy)) add('keyboard-shortcut', `${label}: duplicate shortcut ${copy}`);
        shortcuts.add(copy);
      }
    }
    if (check('button-affordance')) {
      if (node.interactive !== true || node.role !== 'button') add('button-affordance', `${label}: button requires an interactive button role`);
      if (!accessibleName(node)) add('button-affordance', `${label}: button has no accessible name`);
      if (COLOR_NAME_VARIANT.test(node.variant ?? '')) add('button-affordance', `${label}: color-name variant "${node.variant}" is not a semantic owner axis`);
      else if (node.variant && !BUTTON_VARIANTS.has(node.variant)) add('button-affordance', `${label}: unknown button variant ${node.variant}`);
    }
    if (check('toggle-state')) {
      if (node.role !== 'switch') add('toggle-state', `${label}: toggle requires role switch`);
      if (typeof node.checked !== 'boolean') add('toggle-state', `${label}: toggle checked state is missing`);
      if (!accessibleName(node)) add('toggle-state', `${label}: toggle has no accessible name`);
      if (contract && contract !== 'static') add('toggle-state', `${label}: toggle state must not shift layout`);
    }
    if (check('compact-navigation')) {
      if (!accessibleName(node)) add('compact-navigation', `${label}: compact navigation requires an accessible name when collapsed`);
      if (node.hoverMotion === true) add('compact-navigation', `${label}: decorative hover motion is not allowed`);
      if (node.density && node.density !== 'compact' && node.density !== 'default') add('compact-navigation', `${label}: unknown density ${node.density}`);
    }
    if (check('card-bento')) {
      if (node.nestedCard === true) add('card-bento', `${label}: nested card-in-card composition is blocked`);
      if (contract && contract !== 'static' && contract !== 'reserved-geometry') add('card-bento', `${label}: card geometry must stay reserved or static`);
    }
    if (check('form-control')) {
      if (!accessibleName(node)) add('form-control', `${label}: form control has no label`);
      if ((node.error || node.description) && !node.describedBy) add('form-control', `${label}: error/description must stay described`);
      if ((node.error || node.pending === true) && contract !== 'reserved-geometry') add('form-control', `${label}: error/pending form states must reserve geometry`);
    }
    if (check('typography-rhythm')) {
      if (!typography || typeof typography.fontSizePx !== 'number' || typeof typography.lineHeightPx !== 'number') {
        add('typography-rhythm', `${label}: fontSizePx and lineHeightPx are required`);
      } else {
        const ratio = typography.lineHeightPx / typography.fontSizePx;
        const { min, max } = rhythmBounds(typography.role);
        if (ratio < min || ratio > max) add('typography-rhythm', `${label}: Typeset rhythm ${ratio.toFixed(3)} is outside ${min}–${max} for ${typography.role ?? 'body'}`);
      }
    }
    if (check('typography-overflow')) {
      if (!typography || typeof typography.overflow !== 'string') add('typography-overflow', `${label}: typography overflow is missing`);
      else if (typography.overflow === 'clip' || typography.overflow === 'visible') add('typography-overflow', `${label}: Typeset overflow "${typography.overflow}" fails closed; wrap or reserved ellipsis required`);
      else if (typography.overflow === 'ellipsis' && contract !== 'reserved-geometry') add('typography-overflow', `${label}: ellipsis overflow must reserve geometry`);
      else if (typography.overflow !== 'wrap' && typography.overflow !== 'ellipsis') add('typography-overflow', `${label}: unknown typography overflow ${typography.overflow}`);
      const copy = typeof node.copy === 'string' ? node.copy : '';
      if (typeof typography?.measureCh === 'number' && copy.length > typography.measureCh * 2 && typography.overflow !== 'wrap') {
        add('typography-overflow', `${label}: long copy exceeds measure ${typography.measureCh}ch without wrapping`);
      }
    }
  }
  if (check('select-layout-stability') && !nodes.some(node => isObject(node) && (node.slot === 'trigger' || node.role === 'combobox'))) {
    add('select-layout-stability', `${sample.id}: select-layout-stability is applicable but no trigger was rendered`);
  }
  if (check('keyboard-shortcut') && shortcuts.size === 0) add('keyboard-shortcut', `${sample.id}: keyboard-shortcut is applicable but no shortcut was rendered`);
  if (check('button-affordance') && nodes.every(node => !isObject(node) || node.role !== 'button')) add('button-affordance', `${sample.id}: button-affordance is applicable but no button was rendered`);
  if (check('toggle-state') && nodes.every(node => !isObject(node) || node.role !== 'switch')) add('toggle-state', `${sample.id}: toggle-state is applicable but no switch was rendered`);
  return { ok: findings.length === 0, findings };
}

function outcomeSample(id, kind, owner, applicable, nodes) {
  return Object.freeze({
    id,
    kind,
    owner,
    ...dimensionContract(applicable),
    nodes: Object.freeze(nodes.map(node => Object.freeze(node))),
  });
}

// biome-ignore format: compact outcome fixtures
export const OUTCOME_RED_FIXTURES = Object.freeze([
  outcomeSample('deliberate-red.select.layout-shift', 'deliberate-red', 'atom.select', ['select-layout-stability'], [
    { slot: 'trigger', role: 'combobox', copy: 'Pro', accessibleName: 'Plan', open: true, layoutContract: 'static', geometry: { heightPx: 32, triggerShiftPx: 12, siblingShiftPx: 0 } },
    { slot: 'content', role: 'listbox', copy: 'Pro', accessibleName: 'Plan options', open: true, portal: false, layoutContract: 'unbounded', geometry: { heightPx: 240, triggerShiftPx: 12, siblingShiftPx: 48 } },
    { slot: 'sibling', copy: 'Display name', accessibleName: 'Display name', layoutContract: 'static', geometry: { heightPx: 32, siblingShiftPx: 48, triggerShiftPx: 0 } },
  ]),
  outcomeSample('deliberate-red.typography.rhythm-overflow', 'deliberate-red', 'typography.system-b', ['typography-rhythm', 'typography-overflow'], [
    { copy: 'Never Say A Word — a long artist title that must wrap on a smart link', accessibleName: 'Track title', typography: { role: 'heading', fontSizePx: 18, lineHeightPx: 18, measureCh: 20, overflow: 'clip' } },
  ]),
]);

// biome-ignore format: compact outcome fixtures
export const OUTCOME_BATCH_SAMPLES = Object.freeze([
  outcomeSample('outcome-batch.atom.select.closed-open', 'outcome-batch', 'atom.select', ['select-layout-stability'], [
    { slot: 'trigger', role: 'combobox', copy: 'Pro', accessibleName: 'Plan', open: true, layoutContract: 'reserved-geometry', geometry: { heightPx: 32, triggerShiftPx: 0, siblingShiftPx: 0 } },
    { slot: 'content', role: 'listbox', copy: 'Pro', accessibleName: 'Plan options', open: true, portal: true, layoutContract: 'bounded-local-disclosure', geometry: { heightPx: 240, triggerShiftPx: 0, siblingShiftPx: 0 } },
  ]),
  outcomeSample('outcome-batch.atom.kbd.shortcut', 'outcome-batch', 'atom.kbd', ['keyboard-shortcut'], [
    { copy: '⌘K', accessibleName: 'Command K', role: 'presentation', layoutContract: 'static' },
  ]),
  outcomeSample('outcome-batch.atom.button.primary', 'outcome-batch', 'atom.button', ['button-affordance'], [
    { copy: 'Save', accessibleName: 'Save', role: 'button', interactive: true, variant: 'primary', layoutContract: 'static' },
  ]),
  outcomeSample('outcome-batch.atom.switch.on', 'outcome-batch', 'atom.switch', ['toggle-state'], [
    { copy: 'Public profile', accessibleName: 'Public profile', role: 'switch', checked: true, layoutContract: 'static' },
  ]),
  outcomeSample('outcome-batch.molecule.sidebar-nav-item.compact', 'outcome-batch', 'molecule.sidebar-nav-item', ['compact-navigation'], [
    { copy: 'Library', accessibleName: 'Library', density: 'compact', collapsed: true, hoverMotion: false, layoutContract: 'static' },
  ]),
  outcomeSample('outcome-batch.atom.card.default', 'outcome-batch', 'atom.card', ['card-bento'], [
    { copy: 'Release', accessibleName: 'Release', nestedCard: false, layoutContract: 'static' },
  ]),
  outcomeSample('outcome-batch.atom.field.labeled', 'outcome-batch', 'atom.field', ['form-control'], [
    { copy: 'Display name', accessibleName: 'Display name', description: 'Shown on your public profile', describedBy: 'field-name-description', error: 'Enter a display name', layoutContract: 'reserved-geometry' },
  ]),
  outcomeSample('outcome-batch.typography.system-b.rhythm', 'outcome-batch', 'typography.system-b', ['typography-rhythm', 'typography-overflow'], [
    { copy: 'Never Say A Word', accessibleName: 'Track title', typography: { role: 'heading', fontSizePx: 18, lineHeightPx: 23.4, measureCh: 40, overflow: 'wrap' } },
    { copy: 'Stream the release from any DSP on a smart link.', accessibleName: 'Release description', typography: { role: 'body', fontSizePx: 14, lineHeightPx: 21, measureCh: 65, overflow: 'wrap' } },
  ]),
]);

function receiptFor(sample, evaluation) {
  return {
    id: sample.id,
    kind: sample.kind,
    owner: sample.owner ?? null,
    verdict: evaluation.ok ? 'pass' : 'block',
    findings: evaluation.findings,
  };
}

export function runOutcomeCertification(options = {}) {
  const inventory = options.inventory ?? OUTCOME_INVENTORY;
  const redFixtures = options.redFixtures ?? OUTCOME_RED_FIXTURES;
  const enrolledBatch = options.enrolledBatch ?? OUTCOME_BATCH_SAMPLES;
  const inventoryResult = evaluateOutcomeInventory({
    repoRoot: options.repoRoot,
    inventory,
  });
  const issues = [...inventoryResult.issues];
  const comparative = runComparativeQualityBar({
    repoRoot: options.repoRoot ?? REPO_ROOT,
    approvedOutcomeEntries: inventory?.entries,
    inventory: options.comparativeInventory,
    redFixtures: options.comparativeRedFixtures,
    qualificationControls: options.qualificationControls,
  });
  if (!comparative.ok) {
    issues.push(
      ...comparative.receipt.issues.map(
        issue => `comparative quality bar: ${issue}`
      )
    );
  }
  if (!Array.isArray(redFixtures) || redFixtures.length === 0) {
    issues.push('outcome deliberate-red fixtures are missing; fail closed');
  }
  if (!Array.isArray(enrolledBatch) || enrolledBatch.length === 0) {
    issues.push('outcome enrolled-batch samples are missing; fail closed');
  }
  const fixtureReceipts = (redFixtures ?? []).map(sample => {
    const receipt = receiptFor(sample, evaluateOutcomeSample(sample));
    if (receipt.verdict !== 'block')
      issues.push(`${sample.id}: deliberate-red fixture must block`);
    return receipt;
  });
  const batchReceipts = (enrolledBatch ?? []).map(sample => {
    const evaluation = evaluateOutcomeSample(sample);
    const receipt = receiptFor(sample, evaluation);
    if (receipt.verdict !== 'pass') {
      issues.push(
        `${sample.id}: outcome-batch blocked (${evaluation.findings.map(item => item.detail).join('; ')})`
      );
    }
    return receipt;
  });
  const ok = issues.length === 0;
  return {
    ok,
    schema: OUTCOME_INVENTORY_SCHEMA,
    receipt: {
      schema: OUTCOME_INVENTORY_SCHEMA,
      gate: 'component-ship-gate',
      section: 'shadcnOutcome',
      headSha: options.headSha ?? null,
      ok,
      issues,
      provenance: {
        license: inventory?.provenance?.license ?? null,
        boundary: inventory?.provenance?.boundary ?? null,
      },
      enrolled: inventoryResult.enrolledIds,
      catalogCount: inventoryResult.catalogCount,
      unenrolledCount: inventoryResult.unenrolledCount,
      comparativeQualityBar: comparative.receipt,
      fixtures: fixtureReceipts,
      enrolledBatch: batchReceipts,
    },
  };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runOutcomeCertification();
  if (!result.ok) {
    for (const issue of result.receipt.issues) console.error(issue);
    process.exit(1);
  }
}
