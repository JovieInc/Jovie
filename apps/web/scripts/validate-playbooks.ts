#!/usr/bin/env npx tsx
/**
 * Playbook validator CLI (GH #13184 / JOV-3943).
 *
 * Validates every `docs/playbooks/*.playbook.md` against the
 * PlaybookDefinition contract (`@/lib/playbooks/schema`): frontmatter
 * presence, JSON parse, zod schema, and lint rules. Fails with named-rule
 * errors so CI output is actionable.
 *
 * Usage: pnpm --filter=@jovie/web run playbooks:validate
 *
 * Exit codes:
 *   0 - all playbooks valid (or none exist yet)
 *   1 - at least one playbook failed validation
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolveMonorepoRoot } from '../lib/filesystem-paths';
import { validatePlaybookSource } from '../lib/playbooks/schema';

const PLAYBOOK_FILE_SUFFIX = '.playbook.md';

const monorepoRoot = resolveMonorepoRoot();
const playbooksDir = join(monorepoRoot, 'docs', 'playbooks');

let files: string[] = [];
try {
  files = readdirSync(playbooksDir)
    .filter(name => name.endsWith(PLAYBOOK_FILE_SUFFIX))
    .sort();
} catch {
  console.log(
    `No playbooks directory at ${playbooksDir} — nothing to validate.`
  );
  process.exit(0);
}

if (files.length === 0) {
  console.log('No *.playbook.md files found — nothing to validate.');
  process.exit(0);
}

let failures = 0;

for (const file of files) {
  const absolutePath = join(playbooksDir, file);
  const displayPath = relative(monorepoRoot, absolutePath);
  const raw = readFileSync(absolutePath, 'utf-8');
  const result = validatePlaybookSource(raw);

  if (result.ok) {
    const expectedFileName = `${result.definition.id}${PLAYBOOK_FILE_SUFFIX}`;
    if (file !== expectedFileName) {
      failures += 1;
      console.error(
        `✗ ${displayPath}\n  [id-filename-mismatch] frontmatter id "${result.definition.id}" expects filename "${expectedFileName}"`
      );
      continue;
    }
    console.log(
      `✓ ${displayPath} (${result.definition.id}@${result.definition.version})`
    );
    continue;
  }

  failures += 1;
  console.error(`✗ ${displayPath}`);
  for (const error of result.errors) {
    const location = error.path ? ` at \`${error.path}\`` : '';
    console.error(`  [${error.rule}]${location} ${error.message}`);
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} playbook file(s) failed validation. See docs/playbooks/TEMPLATE.md for the contract.`
  );
  process.exit(1);
}

console.log(`\nAll ${files.length} playbook file(s) valid.`);
