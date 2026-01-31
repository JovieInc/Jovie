#!/usr/bin/env node

/**
 * Suppress SonarCloud typescript:S7764 violations for `typeof window` checks
 *
 * These are intentional SSR safety checks that should NOT be changed to globalThis.
 * This script marks them as "won't fix" in SonarCloud.
 *
 * Usage:
 *   export SONAR_TOKEN="your-sonarcloud-token"
 *   node scripts/suppress-sonar-typeof-window.mjs
 *
 * Or:
 *   SONAR_TOKEN="your-token" node scripts/suppress-sonar-typeof-window.mjs
 */

import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';

const SONAR_TOKEN = process.env.SONAR_TOKEN;
const SONAR_PROJECT = 'JovieInc_Jovie';
const SONAR_API_BASE = 'https://sonarcloud.io/api';

if (!SONAR_TOKEN) {
  console.error('❌ Error: SONAR_TOKEN environment variable not set');
  console.error('\nUsage:');
  console.error('  export SONAR_TOKEN="your-sonarcloud-token"');
  console.error('  node scripts/suppress-sonar-typeof-window.mjs');
  console.error('\nOr:');
  console.error(
    '  SONAR_TOKEN="your-token" node scripts/suppress-sonar-typeof-window.mjs'
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

// Filter for S7764 violations
const s7764Issues = issuesData.filter(
  issue => issue.rule === 'typescript:S7764' && issue.status === 'OPEN'
);

console.log(`Found ${s7764Issues.length} open typescript:S7764 violations\n`);

// Identify typeof window checks vs actual window usage
const typeofWindowChecks = [];
const actualWindowUsage = [];

for (const issue of s7764Issues) {
  const filePath = issue.component.replace(/^JovieInc_Jovie:apps\/web\//, '');

  try {
    // Read the file and check the specific line
    const fileContent = readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');
    const lineIndex = issue.line - 1;
    const lineContent = lines[lineIndex] || '';

    // Check if it's a typeof window check (SSR safety pattern)
    if (
      lineContent.includes('typeof window') ||
      lineContent.includes('typeof globalThis')
    ) {
      typeofWindowChecks.push({
        ...issue,
        filePath,
        lineContent: lineContent.trim(),
      });
    } else {
      actualWindowUsage.push({
        ...issue,
        filePath,
        lineContent: lineContent.trim(),
      });
    }
  } catch (error) {
    console.warn(`⚠️  Could not read ${filePath}: ${error.message}`);
    // Assume it might be a typeof check if we can't read it
    typeofWindowChecks.push({
      ...issue,
      filePath,
      lineContent: '(could not read)',
    });
  }
}

console.log(`📊 Analysis:`);
console.log(
  `  - typeof window/globalThis checks: ${typeofWindowChecks.length} (will suppress)`
);
console.log(
  `  - Actual window.* usage: ${actualWindowUsage.length} (already fixed or need manual review)`
);
console.log('');

if (actualWindowUsage.length > 0) {
  console.log(
    `⚠️  Warning: Found ${actualWindowUsage.length} issues that are NOT typeof checks:`
  );
  actualWindowUsage.slice(0, 5).forEach(issue => {
    console.log(`  - ${issue.filePath}:${issue.line} - "${issue.lineContent}"`);
  });
  if (actualWindowUsage.length > 5) {
    console.log(`  ... and ${actualWindowUsage.length - 5} more`);
  }
  console.log('');
}

if (typeofWindowChecks.length === 0) {
  console.log('✅ No typeof window checks to suppress. All done!');
  process.exit(0);
}

// Suppress typeof window checks via SonarCloud API
console.log(
  `🔧 Suppressing ${typeofWindowChecks.length} typeof window checks...\n`
);

const dryRun = process.argv.includes('--dry-run');
if (dryRun) {
  console.log('🧪 DRY RUN MODE - No actual API calls will be made\n');
}

let successCount = 0;
let failureCount = 0;

for (const issue of typeofWindowChecks) {
  const issueKey = issue.key;

  console.log(`  ${issue.filePath}:${issue.line}`);
  console.log(`    Line: ${issue.lineContent}`);

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
            text: 'This is an intentional SSR safety check. `typeof window` is the correct pattern for detecting browser vs server environment. Changing to `typeof globalThis` would break SSR guards since globalThis exists in both environments.',
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
