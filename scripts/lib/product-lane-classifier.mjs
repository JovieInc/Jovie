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
      'pnpm --filter @jovie/auth-routing test && pnpm --filter @jovie/action-contracts test && pnpm --filter @jovie/audio-contracts test && pnpm --filter @jovie/release-channel-contracts test',
    artifact: 'cross-product shared-contract gate receipt',
  },
};

const BLOG_CONTENT_GATE_RECEIPT = {
  tests:
    'JOV-7396 publication contract, JOV-7397 agent certification, and exact candidate Next.js build',
  artifact: 'blog-content-qualification-<merge-group-head-sha>-<run-attempt>',
  releaseWorkflow: '.github/workflows/production-release.yml',
};
const BLOG_CONTENT_PATH =
  /^(apps\/web\/content\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*\.md|apps\/web\/public\/images\/blog\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\.(?:avif|jpe?g|png|webp))$/;

const RULES = /** @type {Array<[string, string, string[], RegExp]>} */ ([
  [
    'shared-jev-evaluation',
    'shared-contract',
    ['web'],
    /^packages\/jev-evaluation\//,
  ],
  [
    // @jovie/copy: canonical copy rules consumed by apps/web (canon/VOICE.md).
    'shared-copy',
    'shared-contract',
    ['web'],
    /^packages\/copy\//,
  ],
  [
    'shared-agent-transport',
    'shared-contract',
    ['web'],
    /^packages\/agent-transport-contracts\//,
  ],
  [
    // Classify before extraction (same pattern as #17271). The daily-post
    // contract currently lives under apps/web/lib/release-communications; this
    // rule lets a later workspace-package extraction pass Path Changes.
    'shared-release-communications',
    'shared-contract',
    ['web'],
    /^packages\/release-communications\//,
  ],
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
    'shared-release-channel',
    'shared-contract',
    PRODUCT_LANES,
    /^packages\/release-channel-contracts\//,
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
    // JS workspace config reaches the pnpm install, TypeScript, Biome, Turbo
    // and Vitest graph. The iOS lane installs none of it: ios-ci.yml runs
    // xcodebuild plus `node --test` on apps/ios/scripts with the runner's
    // system Node. Root package.json is classified per changed script in
    // classifyPackageJsonChange, which still selects iOS for iOS scripts.
    'shared-js-workspace',
    'shared-contract',
    ['mac', 'web'],
    /^(package\.json|pnpm-workspace\.yaml|turbo\.json|tsconfig\.json|vitest\.config\.mts|biome\.json|\.node-version|\.npmrc|\.nvmrc|patches\/)/,
  ],
  [
    'shared-release-admission',
    'operations-tooling',
    [],
    /^(config\/node-runtime-policy\.json|\.github\/(workflows\/(ci|production-controller)\.yml|ci-harness\/)|scripts\/ci-fast-lanes\.mjs|scripts\/lib\/(blog-content-ci|ci-harness|merge-queue-guard|product-lane-(classifier|finalize)|production-lane-range)\.mjs|scripts\/lib\/__tests__\/(blog-content-ci|ci-harness|merge-group-workflow-contract|product-lane-classifier|production-lane-range)\.test\.mjs)$/,
  ],
  [
    'operations-release-contract-test',
    'operations-tooling',
    [],
    /^apps\/web\/tests\/unit\/ci\/deploy-workflow\.test\.ts$/,
  ],
  [
    // The Mac lane's own workflows and routing (macos-ci.yml, mac-lane*.yml,
    // .github/actions/setup-node-pnpm) run the Mac and iOS builds, so editing
    // them must run those builds, not just the operations contract tests.
    'mac-lane-routing',
    'operations-tooling',
    ['ios', 'mac'],
    /^(\.github\/workflows\/mac-lane(-route)?\.yml|\.github\/scripts\/mac-lane\.sh)$/,
  ],
  [
    'mac-ci-tooling',
    'operations-tooling',
    ['mac'],
    /^(\.github\/workflows\/macos-ci\.yml|\.github\/actions\/setup-node-pnpm\/|scripts\/generate-brand-assets\.ts)/,
  ],
  [
    // Files outside apps/desktop that `@jovie/desktop` test and
    // package:staging read: prepare-icons runs apps/web's brand generator
    // (which reads the iOS AppIcon set), system-b-tokens.test reads the web
    // CSS, url-disposition.test reads the route manifest, and the dogfood
    // inventory must resolve its web sources. A guard test derives the
    // inventory list from desktop-dogfood-inventory.mjs.
    'mac-consumed-ios-input',
    'ios',
    ['ios', 'mac'],
    /^apps\/ios\/Jovie\/Resources\/Assets\.xcassets\/AppIcon\.appiconset\/Contents\.json$/,
  ],
  [
    'mac-consumed-web-input',
    'web',
    ['mac', 'web'],
    /^(?:packages\/ui\/brand\/(geometry\.gen|jovie-o-geometry)\.ts$|apps\/web\/(scripts\/generate-brand-assets\.ts|lib\/brand\/tokens\.ts|lib\/design\/generated\/design-tokens\.ts|styles\/(design-system|system-b-app)\.css|data\/marketing\/routeManifest\.ts|constants\/routes\.ts|app\/desktop-auth\/DesktopAuthClient\.tsx|components\/organisms\/(DesktopTitlebar|CmdKPalette|CommandPalette|user-button\/UserButton)\.tsx|components\/features\/(workspace-lock\/WorkspaceLockScreen\.tsx|dashboard\/dashboard-nav\/config\.ts))$)/,
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
  ['web-changelog', 'web', ['web'], /^CHANGELOG\.md$/],
  [
    'web-product',
    'web',
    ['web'],
    // knowledge-ingest now lives in observability-ingest. First-parent ranges
    // still name the old prefix on the add and delete commits.
    /^(apps\/(web|ovie|extension)\/|packages\/(action-contracts|audio-contracts|brand|extension-contracts|jovie-cli|ui)\/|workers\/(observability-ingest|canary-otp|knowledge-ingest)\/|app\/|content\/|lib\/|trigger\/|creator_profiles\/|vercel\.json$|\.vercelignore$|skills\/jovie\/(SKILL\.md|README\.md|LICENSE)$|\.github\/workflows\/(production-release|production-marker-recovery|postdeploy-probes|canary-health-gate)\.yml$)/,
  ],
  [
    'operations-tooling',
    'operations-tooling',
    [],
    /^(\.github\/|scripts\/|apps\/(console|docs|eve-pilot|should-i-make)\/|workers\/x402-artist-resource-proxy\/wrangler\.example\.jsonc$|\.agents\/|\.claude\/|\.codex\/|\.conductor\/|\.context\/|\.cursor\/|\.design-sync(?:-marketing)?\/|\.grok\/|\.hermes\/|\.husky\/|\.lavish\/|\.neon(?:\/|$)|\.no-mistakes\/|\.orchestrator\/|\.sonarlint\/|\.vscode\/|\.windsurf\/|\.zap\/|agentos\/|architecture\/|audits\/|canon\/|creator_profiles(?:\/|$)|docs\/|github\/|ideation\/|infra\/|ops\/|prompts\/|tests\/|tools\/)/,
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
  /^python3 scripts\/fleet-gate\/tests\/[a-z0-9-]+\.test\.py$/;
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

// pnpm install on the Mac runner executes these hooks. Publish hooks do not.
const PNPM_INSTALL_LIFECYCLE = new Set([
  'preinstall',
  'install',
  'postinstall',
  'preprepare',
  'prepare',
  'postprepare',
]);
// The Mac lane's own run block (macos-ci.yml) invokes only
// `pnpm --filter @jovie/desktop`. A root script change can still reach that
// lane when install runs it, when the desktop manifest calls it with
// `pnpm -w`, or when its command (or a script it calls) names Mac product
// surfaces. Anything else that is not a static node/pnpm test chain keeps Mac.
const MAC_COMMAND_SURFACE =
  /apps\/(?:desktop|macos)(?:\/|["'\s]|$)|@jovie\/desktop\b|\belectron-builder\b|\belectron\b|MenuMonitor|\bswift\b|\bxcodebuild\b/;

function lifecycleReaches(scripts, scriptName) {
  if (!isJsonObject(scripts)) return true;
  for (const hook of PNPM_INSTALL_LIFECYCLE) {
    if (scriptDependsOn(hook, scriptName, scripts)) return true;
  }
  return false;
}

function desktopRootScriptNames(source) {
  const names = [];
  const patterns = [
    /(?:^|[\s\n;&|"'])(?:pnpm|npm|yarn)\s+(?:-w|--workspace-root)\s+(?:(?:run|run-script)\s+)?([A-Za-z0-9:_./-]+)/g,
    /(?:^|[\s\n;&|"'])(?:pnpm|npm|yarn)\s+(?:run|run-script)\s+(?:-w|--workspace-root)\s+([A-Za-z0-9:_./-]+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) names.push(match[1]);
  }
  const flags =
    source.match(/--workspace-root|(?:^|[\s\n;&|"'])-w(?=$|[\s\n;&|"'])/g) ??
    [];
  if (flags.length !== names.length) return null;
  return names;
}

function desktopInvokesRootScript(source, scriptName, scripts) {
  if (typeof source !== 'string' || !isJsonObject(scripts)) return true;
  if (/(?:^|[\s\n;&|"'])cd\s+\.\./.test(source)) return true;
  const names = desktopRootScriptNames(source);
  if (names === null) return true;
  return names.some(name => scriptDependsOn(name, scriptName, scripts));
}

function scriptCommandMacIrrelevant(script, scripts, visited) {
  if (visited.has(script)) return true;
  const command = scripts[script];
  if (typeof command !== 'string') return false;
  const next = new Set(visited);
  next.add(script);
  return commandChainMacIrrelevant(command, scripts, next);
}

const NODE_TEST_FLAGS = new Set([
  '--test',
  '--experimental-test-coverage',
  '--test-coverage-include',
  '--test-coverage-exclude',
  '--test-coverage-lines',
  '--test-coverage-branches',
  '--test-coverage-functions',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-name-pattern',
  '--test-skip-pattern',
  '--test-force-exit',
  '--import',
]);

function nodeSegmentMacIrrelevant(segment) {
  if (MAC_COMMAND_SURFACE.test(segment)) return false;
  const tokens = segment.split(/\s+/);
  if (tokens[0] !== 'node') return false;
  let sawFile = false;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith('--')) {
      const flag = token.split('=')[0];
      if (!NODE_TEST_FLAGS.has(flag)) return false;
      if (token === '--import') {
        const modulePath = tokens[index + 1];
        if (!modulePath || modulePath.startsWith('-')) return false;
        index += 1;
      }
      continue;
    }
    if (token.startsWith('-')) return false;
    sawFile = true;
  }
  return sawFile;
}

function segmentMacIrrelevant(segment, scripts, visited) {
  if (segment === 'true') return true;
  if (MAC_COMMAND_SURFACE.test(segment)) return false;
  if (segment.startsWith('node ')) {
    return nodeSegmentMacIrrelevant(segment);
  }
  if (/^(?:pnpm|npm|yarn)\s+/.test(segment)) {
    if (/--filter\b|(?:^|\s)-w(?:\s|$)|--workspace-root\b/.test(segment)) {
      return false;
    }
    const invocations = packageScriptInvocations(segment, scripts);
    if (invocations.length !== 1) return false;
    const name = invocations[0];
    const bare = segment.replace(/\s+/g, ' ').trim();
    const allowed = new Set([
      `pnpm run ${name}`,
      `pnpm run-script ${name}`,
      `pnpm ${name}`,
      `npm run ${name}`,
      `npm run-script ${name}`,
      `yarn run ${name}`,
      `yarn ${name}`,
    ]);
    if (!allowed.has(bare)) return false;
    return scriptCommandMacIrrelevant(name, scripts, visited);
  }
  return false;
}

function commandChainMacIrrelevant(command, scripts, visited) {
  if (typeof command !== 'string' || command.length === 0) return false;
  if (MAC_COMMAND_SURFACE.test(command)) return false;
  const withoutConjunction = command.replaceAll('&&', '');
  if (/[&;|`<>\r\n]/.test(withoutConjunction)) return false;
  if (withoutConjunction.includes('$(') || withoutConjunction.includes('${')) {
    return false;
  }
  if (/[*?[\]]/.test(withoutConjunction)) return false;
  const segments = command
    .split('&&')
    .map(segment => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every(segment =>
    segmentMacIrrelevant(segment, scripts, visited)
  );
}

/**
 * True only when every changed root script is proven not to run on the Mac
 * lane. Missing desktop manifests fail closed (keep Mac). JOV-6113.
 */
function changedRootScriptsSpareMacLane(
  beforeScripts,
  afterScripts,
  changedScripts,
  desktopBefore,
  desktopAfter
) {
  if (typeof desktopBefore !== 'string' || typeof desktopAfter !== 'string') {
    return false;
  }
  for (const script of changedScripts) {
    if (
      lifecycleReaches(beforeScripts, script) ||
      lifecycleReaches(afterScripts, script) ||
      desktopInvokesRootScript(desktopBefore, script, beforeScripts) ||
      desktopInvokesRootScript(desktopAfter, script, afterScripts)
    ) {
      return false;
    }
    const beforeOk =
      beforeScripts[script] === undefined ||
      scriptCommandMacIrrelevant(script, beforeScripts, new Set());
    const afterOk =
      afterScripts[script] === undefined ||
      scriptCommandMacIrrelevant(script, afterScripts, new Set());
    if (!beforeOk || !afterOk) return false;
  }
  return true;
}

/**
 * @param {string} beforeSource
 * @param {string} afterSource
 * @param {{ desktopPackageJsonBefore?: string, desktopPackageJsonAfter?: string }} [desktopManifests]
 */
export function classifyPackageJsonChange(
  beforeSource,
  afterSource,
  { desktopPackageJsonBefore, desktopPackageJsonAfter } = {}
) {
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
  // JOV-6113: a root script the Mac lane cannot run must not queue macos-15.
  // Web stays selected. A dependency or other non-script edit still installs
  // on that runner, so mixed edits keep Mac. Missing desktop evidence or an
  // ambiguous command keeps Mac too.
  if (
    !hasNonScriptChanges &&
    !changesIosCommand &&
    changedRootScriptsSpareMacLane(
      beforeScripts,
      afterScripts,
      changedScripts,
      desktopPackageJsonBefore,
      desktopPackageJsonAfter
    )
  ) {
    return sharedPackageClassification('shared-js-workspace-web-only', ['web']);
  }
  return sharedPackageClassification(
    'shared-js-workspace',
    changesIosCommand ? PRODUCT_LANES : JS_WORKSPACE_PRODUCTS
  );
}

// The desktop lane is the only product the lockfile can reach that needs a
// hosted macOS runner, and that runner's pickup is the slowest step in a
// merge group (8-68 min on 2026-10-10 against a 7 min build). Walk the
// pnpm-lock v9 graph the desktop and macOS importers can reach; a lockfile
// change that leaves that subgraph byte-identical cannot change what the
// Mac lane builds, so it stays a web-only shared change. Anything the walk
// cannot resolve fails closed onto the full lockfile rule.
const LOCKFILE_RULE = RULES.find(([id]) => id === 'shared-js-lockfile');
const MAC_IMPORTERS = ['apps/desktop', 'apps/macos'];
const LOCK_DEPENDENCY_SECTIONS = new Set([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
]);

function unquoteLockKey(value) {
  return value.replace(/^'(.*)'$/, '$1');
}

/** Top-level `name:` sections → their body lines; entries at indent 2 → body text. */
function parseLockSections(source) {
  const sections = new Map();
  let current = null;
  for (const line of source.split(/\r?\n/)) {
    const top = /^([A-Za-z]+):\s*$/.exec(line);
    if (top) {
      current = [];
      sections.set(top[1], current);
      continue;
    }
    if (current && line.length > 0) current.push(line);
  }
  return sections;
}

function parseLockEntries(lines) {
  const entries = new Map();
  let key = null;
  let body = [];
  const flush = () => {
    if (key !== null) entries.set(key, body.join('\n'));
  };
  for (const line of lines) {
    const entry = /^ {2}(\S.*?):(?:\s*\{\})?\s*$/.exec(line);
    if (entry && !line.startsWith('   ')) {
      flush();
      key = unquoteLockKey(entry[1]);
      body = [];
    } else if (key !== null) {
      body.push(line);
    }
  }
  flush();
  return entries;
}

/** Importer body → [name, version] pairs across the dependency sections. */
function importerDependencies(body) {
  const pairs = [];
  let section = null;
  let name = null;
  for (const line of body.split('\n')) {
    const header = /^ {4}([A-Za-z]+):\s*$/.exec(line);
    if (header) {
      section = LOCK_DEPENDENCY_SECTIONS.has(header[1]) ? header[1] : null;
      continue;
    }
    const dependency = /^ {6}(\S.*?):\s*$/.exec(line);
    if (dependency) {
      name = section ? unquoteLockKey(dependency[1]) : null;
      continue;
    }
    const version = /^ {8}version:\s*(.+?)\s*$/.exec(line);
    if (version && name) pairs.push([name, unquoteLockKey(version[1])]);
  }
  return pairs;
}

/** Snapshot body → `name@version` keys it depends on. */
function snapshotDependencies(body) {
  const keys = [];
  let inSection = false;
  for (const line of body.split('\n')) {
    const header = /^ {4}([A-Za-z]+):\s*$/.exec(line);
    if (header) {
      inSection = LOCK_DEPENDENCY_SECTIONS.has(header[1]);
      continue;
    }
    const item = /^ {6}(\S.*?):\s*(\S.*?)\s*$/.exec(line);
    if (item && inSection)
      keys.push(snapshotKey(unquoteLockKey(item[1]), unquoteLockKey(item[2])));
  }
  return keys;
}

/** `alias: real-name@1.2.3` resolves to the aliased package's own snapshot. */
function snapshotKey(name, version) {
  return /^[0-9]/.test(version) ? `${name}@${version}` : version;
}

function resolveLinkImporter(importer, target) {
  const segments = importer === '.' ? [] : importer.split('/');
  for (const part of target.split('/')) {
    if (part === '..') segments.pop();
    else if (part !== '.' && part !== '') segments.push(part);
  }
  return segments.length === 0 ? '.' : segments.join('/');
}

/** Canonical text of everything the Mac importers can reach, or null when unresolved. */
export function macLockfileGraph(source) {
  const sections = parseLockSections(source);
  if (!sections.has('importers') || !sections.has('snapshots')) return null;
  const importers = parseLockEntries(sections.get('importers'));
  const snapshots = parseLockEntries(sections.get('snapshots'));
  const packages = parseLockEntries(sections.get('packages') ?? []);
  const reached = new Map();
  const seenImporters = new Set();
  const pendingImporters = MAC_IMPORTERS.filter(name => importers.has(name));
  const pendingKeys = [];
  while (pendingImporters.length > 0) {
    const importer = pendingImporters.shift();
    if (seenImporters.has(importer)) continue;
    seenImporters.add(importer);
    const body = importers.get(importer);
    if (body === undefined) return null;
    reached.set(`importer ${importer}`, body);
    for (const [name, version] of importerDependencies(body)) {
      if (version.startsWith('link:'))
        pendingImporters.push(
          resolveLinkImporter(importer, version.slice('link:'.length))
        );
      else pendingKeys.push(snapshotKey(name, version));
    }
  }
  while (pendingKeys.length > 0) {
    const key = pendingKeys.shift();
    const snapshotKey = `snapshot ${key}`;
    if (reached.has(snapshotKey)) continue;
    const body = snapshots.get(key);
    if (body === undefined) return null;
    reached.set(snapshotKey, body);
    const packageKey = key.includes('(') ? key.slice(0, key.indexOf('(')) : key;
    reached.set(`package ${packageKey}`, packages.get(packageKey) ?? '');
    pendingKeys.push(...snapshotDependencies(body));
  }
  return [...reached.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, body]) => `${key}\n${body}`)
    .join('\n');
}

export function classifyLockfileChange(beforeSource, afterSource) {
  const [id, category, products] = LOCKFILE_RULE;
  const full = [id, category, [...products]];
  if (typeof beforeSource !== 'string' || typeof afterSource !== 'string')
    return full;
  const before = macLockfileGraph(beforeSource);
  const after = macLockfileGraph(afterSource);
  if (before === null || after === null || before !== after) return full;
  return ['shared-js-lockfile-web-only', 'shared-contract', ['web']];
}

/**
 * @param {string[]} paths
 * @param {{ packageJsonBefore?: string, packageJsonAfter?: string, desktopPackageJsonBefore?: string, desktopPackageJsonAfter?: string, lockfileBefore?: string, lockfileAfter?: string, qualificationProfile?: 'full' | 'content-only' }} [options]
 */
export function classifyProductLanes(
  paths,
  {
    packageJsonBefore,
    packageJsonAfter,
    desktopPackageJsonBefore,
    desktopPackageJsonAfter,
    lockfileBefore,
    lockfileAfter,
    qualificationProfile = 'full',
  } = {}
) {
  const changedPaths = [
    ...new Set(paths.map(normalizePath).filter(Boolean)),
  ].sort();
  const classifications = [];
  const unmappedPaths = [];

  for (const path of changedPaths) {
    const rule =
      path === 'package.json'
        ? classifyPackageJsonChange(packageJsonBefore, packageJsonAfter, {
            desktopPackageJsonBefore,
            desktopPackageJsonAfter,
          })
        : path === 'pnpm-lock.yaml'
          ? classifyLockfileChange(lockfileBefore, lockfileAfter)
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

  if (!['full', 'content-only'].includes(qualificationProfile)) {
    throw new Error(`Unknown qualification profile: ${qualificationProfile}`);
  }
  if (
    qualificationProfile === 'content-only' &&
    (selectedLanes.length !== 1 ||
      selectedLanes[0] !== 'web' ||
      changedPaths.some(path => !BLOG_CONTENT_PATH.test(path)))
  ) {
    throw new Error(
      'Content-only qualification is valid only for approved blog content paths in the web lane'
    );
  }

  return {
    authority: 'Summer',
    qualificationProfile,
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
      selectedLanes.map(lane => [
        lane,
        qualificationProfile === 'content-only' && lane === 'web'
          ? BLOG_CONTENT_GATE_RECEIPT
          : GATE_RECEIPTS[lane],
      ])
    ),
  };
}

function readFileAtRef(ref, path, cwd) {
  return execFileSync('git', ['show', `${ref}:${path}`], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readPackageJsonAtRef(ref, cwd) {
  return readFileAtRef(ref, 'package.json', cwd);
}

function gitSucceeds(args, cwd) {
  try {
    execFileSync('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function readOptionalFileAtRef(ref, path, cwd) {
  if (
    !gitSucceeds(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd)
  ) {
    return { ok: false, message: `could not resolve ${ref}` };
  }
  let type;
  try {
    type = execFileSync('git', ['cat-file', '-t', `${ref}:${path}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return { ok: true, text: '' };
  }
  if (type !== 'blob') {
    return {
      ok: false,
      message: `${ref}:${path} is a ${type}, not a blob`,
    };
  }
  try {
    return { ok: true, text: readFileAtRef(ref, path, cwd) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
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
  let desktopPackageJsonBefore;
  let desktopPackageJsonAfter;
  if (files.map(normalizePath).includes('package.json')) {
    try {
      packageJsonBefore = readPackageJsonAtRef(args['base-ref'], cwd);
      packageJsonAfter = readPackageJsonAtRef(args['head-ref'], cwd);
    } catch (error) {
      console.warn(
        `::warning::Could not inspect package.json change; selecting every product lane: ${error.message}`
      );
    }
    const beforeDesktop = readOptionalFileAtRef(
      args['base-ref'],
      'apps/desktop/package.json',
      cwd
    );
    const afterDesktop = readOptionalFileAtRef(
      args['head-ref'],
      'apps/desktop/package.json',
      cwd
    );
    if (beforeDesktop.ok && afterDesktop.ok) {
      desktopPackageJsonBefore = beforeDesktop.text;
      desktopPackageJsonAfter = afterDesktop.text;
    } else {
      console.warn(
        `::warning::Could not inspect apps/desktop/package.json; keeping the Mac lane for root script changes: ${beforeDesktop.message || afterDesktop.message}`
      );
    }
  }
  let lockfileBefore;
  let lockfileAfter;
  if (files.map(normalizePath).includes('pnpm-lock.yaml')) {
    try {
      lockfileBefore = readFileAtRef(args['base-ref'], 'pnpm-lock.yaml', cwd);
      lockfileAfter = readFileAtRef(args['head-ref'], 'pnpm-lock.yaml', cwd);
    } catch (error) {
      console.warn(
        `::warning::Could not inspect pnpm-lock.yaml change; selecting the Mac lane: ${error.message}`
      );
    }
  }
  const receipt = classifyProductLanes(files, {
    packageJsonBefore,
    packageJsonAfter,
    desktopPackageJsonBefore,
    desktopPackageJsonAfter,
    lockfileBefore,
    lockfileAfter,
    qualificationProfile: args['qualification-profile'] ?? 'full',
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
