#!/usr/bin/env node
/**
 * resolve-pr-conflict.mjs
 * Event-driven conflict resolver for a single PR.
 * Called by GitHub Actions workflow auto-resolve-conflicts.yml.
 *
 * Usage: node resolve-pr-conflict.mjs --pr=123 [--apply] [--dry-run]
 * Default: --dry-run
 */

const args = process.argv.slice(2);
const PR_ARG = args.find(a => a.startsWith('--pr='));
const DRY_RUN = !args.includes('--apply');
const REPO = process.env.GH_REPO || 'JovieInc/Jovie';

if (!PR_ARG) {
  console.error('Usage: node resolve-pr-conflict.mjs --pr=NUMBER [--apply]');
  process.exit(1);
}

const PR_NUMBER = PR_ARG.split('=')[1];

function gh(args) {
  const { execSync } = require('node:child_process');
  const result = execSync('gh ' + args.map(a => JSON.stringify(a)).join(' '), {
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000,
  });
  return result.trim();
}

function main() {
  // Step 1: Get PR info
  console.log(`\n🔍 Checking PR #${PR_NUMBER}...`);
  const prJson = gh([
    'pr',
    'view',
    String(PR_NUMBER),
    '--repo',
    REPO,
    '--json',
    'number,title,headRefName,baseRefName,mergeable,labels',
  ]);
  const pr = JSON.parse(prJson);

  const shortTitle =
    pr.title.length > 70 ? pr.title.slice(0, 70) + '…' : pr.title;
  console.log(`   ${shortTitle}`);
  console.log(
    `   Base: ${pr.baseRefName} | Branch: ${pr.headRefName} | Mergeable: ${pr.mergeable}`
  );

  // Step 2: Check if it actually has conflicts
  if (pr.mergeable !== 'CONFLICTING') {
    console.log(`   ✅ No conflicts (state: ${pr.mergeable}). Cleaning label.`);

    // Remove needs-conflict-resolution label if present
    const hasLabel = pr.labels.some(
      l => l.name === 'needs-conflict-resolution'
    );
    if (hasLabel && !DRY_RUN) {
      gh([
        'pr',
        'edit',
        String(PR_NUMBER),
        '--repo',
        REPO,
        '--remove-label',
        'needs-conflict-resolution',
      ]);
      console.log('   ✅ Stale label removed.');
    } else if (hasLabel) {
      console.log('   🏁 [DRY RUN] Would remove stale label.');
    }
    return;
  }

  // Step 3: Try to auto-resolve by merging base into head
  const { execSync } = require('node:child_process');
  const { mkdtempSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');

  const tmpDir = mkdtempSync(join(tmpdir(), 'pr-conflict-'));
  let resolved = false;

  try {
    console.log(`   🔄 Merging ${pr.baseRefName} into ${pr.headRefName}...`);

    // Clone the PR branch
    execSync(
      `git clone --depth 50 https://github.com/${REPO}.git "${tmpDir}" --branch ${pr.headRefName} --single-branch`,
      { encoding: 'utf-8', timeout: 120_000 }
    );

    // Fetch the base branch
    execSync(`git fetch origin ${pr.baseRefName}`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 60_000,
    });

    // Set identity
    execSync('git config user.email "gem@jovie.app"', {
      cwd: tmpDir,
      timeout: 10_000,
    });
    execSync('git config user.name "Gem (CI Bot)"', {
      cwd: tmpDir,
      timeout: 10_000,
    });

    // Try the merge
    try {
      execSync('git merge --no-edit FETCH_HEAD', {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 60_000,
      });
      console.log('   ✅ Merge clean!');

      if (!DRY_RUN) {
        execSync(`git push origin ${pr.headRefName}`, {
          cwd: tmpDir,
          encoding: 'utf-8',
          timeout: 60_000,
        });
        gh([
          'pr',
          'edit',
          String(PR_NUMBER),
          '--repo',
          REPO,
          '--remove-label',
          'needs-conflict-resolution',
        ]);
        console.log('   ✅ Pushed and label removed.');
        resolved = true;
      } else {
        console.log('   🏁 [DRY RUN] Would push and remove label.');
        resolved = true;
      }
    } catch (_mergeErr) {
      // Real merge conflict
      const files = execSync('git diff --name-only --diff-filter=U', {
        cwd: tmpDir,
        encoding: 'utf-8',
      })
        .trim()
        .split('\n')
        .filter(Boolean);

      console.log(`   ❌ Real conflict in ${files.length} file(s):`);
      for (const f of files.slice(0, 15)) console.log(`      - ${f}`);
      if (files.length > 15)
        console.log(`      ... and ${files.length - 15} more`);

      if (!DRY_RUN) {
        // Leave a comment with the conflicting files
        const comment = `🤖 **Auto-resolve failed**

Could not automatically merge \`${pr.baseRefName}\` into this branch.

Conflicting files:
${files.map(f => `- \`${f}\``).join('\n')}

These conflicts need manual resolution.`;

        gh([
          'pr',
          'comment',
          String(PR_NUMBER),
          '--repo',
          REPO,
          '--body',
          comment,
        ]);
        console.log('   💬 Comment left on PR.');
      }
    }
  } catch (e) {
    console.error(`   💥 Error: ${e.message.slice(0, 200)}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  if (resolved) {
    console.log(`\n✅ PR #${PR_NUMBER}: Resolved successfully.`);
    process.exit(0);
  }
}

main();
