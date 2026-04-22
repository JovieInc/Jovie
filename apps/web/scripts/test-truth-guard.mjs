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
