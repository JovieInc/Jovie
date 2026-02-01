#!/usr/bin/env node

/**
 * Suppress SonarCloud typescript:S6759 violations for readonly props
 *
 * These are style preference issues - React props are immutable by design.
 * Explicit Readonly<> wrapper is redundant and doesn't prevent actual mutations.
 * This script marks them as "won't fix" in SonarCloud.
 *
 * Usage:
 *   export SONAR_TOKEN="your-sonarcloud-token"
 *   node scripts/suppress-sonar-readonly-props.mjs
 *
 * Or:
 *   SONAR_TOKEN="your-token" node scripts/suppress-sonar-readonly-props.mjs
 */

import { readFile } from 'fs/promises';

const SONAR_TOKEN = process.env.SONAR_TOKEN;
const SONAR_PROJECT = 'JovieInc_Jovie';
const SONAR_API_BASE = 'https://sonarcloud.io/api';

if (!SONAR_TOKEN) {
  console.error('❌ Error: SONAR_TOKEN environment variable not set');
  console.error('\nUsage:');
  console.error('  export SONAR_TOKEN="your-sonarcloud-token"');
  console.error('  node scripts/suppress-sonar-readonly-props.mjs');
  console.error('\nOr:');
  console.error(
    '  SONAR_TOKEN="your-token" node scripts/suppress-sonar-readonly-props.mjs'
  );
  console.error(
    '\nGet your token from: https://sonarcloud.io/account/security'
  );
  process.exit(1);
}

// Load SonarCloud issues
console.log('📂 Loading SonarCloud issues...');
const issuesData = JSON.parse(
  await readFile('.issues/sonar-issues-latest.json', 'utf-8')
);

// Filter for S6759 violations
const s6759Issues = issuesData.filter(
  issue => issue.rule === 'typescript:S6759' && issue.status === 'OPEN'
);

console.log(
  `Found ${s6759Issues.length} open typescript:S6759 violations (readonly props)\n`
);

if (s6759Issues.length === 0) {
  console.log('✅ No readonly props issues to suppress. All done!');
  process.exit(0);
}

// Show sample issues
console.log(`📊 Sample issues:`);
s6759Issues.slice(0, 5).forEach(issue => {
  const filePath = issue.component.replace(/^JovieInc_Jovie:apps\/web\//, '');
  console.log(`  - ${filePath}:${issue.line}`);
  console.log(`    Message: ${issue.message}`);
});
if (s6759Issues.length > 5) {
  console.log(`  ... and ${s6759Issues.length - 5} more`);
}
console.log('');

// Suppress readonly props violations via SonarCloud API
console.log(`🔧 Suppressing ${s6759Issues.length} readonly props issues...\n`);

const dryRun = process.argv.includes('--dry-run');
if (dryRun) {
  console.log('🧪 DRY RUN MODE - No actual API calls will be made\n');
}

let successCount = 0;
let failureCount = 0;

for (const issue of s6759Issues) {
  const issueKey = issue.key;
  const filePath = issue.component.replace(/^JovieInc_Jovie:apps\/web\//, '');

  console.log(`  ${filePath}:${issue.line}`);

  if (dryRun) {
    console.log(`    [DRY RUN] Would mark as won't fix`);
    successCount++;
  } else {
    try {
      // Mark issue as "won't fix" with resolution
      const response = await fetch(`${SONAR_API_BASE}/issues/do_transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SONAR_TOKEN}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          issue: issueKey,
          transition: 'wontfix',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(
          `    ❌ Failed to suppress: ${response.status} ${errorText}`
        );
        failureCount++;
        continue;
      }

      // Add a comment explaining why we're suppressing
      const commentResponse = await fetch(
        `${SONAR_API_BASE}/issues/add_comment`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SONAR_TOKEN}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            issue: issueKey,
            text: 'React props are immutable by design and semantics. Explicit Readonly<> wrapper is a style preference that does not prevent actual mutations. This is not a bug or security issue.',
          }),
        }
      );

      if (commentResponse.ok) {
        console.log(`    ✅ Suppressed with comment`);
      } else {
        console.log(`    ⚠️  Suppressed (but comment failed)`);
      }

      successCount++;

      // Rate limit: 1 request per 100ms to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
      failureCount++;
    }
  }

  console.log('');
}

console.log('━'.repeat(60));
console.log(`✨ Summary:`);
console.log(`  Successfully suppressed: ${successCount}`);
console.log(`  Failed: ${failureCount}`);
console.log(`  Mode: ${dryRun ? 'DRY RUN (no changes made)' : 'APPLIED'}`);
console.log('━'.repeat(60));

if (!dryRun && successCount > 0) {
  console.log(
    '\n✅ Done! The SonarCloud dashboard should update within a few minutes.'
  );
  console.log(
    `   View: https://sonarcloud.io/project/issues?resolved=false&id=${SONAR_PROJECT}`
  );
}

if (failureCount > 0) {
  process.exit(1);
}
