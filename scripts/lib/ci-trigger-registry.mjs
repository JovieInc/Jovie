// CI trigger registry (audit finding 4, 2026-11-11): every workflow declares
// the events that may start it and its expected runs per merged PR, so event
// fan-out has an explicit budget. Pure functions; the gate lives in
// scripts/ci-workflow-topology.test.mjs and the CLI in
// scripts/ci-trigger-registry.mjs. Docs: docs/ci/repository-health.md.
import fs from 'node:fs';
import path from 'node:path';
import { load as yamlLoad } from 'js-yaml';

export const REGISTRY_PATH = 'scripts/ci-trigger-registry.json';
export const SCHEMA = 'jovie-ci-trigger-registry/v1';

const list = value =>
  value == null ? [] : Array.isArray(value) ? value : [value];

/**
 * One string per way a workflow can start: `event`, `event:type` for each
 * declared activity type, or `workflow_run:<upstream workflow name>`.
 * @param {unknown} on the parsed `on:` value
 * @returns {string[]}
 */
export function triggersOf(on) {
  if (on == null) return [];
  if (typeof on === 'string' || Array.isArray(on))
    return list(on).map(String).sort();
  const out = [];
  for (const [event, config] of Object.entries(on)) {
    if (event === 'workflow_run') {
      for (const name of list(config?.workflows))
        out.push(`workflow_run:${name}`);
      continue;
    }
    const types = list(config?.types);
    if (types.length) for (const type of types) out.push(`${event}:${type}`);
    else out.push(event);
  }
  return [...new Set(out)].sort();
}

/** Triggers that fan one event out into more runs: chains and PR metadata edits. */
export const isFanOut = trigger =>
  trigger.startsWith('workflow_run:') ||
  /:(?:edited|labeled|unlabeled)$/.test(trigger);

/** @returns {Record<string, string[]>} workflow file name -> triggers */
export function scanWorkflows(root) {
  const dir = path.join(root, '.github/workflows');
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const file of fs
    .readdirSync(dir)
    .filter(f => /\.ya?ml$/.test(f))
    .sort()) {
    const parsed = /** @type {any} */ (
      yamlLoad(fs.readFileSync(path.join(dir, file), 'utf8')) ?? {}
    );
    out[file] = triggersOf(parsed.on);
  }
  return out;
}

/** One line per workflow keeps the registry reviewable in a diff. */
export function formatRegistry(registry) {
  const { workflows = {}, ...head } = registry;
  const rows = Object.keys(workflows)
    .sort()
    .map(file => {
      const { runsPerMergedPr, triggers } = workflows[file];
      return `    ${JSON.stringify(file)}: ${JSON.stringify({ runsPerMergedPr, triggers })}`;
    });
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  return `${top},\n  "workflows": {\n${rows.join(',\n')}\n  }\n}\n`;
}

export function readRegistry(root) {
  return JSON.parse(fs.readFileSync(path.join(root, REGISTRY_PATH), 'utf8'));
}

/**
 * @param {{ budget: { runsPerMergedPr: number, ceiling: number },
 *   workflows: Record<string, { triggers: string[], runsPerMergedPr: number }> }} registry
 * @param {Record<string, string[]>} scanned
 * @returns {{ errors: string[], expectedRunsPerMergedPr: number }}
 */
export function checkRegistry(registry, scanned) {
  const errors = [];
  const declared = registry.workflows ?? {};
  for (const [file, triggers] of Object.entries(scanned)) {
    const entry = declared[file];
    if (!entry) {
      const fan = triggers.filter(isFanOut);
      errors.push(
        `${file}: not in ${REGISTRY_PATH}; declare its triggers and expected runsPerMergedPr${fan.length ? ` (fan-out: ${fan.join(', ')})` : ''}`
      );
      continue;
    }
    const known = new Set(entry.triggers ?? []);
    for (const t of triggers)
      if (!known.has(t))
        errors.push(
          `${file}: trigger ${t}${isFanOut(t) ? ' (fan-out)' : ''} is not registered; add it and re-estimate runsPerMergedPr`
        );
    for (const t of known)
      if (!triggers.includes(t))
        errors.push(
          `${file}: registered trigger ${t} no longer exists; remove it`
        );
    if (!Number.isFinite(entry.runsPerMergedPr) || entry.runsPerMergedPr < 0)
      errors.push(`${file}: runsPerMergedPr must be a number >= 0`);
  }
  for (const file of Object.keys(declared))
    if (!(file in scanned))
      errors.push(`${file}: registered but the workflow is gone; remove it`);
  const expected = Object.values(declared).reduce(
    (sum, entry) => sum + (Number(entry.runsPerMergedPr) || 0),
    0
  );
  const expectedRunsPerMergedPr = Math.round(expected * 10) / 10;
  const { ceiling, runsPerMergedPr: target } = registry.budget ?? {};
  if (!(target > 0) || !(ceiling > 0))
    errors.push('budget: a runsPerMergedPr target and a ceiling are required');
  else if (expectedRunsPerMergedPr > ceiling)
    errors.push(
      `budget: declared ${expectedRunsPerMergedPr} runs per merged PR exceeds the ceiling ${ceiling} (target ${target}); remove fan-out before raising it`
    );
  return { errors, expectedRunsPerMergedPr };
}
