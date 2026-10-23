#!/usr/bin/env node
/**
 * Fail when Codecov or Chromatic config claims a gate no workflow produces.
 *
 * Coverage flags come only from `codecov/codecov-action`. Test Analytics
 * (`codecov/test-results-action`) uses flag names too, and those are not
 * coverage producers. Pull-request line coverage is the Exact-head Coverage
 * ratchet in `.github/workflows/ci.yml`. Codecov patch status stays
 * informational until a pull_request workflow uploads coverage.
 *
 * Path literals below are how script-contract selection notices a config-only
 * edit (scripts/lib/test-file-dependencies.mjs).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const COVERAGE_ACTION = 'codecov/codecov-action@';
export const CODECOV_CONFIG = 'codecov.yml';
export const CHROMATIC_CONFIG = 'chromatic.config.json';
export const STORYBOOK_MAIN = 'apps/web/.storybook/main.ts';
export const WEB_PACKAGE = 'apps/web/package.json';
const WORKFLOW_DIR = '.github/workflows';

const CHROMATIC_RUN =
  /(?:chromaui\/action@|chromatic-com\/action@|uses:\s*['"]?chromatic\/|npx\s+chromatic\b|\bpnpm\s+(?:exec\s+)?chromatic\b)/u;

/** @param {unknown} value @returns {Record<string, unknown>} */
function asMapping(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {string} workflowText */
export function onBlock(workflowText) {
  const start = workflowText.search(/^on:\s*/m);
  if (start === -1) return '';
  const rest = workflowText.slice(start);
  const end = rest.search(/\n(?:jobs|permissions|concurrency|env):/);
  return end === -1 ? rest : rest.slice(0, end);
}

/** @param {string} workflowText */
export function triggersPullRequest(workflowText) {
  return /\bpull_request(?:_target)?:/u.test(onBlock(workflowText));
}

/**
 * Flag names on the `with:` block of each matching action. The window stops at
 * the next step so a later step's `flags:` cannot be attributed here.
 *
 * @param {string} workflowText
 * @param {string} actionMarker
 * @returns {string[]}
 */
export function actionFlags(workflowText, actionMarker) {
  const flags = [];
  let searchFrom = 0;
  while (searchFrom < workflowText.length) {
    const index = workflowText.indexOf(actionMarker, searchFrom);
    if (index === -1) break;
    const nextStep = workflowText.indexOf(
      '\n      - ',
      index + actionMarker.length
    );
    const window = workflowText.slice(
      index,
      nextStep === -1 ? workflowText.length : nextStep
    );
    const match = window.match(/^\s*flags:\s*['"]?([A-Za-z0-9_,.-]+)/m);
    if (match) {
      for (const flag of match[1].split(',')) {
        const name = flag.trim();
        if (name) flags.push(name);
      }
    }
    searchFrom = index + actionMarker.length;
  }
  return flags;
}

/**
 * @param {string} root
 * @returns {string[]}
 */
export function auditGateConfigs(root) {
  const findings = [];
  const workflowDir = resolve(root, WORKFLOW_DIR);
  const workflowNames = existsSync(workflowDir)
    ? readdirSync(workflowDir).filter(name => /\.ya?ml$/u.test(name))
    : [];
  const coverageFlags = new Set();
  let pullRequestUploadsCoverage = false;
  let chromaticWired = false;

  for (const name of workflowNames) {
    const text = readFileSync(resolve(workflowDir, name), 'utf8');
    for (const flag of actionFlags(text, COVERAGE_ACTION)) {
      coverageFlags.add(flag);
    }
    if (text.includes(COVERAGE_ACTION) && triggersPullRequest(text)) {
      pullRequestUploadsCoverage = true;
    }
    if (CHROMATIC_RUN.test(text)) chromaticWired = true;
  }

  const codecovPath = resolve(root, CODECOV_CONFIG);
  if (!existsSync(codecovPath)) {
    findings.push(`${CODECOV_CONFIG} is missing`);
  } else {
    const codecov = asMapping(loadYaml(readFileSync(codecovPath, 'utf8')));
    const declared = new Set(Object.keys(asMapping(codecov.flags)));
    for (const flag of declared) {
      if (!coverageFlags.has(flag)) {
        findings.push(
          `${CODECOV_CONFIG} declares coverage flag "${flag}" but no workflow uploads it with codecov/codecov-action`
        );
      }
    }
    for (const flag of coverageFlags) {
      if (!declared.has(flag)) {
        findings.push(
          `a workflow uploads coverage flag "${flag}" but ${CODECOV_CONFIG} does not declare it`
        );
      }
    }
    const coverage = asMapping(codecov.coverage);
    const status = asMapping(coverage.status);
    const patchEntries = Object.values(asMapping(status.patch));
    const patchInformational =
      patchEntries.length > 0 &&
      patchEntries.every(entry => asMapping(entry).informational === true);
    if (!patchInformational && !pullRequestUploadsCoverage) {
      findings.push(
        `${CODECOV_CONFIG} patch status is blocking, but no pull_request workflow uploads coverage. Exact-head Coverage in ci.yml is the pull-request line-coverage gate.`
      );
    }
  }

  if (existsSync(resolve(root, CHROMATIC_CONFIG)) && !chromaticWired) {
    findings.push(`${CHROMATIC_CONFIG} exists but no workflow runs Chromatic`);
  }

  const packagePath = resolve(root, WEB_PACKAGE);
  if (existsSync(packagePath)) {
    const webPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
    const dependencies = {
      ...webPackage.dependencies,
      ...webPackage.devDependencies,
    };
    if (dependencies['@chromatic-com/storybook'] && !chromaticWired) {
      findings.push(
        '@chromatic-com/storybook is installed but no workflow runs Chromatic'
      );
    }
  }

  const storybookMain = resolve(root, STORYBOOK_MAIN);
  if (
    existsSync(storybookMain) &&
    readFileSync(storybookMain, 'utf8').includes('@chromatic-com/storybook') &&
    !chromaticWired
  ) {
    findings.push(
      'Storybook loads @chromatic-com/storybook but no workflow runs Chromatic'
    );
  }

  return findings;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const findings = auditGateConfigs(root);
  if (findings.length === 0) return;
  console.error(findings.join('\n'));
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
