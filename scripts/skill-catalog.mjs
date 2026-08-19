#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CATALOG_RESOLVER_ROOTS = Object.freeze([
  '.claude/skills',
  '.agents/skills',
]);

/**
 * One-level SKILL.md files only. Nested checkout copies are not catalog-visible.
 */
const SKIP_DIR_NAMES = new Set([
  '.bak',
  '.cursor',
  '.factory',
  '.agents',
  '.git',
  'src',
  'test',
  'bin',
  'node_modules',
]);

function addLeaf(byName, name, skillPath, root) {
  if (!existsSync(resolve(root, skillPath))) return;
  const record = byName.get(name) ?? { name, paths: [] };
  record.paths.push(skillPath);
  byName.set(name, record);
}

export function collectCatalogVisibleSkills({ root = process.cwd() } = {}) {
  const byName = new Map();
  for (const resolverRoot of CATALOG_RESOLVER_ROOTS) {
    const absoluteRoot = resolve(root, resolverRoot);
    if (!existsSync(absoluteRoot)) continue;
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      addLeaf(
        byName,
        entry.name,
        `${resolverRoot}/${entry.name}/SKILL.md`,
        root
      );
    }
  }
  // gstack checkout leaves (one level only) share names with .claude/skills copies
  const gstackLeaves = resolve(root, '.agents/skills/gstack');
  if (existsSync(gstackLeaves)) {
    for (const entry of readdirSync(gstackLeaves, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      addLeaf(
        byName,
        entry.name,
        `.agents/skills/gstack/${entry.name}/SKILL.md`,
        root
      );
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function evaluateSkillCatalog({ root = process.cwd() } = {}) {
  const errors = [];
  const catalog = collectCatalogVisibleSkills({ root });
  const names = catalog.map(entry => entry.name);
  const unique = new Set(names);
  if (unique.size !== names.length) {
    errors.push('catalog-visible skill names are not unique');
  }
  const resolverPath = resolve(root, '.claude/skills/RESOLVER.md');
  if (!existsSync(resolverPath)) {
    errors.push('.claude/skills/RESOLVER.md: compact routing list is missing');
    return errors;
  }
  const resolver = readFileSync(resolverPath, 'utf8');
  for (const entry of catalog) {
    if (!resolver.includes(`**${entry.name}**`)) {
      errors.push(
        `RESOLVER.md missing unique leaf **${entry.name}** (${entry.paths.join(', ')})`
      );
    }
  }
  return errors;
}

function main() {
  const errors = evaluateSkillCatalog();
  if (errors.length === 0) {
    console.log('[skill-catalog] unique leaf names');
    return;
  }
  console.error('[skill-catalog] blocked:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) main();
