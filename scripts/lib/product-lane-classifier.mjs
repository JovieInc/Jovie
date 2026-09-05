import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const PRODUCT_LANES = ['ios', 'mac', 'web'];

const GATE_RECEIPTS = {
  ios: {
    tests:
      'pnpm run ios:lint && bash apps/ios/scripts/run-unit-tests.sh && bash apps/ios/scripts/check_coverage.sh',
    artifact: 'ios-test-results-<merge-group-head-sha>-<run-attempt>',
    releaseWorkflow: '.github/workflows/ios-testflight.yml',
  },
  mac: {
    tests:
      'swift build --package-path apps/macos/MenuMonitor -c release && pnpm --filter @jovie/desktop run typecheck && pnpm --filter @jovie/desktop run test && pnpm --filter @jovie/desktop run package:staging',
    artifact:
      'desktop-staging-<merge-group-head-sha> with MenuMonitor release binary',
    releaseWorkflow: '.github/workflows/desktop-release.yml',
  },
  web: {
    tests:
      'Web unit shards, Ovie route/proxy coverage and independent build/typecheck, Web build/layout, extension typecheck/test/build, and observability worker typecheck/test',
    artifact: 'apps/web/.next exact combined-head build workspace',
    releaseWorkflow: '.github/workflows/production-release.yml',
  },
  operations: {
    tests:
      'pnpm ci:harness:check && pnpm ci:control:test && workflow contract tests',
    artifact: 'product-lane-classification receipt in Path Changes summary',
  },
  'cross-product': {
    tests:
      'pnpm --filter @jovie/auth-routing test && pnpm --filter @jovie/action-contracts test && pnpm --filter @jovie/audio-contracts test',
    artifact: 'cross-product shared-contract gate receipt',
  },
};

const RULES = /** @type {Array<[string, string, string[], RegExp]>} */ ([
  [
    'shared-release-version',
    'shared-contract',
    PRODUCT_LANES,
    /^(VERSION|version\.json)$/,
  ],
  [
    'shared-native-auth',
    'shared-contract',
    PRODUCT_LANES,
    /^packages\/auth-routing\//,
  ],
  [
    // Lockfile-only churn (every dependabot group) changes the JS install
    // graph. The iOS lane is native xcodebuild with no causal path from it —
    // unlike the desktop lane, which bundles web output. Dropping ios here
    // removes 25-70 minutes of Swift CI from every dependency-only
    // merge-group head (2026-09-04 queue evidence).
    'shared-js-lockfile',
    'shared-contract',
    ['mac', 'web'],
    /^pnpm-lock\.yaml$/,
  ],
  [
    'shared-js-workspace',
    'shared-contract',
    PRODUCT_LANES,
    /^(package\.json|pnpm-workspace\.yaml|turbo\.json|tsconfig\.json|vitest\.config\.mts|biome\.json|\.node-version|\.npmrc|\.nvmrc|patches\/)/,
  ],
  [
    'shared-release-admission',
    'operations-tooling',
    [],
    /^(config\/node-runtime-policy\.json|\.github\/(workflows\/(ci|production-controller)\.yml|ci-harness\/)|scripts\/ci-fast-lanes\.mjs|scripts\/lib\/(ci-harness|merge-queue-guard|product-lane-(classifier|finalize)|production-lane-range)\.mjs|scripts\/lib\/__tests__\/(ci-harness|merge-group-workflow-contract|product-lane-classifier|production-lane-range)\.test\.mjs)$/,
  ],
  [
    'operations-release-contract-test',
    'operations-tooling',
    [],
    /^apps\/web\/tests\/unit\/ci\/deploy-workflow\.test\.ts$/,
  ],
  [
    'ios-product',
    'ios',
    ['ios'],
    /^(apps\/ios\/|fastlane\/|Gemfile$|Gemfile\.lock$|scripts\/ios-best-practices-lint\.sh$|\.github\/workflows\/ios-(ci|testflight|signing-bootstrap)\.yml$)/,
  ],
  [
    'mac-product',
    'mac',
    ['mac'],
    /^(apps\/(desktop|macos)\/|\.github\/workflows\/desktop-release\.yml$|scripts\/desktop-(release|installed-apps)[^/]*\.(mjs|test\.mjs)$)/,
  ],
  [
    'web-product',
    'web',
    ['web'],
    /^(apps\/(web|ovie|extension)\/|packages\/(action-contracts|audio-contracts|extension-contracts|jovie-cli|ui)\/|workers\/observability-ingest\/|app\/|content\/|lib\/|trigger\/|creator_profiles\/|vercel\.json$|\.vercelignore$|\.github\/workflows\/(production-release|production-marker-recovery|postdeploy-probes|canary-health-gate)\.yml$)/,
  ],
  [
    'operations-tooling',
    'operations-tooling',
    [],
    /^(\.github\/|scripts\/|apps\/(console|docs|eve-pilot|should-i-make)\/|workers\/x402-artist-resource-proxy\/wrangler\.example\.jsonc$|\.agents\/|\.claude\/|\.codex\/|\.conductor\/|\.context\/|\.cursor\/|\.design-sync(?:-marketing)?\/|\.grok\/|\.hermes\/|\.husky\/|\.lavish\/|\.neon(?:\/|$)|\.no-mistakes\/|\.orchestrator\/|\.sonarlint\/|\.vscode\/|\.windsurf\/|\.zap\/|agentos\/|architecture\/|audits\/|canon\/|creator_profiles(?:\/|$)|docs\/|github\/|ideation\/|infra\/|prompts\/|tests\/|tools\/)/,
  ],
  [
    'operations-root-file',
    'operations-tooling',
    [],
    /^(CHANGELOG\.md|LICENSE|[^/]+\.(md|txt|json|ya?ml|toml|lock|mjs|cjs|sh|properties)|\.agent-status\.json|\.ci-kick|\.coderabbit\.yaml|\.commitlintrc\.json|\.editorconfig|\.env\.example|\.gitattributes|\.gitignore|\.gitleaks\.toml|\.gitmessage|\.mcp\.json|\.no-mistakes\.yaml|\.sonarcloud\.properties|\.trivyignore|\.trufflehog-exclude\.txt)$/,
  ],
]);

const ALL_LANES = [...PRODUCT_LANES, 'operations', 'cross-product'];
const JS_WORKSPACE_PRODUCTS = ['mac', 'web'];
const OPERATIONS_ONLY_PACKAGE_SCRIPTS = new Set(['invariants:check']);
const OPERATIONS_ONLY_INVARIANT_ADDITION =
  /^python3 scripts\/symphony\/tests\/[a-z0-9-]+\.test\.py$/;
const IOS_PACKAGE_SCRIPT = /^(?:ios:|ci:ios-|test:auth:ios$)/;
const IOS_PACKAGE_COMMAND = /(?:apps\/ios\/|\bxcodebuild\b|\bfastlane ios\b)/;
const PACKAGE_MANAGER_COMMAND = /\b(?:pnpm|npm|yarn)\s+([^;&|\n]+)/g;

const normalizePath = path =>
  String(path ?? '')
    .trim()
    .replace(/^\.\//, '');
const isJsonObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export class ProductLaneClassificationError extends Error {
  constructor(paths) {
    super(
      `Unmapped changed paths: ${paths.join(', ')}. Add an explicit product-lane rule before intake can continue.`
    );
    this.name = 'ProductLaneClassificationError';
  }
}

function sharedPackageClassification(
  rule = 'shared-js-workspace',
  affectedProducts = JS_WORKSPACE_PRODUCTS
) {
  return [rule, 'shared-contract', affectedProducts];
}

function isOperationsOnlyInvariantChange(beforeCommand, afterCommand) {
  if (typeof beforeCommand !== 'string' || typeof afterCommand !== 'string') {
    return false;
  }

  const beforeCommands = beforeCommand
    .split(' && ')
    .map(command => command.trim());
  const addedCommands = [];
  let beforeIndex = 0;
  for (const command of afterCommand
    .split(' && ')
    .map(candidate => candidate.trim())) {
    if (command === beforeCommands[beforeIndex]) {
      beforeIndex += 1;
    } else {
      addedCommands.push(command);
    }
  }

  return (
    beforeIndex === beforeCommands.length &&
    addedCommands.length > 0 &&
    addedCommands.every(command =>
      OPERATIONS_ONLY_INVARIANT_ADDITION.test(command)
    )
  );
}

function packageScriptInvocations(command, scripts) {
  return [...command.matchAll(PACKAGE_MANAGER_COMMAND)].flatMap(match => {
    const tokens = match[1]
      .trim()
      .split(/\s+/)
      .map(token => token.replace(/^["']|["']$/g, ''));
    const runIndex = tokens.findIndex(
      token => token === 'run' || token === 'run-script'
    );
    if (runIndex >= 0 && tokens[runIndex + 1]) return [tokens[runIndex + 1]];

    const directScript = tokens.find(token => Object.hasOwn(scripts, token));
    return directScript ? [directScript] : [];
  });
}

function scriptReferencesIos(script, scripts, visited = new Set()) {
  if (IOS_PACKAGE_SCRIPT.test(script)) return true;
  if (visited.has(script)) return false;
  const nextVisited = new Set(visited);
  nextVisited.add(script);

  const command = scripts[script];
  if (typeof command !== 'string') return false;
  if (IOS_PACKAGE_COMMAND.test(command)) return true;

  return packageScriptInvocations(command, scripts).some(invocation =>
    scriptReferencesIos(invocation, scripts, nextVisited)
  );
}

function scriptDependsOn(script, target, scripts, visited = new Set()) {
  if (script === target) return true;
  if (visited.has(script)) return false;
  const nextVisited = new Set(visited);
  nextVisited.add(script);

  const command = scripts[script];
  if (typeof command !== 'string') return false;
  return packageScriptInvocations(command, scripts).some(invocation =>
    scriptDependsOn(invocation, target, scripts, nextVisited)
  );
}

function scriptChangeAffectsIos(script, scripts) {
  if (scriptReferencesIos(script, scripts)) return true;
  return Object.keys(scripts).some(candidate => {
    const command = scripts[candidate];
    const isIosEntryPoint =
      IOS_PACKAGE_SCRIPT.test(candidate) ||
      (typeof command === 'string' && IOS_PACKAGE_COMMAND.test(command));
    return (
      isIosEntryPoint && scriptDependsOn(candidate, script, scripts, new Set())
    );
  });
}

export function classifyPackageJsonChange(beforeSource, afterSource) {
  if (typeof beforeSource !== 'string' || typeof afterSource !== 'string') {
    return sharedPackageClassification(
      'shared-js-workspace-unresolved',
      PRODUCT_LANES
    );
  }

  let before;
  let after;
  try {
    before = JSON.parse(beforeSource);
    after = JSON.parse(afterSource);
  } catch {
    return sharedPackageClassification(
      'shared-js-workspace-unresolved',
      PRODUCT_LANES
    );
  }
  if (!isJsonObject(before) || !isJsonObject(after)) {
    return sharedPackageClassification(
      'shared-js-workspace-unresolved',
      PRODUCT_LANES
    );
  }

  const changedTopLevelKeys = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].filter(key => !isDeepStrictEqual(before[key], after[key]));
  const hasNonScriptChanges = changedTopLevelKeys.some(
    key => key !== 'scripts'
  );
  if (!changedTopLevelKeys.includes('scripts')) {
    return sharedPackageClassification();
  }

  const beforeScripts = before.scripts ?? {};
  const afterScripts = after.scripts ?? {};
  if (!isJsonObject(beforeScripts) || !isJsonObject(afterScripts)) {
    return sharedPackageClassification(
      'shared-js-workspace-unresolved',
      PRODUCT_LANES
    );
  }
  const changedScripts = [
    ...new Set([...Object.keys(beforeScripts), ...Object.keys(afterScripts)]),
  ].filter(
    script => !isDeepStrictEqual(beforeScripts[script], afterScripts[script])
  );
  const hasInvalidChangedScriptValue = changedScripts.some(
    script =>
      (beforeScripts[script] !== undefined &&
        typeof beforeScripts[script] !== 'string') ||
      (afterScripts[script] !== undefined &&
        typeof afterScripts[script] !== 'string')
  );
  if (changedScripts.length === 0 || hasInvalidChangedScriptValue) {
    return sharedPackageClassification(
      hasInvalidChangedScriptValue
        ? 'shared-js-workspace-unresolved'
        : 'shared-js-workspace',
      hasInvalidChangedScriptValue ? PRODUCT_LANES : JS_WORKSPACE_PRODUCTS
    );
  }
  if (
    changedScripts.every(script => OPERATIONS_ONLY_PACKAGE_SCRIPTS.has(script))
  ) {
    if (
      isOperationsOnlyInvariantChange(
        beforeScripts['invariants:check'],
        afterScripts['invariants:check']
      )
    ) {
      return hasNonScriptChanges
        ? sharedPackageClassification()
        : ['operations-package-scripts', 'operations-tooling', []];
    }
    return sharedPackageClassification('shared-js-workspace', PRODUCT_LANES);
  }

  const changesIosCommand = changedScripts.some(script => {
    return (
      scriptChangeAffectsIos(script, beforeScripts) ||
      scriptChangeAffectsIos(script, afterScripts)
    );
  });
  return sharedPackageClassification(
    'shared-js-workspace',
    changesIosCommand ? PRODUCT_LANES : JS_WORKSPACE_PRODUCTS
  );
}

/**
 * @param {string[]} paths
 * @param {{ packageJsonBefore?: string, packageJsonAfter?: string }} [options]
 */
export function classifyProductLanes(
  paths,
  { packageJsonBefore, packageJsonAfter } = {}
) {
  const changedPaths = [
    ...new Set(paths.map(normalizePath).filter(Boolean)),
  ].sort();
  const classifications = [];
  const unmappedPaths = [];

  for (const path of changedPaths) {
    const rule =
      path === 'package.json'
        ? classifyPackageJsonChange(packageJsonBefore, packageJsonAfter)
        : RULES.find(([, , , pattern]) => pattern.test(path));
    if (!rule) {
      unmappedPaths.push(path);
      continue;
    }
    const [id, category, products] = rule;
    classifications.push({
      path,
      category,
      affectedProducts: [...products],
      rule: id,
    });
  }

  if (unmappedPaths.length > 0) {
    throw new ProductLaneClassificationError(unmappedPaths);
  }

  const selectedProducts = PRODUCT_LANES.filter(product =>
    classifications.some(item => item.affectedProducts.includes(product))
  );
  const operationsSelected = classifications.some(
    item =>
      item.category === 'operations-tooling' ||
      item.rule === 'shared-release-admission'
  );
  const sharedClassifications = classifications.filter(
    item => item.category === 'shared-contract'
  );
  const sharedAffectedProducts = PRODUCT_LANES.filter(product =>
    sharedClassifications.some(item => item.affectedProducts.includes(product))
  );
  const crossProductSelected = sharedClassifications.length > 0;
  const selectedLanes = [
    ...selectedProducts,
    ...(operationsSelected ? ['operations'] : []),
    ...(crossProductSelected ? ['cross-product'] : []),
  ];
  const skippedLanes = ALL_LANES.filter(
    lane => !selectedLanes.includes(lane)
  ).map(lane => ({
    lane,
    reason: 'no changed path can materially affect this lane',
  }));

  return {
    authority: 'Summer',
    changedPaths,
    classifications,
    selectedLanes,
    skippedLanes,
    sharedContract: {
      changed: crossProductSelected,
      affectedProducts: sharedAffectedProducts,
      paths: sharedClassifications.map(item => item.path),
    },
    requiredGates: Object.fromEntries(
      selectedLanes.map(lane => [lane, GATE_RECEIPTS[lane]])
    ),
  };
}

function readPackageJsonAtRef(ref, cwd) {
  return execFileSync('git', ['show', `${ref}:package.json`], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function evaluateProductLaneResults(receipt, results) {
  const selected = new Set(receipt.selectedLanes);
  const admissions = Object.fromEntries(
    ALL_LANES.map(lane => {
      const laneResults = results[lane] ?? [];
      if (!selected.has(lane)) {
        if (laneResults.some(result => result !== 'skipped')) {
          throw new Error(
            `Unselected ${lane} lane produced a non-skipped result`
          );
        }
        return [lane, { selected: false, passed: false, results: laneResults }];
      }
      if (laneResults.length === 0) {
        throw new Error(`Selected ${lane} lane has no result evidence`);
      }
      return [
        lane,
        {
          selected: true,
          passed: laneResults.every(result => result === 'success'),
          results: laneResults,
        },
      ];
    })
  );
  const selectedAdmissions = Object.values(admissions).filter(
    admission => admission.selected
  );
  const sharedGatePassed =
    !admissions['cross-product'].selected || admissions['cross-product'].passed;
  return {
    admissions,
    aggregatePassed: selectedAdmissions.every(admission => admission.passed),
    independentlyShippableProducts: PRODUCT_LANES.filter(
      lane =>
        admissions[lane].selected && admissions[lane].passed && sharedGatePassed
    ),
  };
}

export function formatGitHubSummary(receipt) {
  return [
    '### Product lane classification',
    '',
    `- Operational authority: **${receipt.authority}**`,
    `- Selected lanes: ${receipt.selectedLanes.join(', ') || 'none'}`,
    `- Shared-contract impact: ${receipt.sharedContract.changed ? receipt.sharedContract.affectedProducts.join(', ') : 'none'}`,
    '',
    '| Changed path | Classification | Affected products |',
    '| --- | --- | --- |',
    ...receipt.classifications.map(
      item =>
        `| \`${item.path}\` | ${item.category} | ${item.affectedProducts.join(', ') || 'none'} |`
    ),
    '',
    'Skipped lanes:',
    ...receipt.skippedLanes.map(item => `- ${item.lane}: ${item.reason}`),
    '',
    'Exact selected gates and required evidence:',
    ...Object.entries(receipt.requiredGates).map(
      ([lane, gate]) =>
        `- ${lane}: \`${gate.tests}\`; artifact/deployment: ${gate.artifact}; release workflow: ${gate.releaseWorkflow ?? 'not applicable'}`
    ),
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? '<end>'}`);
    }
    args[key.slice(2)] = value;
  }
  return args;
}

export function runProductLaneClassifier(
  argv = process.argv.slice(2),
  { cwd = process.cwd() } = {}
) {
  const args = parseArgs(argv);
  const files = readFileSync(args['files-from'], 'utf8').split(/\r?\n/);
  let packageJsonBefore;
  let packageJsonAfter;
  if (files.map(normalizePath).includes('package.json')) {
    try {
      packageJsonBefore = readPackageJsonAtRef(args['base-ref'], cwd);
      packageJsonAfter = readPackageJsonAtRef(args['head-ref'], cwd);
    } catch (error) {
      console.warn(
        `::warning::Could not inspect package.json change; selecting every product lane: ${error.message}`
      );
    }
  }
  const receipt = classifyProductLanes(files, {
    packageJsonBefore,
    packageJsonAfter,
  });
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  if (args['json-out']) writeFileSync(args['json-out'], json);
  if (args['summary-out'])
    writeFileSync(args['summary-out'], formatGitHubSummary(receipt));
  if (args['github-output']) {
    const selected = new Set(receipt.selectedLanes);
    const outputs = [
      `run_web=${selected.has('web')}`,
      `run_macos=${selected.has('mac')}`,
      `run_ios=${selected.has('ios')}`,
      `run_operations=${selected.has('operations')}`,
      `run_cross_product=${selected.has('cross-product')}`,
      `selected_lanes=${receipt.selectedLanes.join(',')}`,
      `shared_contract_impact=${receipt.sharedContract.affectedProducts.join(',') || 'none'}`,
    ];
    writeFileSync(args['github-output'], `${outputs.join('\n')}\n`, {
      flag: 'a',
    });
  }
  if (!args['json-out']) process.stdout.write(json);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runProductLaneClassifier();
  } catch (error) {
    console.error(
      `::error::Product lane classification failed: ${error.message}`
    );
    process.exitCode = 1;
  }
}
