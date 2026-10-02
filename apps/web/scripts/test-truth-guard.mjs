import fs from 'node:fs';
import path from 'node:path';

const appRoot = process.cwd();
const testsRoot = path.join(appRoot, 'tests');
const repoRoot = path.resolve(appRoot, '..', '..');

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
    const relativePath = path.relative(appRoot, fullPath);

    if (relativePath.startsWith(`tests${path.sep}integration${path.sep}`)) {
      if (!/\bexpect\s*\(/.test(content)) {
        violations.push(`${relativePath} has zero protected assertions`);
      }
      if (/\.(?:skip|todo)\s*\(/.test(content)) {
        violations.push(`${relativePath} contains an unconditional skip`);
      }
    }

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

const fastConfig = fs.readFileSync(
  path.join(appRoot, 'vitest.config.fast.mts'),
  'utf8'
);
const integrationConfigPath = path.join(
  appRoot,
  'vitest.config.integration.mts'
);
const integrationConfig = fs.existsSync(integrationConfigPath)
  ? fs.readFileSync(integrationConfigPath, 'utf8')
  : '';
const ciWorkflow = fs.readFileSync(
  path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
  'utf8'
);

if (!fastConfig.includes("'tests/integration/**'")) {
  violations.push(
    'vitest.config.fast.mts must explicitly route tests/integration to the database lane'
  );
}
if (
  !integrationConfig.includes("'tests/integration/**/*.test.ts'") ||
  !integrationConfig.includes('passWithNoTests: false')
) {
  violations.push(
    'vitest.config.integration.mts must discover integration tests and reject zero tests'
  );
}
if (
  !ciWorkflow.includes('run test:integration') ||
  !ciWorkflow.includes("DB_CERTIFICATION: 'true'")
) {
  violations.push(
    'ci.yml must execute the real database integration lane in certification mode'
  );
}

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
