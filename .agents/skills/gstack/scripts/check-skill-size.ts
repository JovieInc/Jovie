#!/usr/bin/env bun
/**
 * Prompt-size ratchet for gstack skills.
 *
 * These limits intentionally track the current oversized system rather than the
 * long-term target. They prevent accidental bloat while leaving room for a
 * staged shared-core/thin-leaf refactor.
 */

import * as fs from 'fs';
import * as path from 'path';

export const ROOT = path.resolve(import.meta.dir, '..');
export const DEFAULT_TEMPLATE_LIMIT_BYTES = 60_000;
export const DEFAULT_GENERATED_LIMIT_BYTES = 110_000;

export interface SkillSizeBudget {
  templates: number;
  generated: number;
}

export interface SkillSizeEntry {
  file: string;
  bytes: number;
  limit: number;
  kind: 'template' | 'generated';
}

export interface SkillSizeReport {
  ok: boolean;
  entries: SkillSizeEntry[];
  violations: SkillSizeEntry[];
}

const SKIP_DIRS = new Set([
  '.git',
  '.agents',
  '.factory',
  'node_modules',
  'dist',
]);

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function budgetFromEnv(): SkillSizeBudget {
  return {
    templates: envInt('GSTACK_MAX_TEMPLATE_SKILL_BYTES', DEFAULT_TEMPLATE_LIMIT_BYTES),
    generated: envInt('GSTACK_MAX_GENERATED_SKILL_BYTES', DEFAULT_GENERATED_LIMIT_BYTES),
  };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
      continue;
    }
    if (entry.isFile() && (entry.name === 'SKILL.md' || entry.name === 'SKILL.md.tmpl')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

export function checkSkillSizes(
  root: string = ROOT,
  budget: SkillSizeBudget = budgetFromEnv(),
): SkillSizeReport {
  const entries = walk(root)
    .map((file): SkillSizeEntry => {
      const kind = file.endsWith('.tmpl') ? 'template' : 'generated';
      const limit = kind === 'template' ? budget.templates : budget.generated;
      return {
        file: path.relative(root, file),
        bytes: fs.statSync(file).size,
        limit,
        kind,
      };
    })
    .sort((a, b) => b.bytes - a.bytes);

  const violations = entries.filter((entry) => entry.bytes > entry.limit);
  return { ok: violations.length === 0, entries, violations };
}

function printReport(report: SkillSizeReport): void {
  const largest = report.entries.slice(0, 12);
  console.log(`Skill size check: ${report.ok ? 'ok' : 'failed'}`);
  console.log('Largest skill files:');
  for (const entry of largest) {
    console.log(`- ${entry.file}: ${entry.bytes} bytes (${entry.kind}, limit ${entry.limit})`);
  }
  if (!report.ok) {
    console.error('\nOver budget:');
    for (const entry of report.violations) {
      console.error(`- ${entry.file}: ${entry.bytes} bytes > ${entry.limit}`);
    }
  }
}

if (import.meta.main) {
  const report = checkSkillSizes();
  printReport(report);
  process.exit(report.ok ? 0 : 1);
}
