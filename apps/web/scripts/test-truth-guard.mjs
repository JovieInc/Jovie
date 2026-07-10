import fs from 'node:fs';
import path from 'node:path';

const appRoot = process.cwd();
const testsRoot = path.join(appRoot, 'tests');

const invalidPhrasePatterns = [
  /duplicate the algorithm/i,
  /recreate .* helper/i,
  /private in .* so we/i,
];

const setupFiles = [
  path.join(testsRoot, 'setup-mocks.ts'),
  path.join(testsRoot, 'utils', 'lazy-mocks.ts'),
];

const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      for (const pattern of invalidPhrasePatterns) {
        if (pattern.test(line)) {
          violations.push(
            `${path.relative(appRoot, fullPath)}:${index + 1} contains banned test-truth phrase: ${line.trim()}`
          );
        }
      }

      if (/loader\(\)\.then/.test(line)) {
        violations.push(
          `${path.relative(appRoot, fullPath)}:${index + 1} starts a real async import from a dynamic() mock: ${line.trim()}`
        );
      }
    });
  }
}

walk(testsRoot);

/**
 * Dead-test detector (JOV-4195 / GH #13931).
 *
 * Fails when a tests/** vitest file is excluded by every CI-executed vitest
 * config — i.e. it counts as coverage on the heatmap but never runs anywhere.
 * (This is exactly how tests/integration/** sat structurally dead: the fast
 * config backing the merge gate excluded it, and no other CI lane ran it.)
 *
 * CI-executed vitest lanes modeled here:
 *   - vitest.config.fast.mts  -> "Unit Tests" merge gate (excludes parsed
 *     live from the config so drift is caught automatically)
 *   - vitest.config.integration.mts -> "Integration Tests (DB)" lane
 *   - vitest.config.golden-eval.mts -> evals:golden gate (tests/eval/golden
 *     *.ci.test.ts only)
 *
 * Non-vitest / opt-in lanes (allowlisted): *.nightly.test.ts (nightly agent),
 * *.real.test.ts (live real-model lane), tests/e2e (Playwright).
 */
function globToRegExp(glob) {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob.startsWith('**/', i)) {
        re += '(?:.*/)?';
        i += 3;
        continue;
      }
      if (glob.startsWith('**', i)) {
        re += '.*';
        i += 2;
        continue;
      }
      re += '[^/]*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      re += '[^/]';
      i += 1;
      continue;
    }
    if (ch === '{') {
      const end = glob.indexOf('}', i);
      if (end !== -1) {
        const alts = glob
          .slice(i + 1, end)
          .split(',')
          .map(alt => alt.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|');
        re += `(?:${alts})`;
        i = end + 1;
        continue;
      }
    }
    re += ch.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }
  return new RegExp(`^${re}$`);
}

function parseGlobArray(configText, key) {
  const match = configText.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`, 'm'));
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

function checkDeadTests() {
  const fastConfig = fs.readFileSync(
    path.join(appRoot, 'vitest.config.fast.mts'),
    'utf8'
  );
  const integrationConfig = fs.readFileSync(
    path.join(appRoot, 'vitest.config.integration.mts'),
    'utf8'
  );

  const fastExcludes = parseGlobArray(fastConfig, 'exclude')
    .filter(glob => glob.startsWith('tests/'))
    .map(globToRegExp);
  const integrationIncludes = parseGlobArray(integrationConfig, 'include').map(
    globToRegExp
  );
  const goldenIncludes = [globToRegExp('tests/eval/golden/**/*.ci.test.ts')];

  const allowlistedLanes = [
    globToRegExp('tests/e2e/**'), // Playwright
    globToRegExp('tests/**/*.nightly.test.ts'), // nightly agent lane
    globToRegExp('tests/**/*.real.test.ts'), // opt-in live real-model lane
  ];

  const deadFiles = [];

  function walkForDead(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkForDead(fullPath);
        continue;
      }
      if (!/\.test\.(ts|tsx)$/.test(entry.name)) continue;

      const rel = path.relative(appRoot, fullPath).split(path.sep).join('/');
      if (allowlistedLanes.some(re => re.test(rel))) continue;

      const coveredByFast = !fastExcludes.some(re => re.test(rel));
      const coveredByIntegration = integrationIncludes.some(re =>
        re.test(rel)
      );
      const coveredByGolden = goldenIncludes.some(re => re.test(rel));

      if (!coveredByFast && !coveredByIntegration && !coveredByGolden) {
        deadFiles.push(rel);
      }
    }
  }

  walkForDead(testsRoot);

  for (const file of deadFiles) {
    violations.push(
      `${file} is excluded by every CI-executed vitest config (dead test — wire it into a CI lane or move it to an allowlisted lane)`
    );
  }
}

checkDeadTests();

for (const setupFile of setupFiles) {
  const content = fs.readFileSync(setupFile, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    if (/^\s+vi\.mock\(/.test(line)) {
      violations.push(
        `${path.relative(appRoot, setupFile)}:${index + 1} contains non-top-level vi.mock(): ${line.trim()}`
      );
    }
  });
}

if (violations.length > 0) {
  console.error('test-truth-guard found violations:\n');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log('test-truth-guard: no violations found');
}
