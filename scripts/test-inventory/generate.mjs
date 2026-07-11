#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUDGETS,
  CLASSIFICATIONS,
  KNOWN_FINDINGS,
  NULL_METRIC_REASON,
  SCHEMA_VERSION,
  validateInventory,
} from './schema.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_JSON = join(ROOT, 'docs/testing/test-inventory.json');
const OUTPUT_TAXONOMY = join(ROOT, 'docs/testing/test-taxonomy.md');
const OUTPUT_BASELINE = join(ROOT, 'docs/testing/test-performance-baseline.md');

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort();
}

export function isExecutableTestFile(path) {
  return (
    /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.(?:[cm]?[jt]sx?)$/.test(path) ||
    /(?:^|\/)(?:Tests|UITests)\/.*\.swift$/.test(path) ||
    /(?:Tests|UITests)\.swift$/.test(path)
  );
}

function packageName(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('@/')) return specifier;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function uniqueMatches(content, regex, mapper = value => value) {
  return [...content.matchAll(regex)]
    .map(match => mapper(match[1]))
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 12);
}

function classify(path, content) {
  const evidence = [];
  const hit = (pattern, label) => {
    if (!pattern.test(content)) return false;
    evidence.push(label);
    return true;
  };

  if (
    /\/(?:UITests)\//.test(path) ||
    /XCUITest|XCUIApplication/.test(content)
  ) {
    return [
      'iOS integration/UI',
      ['XCUITest or iOS UI-test target boundary'],
      'high',
    ];
  }
  if (/\.swift$/.test(path)) {
    const integration = hit(
      /URLSession|SwiftData|CoreData|StoreKit|AVFoundation/,
      'Apple framework/service boundary'
    );
    return [
      integration ? 'iOS integration/UI' : 'iOS unit',
      evidence.length ? evidence : ['XCTest without UI/service boundary'],
      integration ? 'medium' : 'high',
    ];
  }
  if (
    path.startsWith('apps/desktop/') ||
    hit(/electron|@playwright\/test.*electron/i, 'Electron runtime boundary')
  ) {
    return [
      'desktop',
      evidence.length ? evidence : ['Desktop package test target'],
      'high',
    ];
  }
  if (
    path.startsWith('scripts/test-inventory/') &&
    /buildInventory|validateInventory|generate\(\{ check/.test(content)
  ) {
    return [
      'contract/structural',
      ['inventory generator/schema contract validation'],
      'high',
    ];
  }
  const browser = hit(
    /@playwright\/test|\bplaywright\s+test\b|\bpage\.(?:goto|click|locator)|expect\(page\)/,
    'real browser/page API'
  );
  if (browser) {
    if (
      /@a11y|axe|visual|screenshot|toHaveScreenshot|lighthouse/i.test(
        `${path}\n${content}`
      )
    ) {
      return [
        'full/visual/a11y E2E',
        [...evidence, 'visual, accessibility, or Lighthouse assertion'],
        'high',
      ];
    }
    if (/@smoke|smoke/i.test(`${path}\n${content}`))
      return ['E2E smoke', [...evidence, 'smoke-tagged journey'], 'medium'];
    if (
      /golden|critical journey|onboarding.*(?:claim|publish)/i.test(
        `${path}\n${content}`
      )
    ) {
      return [
        'E2E golden path',
        [...evidence, 'business-critical multi-step journey'],
        'medium',
      ];
    }
    return [
      'full/visual/a11y E2E',
      [...evidence, 'unscoped full browser journey'],
      'medium',
    ];
  }
  const evalLike =
    /(?:^|\/)(?:evals?|promptfoo)(?:\/|\.|-)/i.test(path) ||
    /promptfoo|\b(?:LLM|large language model)\b|(?:openai|anthropic)\.(?:chat|messages|responses)/i.test(
      content
    );
  if (evalLike) {
    const live = hit(
      /OPENAI_API_KEY|ANTHROPIC_API_KEY|live provider|evals:live|https?:\/\//i,
      'live model/provider access'
    );
    return [
      live ? 'live eval' : 'deterministic eval',
      evidence.length ? evidence : ['deterministic model fixture/assertion'],
      live ? 'medium' : 'medium',
    ];
  }
  const db = hit(
    /(?:from|import\()\s*['"][^'"]*(?:\/db|drizzle|postgres|database)|DATABASE_URL|testcontainers|\.transaction\(/i,
    'database driver, database URL, or transaction boundary'
  );
  const mocksDatabase =
    /(?:vi|jest)\.mock\([\s\S]{0,200}(?:\/db|drizzle|postgres|database)/i.test(
      content
    );
  if (db && !mocksDatabase)
    return ['database/API integration', evidence, 'high'];
  const component = hit(
    /@testing-library\/(?:react|user-event)|render\s*\(|jsdom|react-dom/i,
    'DOM/component renderer boundary'
  );
  if (component) return ['component unit', evidence, 'high'];
  const external = hit(
    /(?:new\s+Stripe|stripe\.(?:customers|checkout|webhooks)|spotifyApi\.|clerkClient\(|resend\.(?:emails|contacts)|external sandbox)/i,
    'external provider dependency'
  );
  const mocksExternal =
    /(?:vi|jest)\.mock\([^)]*(?:stripe|spotify|clerk|resend|sentry|neon)/i.test(
      content
    );
  if (external && !mocksExternal)
    return ['external sandbox integration', evidence, 'medium'];
  const service = hit(
    /(?:fetch|Request|Response)\s*\(|\.GET\(|\.POST\(|route handler|server action/i,
    'service, HTTP, or route-handler boundary'
  );
  if (service) return ['service integration', evidence, 'medium'];
  const structural = hit(
    /readFileSync|globSync|git ls-files|schema|contract|guard|lint|snapshot/i,
    'filesystem, schema, contract, or static structure assertion'
  );
  if (structural) return ['contract/structural', evidence, 'medium'];
  return [
    'pure unit',
    [
      'No DOM, process, service, database, browser, provider, or platform boundary detected',
    ],
    'medium',
  ];
}

function staticTestCount(path, content) {
  const regex =
    /\b(?:it|test)(?:\.(?:each|skip|only|todo|fails))?\s*\(|\bfunc\s+test[A-Z_a-z0-9]*\s*\(/g;
  return {
    value: [...content.matchAll(regex)].length,
    provenance: `Static syntax scan of ${path}; parameterized cases count as one declaration.`,
  };
}

function metrics() {
  return {
    p50Ms: null,
    p95Ms: null,
    maxMs: null,
    fileDurationMs: null,
    collectionMs: null,
    transformMs: null,
    setupMs: null,
    environmentMs: null,
    nullReason: NULL_METRIC_REASON,
  };
}

function dependencies(content) {
  const imported = uniqueMatches(
    content,
    /(?:from\s+|import\s*\()['"]([^'"]+)['"]/g,
    packageName
  );
  const mocked = uniqueMatches(
    content,
    /(?:vi|jest)\.mock\(\s*['"]([^'"]+)['"]/g,
    packageName
  );
  return {
    real: imported.filter(value => !mocked.includes(value)),
    mocked,
  };
}

function recommendation(classification, confidence) {
  if (confidence !== 'high')
    return 'Review the inferred boundary during lane separation; retain coverage until confirmed.';
  if (
    classification === 'live eval' ||
    classification === 'external sandbox integration'
  )
    return 'Keep off PR merge gates; run on main/schedule unless risk-triggered.';
  if (classification.includes('E2E'))
    return 'Keep the smallest behavior-complete journey in its dedicated browser lane.';
  return 'Keep in the dedicated taxonomy lane; add measured timing before performance changes.';
}

function fileCiMapping(record, lanes) {
  const laneBySuffix = suffix =>
    lanes.filter(lane => lane.id.endsWith(`#${suffix}`));
  let candidates = [];
  let suiteCandidates = [];
  let confidence = 'low';
  let provenance = 'No checked-in suite/config or CI command maps this path.';

  if (record.path.startsWith('apps/ios/')) {
    candidates = laneBySuffix('test').filter(lane =>
      lane.path.endsWith('/ios-ci.yml')
    );
    suiteCandidates = ['bash apps/ios/scripts/run-xcodebuild.sh test'];
    confidence = 'high';
    provenance = 'apps/ios test target and ios-ci.yml xcodebuild test command.';
  } else if (
    record.path.startsWith('apps/desktop/') ||
    /^scripts\/desktop-/.test(record.path)
  ) {
    suiteCandidates = ['pnpm --filter @jovie/desktop test'];
    confidence = 'high';
    provenance =
      'apps/desktop/package.json test script; no workflow invokes the desktop test suite.';
    if (
      /apps\/desktop\/scripts\/(?:desktop-auth-security\.test\.ts|desktop-tray-contract\.test\.mjs)$/.test(
        record.path
      )
    ) {
      suiteCandidates = [];
      provenance =
        'Known orphan: this desktop test is omitted from apps/desktop/package.json test and no CI workflow invokes it.';
    }
  } else if (/^(?:scripts|packages|tests|workers)\//.test(record.path)) {
    suiteCandidates = [];
    confidence = 'low';
    provenance =
      'No checked-in package/config/CI command was proven to select this exact root/package path; runner and lane remain unproven.';
  } else if (record.classification === 'live eval') {
    candidates = lanes.filter(lane =>
      /eval-real-model|evals-periodic/.test(lane.path)
    );
    suiteCandidates = ['pnpm --filter @jovie/web run evals:live'];
    confidence = 'medium';
    provenance =
      'Live-eval boundary maps to checked-in real-model/periodic workflows; exact file selection is conditional.';
  } else if (record.classification === 'deterministic eval') {
    candidates = lanes.filter(lane =>
      /(?:promptfoo-evals|golden-eval-set)/.test(lane.laneId)
    );
    suiteCandidates = [
      'pnpm --filter @jovie/web run evals:validate',
      'pnpm --filter @jovie/web run evals:golden',
    ];
    confidence = 'medium';
    provenance =
      'Deterministic-eval boundary maps to promptfoo/golden commands; exact manifest membership is conditional.';
  } else if (record.path.startsWith('apps/web/tests/e2e/')) {
    if (record.classification === 'E2E smoke') {
      candidates = lanes.filter(lane =>
        /(?:e2e-smoke|smoke-required|homepage-smoke|public-profile-smoke)/.test(
          lane.laneId
        )
      );
      suiteCandidates = ['pnpm --filter @jovie/web run test:e2e:smoke'];
    } else if (record.classification === 'E2E golden path') {
      candidates = laneBySuffix('ci-golden-path');
      suiteCandidates = [
        'pnpm --filter @jovie/web run test:e2e:golden-path:ci',
      ];
    } else if (/a11y|axe/i.test(record.path)) {
      candidates = lanes.filter(lane => /a11y/.test(lane.laneId));
      suiteCandidates = ['pnpm --filter @jovie/web run a11y:ci'];
    } else if (/visual|screenshot/i.test(record.path)) {
      candidates = lanes.filter(lane =>
        /visual-regression|screenshots/.test(lane.path)
      );
      suiteCandidates = ['pnpm --filter @jovie/web run e2e:visual'];
    } else {
      candidates = lanes.filter(lane =>
        /(?:ci-e2e-tests|e2e-full)/.test(`${lane.laneId} ${lane.path}`)
      );
      suiteCandidates = ['pnpm --filter @jovie/web run test:e2e:full'];
    }
    confidence = 'medium';
    provenance =
      'Playwright boundary and checked-in suite/config command; path filters, tags, and risk gates may select a subset.';
  } else if (record.path.startsWith('apps/web/tests/integration/')) {
    suiteCandidates = [];
    confidence = 'high';
    provenance =
      'Current vitest.config.fast.mts explicitly excludes tests/integration/**, so this file has no current test:fast or PR CI lane. JOV-4195/#13967 is pending work, not current coverage.';
  } else if (record.path.startsWith('apps/web/')) {
    candidates = laneBySuffix('ci-unit-tests');
    suiteCandidates = ['pnpm --filter @jovie/web run test:fast'];
    confidence = 'high';
    provenance =
      'vitest.config.mts re-exports vitest.config.fast.mts; the file is inside that fast scope and ci.yml invokes ci-unit-tests.';
  }

  return {
    jobs: candidates.map(lane => lane.id.replace(/^ci:/, '')),
    triggers: [...new Set(candidates.flatMap(lane => lane.ci.triggers))],
    blocking: null,
    reason:
      'Required-check/branch-protection configuration is not available in-repo; trigger presence does not prove blocking status.',
    suiteCandidates,
    mappingConfidence: confidence,
    mappingProvenance: provenance,
  };
}

function testRecords(files, lanes) {
  const provisional = files.filter(isExecutableTestFile).map(path => {
    const content = readFileSync(join(ROOT, path), 'utf8');
    const [classification, rationale, confidence] = classify(path, content);
    return {
      id: `file:${path}`,
      kind: 'test-file',
      path,
      classification,
      rationale,
      confidence,
      testCount: staticTestCount(path, content),
      metrics: metrics(),
      dependencies: dependencies(content),
      ci: null,
      retryFlake: {
        retries: null,
        flakeRate: null,
        reason: 'No per-test retry/flake history artifact is checked in.',
      },
      duplicateCoverageCandidates: [],
      recommendation: recommendation(classification, confidence),
    };
  });
  const byStem = new Map();
  for (const record of provisional) {
    const stem = record.path
      .split('/')
      .at(-1)
      .replace(/\.(?:test|spec)\.[^.]+$/, '')
      .toLowerCase();
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(record.path);
  }
  for (const record of provisional) {
    const stem = record.path
      .split('/')
      .at(-1)
      .replace(/\.(?:test|spec)\.[^.]+$/, '')
      .toLowerCase();
    record.duplicateCoverageCandidates = (byStem.get(stem) ?? [])
      .filter(path => path !== record.path)
      .slice(0, 8);
    record.ci = fileCiMapping(record, lanes);
    if (record.ci.suiteCandidates.length === 0) {
      record.recommendation = record.ci.mappingProvenance;
    }
  }
  return provisional;
}

function workflowTriggers(content) {
  const header = content.split(/^jobs:\s*$/m)[0];
  const inline = header.match(/^on:\s*\[([^\]]+)]/m);
  if (inline) return inline[1].split(',').map(value => value.trim());
  const onIndex = header.search(/^on:\s*$/m);
  if (onIndex < 0) return [];
  const onBlock = header.slice(onIndex).split('\n').slice(1);
  const triggers = [];
  for (const line of onBlock) {
    if (/^\S/.test(line)) break;
    const match = line.match(/^  ([a-zA-Z_][\w-]*):/);
    if (match) triggers.push(match[1]);
  }
  return triggers;
}

const TEST_COMMAND =
  /\b(?:vitest\s+run|playwright\s+test|xcodebuild\b[^\n]*\btest\b|run-xcodebuild\.sh\s+test|lhci\s+autorun|promptfoo\b|node\s+--test|bun\s+test|swift\s+test|pnpm\s+turbo\s+(?:test|test:fast)|pnpm(?:\s+--filter(?:=|\s+)\S+)?\s+(?:run\s+)?(?:test(?::[\w:-]+)?|evals(?::[\w:-]+)?)(?:\s|$)|npm\s+(?:run\s+)?test\b)/i;

function executableTestCommands(block) {
  return block
    .split('\n')
    .map(line => line.trim().replace(/^run:\s*/, ''))
    .filter(line => line && !line.startsWith('#') && !/^echo\b/.test(line))
    .filter(
      line =>
        /^(?:(?:[A-Z_][A-Z0-9_]*=(?:"[^"]*"|'[^']*'|\S+))\s+)*(?:pnpm|npm|vitest|playwright|xcodebuild|bash|node|bun|swift)\b/.test(
          line
        ) ||
        /^(?:cd|until|if|for|doppler)\b.*\b(?:pnpm|npm|vitest|playwright|xcodebuild|node|bun|swift)\b/.test(
          line
        )
    )
    .filter(line => TEST_COMMAND.test(line))
    .map(line => line.replace(/\\$/, '').trim())
    .filter((line, index, all) => all.indexOf(line) === index)
    .slice(0, 20);
}

function classifyLane(path, id, commands) {
  const command = commands.join('\n');
  if (/xcodebuild|run-xcodebuild/.test(command))
    return ['iOS integration/UI', ['xcodebuild test command'], 'high'];
  if (/desktop/.test(command))
    return ['desktop', ['desktop package test command'], 'high'];
  if (/lhci\s+autorun|lighthouse/i.test(command))
    return ['full/visual/a11y E2E', ['Lighthouse executable command'], 'high'];
  if (/playwright\s+test/.test(command)) {
    if (/smoke|playwright\.config\.smoke/.test(`${id}\n${command}`))
      return ['E2E smoke', ['Playwright smoke suite/config command'], 'high'];
    if (/golden/.test(`${id}\n${command}`))
      return ['E2E golden path', ['Playwright golden-path command'], 'high'];
    return [
      'full/visual/a11y E2E',
      ['Playwright full, visual, or accessibility command'],
      'high',
    ];
  }
  if (/promptfoo|evals:|real-eval|real-model/.test(`${id}\n${command}`)) {
    const live =
      /live|real-model|real-eval|evals-periodic|promptfooconfig\.judge|OPENAI_API_KEY/.test(
        `${path}\n${id}\n${command}`
      );
    return [
      live ? 'live eval' : 'deterministic eval',
      [live ? 'live/real provider eval command' : 'deterministic eval command'],
      'high',
    ];
  }
  if (/test:fast|vitest\s+run/.test(command)) {
    if (id === 'ci-unit-tests') {
      return [
        'service integration',
        [
          'Heterogeneous fast Vitest scope includes jsdom components and mocked route/service handler boundaries; integration directory is excluded.',
        ],
        'high',
      ];
    }
    const integration =
      /integration|DATABASE_URL|vitest\.config\.(?:integration|ci)/.test(
        `${id}\n${command}`
      );
    return [
      integration ? 'database/API integration' : 'pure unit',
      [
        integration
          ? 'integration Vitest suite/config command'
          : 'Vitest fast/unit command',
      ],
      'medium',
    ];
  }
  return [
    'contract/structural',
    ['executable structural test command'],
    'medium',
  ];
}

function ciRecords(files) {
  const records = [];
  for (const path of files.filter(path =>
    /^\.github\/workflows\/.*\.ya?ml$/.test(path)
  )) {
    const content = readFileSync(join(ROOT, path), 'utf8');
    const triggers = workflowTriggers(content);
    const jobsIndex = content.search(/^jobs:\s*$/m);
    if (jobsIndex < 0) continue;
    const jobText = content.slice(jobsIndex);
    const matches = [...jobText.matchAll(/^  ([\w-]+):\s*$/gm)];
    for (let index = 0; index < matches.length; index += 1) {
      const id = matches[index][1];
      const start = matches[index].index;
      const end = matches[index + 1]?.index ?? jobText.length;
      const block = jobText.slice(start, end);
      const commands = executableTestCommands(block);
      if (commands.length === 0) continue;
      const [classification, rationale, confidence] = classifyLane(
        path,
        id,
        commands
      );
      const commandCount = commands.length;
      records.push({
        id: `ci:${path}#${id}`,
        kind: 'ci-lane',
        path,
        laneId: id,
        classification,
        rationale,
        confidence,
        testCount: {
          value: commandCount,
          provenance:
            'Static count of test-related command invocations; matrix expansion and discovered tests are not measured.',
        },
        metrics: metrics(),
        dependencies: { real: commands, mocked: [] },
        ci: {
          jobs: [id],
          triggers,
          blocking: null,
          reason:
            'Required-check/branch-protection configuration is not available in-repo; trigger presence does not prove blocking status.',
        },
        retryFlake: {
          retries: /retries|retry/.test(block) ? 'configured in job text' : 0,
          flakeRate: null,
          reason: 'No lane-level flake history artifact is checked in.',
        },
        duplicateCoverageCandidates: [],
        recommendation: recommendation(classification, confidence),
      });
    }
  }
  return records.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildInventory(files = trackedFiles()) {
  const ciLanes = ciRecords(files);
  const testFiles = testRecords(files, ciLanes);
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedBy: 'scripts/test-inventory/generate.mjs',
    sourceRevision: 'working-tree',
    allowedClassifications: CLASSIFICATIONS,
    budgets: BUDGETS,
    baselineStatus: {
      status: 'measurement incomplete; ratchet only from trustworthy artifacts',
      policy:
        'Every PR must improve or preserve each measured metric. Budgets may not be loosened without a documented classification-based exception.',
      knownFindings: KNOWN_FINDINGS,
    },
    summary: { testFileCount: testFiles.length, ciLaneCount: ciLanes.length },
    testFiles,
    ciLanes,
  };
}

function taxonomyMarkdown(inventory) {
  const rows = CLASSIFICATIONS.map(name => {
    const budget = BUDGETS[name];
    const fields = budget
      ? Object.entries(budget)
          .map(([key, value]) => `${key}=${value}`)
          .join(', ')
      : 'No numeric target in brief';
    return `| ${name} | ${fields} |`;
  }).join('\n');
  return `# Canonical Test Taxonomy\n\n> Generated by \`scripts/test-inventory/generate.mjs\` from the schema and repository evidence. Do not edit by hand.\n\nClassification follows the strongest real boundary crossed, never the filename or current lane label. Ambiguous records remain explicitly medium-confidence and require review before movement.\n\n| Allowed classification | Final budget (milliseconds unless rate) |\n|---|---|\n${rows}\n\n## Evidence policy\n\n- High confidence requires direct imports or API use proving the boundary.\n- Medium confidence is an evidence-backed inference that still needs owner review.\n- Missing timing and flake data stays null with provenance; zero is never substituted for missing evidence.\n- Live providers and external sandboxes stay off PR gates unless a risk trigger requires them.\n- Generated inventory coverage is validated against every tracked executable test path.\n`;
}

function baselineMarkdown(inventory) {
  return `# Test Performance Baseline\n\n> Generated by \`scripts/test-inventory/generate.mjs\`. Do not edit by hand.\n\n## Current evidence\n\n- Test files inventoried: **${inventory.summary.testFileCount}**\n- Test-related CI lanes inventoried: **${inventory.summary.ciLaneCount}**\n- Trustworthy per-file timing artifacts checked in: **0**\n- Baseline status: **measurement incomplete**\n\nThe existing profiler observations of 455ms empty success and 420142ms timeout output are invalid measurements, not a baseline. Until successful timing artifacts exist, duration fields remain null with explicit provenance. This prevents partial runs from becoming ratchets.\n\n## Ratchet policy\n\nEvery PR must improve or preserve measured p50, p95, max, file/suite duration, setup, transform, collection, environment, merge-gate wall-clock, and flake rate. The final budgets in [test-taxonomy.md](test-taxonomy.md) remain fixed; a failing lane must be reclassified, optimized, or granted an evidence-backed exception rather than loosening its threshold.\n\n## Known confirmed findings\n\n${KNOWN_FINDINGS.map(item => `- **${item.id}:** ${item.evidence}`).join('\n')}\n`;
}

export function generate({ check = false } = {}) {
  const inventory = buildInventory();
  const errors = validateInventory(inventory);
  if (errors.length)
    throw new Error(`Inventory validation failed:\n${errors.join('\n')}`);
  const outputs = new Map([
    [OUTPUT_JSON, `${JSON.stringify(inventory)}\n`],
    [OUTPUT_TAXONOMY, taxonomyMarkdown(inventory)],
    [OUTPUT_BASELINE, baselineMarkdown(inventory)],
  ]);
  for (const [path, content] of outputs) {
    if (check) {
      const current = readFileSync(path, 'utf8');
      if (current !== content)
        throw new Error(`Generated artifact is stale: ${relative(ROOT, path)}`);
    } else writeFileSync(path, content);
  }
  return inventory;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inventory = generate({ check: process.argv.includes('--check') });
  console.log(
    `Inventory valid: ${inventory.summary.testFileCount} files, ${inventory.summary.ciLaneCount} CI lanes.`
  );
}
