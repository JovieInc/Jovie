#!/usr/bin/env node
/**
 * Semantic Token Validator for Jovie Dashboard
 *
 * Scans dashboard components for hardcoded Tailwind color classes
 * and ensures semantic design tokens are used instead.
 *
 * Usage:
 *   node scripts/validate-semantic-tokens.mjs
 *   node scripts/validate-semantic-tokens.mjs --fix (auto-migrate where possible)
 *
 * @see CLAUDE.md - Design Aesthetic (Color-Agnostic, Apple-Inspired)
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

// Hardcoded color patterns to detect (NOT exhaustive, but catches common violations)
const HARDCODED_COLOR_PATTERNS = [
  // Background colors
  /bg-white\b/g,
  /bg-black\b/g,
  /bg-gray-\d{2,3}\b/g,
  /bg-zinc-\d{2,3}\b/g,
  /bg-slate-\d{2,3}\b/g,
  /bg-neutral-\d{2,3}\b/g,

  // Text colors
  /text-white\b/g,
  /text-black\b/g,
  /text-gray-\d{2,3}\b/g,
  /text-zinc-\d{2,3}\b/g,
  /text-slate-\d{2,3}\b/g,
  /text-neutral-\d{2,3}\b/g,

  // Border colors
  /border-white\b/g,
  /border-black\b/g,
  /border-gray-\d{2,3}\b/g,
  /border-zinc-\d{2,3}\b/g,
  /border-slate-\d{2,3}\b/g,
  /border-neutral-\d{2,3}\b/g,
];

// Suggested semantic token replacements
const MIGRATION_MAP = {
  // Backgrounds
  'bg-white': 'bg-surface-0',
  'bg-black': 'bg-base',
  'bg-gray-50': 'bg-surface-0',
  'bg-gray-100': 'bg-surface-1',
  'bg-gray-200': 'bg-surface-2',
  'bg-gray-800': 'bg-surface-1',
  'bg-gray-900': 'bg-surface-0',

  // Text
  'text-white': 'text-primary-token',
  'text-black': 'text-primary-token',
  'text-gray-400': 'text-secondary-token',
  'text-gray-500': 'text-secondary-token',
  'text-gray-600': 'text-secondary-token',
  'text-gray-700': 'text-primary-token',
  'text-gray-900': 'text-primary-token',

  // Borders
  'border-gray-200': 'border-subtle',
  'border-gray-300': 'border-default',
  'border-zinc-200': 'border-subtle',
  'border-zinc-300': 'border-default',
};

// Scan a file for violations
function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const violations = [];

  for (const pattern of HARDCODED_COLOR_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      violations.push({
        file: filePath,
        match: match[0],
        line: content.substring(0, match.index).split('\n').length,
      });
    }
  }

  return violations;
}

// Recursively scan directory
function scanDirectory(dirPath, violations = []) {
  const entries = readdirSync(dirPath);

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!entry.startsWith('.') && entry !== 'node_modules') {
        scanDirectory(fullPath, violations);
      }
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      const fileViolations = scanFile(fullPath);
      violations.push(...fileViolations);
    }
  }

  return violations;
}

// Auto-fix mode (experimental)
function autoFix(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  let fixCount = 0;

  for (const [oldClass, newClass] of Object.entries(MIGRATION_MAP)) {
    const regex = new RegExp(`\\b${oldClass}\\b`, 'g');
    const matches = content.match(regex);
    if (matches) {
      content = content.replace(regex, newClass);
      fixCount += matches.length;
    }
  }

  if (fixCount > 0) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ Fixed ${fixCount} violations in ${filePath}`);
  }

  return fixCount;
}

// Main execution
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const targetDir = args.find(arg => !arg.startsWith('--')) || 'components/dashboard';

console.log('🔍 Scanning for hardcoded Tailwind colors...\n');

const violations = scanDirectory(targetDir);

if (violations.length === 0) {
  console.log('✅ No hardcoded color violations found!');
  process.exit(0);
}

// Group by file
const violationsByFile = violations.reduce((acc, v) => {
  if (!acc[v.file]) acc[v.file] = [];
  acc[v.file].push(v);
  return acc;
}, {});

console.log(`❌ Found ${violations.length} violations across ${Object.keys(violationsByFile).length} files:\n`);

for (const [file, fileViolations] of Object.entries(violationsByFile)) {
  console.log(`📄 ${file} (${fileViolations.length} violations)`);

  // Show first 3 violations
  fileViolations.slice(0, 3).forEach(v => {
    const suggestion = MIGRATION_MAP[v.match] || '(manual review needed)';
    console.log(`   Line ${v.line}: ${v.match} → ${suggestion}`);
  });

  if (fileViolations.length > 3) {
    console.log(`   ... and ${fileViolations.length - 3} more`);
  }
  console.log();
}

if (shouldFix) {
  console.log('🔧 Auto-fixing violations...\n');

  let totalFixed = 0;
  for (const file of Object.keys(violationsByFile)) {
    totalFixed += autoFix(file);
  }

  console.log(`\n✅ Fixed ${totalFixed} violations automatically.`);
  console.log('⚠️  Please review changes and test thoroughly before committing.');
} else {
  console.log('💡 Tip: Run with --fix flag to auto-migrate where possible.');
  console.log('   Example: node scripts/validate-semantic-tokens.mjs --fix');
}

process.exit(violations.length > 0 ? 1 : 0);
