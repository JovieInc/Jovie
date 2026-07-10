#!/usr/bin/env npx tsx
/**
 * Playbook → Skill compiler CLI (JOV-3945).
 *
 * Validates every docs/playbooks/*.playbook.md, compiles each to a draft
 * SkillDefinition, and optionally registers into skills_catalog when
 * DATABASE_URL is set and --register is passed.
 *
 * Usage:
 *   pnpm --filter=@jovie/web run playbooks:compile
 *   pnpm --filter=@jovie/web run playbooks:compile -- --register
 *
 * Exit codes:
 *   0 - all playbooks validated + compiled
 *   1 - validation or compile failure
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveMonorepoRoot } from '../lib/filesystem-paths';
import { compilePlaybookToSkill } from '../lib/playbooks/compile';
import { validatePlaybookSource } from '../lib/playbooks/schema';

const PLAYBOOK_FILE_SUFFIX = '.playbook.md';
const monorepoRoot = resolveMonorepoRoot();
const playbooksDir = join(monorepoRoot, 'docs', 'playbooks');
const shouldRegister = process.argv.includes('--register');

export async function compileAllPlaybooks(): Promise<{
  compiled: number;
  failures: number;
}> {
  let files: string[] = [];
  try {
    files = readdirSync(playbooksDir)
      .filter(name => name.endsWith(PLAYBOOK_FILE_SUFFIX))
      .sort();
  } catch {
    console.log(`No playbooks directory at ${playbooksDir}`);
    return { compiled: 0, failures: 0 };
  }

  let compiled = 0;
  let failures = 0;

  let registerCompiledSkill:
    | typeof import('../lib/playbooks/register').registerCompiledSkill
    | null = null;

  if (shouldRegister) {
    if (!process.env.DATABASE_URL) {
      console.error(
        '[compile-playbooks] --register requires DATABASE_URL; skipping registration'
      );
    } else {
      ({ registerCompiledSkill } = await import('../lib/playbooks/register'));
    }
  }

  for (const file of files) {
    const absolutePath = join(playbooksDir, file);
    const displayPath = relative(monorepoRoot, absolutePath);
    const raw = readFileSync(absolutePath, 'utf-8');
    const validated = validatePlaybookSource(raw);

    if (!validated.ok) {
      failures += 1;
      console.error(`✗ ${displayPath} (validate)`);
      for (const error of validated.errors) {
        const location = error.path ? ` at \`${error.path}\`` : '';
        console.error(`  [${error.rule}]${location} ${error.message}`);
      }
      continue;
    }

    const expectedFileName = `${validated.definition.id}${PLAYBOOK_FILE_SUFFIX}`;
    if (file !== expectedFileName) {
      failures += 1;
      console.error(
        `✗ ${displayPath}\n  [id-filename-mismatch] frontmatter id "${validated.definition.id}" expects filename "${expectedFileName}"`
      );
      continue;
    }

    const compiledResult = compilePlaybookToSkill(validated.definition);
    if (!compiledResult.ok) {
      failures += 1;
      console.error(`✗ ${displayPath} (compile)`);
      for (const error of compiledResult.errors) {
        const location = error.path ? ` at \`${error.path}\`` : '';
        console.error(`  [${error.rule}]${location} ${error.message}`);
      }
      continue;
    }

    compiled += 1;
    const skill = compiledResult.skill;
    console.log(
      `✓ ${displayPath} → skill ${skill.id}@${skill.version} lifecycle=${skill.lifecycle}`
    );

    if (registerCompiledSkill) {
      try {
        const reg = await registerCompiledSkill(skill);
        console.log(
          `  registered (${reg.action}) active lifecycle=${reg.lifecycle}`
        );
      } catch (err) {
        failures += 1;
        console.error(`  registration failed:`, err);
      }
    }
  }

  return { compiled, failures };
}

async function main(): Promise<void> {
  const { compiled, failures } = await compileAllPlaybooks();
  if (failures > 0) {
    console.error(
      `\n${failures} playbook(s) failed compile. Fix named-rule errors above.`
    );
    process.exit(1);
  }
  console.log(`\nCompiled ${compiled} playbook(s) to draft skills.`);
  process.exit(0);
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch(err => {
    console.error('[compile-playbooks] failed:', err);
    process.exit(1);
  });
}
