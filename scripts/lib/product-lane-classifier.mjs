import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PRODUCT_LANES = ['ios', 'mac', 'web'];

const GATE_RECEIPTS = {
  ios: {
    tests: 'pnpm run ios:lint && pnpm run ios:test',
    artifact: 'ios-screenshots',
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
      'Web unit shards, Web build/layout, extension typecheck/test/build, and observability worker typecheck/test',
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
    'shared-js-workspace',
    'shared-contract',
    PRODUCT_LANES,
    /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|tsconfig\.json|vitest\.config\.mts|biome\.json|\.node-version|\.npmrc|\.nvmrc|patches\/)/,
  ],
  [
    'shared-release-admission',
    'shared-contract',
    PRODUCT_LANES,
    /^(\.github\/(workflows\/(ci|production-controller)\.yml|ci-harness\/)|scripts\/ci-fast-lanes\.mjs|scripts\/lib\/(ci-harness|merge-queue-guard|product-lane-(classifier|finalize))\.mjs|scripts\/lib\/__tests__\/(ci-harness|merge-group-workflow-contract|product-lane-classifier)\.test\.mjs)$/,
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
    /^(apps\/(web|extension)\/|packages\/(action-contracts|audio-contracts|extension-contracts|ui)\/|workers\/observability-ingest\/|app\/|content\/|lib\/|trigger\/|creator_profiles\/|vercel\.json$|\.vercelignore$|\.github\/workflows\/(production-release|production-marker-recovery|postdeploy-probes|canary-health-gate)\.yml$)/,
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

const normalizePath = path =>
  String(path ?? '')
    .trim()
    .replace(/^\.\//, '');

export class ProductLaneClassificationError extends Error {
  constructor(paths) {
    super(
      `Unmapped changed paths: ${paths.join(', ')}. Add an explicit product-lane rule before intake can continue.`
    );
  }
}

export function classifyProductLanes(paths) {
  const changedPaths = [
    ...new Set(paths.map(normalizePath).filter(Boolean)),
  ].sort();
  const classifications = [];
  const unmappedPaths = [];

  for (const path of changedPaths) {
    const rule = RULES.find(([, , , pattern]) => pattern.test(path));
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
  const skippedLanes = [...PRODUCT_LANES, 'operations', 'cross-product']
    .filter(lane => !selectedLanes.includes(lane))
    .map(lane => ({
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

export function evaluateProductLaneResults(receipt, results) {
  const selected = new Set(receipt.selectedLanes);
  const admissions = Object.fromEntries(
    [...PRODUCT_LANES, 'operations', 'cross-product'].map(lane => {
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

export function runProductLaneClassifier(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const files = readFileSync(args['files-from'], 'utf8').split(/\r?\n/);
  const receipt = classifyProductLanes(files);
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  if (args['json-out']) writeFileSync(args['json-out'], json);
  if (args['summary-out'])
    writeFileSync(args['summary-out'], formatGitHubSummary(receipt));
  if (args['github-output']) {
    const selected = new Set(receipt.selectedLanes);
    const outputs = [
      `run_web=${selected.has('web')}`,
      `run_mac=${selected.has('mac')}`,
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
