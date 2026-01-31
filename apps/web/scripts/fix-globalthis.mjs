import { exec } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load SonarCloud issues
const issuesData = JSON.parse(
  await readFile('.issues/sonar-issues-latest.json', 'utf-8')
);

// Filter for S7764 violations
const globalThisIssues = issuesData.filter(
  issue => issue.rule === 'typescript:S7764'
);

console.log(`Found ${globalThisIssues.length} S7764 violations`);

// Group by file
const fileGroups = new Map();
for (const issue of globalThisIssues) {
  // Remove SonarCloud project prefix and apps/web/ prefix
  const file = issue.component
    .replace(/^JovieInc_Jovie:/, '')
    .replace(/^apps\/web\//, '');
  if (!fileGroups.has(file)) {
    fileGroups.set(file, []);
  }
  fileGroups.get(file).push(issue);
}

// Replacement patterns (order matters!)
const patterns = [
  // Pattern 1: window.location (most common)
  {
    regex: /\bwindow\.location\b/g,
    replacement: 'globalThis.location',
    description: 'window.location → globalThis.location',
  },
  // Pattern 2: window.addEventListener
  {
    regex: /\bwindow\.addEventListener\b/g,
    replacement: 'globalThis.addEventListener',
    description: 'window.addEventListener → globalThis.addEventListener',
  },
  // Pattern 3: window.removeEventListener
  {
    regex: /\bwindow\.removeEventListener\b/g,
    replacement: 'globalThis.removeEventListener',
    description: 'window.removeEventListener → globalThis.removeEventListener',
  },
  // Pattern 4: window.print() (needs optional chaining)
  {
    regex: /\bwindow\.print\(\)/g,
    replacement: 'globalThis.print?.()',
    description: 'window.print() → globalThis.print?.()',
  },
  // Pattern 5: window.open(
  {
    regex: /\bwindow\.open\(/g,
    replacement: 'globalThis.open(',
    description: 'window.open( → globalThis.open(',
  },
  // Pattern 6: window.navigator
  {
    regex: /\bwindow\.navigator\b/g,
    replacement: 'globalThis.navigator',
    description: 'window.navigator → globalThis.navigator',
  },
  // Pattern 7: window.matchMedia
  {
    regex: /\bwindow\.matchMedia\b/g,
    replacement: 'globalThis.matchMedia',
    description: 'window.matchMedia → globalThis.matchMedia',
  },
  // Pattern 8: window.innerWidth
  {
    regex: /\bwindow\.innerWidth\b/g,
    replacement: 'globalThis.innerWidth',
    description: 'window.innerWidth → globalThis.innerWidth',
  },
  // Pattern 9: window.innerHeight
  {
    regex: /\bwindow\.innerHeight\b/g,
    replacement: 'globalThis.innerHeight',
    description: 'window.innerHeight → globalThis.innerHeight',
  },
  // Pattern 10: window.scrollTo
  {
    regex: /\bwindow\.scrollTo\b/g,
    replacement: 'globalThis.scrollTo',
    description: 'window.scrollTo → globalThis.scrollTo',
  },
  // Pattern 11: window.sessionStorage
  {
    regex: /\bwindow\.sessionStorage\b/g,
    replacement: 'globalThis.sessionStorage',
    description: 'window.sessionStorage → globalThis.sessionStorage',
  },
  // Pattern 12: window.localStorage
  {
    regex: /\bwindow\.localStorage\b/g,
    replacement: 'globalThis.localStorage',
    description: 'window.localStorage → globalThis.localStorage',
  },
  // Pattern 13: window.document
  {
    regex: /\bwindow\.document\b/g,
    replacement: 'globalThis.document',
    description: 'window.document → globalThis.document',
  },
  // Pattern 14: window.requestAnimationFrame
  {
    regex: /\bwindow\.requestAnimationFrame\b/g,
    replacement: 'globalThis.requestAnimationFrame',
    description:
      'window.requestAnimationFrame → globalThis.requestAnimationFrame',
  },
  // Pattern 15: window.cancelAnimationFrame
  {
    regex: /\bwindow\.cancelAnimationFrame\b/g,
    replacement: 'globalThis.cancelAnimationFrame',
    description:
      'window.cancelAnimationFrame → globalThis.cancelAnimationFrame',
  },
  // Pattern 15b: window.history
  {
    regex: /\bwindow\.history\b/g,
    replacement: 'globalThis.history',
    description: 'window.history → globalThis.history',
  },
  // Pattern 15c: window.gtag (analytics)
  {
    regex: /\bwindow\.gtag\b/g,
    replacement: 'globalThis.gtag',
    description: 'window.gtag → globalThis.gtag',
  },
  // Pattern 15d: window.dataLayer (GTM)
  {
    regex: /\bwindow\.dataLayer\b/g,
    replacement: 'globalThis.dataLayer',
    description: 'window.dataLayer → globalThis.dataLayer',
  },
  // Pattern 16: Custom window properties (e.g., window.JVConsent)
  {
    regex: /\bwindow\.([A-Z][a-zA-Z0-9]*)\b/g,
    replacement: 'globalThis.$1',
    description: 'window.CustomProp → globalThis.CustomProp',
  },
  // Pattern 17: global. (Node.js global)
  {
    regex: /\bglobal\./g,
    replacement: 'globalThis.',
    description: 'global. → globalThis.',
  },
  // Pattern 18: DO NOT auto-replace Interface Window - requires manual handling
  // Global var declarations should be used instead, which we do NOT auto-replace
];

// Process files
const dryRun = process.argv.includes('--dry-run');
const batchArg = process.argv.find(arg => arg.startsWith('--batch='));
const batch = batchArg ? batchArg.split('=')[1] : null;

console.log(
  `Processing ${fileGroups.size} files with globalThis violations...`
);
console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLY CHANGES'}`);
if (batch) {
  console.log(`Batch filter: ${batch}`);
}
console.log('');

let filesProcessed = 0;
let replacementsMade = 0;
const processedFiles = [];

for (const [file, issues] of fileGroups) {
  // Skip if not in specified batch
  if (batch && !file.includes(batch)) continue;

  console.log(`\n📄 ${file} (${issues.length} violations)`);

  try {
    const content = await readFile(file, 'utf-8');
    let newContent = content;
    let fileReplacements = 0;

    for (const pattern of patterns) {
      const matches = content.match(pattern.regex);
      if (matches) {
        console.log(`  ✓ ${pattern.description}: ${matches.length} match(es)`);
        newContent = newContent.replace(pattern.regex, pattern.replacement);
        fileReplacements += matches.length;
      }
    }

    if (fileReplacements > 0) {
      if (!dryRun) {
        await writeFile(file, newContent, 'utf-8');
        console.log(`  ✅ File written`);
      }

      filesProcessed++;
      replacementsMade += fileReplacements;
      processedFiles.push(file);
      console.log(`  📝 Made ${fileReplacements} replacement(s)`);
    } else {
      console.log(`  ℹ️  No patterns matched (may already be fixed)`);
    }
  } catch (error) {
    console.error(`  ❌ Error processing file: ${error.message}`);
  }
}

console.log(`\n✨ Summary:`);
console.log(`  Files processed: ${filesProcessed}`);
console.log(`  Replacements made: ${replacementsMade}`);
console.log(`  Mode: ${dryRun ? 'DRY RUN (no changes saved)' : 'APPLIED'}`);

if (processedFiles.length > 0) {
  console.log(`\n📋 Files modified:`);
  processedFiles.forEach(f => console.log(`  - ${f}`));
}

if (!dryRun && filesProcessed > 0) {
  console.log(`\n🔍 Validating TypeScript...`);
  try {
    await execAsync('pnpm tsc --noEmit', { cwd: process.cwd() });
    console.log(`✅ TypeScript validation passed`);
  } catch (error) {
    console.error(`❌ TypeScript validation FAILED`);
    console.error(error.stderr || error.message);
    process.exit(1);
  }

  console.log(`\n🔍 Next steps:`);
  console.log(`  1. Run: pnpm --filter @jovie/web run lint`);
  console.log(`  2. Review changes with: git diff`);
  console.log(
    `  3. Commit: git commit -m "fix: migrate window/global to globalThis (batch N)"`
  );
}
