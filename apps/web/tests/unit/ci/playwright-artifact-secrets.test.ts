import { spawnSync } from 'node:child_process';
import {
  existsSync,
  globSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { type AddressInfo, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import type { PlaywrightTestConfig } from '@playwright/test';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  artifactContainsSecret,
  guardPlaywrightArtifacts,
  inspectPlaywrightArtifacts,
  isCredentialBearingName,
  resolveArtifactFiles,
  validPlaywrightPng,
} from '../../../../../.github/scripts/guard-playwright-artifacts.mjs';

const webRoot = resolve(import.meta.dirname, '../../..');
const repoRoot = resolve(webRoot, '../..');
const githubRoot = join(repoRoot, '.github');
const workflowsRoot = join(githubRoot, 'workflows');
const guardScriptName = 'guard-playwright-artifacts.mjs';
const guardScript = join(githubRoot, 'scripts', guardScriptName);
const generated: string[] = [];
const configLoaders = Object.fromEntries(
  Object.entries(
    import.meta.glob<{ default: PlaywrightTestConfig }>(
      '../../../playwright*.config*.ts'
    )
  ).map(([path, load]) => [path.split('/').at(-1), load])
);
const expectedConfigs = Object.keys(configLoaders).sort();
const localTrace = Object.fromEntries(
  'playwright.config.dropdown.ts=retain-on-failure|playwright.config.screenshots.ts=off|playwright.config.visual-qa.ts=off|playwright.synthetic.config.ts=retain-on-failure'
    .split('|')
    .map(value => value.split('='))
);
const uploadInventory =
  'agent-tick.yml:public-profile-smoke-screenshots|agent-tick.yml:synthetic-test-results|ci.yml:${{ github.job }}-shard-${{ matrix.shard }}-test-results-${{ github.run_id }}-${{ github.run_attempt }}|ci.yml:a11y-authed-report-${{ github.run_id }}-${{ github.run_attempt }}|ci.yml:a11y-axe-report-${{ github.run_id }}-${{ github.run_attempt }}|ci.yml:admin-smoke-report-${{ github.run_id }}-${{ github.run_attempt }}|ci.yml:combined-layout-report-${{ github.run_id }}-${{ github.run_attempt }}|ci.yml:e2e-smoke-report-${{ github.run_id }}-${{ github.run_attempt }}|ci.yml:golden-path-report-${{ github.run_id }}-${{ github.run_attempt }}|ci.yml:layout-guard-report-${{ github.run_id }}-${{ github.run_attempt }}|ci.yml:mobile-overflow-report-${{ matrix.width }}-${{ github.run_id }}-${{ github.run_attempt }}|ci.yml:public-lighthouse-mobile-report-${{ github.run_id }}-${{ github.run_attempt }}|ci.yml:smoke-required-report-${{ github.run_id }}|e2e-full-matrix.yml:e2e-full-${{ matrix.browser }}-results-${{ github.run_id }}|nightly-testing-agent.yml:nightly-agent-candidate-validation-${{ github.run_id }}|nightly-testing-agent.yml:nightly-agent-context-${{ github.run_id }}|nightly-testing-agent.yml:nightly-agent-deterministic-${{ github.run_id }}|nightly-testing-agent.yml:nightly-agent-mutation-${{ github.run_id }}|nightly-testing-agent.yml:nightly-agent-report-${{ github.run_id }}|nightly-tests.yml:full-surface-chaos-${{ github.run_id }}|nightly-tests.yml:nightly-e2e-results-${{ github.run_id }}|nightly-tests.yml:nightly-route-qa-${{ github.run_id }}|postdeploy-probes.yml:postdeploy-auth-smoke-${{ github.run_id }}|production-controller.yml:post-deploy-auth-smoke-${{ github.run_id }}|synthetic-monitoring.yml:synthetic-test-results|visual-regression.yml:visual-regression-report-${{ github.run_id }}-${{ github.run_attempt }}'.split(
    '|'
  );
const imageUploads =
  'agent-tick.yml:public-profile-smoke-screenshots|ci.yml:public-lighthouse-mobile-report-${{ github.run_id }}-${{ github.run_attempt }}|visual-regression.yml:visual-regression-report-${{ github.run_id }}-${{ github.run_attempt }}'.split(
    '|'
  );
const markdownUploads = [
  'nightly-testing-agent.yml:nightly-agent-report-${{ github.run_id }}',
  'visual-regression.yml:visual-regression-report-${{ github.run_id }}-${{ github.run_attempt }}',
];
const protectedJobs: Record<string, string[]> = {
  'agent-tick.yml': ['synthetic-monitoring'],
  'ci.yml':
    'ci-build-layout ci-layout-guard ci-mobile-overflow ci-lighthouse-pr ci-a11y ci-a11y-authed ci-e2e-smoke ci-golden-path ci-admin-smoke ci-e2e-tests ci-smoke-required'.split(
      ' '
    ),
  'e2e-full-matrix.yml': ['e2e-full-matrix'],
  'nightly-tests.yml': ['e2e-tests'],
  'nightly-testing-agent.yml': ['deterministic', 'report'],
  'production-controller.yml': ['ci-post-deploy-auth-smoke'],
  'production-release.yml': ['alias-staging', 'production-oauth-gate'],
  'synthetic-monitoring.yml': ['synthetic-test'],
  'visual-regression.yml': ['visual-regression'],
};
const producerCounts: Record<string, number> = {
  'agent-tick.yml': 6,
  'canary-health-gate.yml': 1,
  'ci.yml': 14,
  'e2e-full-matrix.yml': 2,
  'nightly-testing-agent.yml': 2,
  'nightly-tests.yml': 4,
  'production-controller.yml': 1,
  'production-release.yml': 2,
  'screenshots.yml': 1,
  'synthetic-monitoring.yml': 6,
  'visual-regression.yml': 5,
};

function fixture(prefix = 'jovie-artifact-', parent = tmpdir()) {
  const path = realpathSync(mkdtempSync(join(parent, prefix)));
  generated.push(path);
  return path;
}

function write(path: string, contents: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const fileMode = (path: string) => lstatSync(path).mode & 0o777;
const jobBlock = (source: string, job: string) =>
  source.match(new RegExp(`\\n  ${job}:[\\s\\S]*?(?=\\n  [\\w-]+:|$)`))?.[0] ??
  '';
const stepBlock = (source: string, name: string) =>
  source
    .split(/(?=^      - name:)/m)
    .find(block => block.startsWith(`      - name: ${name}\n`)) ?? '';
const yamlPropertyBlock = (source: string, key: string, indent: number) => {
  const lines = source.split('\n');
  const prefix = ' '.repeat(indent);
  const start = lines.findIndex(line => line.startsWith(`${prefix}${key}:`));
  if (start < 0) return '';
  let end = start + 1;
  while (
    end < lines.length &&
    (lines[end] === '' || lines[end].startsWith(prefix + ' '))
  )
    end += 1;
  return lines.slice(start, end).join('\n');
};
type WorkflowJobBlock = {
  readonly id: string;
  readonly source: string;
};
const workflowJobBlocks = (source: string): WorkflowJobBlock[] => {
  const lines = source.split('\n');
  const jobs = lines.findIndex(line => line === 'jobs:');
  if (jobs < 0) return [];
  const starts = lines.flatMap((line, index) => {
    const match = index > jobs ? line.match(/^  ([\w-]+):(?:\s.*)?$/) : null;
    return match ? [{ id: match[1], index }] : [];
  });
  return starts.map(({ id, index }, position) => ({
    id,
    source: lines
      .slice(index, starts[position + 1]?.index ?? lines.length)
      .join('\n'),
  }));
};
const workflowStepBlocks = (job: string): string[] => {
  const lines = job.split('\n');
  const steps = lines.findIndex(line => /^    steps:\s*$/.test(line));
  if (steps < 0) return [];
  const starts = lines.flatMap((line, index) =>
    index > steps && /^      - /.test(line) ? [index] : []
  );
  return starts.map((index, position) =>
    lines.slice(index, starts[position + 1] ?? lines.length).join('\n')
  );
};
const safeUploadAction =
  'uses: ./.github/actions/upload-safe-playwright-artifact';
const persistentGitCredentialPatterns: readonly (readonly [string, RegExp])[] =
  [
    [
      'app-token',
      /uses:\s*[^\n]*(?:create-github-app-token|github-app-token)@/i,
    ],
    [
      'credential-helper',
      /\bgit\s+config\b[^\n]*(?:credential\.helper|http\.[^\s=]*\.extraheader|url\.[^\s=]*\.insteadof)/i,
    ],
    ['gh-auth-setup', /\bgh\s+auth\s+setup-git\b/i],
    ['git-credential-store', /\bgit\s+credential\s+(?:approve|store)\b/i],
    ['credential-file', /\.git-credentials\b/i],
    [
      'tokenized-remote',
      /\bgit\b[^\n]*\b(?:remote\s+(?:add|set-url)|clone|fetch|pull|push)\b[^\n]*(?:x-access-token|oauth2|\$\{?\{?\s*secrets\.|\$\{?[A-Z0-9_]*(?:TOKEN|SECRET))/i,
    ],
  ];
const persistentGitCredentialViolations = (source: string): string[] =>
  persistentGitCredentialPatterns.flatMap(([category, pattern]) =>
    pattern.test(source) ? [category] : []
  );
const hasCommandScopedGitAuth = (source: string, command: 'pull' | 'push') =>
  new RegExp(
    `\\bgit\\s+-c\\s+["']?http\\.[^\\s"']*\\.extraheader=\\$[A-Z][A-Z0-9_]*["']?\\s+${command}\\b`,
    'i'
  ).test(source);
const allowedPreCheckoutStep = (step: string) =>
  [
    '      - name: Reset workspace git state (self-hosted)\n',
    '      - name: Safety check - only run on schedule or manual dispatch\n',
  ].some(prefix => step.startsWith(prefix));
const safeUploadJobAudit = (job: WorkflowJobBlock) => {
  const steps = workflowStepBlocks(job.source);
  const uploadIndexes = steps.flatMap((step, index) =>
    step.includes(safeUploadAction) ? [index] : []
  );
  const checkoutSteps = steps.flatMap((source, index) =>
    /uses:\s*actions\/checkout@/i.test(source) ? [{ index, source }] : []
  );
  const checkoutIndex =
    checkoutSteps.length === 1 ? checkoutSteps[0]?.index : undefined;
  const mustFollowCheckout = steps.flatMap((step, index) =>
    /uses:\s*actions\/checkout@/i.test(step) || allowedPreCheckoutStep(step)
      ? []
      : [index]
  );
  const lastUpload = uploadIndexes.at(-1) ?? steps.length;
  const preUploadSteps = steps.slice(0, lastUpload).join('\n');
  return {
    uploadCount: uploadIndexes.length,
    violations: [
      ...(steps.length ? [] : [`${job.id}:missing-steps`]),
      ...(uploadIndexes.length ? [] : [`${job.id}:missing-safe-upload`]),
      ...(checkoutSteps.length === 1
        ? []
        : [`${job.id}:checkout-count-${checkoutSteps.length}`]),
      ...(checkoutIndex === undefined ||
      mustFollowCheckout.every(index => checkoutIndex < index)
        ? []
        : [`${job.id}:checkout-after-producer-or-upload`]),
      ...checkoutSteps.flatMap(({ source }, index) =>
        /^\s+persist-credentials:\s*false\s*$/m.test(source)
          ? []
          : [`${job.id}:checkout-${index + 1}-persists-credentials`]
      ),
      ...persistentGitCredentialViolations(preUploadSteps).map(
        violation => `${job.id}:pre-upload-${violation}`
      ),
    ],
  };
};
const gitPushAuthViolations = (source: string): string[] => [
  ...(hasCommandScopedGitAuth(source, 'push')
    ? []
    : ['missing-command-scoped-push-auth']),
  ...persistentGitCredentialViolations(source),
];
const secretReferenceViolations = (...sources: string[]) =>
  [...sources.join('\n').matchAll(/\$\{\{\s*secrets\.[^}]+}}/g)].map(
    match => match[0]
  );
const reporterNames = (reporter: unknown) =>
  typeof reporter === 'string'
    ? [reporter]
    : Array.isArray(reporter)
      ? reporter.map(value => String(Array.isArray(value) ? value[0] : value))
      : [];

function reporterViolations(source: string) {
  const file = ts.createSourceFile(
    'config.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const violations: string[] = [];
  const name = (node: ts.PropertyName) =>
    ts.isIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node)
      ? node.text
      : undefined;
  const envName = (node: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(file) === 'process' &&
      node.expression.name.text === 'env'
    )
      return node.name.text;
    if (
      ts.isElementAccessExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(file) === 'process' &&
      node.expression.name.text === 'env' &&
      ts.isStringLiteral(node.argumentExpression)
    )
      return node.argumentExpression.text;
    if (
      ts.isElementAccessExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(file) === 'process' &&
      node.expression.name.text === 'env'
    )
      return '*';
    return undefined;
  };
  const containsCredentialEnv = (node: ts.Node) => {
    let found = false;
    const scan = (nested: ts.Node) => {
      const environmentName = envName(nested);
      if (
        environmentName === '*' ||
        (environmentName !== undefined &&
          isCredentialBearingName(environmentName))
      )
        found = true;
      else ts.forEachChild(nested, scan);
    };
    scan(node);
    return found;
  };
  const serializedCommandLeaks = (node: ts.Expression): boolean =>
    ts.isConditionalExpression(node)
      ? serializedCommandLeaks(node.whenTrue) ||
        serializedCommandLeaks(node.whenFalse)
      : containsCredentialEnv(node);
  const unwrap = (node: ts.Expression): ts.Expression => {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    )
      return unwrap(node.expression);
    return node;
  };
  const envObjectUnsafe = (node: ts.Expression): boolean => {
    const value = unwrap(node);
    if (ts.isConditionalExpression(value))
      return (
        envObjectUnsafe(value.whenTrue) || envObjectUnsafe(value.whenFalse)
      );
    if (!ts.isObjectLiteralExpression(value)) return true;
    return value.properties.some(member => {
      if (ts.isSpreadAssignment(member))
        return envObjectUnsafe(member.expression);
      if (!ts.isPropertyAssignment(member)) return true;
      const key = name(member.name);
      return (
        key === undefined ||
        isCredentialBearingName(key) ||
        containsCredentialEnv(member.initializer)
      );
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'env')
      violations.push('unsafe env');
    if (ts.isPropertyAssignment(node)) {
      const key = name(node.name);
      if (key === undefined) violations.push('unsafe computed property');
      if (key === 'env' && envObjectUnsafe(node.initializer))
        violations.push('unsafe env');
      if (
        key !== undefined &&
        ['command', 'metadata', 'extraHTTPHeaders'].includes(key) &&
        (key === 'command'
          ? serializedCommandLeaks(node.initializer)
          : containsCredentialEnv(node.initializer))
      )
        violations.push('unsafe expression');
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return violations;
}

function testUseMediaViolations(source: string) {
  const file = ts.createSourceFile(
    'test.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const unwrap = (node: ts.Expression): ts.Expression => {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    )
      return unwrap(node.expression);
    return node;
  };
  const isCi = (node: ts.Expression): boolean | undefined => {
    const value = unwrap(node);
    if (
      ts.isPropertyAccessExpression(value) &&
      ts.isPropertyAccessExpression(value.expression) &&
      value.expression.expression.getText(file) === 'process' &&
      value.expression.name.text === 'env' &&
      value.name.text === 'CI'
    )
      return true;
    if (
      ts.isPrefixUnaryExpression(value) &&
      value.operator === ts.SyntaxKind.ExclamationToken
    ) {
      const nested = isCi(value.operand);
      return nested === undefined ? undefined : !nested;
    }
    if (
      ts.isCallExpression(value) &&
      value.expression.getText(file) === 'Boolean' &&
      value.arguments.length === 1
    )
      return isCi(value.arguments[0]);
    return undefined;
  };
  const valueForCi = (node: ts.Expression): string | undefined => {
    const value = unwrap(node);
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
      return value.text;
    if (ts.isConditionalExpression(value)) {
      const condition = isCi(value.condition);
      if (condition === undefined) return undefined;
      return valueForCi(condition ? value.whenTrue : value.whenFalse);
    }
    return undefined;
  };
  const violations: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const directUse =
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(file) === 'test' &&
        node.expression.name.text === 'use';
      const computedTestCall =
        ts.isElementAccessExpression(node.expression) &&
        node.expression.expression.getText(file) === 'test';
      if (!directUse && !computedTestCall) {
        ts.forEachChild(node, visit);
        return;
      }
      if (computedTestCall) violations.push('computed test method');
      const value = node.arguments[0];
      if (!value || !ts.isObjectLiteralExpression(value)) {
        violations.push('unknown test.use options');
      } else {
        for (const property of value.properties) {
          if (!ts.isPropertyAssignment(property)) {
            violations.push('unknown test.use member');
            continue;
          }
          const name =
            ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
              ? property.name.text
              : undefined;
          if (name === undefined) {
            violations.push('computed test.use member');
            continue;
          }
          if (
            (name === 'trace' || name === 'video') &&
            valueForCi(property.initializer) !== 'off'
          )
            violations.push(`${name}:${property.initializer.getText(file)}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return violations;
}

async function configs(ci: boolean, producer = false, bypass = '') {
  vi.stubEnv('CI', ci ? '1' : '');
  vi.stubEnv(
    'PLAYWRIGHT_ARTIFACT_REQUIRE_PRODUCER_STAGE',
    producer ? 'true' : ''
  );
  vi.stubEnv('BASE_URL', 'http://127.0.0.1:3100');
  vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', bypass);
  vi.resetModules();
  return Object.fromEntries(
    await Promise.all(
      expectedConfigs.map(async name => [
        name,
        (await configLoaders[name]()).default,
      ])
    )
  );
}

async function port() {
  return await new Promise<number>((accept, reject) => {
    const server = createServer().once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const value = (server.address() as AddressInfo).port;
      server.close(error => (error ? reject(error) : accept(value)));
    });
  });
}

function chunk(type: string, data = Buffer.alloc(0)) {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length);
  output.write(type, 4, 4, 'ascii');
  data.copy(output, 8);
  output.writeUInt32BE(
    crc32(output.subarray(4, data.length + 8)),
    data.length + 8
  );
  return output;
}

const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const pngRows = Buffer.from([0, 0, 0, 0]);
function png(extra: Buffer[] = [], idat?: Buffer, colorType = 2) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1);
  header.writeUInt32BE(1, 4);
  Buffer.from([8, colorType, 0, 0, 0]).copy(header, 8);
  return Buffer.concat([
    pngSignature,
    chunk('IHDR', header),
    ...extra,
    chunk(
      'IDAT',
      idat ?? deflateSync(Buffer.alloc(1 + (colorType === 6 ? 4 : 3)))
    ),
    chunk('IEND'),
  ]);
}

function baseEnv(workspace: string, runner: string, extra = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    GITHUB_WORKSPACE: workspace,
    RUNNER_TEMP: runner,
    GITHUB_RUN_ID: '14442',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_JOB: 'artifact-test',
    PLAYWRIGHT_ARTIFACT_PATHS: 'out',
    ...extra,
  };
}

function runChild(workspace: string, runner: string, code: string, extra = {}) {
  return spawnSync(
    process.execPath,
    [guardScript, '--run', '--', process.execPath, '-e', code],
    { cwd: workspace, encoding: 'utf8', env: baseEnv(workspace, runner, extra) }
  );
}

function currentStage(runner: string) {
  const root = join(runner, 'safe-playwright-producer');
  const pointer = readFileSync(join(root, 'current'), 'utf8');
  return { pointer, root, stage: join(root, pointer.trim().split('|')[1]) };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const path of generated.splice(0)) {
    spawnSync('chmod', ['-R', 'u+w', path]);
    rmSync(path, { recursive: true, force: true });
  }
});

describe('Playwright artifact secret boundary', () => {
  it('keeps configs reporter-safe and suppresses default JSON only for producer jobs', async () => {
    const actual = readdirSync(webRoot)
      .filter(name =>
        /^playwright(?:\.[\w-]+)*\.config(?:\.[\w-]+)*\.[cm]?[jt]s$/.test(name)
      )
      .sort();
    expect(actual).toEqual(expectedConfigs);
    for (const name of actual) {
      const source = readFileSync(join(webRoot, name), 'utf8');
      expect(reporterViolations(source), name).toEqual([]);
      expect(source, name).not.toContain('...process.env');
    }
    expect(
      reporterViolations(
        "export default {command:process.env.DATABASE_URL?'safe-a':'safe-b'}"
      )
    ).toEqual([]);
    for (const command of [
      "process.env.DATABASE_URL ?? 'fallback'",
      '`run ${process.env.DATABASE_URL}`',
      "'run '+process.env.DATABASE_URL",
      'make(process.env.DATABASE_URL)',
      "ok ? process.env.DATABASE_URL : 'safe'",
      "ok ? 'safe' : process.env.DATABASE_URL",
    ])
      expect(
        reporterViolations(`export default {command:${command}}`),
        command
      ).toContain('unsafe expression');
    expect(
      reporterViolations(
        "export default {env:{SAFE:'1',NODE_OPTIONS:process.env.NODE_OPTIONS??'',...(ok?{NEXT_PUBLIC_E2E_MODE:'1'}:{})}}"
      )
    ).toEqual([]);
    for (const unsafe of [
      "const env={SAFE:'1'};export default {env}",
      'export default {env:process.env}',
      'export default {env:{...process.env}}',
      'export default {env:{...safeEnv}}',
      'export default {env:{SAFE:process.env.DATABASE_URL}}',
      "export default {env:{[key]:'value'}}",
      "export default {['env']:{SAFE:'1'}}",
    ])
      expect(reporterViolations(unsafe), unsafe).not.toEqual([]);
    const ci = await configs(true);
    const testSources = new Set<string>();
    const collect = (root: string, match?: RegExp | RegExp[]) => {
      const absoluteRoot = resolve(webRoot, root);
      for (const path of globSync('**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}', {
        cwd: absoluteRoot,
      })) {
        const absolute = join(absoluteRoot, path);
        const patterns = match ? (Array.isArray(match) ? match : [match]) : [];
        if (
          lstatSync(absolute).isFile() &&
          (patterns.length === 0 ||
            patterns.some(pattern => {
              pattern.lastIndex = 0;
              return pattern.test(absolute);
            }))
        )
          testSources.add(absolute);
      }
    };
    for (const config of Object.values(ci)) {
      collect(config.testDir ?? './tests/e2e');
      for (const project of config.projects ?? [])
        if (project.testDir && project.testMatch instanceof RegExp)
          collect(project.testDir, project.testMatch);
    }
    for (const path of testSources)
      expect(testUseMediaViolations(readFileSync(path, 'utf8')), path).toEqual(
        []
      );
    expect(
      testUseMediaViolations(
        "test.use({trace:'off',video:process.env.CI?'off':'on'})"
      )
    ).toEqual([]);
    for (const unsafe of [
      "test.use({trace:process.env.CI?'on':'off',video:'off'})",
      "const media={trace:'off'};test.use(media)",
      "test.use({...{trace:'off'}})",
      "const trace='off';test.use({trace})",
      "test.use({['trace']:'off'})",
      "test['use']({trace:'off'})",
      "const value='off';test.use({trace:value})",
    ])
      expect(testUseMediaViolations(unsafe), unsafe).not.toEqual([]);
    const local = await configs(false);
    for (const name of expectedConfigs) {
      expect(ci[name].captureGitInfo, name).toEqual({
        commit: false,
        diff: false,
      });
      expect(ci[name].use?.trace, name).toBe('off');
      expect(ci[name].use?.video ?? 'off', name).toBe('off');
      expect(ci[name].use?.screenshot ?? 'off', name).toBe('off');
      expect(reporterNames(ci[name].reporter), name).not.toContain('html');
      expect(local[name].use?.trace, name).toBe(
        localTrace[name] ?? 'on-first-retry'
      );
    }
    expect(reporterNames(ci['playwright.config.ts'].reporter)).toContain(
      'json'
    );
    expect(
      reporterNames(
        (await configs(true, true))['playwright.config.ts'].reporter
      )
    ).not.toContain('json');
    await expect(configs(true, false, 'sentinel')).rejects.toThrow(
      'Global Vercel bypass headers are forbidden'
    );
  }, 20_000);

  it('inherits child env without JSON disclosure and rejects a real credential trace', async () => {
    const directory = fixture('.artifact-json-', webRoot);
    const serverPort = await port();
    const report = join(directory, 'report.json');
    const outputDir = join(directory, 'test-results');
    write(
      join(directory, 'server.mjs'),
      `import http from'node:http';http.createServer((q,r)=>{const p=new URL(q.url,'http://local').pathname;if(p==='/env')return r.end(process.env.ARTIFACT_PASSWORD_SENTINEL);if(p==='/submit')return r.end('ok');r.setHeader('set-cookie','session='+process.env.TRACE_COOKIE_SENTINEL);r.end('ok')}).listen(${serverPort},'127.0.0.1')`
    );
    write(
      join(directory, 'sentinel.spec.ts'),
      `import{expect,test}from'@playwright/test';test('env',async({page,request})=>{expect(await(await request.get('http://127.0.0.1:${serverPort}/env')).text()).toBe('never-report-me');await page.goto('http://127.0.0.1:${serverPort}');await page.setContent('<input><button>go</button><script>document.querySelector("button").onclick=()=>fetch("/submit",{method:"POST"})</script>');await page.locator('input').fill(process.env.TRACE_PASSWORD_SENTINEL);const done=page.waitForResponse('**/submit');await page.locator('button').click();expect((await done).ok()).toBe(true)})`
    );
    write(
      join(directory, 'playwright.config.ts'),
      `import{defineConfig}from'@playwright/test';export default defineConfig({testDir:'.',outputDir:${JSON.stringify(outputDir)},reporter:[['json',{outputFile:${JSON.stringify(report)}}]],use:{trace:'on',extraHTTPHeaders:{'x-secret':process.env.TRACE_HEADER_SENTINEL}},webServer:{command:${JSON.stringify(`${process.execPath} server.mjs`)},cwd:${JSON.stringify(directory)},env:{SAFE:'1'},url:'http://127.0.0.1:${serverPort}'}})`
    );
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config',
        join(directory, 'playwright.config.ts'),
      ],
      {
        cwd: webRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          ARTIFACT_PASSWORD_SENTINEL: 'never-report-me',
          TRACE_PASSWORD_SENTINEL: 'trace-password',
          TRACE_HEADER_SENTINEL: 'trace-header',
          TRACE_COOKIE_SENTINEL: 'trace-cookie',
        },
        timeout: 90_000,
      }
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(readFileSync(report, 'utf8')).not.toMatch(
      /ARTIFACT_PASSWORD_SENTINEL|never-report-me/
    );
    const trace = resolveArtifactFiles([outputDir], directory).find(path =>
      path.endsWith('.zip')
    ) as string;
    const unpacked = spawnSync('unzip', ['-p', trace], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    expect(unpacked.status, unpacked.stderr).toBe(0);
    for (const value of ['trace-password', 'trace-header', 'trace-cookie'])
      expect(unpacked.stdout).toContain(value);
    expect(
      guardPlaywrightArtifacts([outputDir], {}, { workspace: directory })
    ).toContain(trace);
    const guarded = spawnSync(process.execPath, [guardScript, outputDir], {
      cwd: directory,
      encoding: 'utf8',
      env: baseEnv(directory, fixture(), {
        TRACE_PASSWORD_SENTINEL: 'trace-password',
        TRACE_HEADER_SENTINEL: 'trace-header',
        TRACE_COOKIE_SENTINEL: 'trace-cookie',
      }),
    });
    expect(guarded.status).toBe(1);
    expect(`${guarded.stdout}\n${guarded.stderr}`).toContain(
      'PLAYWRIGHT_ARTIFACT_SECRET_EXPOSURE'
    );
    expect(`${guarded.stdout}\n${guarded.stderr}`).not.toMatch(
      /TRACE_|trace-password|trace-header|trace-cookie/
    );
  }, 120_000);

  it('routes the exact upload and producer inventory through staged-only guards', () => {
    const uploads: string[] = [];
    const images: string[] = [];
    const markdown: string[] = [];
    const safeUploadJobs: (WorkflowJobBlock & { readonly file: string })[] = [];
    for (const file of readdirSync(workflowsRoot).filter(name =>
      /\.ya?ml$/.test(name)
    )) {
      const source = readFileSync(join(workflowsRoot, file), 'utf8');
      safeUploadJobs.push(
        ...workflowJobBlocks(source)
          .filter(job => job.source.includes(safeUploadAction))
          .map(job => ({ ...job, file }))
      );
      for (const block of source.split(/(?=^ {6}- (?:name:|uses:))/m)) {
        if (
          block.includes(
            'uses: ./.github/actions/upload-safe-playwright-artifact'
          )
        ) {
          expect(block, file).not.toContain('apps/web/playwright-report/');
          expect(block, file).not.toMatch(
            /if-no-files-found:\s*(?:ignore|warn)/
          );
          if (/^ {8}if:.*(?:always|failure)\(\)/m.test(block))
            expect(block, file).toContain('hashFiles(');
        }
        if (
          !/apps\/web\/(?:playwright-report|test-results)/.test(block) ||
          !/uses:\s*(?:actions\/upload-artifact@|\.\/\.github\/actions\/upload-safe-playwright-artifact)/.test(
            block
          )
        )
          continue;
        expect(block, file).toContain(
          'uses: ./.github/actions/upload-safe-playwright-artifact'
        );
        const artifact = `${file}:${block.match(/^ {10}name:\s*(.+)$/m)?.[1]}`;
        uploads.push(artifact);
        if (/^ {10}allow-images:\s*['"]?true/m.test(block))
          images.push(artifact);
        if (/^ {10}allow-markdown:\s*['"]?true/m.test(block))
          markdown.push(artifact);
      }
    }
    expect(uploads.sort()).toEqual(uploadInventory.sort());
    expect(images.sort()).toEqual(imageUploads.sort());
    expect(markdown.sort()).toEqual(markdownUploads.sort());
    expect(safeUploadJobs).toHaveLength(23);
    expect(
      safeUploadJobs.reduce(
        (count, job) => count + safeUploadJobAudit(job).uploadCount,
        0
      )
    ).toBe(26);
    for (const job of safeUploadJobs) {
      const audit = safeUploadJobAudit(job);
      expect(
        audit.uploadCount,
        `${job.file}:${job.id}:safe uploads`
      ).toBeGreaterThan(0);
      expect(audit.violations, `${job.file}:${job.id}`).toEqual([]);
    }

    const fixtureCheckout = `      - uses: actions/checkout@0123456789abcdef
        with:
          persist-credentials: false`;
    const safeUploadFixture = `jobs:
  artifact:
    steps:
${fixtureCheckout}
      - name: Produce artifact
        run: node .github/scripts/guard-playwright-artifacts.mjs --run -- true
      - uses: ./.github/actions/upload-safe-playwright-artifact
        with:
          name: fixture
          path: apps/web/test-results/result.json`;
    const safeFixtureJobs = workflowJobBlocks(safeUploadFixture);
    expect(safeFixtureJobs).toHaveLength(1);
    const safeFixtureJob = safeFixtureJobs.at(0);
    if (!safeFixtureJob)
      throw new Error('safe upload fixture job was not parsed');
    expect(safeUploadJobAudit(safeFixtureJob).uploadCount).toBe(1);
    expect(safeUploadJobAudit(safeFixtureJob).violations).toEqual([]);
    const withoutFixtureCheckout = safeUploadFixture.replace(
      `${fixtureCheckout}\n`,
      ''
    );
    for (const unsafe of [
      safeUploadFixture.replace('          persist-credentials: false\n', ''),
      safeUploadFixture.replace(
        `${fixtureCheckout}\n`,
        `${fixtureCheckout}\n${fixtureCheckout}\n`
      ),
      withoutFixtureCheckout.replace(
        '      - uses: ./.github/actions/upload-safe-playwright-artifact',
        `${fixtureCheckout}\n      - uses: ./.github/actions/upload-safe-playwright-artifact`
      ),
      `${withoutFixtureCheckout}\n${fixtureCheckout}`,
      safeUploadFixture.replace(
        '      - name: Produce artifact',
        '      - uses: actions/create-github-app-token@0123456789abcdef\n      - name: Produce artifact'
      ),
      safeUploadFixture.replace(
        '        run: node .github/scripts/guard-playwright-artifacts.mjs --run -- true',
        '        run: git config --global credential.helper store'
      ),
      safeUploadFixture.replace(
        '        run: node .github/scripts/guard-playwright-artifacts.mjs --run -- true',
        '        run: git remote set-url origin https://x-access-token:$GH_TOKEN@github.com/JovieInc/Jovie.git'
      ),
    ]) {
      const unsafeJobs = workflowJobBlocks(unsafe);
      expect(unsafeJobs, unsafe).toHaveLength(1);
      const unsafeJob = unsafeJobs.at(0);
      if (!unsafeJob)
        throw new Error('unsafe upload fixture job was not parsed');
      expect(safeUploadJobAudit(unsafeJob).violations, unsafe).not.toEqual([]);
    }
    for (const [file, jobs] of Object.entries(protectedJobs)) {
      const source = readFileSync(join(workflowsRoot, file), 'utf8');
      for (const job of jobs) {
        const protectedJob = jobBlock(source, job);
        expect(protectedJob, `${file}:${job}`).not.toBe('');
        const protectedJobEnv = yamlPropertyBlock(protectedJob, 'env', 4);
        expect(protectedJobEnv, `${file}:${job}:job.env`).toContain(
          "PLAYWRIGHT_ARTIFACT_REQUIRE_PRODUCER_STAGE: 'true'"
        );
        expect(
          protectedJob.indexOf(protectedJobEnv),
          `${file}:${job}:job.env-before-steps`
        ).toBeLessThan(protectedJob.indexOf('\n    steps:'));
      }
    }
    const imageJobs =
      'agent-tick.yml:synthetic-monitoring|synthetic-monitoring.yml:synthetic-test|ci.yml:ci-lighthouse-pr|visual-regression.yml:visual-regression';
    for (const item of imageJobs.split('|')) {
      const [file, job] = item.split(':');
      const imageJob = jobBlock(
        readFileSync(join(workflowsRoot, file), 'utf8'),
        job
      );
      expect(imageJob, item).not.toBe('');
      const imageJobEnv = yamlPropertyBlock(imageJob, 'env', 4);
      expect(imageJobEnv, `${item}:job.env`).toContain(
        "PLAYWRIGHT_ARTIFACT_ALLOW_IMAGES: 'true'"
      );
      expect(
        imageJob.indexOf(imageJobEnv),
        `${item}:job.env-before-steps`
      ).toBeLessThan(imageJob.indexOf('\n    steps:'));
    }
    for (const [file, count] of Object.entries(producerCounts)) {
      const producers = readFileSync(join(workflowsRoot, file), 'utf8')
        .split(/(?=^ {6}- (?:name:|uses:))/m)
        .flatMap(block => {
          const stepName = block.match(/^      - name: (.+)$/m)?.[1];
          return block
            .split('\n')
            .filter(
              line =>
                !line.trimStart().startsWith('echo') &&
                /(?:playwright test|run qa:routes| e2e:|run test:e2e|test:nightly-agent:(?:normalize|publish-status))/.test(
                  line
                ) &&
                !/playwright install/.test(line) &&
                (!line.includes('test:nightly-agent:normalize') ||
                  stepName === 'Normalize unit telemetry')
            )
            .map(line => ({ block, line }));
        });
      expect(producers, file).toHaveLength(count);
      for (const { block, line } of producers) {
        const exception =
          (file === 'canary-health-gate.yml' &&
            line.includes('BASE_URL="https://staging.jov.ie"')) ||
          file === 'screenshots.yml';
        if (!exception)
          expect(block, `${file}:${line}`).toContain(
            'guard-playwright-artifacts.mjs'
          );
      }
    }
    for (const file of ['agent-tick.yml', 'synthetic-monitoring.yml']) {
      const doppler = readFileSync(join(workflowsRoot, file), 'utf8')
        .split('\n')
        .filter(line => line.includes('doppler run --'));
      expect(doppler).toHaveLength(7);
      const guarded = doppler.filter(line => line.includes(guardScriptName));
      expect(guarded).toHaveLength(6);
      expect(
        guarded.every(line =>
          line.includes(
            'doppler run -- node .github/scripts/guard-playwright-artifacts.mjs --run -- pnpm'
          )
        )
      ).toBe(true);
      expect(doppler.filter(line => !line.includes(guardScriptName))).toEqual([
        expect.stringContaining('scripts/check-signup-readiness.ts'),
      ]);
    }
    const screenshots = readFileSync(
      join(workflowsRoot, 'screenshots.yml'),
      'utf8'
    );
    const screenshotJob = jobBlock(screenshots, 'generate');
    const screenshotCapture = stepBlock(
      screenshots,
      'Capture screenshot catalog'
    );
    const screenshotStart = stepBlock(screenshots, 'Start production server');
    const screenshotStop = stepBlock(screenshots, 'Stop production server');
    const screenshotIntegrity = stepBlock(
      screenshots,
      'Verify screenshot catalog integrity and budgets'
    );
    const screenshotDiff = stepBlock(screenshots, 'Check for changes');
    const screenshotToken = stepBlock(screenshots, 'Generate Jovie Bot token');
    const screenshotPush = stepBlock(
      screenshots,
      'Create or update screenshot PR'
    );
    expect(screenshotJob).not.toBe('');
    expect(screenshotCapture).not.toBe('');
    expect(screenshotJob).toMatch(
      /- uses: actions\/checkout@[a-f0-9]+[\s\S]*?persist-credentials: false/
    );
    expect(screenshotJob.indexOf('actions/checkout@')).toBeLessThan(
      screenshotJob.indexOf(screenshotCapture)
    );
    const screenshotWorkflowEnv = yamlPropertyBlock(screenshots, 'env', 0);
    const screenshotJobEnv = yamlPropertyBlock(screenshotJob, 'env', 4);
    const screenshotCaptureEnv = yamlPropertyBlock(screenshotCapture, 'env', 8);
    expect(screenshotWorkflowEnv).toBe('');
    expect(screenshotCaptureEnv).not.toBe('');
    expect(
      secretReferenceViolations(
        screenshotWorkflowEnv,
        screenshotJobEnv,
        screenshotCapture
      )
    ).toEqual([]);
    expect(screenshotCapture).not.toContain('JOVIE_BOT_PRIVATE_KEY');
    expect(screenshots.match(/JOVIE_BOT_PRIVATE_KEY/g)).toHaveLength(1);
    expect(screenshotJobEnv).not.toBe('');
    expect(screenshotJob.indexOf(screenshotJobEnv)).toBeLessThan(
      screenshotJob.indexOf('\n    steps:')
    );
    expect(screenshotJobEnv).not.toContain('${{ secrets.');
    expect(
      screenshotJobEnv
        .split('\n')
        .map(line => line.trim())
        .filter(line =>
          isCredentialBearingName(line.match(/^([A-Z0-9_]+):/)?.[1] ?? '')
        )
    ).toEqual([
      'DATABASE_URL: postgresql://localhost/noop',
      'CLERK_SECRET_KEY: sk_test_mock',
    ]);
    for (const block of [
      screenshotStart,
      screenshotCapture,
      screenshotStop,
      screenshotIntegrity,
      screenshotDiff,
      screenshotToken,
      screenshotPush,
    ])
      expect(block).not.toBe('');
    expect(screenshotJob.indexOf(screenshotCapture)).toBeLessThan(
      screenshotJob.indexOf(screenshotStop)
    );
    expect(screenshotJob.indexOf(screenshotStop)).toBeLessThan(
      screenshotJob.indexOf(screenshotIntegrity)
    );
    expect(screenshotJob.indexOf(screenshotIntegrity)).toBeLessThan(
      screenshotJob.indexOf(screenshotDiff)
    );
    expect(screenshotJob.indexOf(screenshotDiff)).toBeLessThan(
      screenshotJob.indexOf(screenshotToken)
    );
    expect(
      screenshotJob.slice(0, screenshotJob.indexOf(screenshotToken))
    ).not.toContain('${{ secrets.');
    expect(
      persistentGitCredentialViolations(
        screenshotJob.slice(0, screenshotJob.indexOf(screenshotCapture))
      )
    ).toEqual([]);
    expect(gitPushAuthViolations(screenshotPush)).toEqual([]);
    const screenshotWithWorkflowSecret =
      'env:\n  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}\n\n' + screenshots;
    expect(
      secretReferenceViolations(
        yamlPropertyBlock(screenshotWithWorkflowSecret, 'env', 0),
        yamlPropertyBlock(
          jobBlock(screenshotWithWorkflowSecret, 'generate'),
          'env',
          4
        ),
        stepBlock(screenshotWithWorkflowSecret, 'Capture screenshot catalog')
      )
    ).not.toEqual([]);

    const visual = readFileSync(
      join(workflowsRoot, 'visual-regression.yml'),
      'utf8'
    );
    const visualJob = jobBlock(visual, 'visual-regression');
    const visualResolve = stepBlock(
      visual,
      'Resolve DATABASE_URL from Neon branch (early)'
    );
    const visualExport = stepBlock(visual, 'Export DATABASE_URL');
    const visualRun = stepBlock(visual, 'Run visual regression suite');
    const visualUpload = stepBlock(
      visual,
      'Upload Playwright results on failure'
    );
    const visualToken = stepBlock(
      visual,
      'Generate Jovie Bot token (refresh only)'
    );
    const visualPush = stepBlock(
      visual,
      'Create or update baseline PR (refresh only)'
    );
    for (const block of [
      visualJob,
      visualResolve,
      visualExport,
      visualRun,
      visualUpload,
      visualToken,
      visualPush,
    ])
      expect(block).not.toBe('');
    expect(visualJob).toMatch(
      /- uses: actions\/checkout@[a-f0-9]+[\s\S]*?persist-credentials: false/
    );
    expect(visualJob.indexOf('actions/checkout@')).toBeLessThan(
      visualJob.indexOf(visualRun)
    );
    expect(visualExport).toContain(
      'DATABASE_URL=${{ steps.resolve-visual-neon-db-url-early.outputs.database_url }}'
    );
    expect(visualExport).toContain('>> "$GITHUB_ENV"');
    expect(visualRun).toContain(
      'node "$GITHUB_WORKSPACE/.github/scripts/guard-playwright-artifacts.mjs" --run --'
    );
    expect(visualRun).toContain('DATABASE_URL: ${{ env.DATABASE_URL }}');
    expect(yamlPropertyBlock(visualJob, 'env', 4)).toContain(
      "PLAYWRIGHT_ARTIFACT_ALLOW_MARKDOWN: 'true'"
    );
    expect(visualUpload).toContain("allow-markdown: 'true'");
    expect(visualJob.indexOf(visualResolve)).toBeLessThan(
      visualJob.indexOf(visualExport)
    );
    expect(visualJob.indexOf(visualExport)).toBeLessThan(
      visualJob.indexOf(visualRun)
    );
    expect(visualJob.indexOf(visualRun)).toBeLessThan(
      visualJob.indexOf(visualUpload)
    );
    expect(visualJob.indexOf(visualUpload)).toBeLessThan(
      visualJob.indexOf(visualToken)
    );
    expect(visualJob.slice(0, visualJob.indexOf(visualToken))).not.toContain(
      'JOVIE_BOT_PRIVATE_KEY'
    );
    expect(
      persistentGitCredentialViolations(
        visualJob.slice(0, visualJob.indexOf(visualRun))
      )
    ).toEqual([]);
    expect(gitPushAuthViolations(visualPush)).toEqual([]);
    for (const unsafePush of [
      'git push --force origin branch',
      'git config --global credential.helper store\ngit push origin branch',
      'git config --local http.https://github.com/.extraheader=$AUTH_HEADER\ngit push origin branch',
      'git push https://x-access-token:$GH_TOKEN@github.com/JovieInc/Jovie.git branch',
      'git -c "http.https://github.com/.extraheader=$AUTH_HEADER" push https://x-access-token:$GH_TOKEN@github.com/JovieInc/Jovie.git branch',
    ])
      expect(gitPushAuthViolations(unsafePush), unsafePush).not.toEqual([]);

    const canary = readFileSync(
      join(workflowsRoot, 'canary-health-gate.yml'),
      'utf8'
    );
    const canaryJob = jobBlock(canary, 'canary-health-gate');
    const publicAuthProbe = stepBlock(
      canary,
      'Verify public auth controls are interactive'
    );
    const productionRelease = readFileSync(
      join(workflowsRoot, 'production-release.yml'),
      'utf8'
    );
    const aliasJob = jobBlock(productionRelease, 'alias-staging');
    const productionOauthJob = jobBlock(
      productionRelease,
      'production-oauth-gate'
    );
    const oauthProbe = stepBlock(
      aliasJob,
      'Verify aliased staging OAuth redirect URIs'
    );
    expect(canaryJob).not.toBe('');
    expect(publicAuthProbe).not.toBe('');
    expect(oauthProbe).not.toBe('');
    expect(canaryJob).toMatch(
      /- uses: actions\/checkout@[a-f0-9]+[\s\S]*?persist-credentials: false/
    );
    expect(canaryJob.indexOf('actions/checkout@')).toBeLessThan(
      canaryJob.indexOf(publicAuthProbe)
    );
    const canaryWorkflowEnv = yamlPropertyBlock(canary, 'env', 0);
    const canaryJobEnv = yamlPropertyBlock(canaryJob, 'env', 4);
    expect(canaryWorkflowEnv).toBe('');
    expect(canaryJobEnv).toBe('');
    const canaryInherited = canaryWorkflowEnv + canaryJobEnv;
    expect(canaryInherited).not.toContain('${{ secrets.');
    expect(
      [...canaryInherited.matchAll(/\b([A-Z][A-Z0-9_]*)\s*(?::|=)/g)]
        .map(match => match[1])
        .filter(isCredentialBearingName)
    ).toEqual([]);
    expect(publicAuthProbe).toContain(
      'node "$GITHUB_WORKSPACE/.github/scripts/guard-playwright-artifacts.mjs" --run --'
    );
    expect(publicAuthProbe).toContain(
      'PLAYWRIGHT_VERCEL_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}'
    );
    expect(publicAuthProbe).not.toContain('$GITHUB_ENV');
    expect(canaryJob).not.toContain('oauth-providers.spec.ts');
    expect(aliasJob.indexOf('Prove staging alias owns')).toBeLessThan(
      aliasJob.indexOf(oauthProbe)
    );
    expect(oauthProbe).toContain('oauth-providers.spec.ts');
    expect(oauthProbe).toContain(
      'PLAYWRIGHT_VERCEL_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}'
    );
    expect(oauthProbe).toContain("PLAYWRIGHT_ARTIFACT_ALLOW_MARKDOWN: 'true'");
    expect(productionOauthJob).toContain(
      "PLAYWRIGHT_ARTIFACT_ALLOW_MARKDOWN: 'true'"
    );
    expect(
      productionRelease.match(/PLAYWRIGHT_ARTIFACT_ALLOW_MARKDOWN: 'true'/g)
    ).toHaveLength(2);
    const action = readFileSync(
      join(githubRoot, 'actions/upload-safe-playwright-artifact/action.yml'),
      'utf8'
    );
    expect(action).toMatch(/pending[\s\S]*blocked[\s\S]*current/);
    expect(action).toContain('path: ${{ steps.guard.outputs.path }}');
    expect(action).not.toContain('path: ${{ inputs.path }}');
    expect(action).toContain('echo "$artifact_stage/"');
    expect(action).not.toContain('${path#!}');
    expect(action).toContain('include-hidden-files: true');
    expect(action).toContain(
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'
    );
    expect(
      readFileSync(join(workflowsRoot, 'eval-real-model.yml'), 'utf8')
    ).not.toContain('upload-safe-playwright-artifact');
    const nightly = readFileSync(
      join(workflowsRoot, 'nightly-tests.yml'),
      'utf8'
    );
    const chaosSweep = stepBlock(nightly, 'Run full surface chaos sweep');
    const chaosUpload = stepBlock(nightly, 'Upload full surface chaos report');
    expect(chaosSweep).not.toBe('');
    expect(chaosUpload).not.toBe('');
    expect(chaosSweep).toContain(
      'guard-playwright-artifacts.mjs" --run -- bash -c'
    );
    expect(chaosSweep).toContain('status=\\$?');
    expect(chaosSweep).toContain(
      'if [ -f test-results/nightly-results.json ]; then'
    );
    expect(chaosSweep).toContain(
      'cp test-results/nightly-results.json test-results/full-surface-chaos-report.json || exit \\$?'
    );
    expect(chaosSweep).toContain('exit \\"\\$status\\"');
    expect(chaosSweep).not.toMatch(
      /if\s+\[[^\n]*\\?\$status[^\n]*(?:-eq|={1,3})\s*["']?0/
    );
    expect(
      chaosSweep.indexOf('guard-playwright-artifacts.mjs" --run -- bash -c')
    ).toBeLessThan(chaosSweep.indexOf('pnpm playwright test'));
    expect(chaosSweep.indexOf('pnpm playwright test')).toBeLessThan(
      chaosSweep.indexOf('status=\\$?')
    );
    expect(chaosSweep.indexOf('status=\\$?')).toBeLessThan(
      chaosSweep.indexOf('if [ -f test-results/nightly-results.json ]; then')
    );
    expect(
      chaosSweep.indexOf(
        'cp test-results/nightly-results.json test-results/full-surface-chaos-report.json'
      )
    ).toBeLessThan(chaosSweep.indexOf('exit \\"\\$status\\"'));
    expect(nightly.indexOf(chaosSweep)).toBeLessThan(
      nightly.indexOf(chaosUpload)
    );
    expect(stepBlock(nightly, 'Upload route QA ledger')).toMatch(
      /workflow_dispatch[\s\S]*suite != 'design-v1'[\s\S]*route-matrix\.json[\s\S]*findings-ledger\.json/
    );
    expect(chaosUpload).toMatch(
      /suite != 'design-v1'[\s\S]*hashFiles\('apps\/web\/test-results\/full-surface-chaos-report\.json'/
    );
    const nightlyAgent = readFileSync(
      join(workflowsRoot, 'nightly-testing-agent.yml'),
      'utf8'
    );
    const normalizeTelemetry = stepBlock(
      nightlyAgent,
      'Normalize unit telemetry'
    );
    const uploadTelemetry = stepBlock(
      nightlyAgent,
      'Upload deterministic telemetry'
    );
    expect(normalizeTelemetry).not.toBe('');
    expect(uploadTelemetry).not.toBe('');
    expect(normalizeTelemetry).toContain(
      'node .github/scripts/guard-playwright-artifacts.mjs --run --'
    );
    expect(normalizeTelemetry).toContain(
      'UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}'
    );
    expect(normalizeTelemetry).toContain(
      'UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}'
    );
    expect(normalizeTelemetry).toContain(
      '--out apps/web/test-results/nightly-agent/deterministic'
    );
    expect(normalizeTelemetry).toContain('--name normalized-results.json');
    expect(uploadTelemetry).toContain(
      "hashFiles('apps/web/test-results/nightly-agent/deterministic/normalized-results.json') != ''"
    );
    expect(uploadTelemetry).toContain(
      'path: apps/web/test-results/nightly-agent/deterministic/'
    );
    expect(nightlyAgent.indexOf(normalizeTelemetry)).toBeLessThan(
      nightlyAgent.indexOf(uploadTelemetry)
    );
    const publishReport = stepBlock(
      nightlyAgent,
      'Publish daily report and ops status'
    );
    const commitReport = stepBlock(
      nightlyAgent,
      'Commit daily report when changed'
    );
    const uploadReport = stepBlock(nightlyAgent, 'Upload final report');
    const reportJob = jobBlock(nightlyAgent, 'report');
    for (const block of [publishReport, commitReport, uploadReport, reportJob])
      expect(block).not.toBe('');
    const reportPaths = [
      'apps/web/test-results/nightly-agent/nightly-report.md',
      'apps/web/test-results/nightly-agent/skill-delta.json',
      'docs/NIGHTLY_TESTING_AGENT_REPORT.md',
      'apps/web/reports/nightly-agent/last-run.json',
    ];
    expect(publishReport).toContain(
      'node .github/scripts/guard-playwright-artifacts.mjs --run --'
    );
    expect(publishReport).toContain(
      'UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}'
    );
    expect(publishReport).toContain(
      'UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}'
    );
    expect(publishReport).toContain(
      "PLAYWRIGHT_ARTIFACT_ALLOW_MARKDOWN: 'true'"
    );
    for (const path of reportPaths) {
      expect(publishReport, path).toContain(path);
      expect(uploadReport, path).toContain(path);
      expect(uploadReport, path).toContain(`hashFiles('${path}') != ''`);
    }
    expect(nightlyAgent.indexOf(publishReport)).toBeLessThan(
      nightlyAgent.indexOf(stepBlock(nightlyAgent, 'Add report to job summary'))
    );
    expect(nightlyAgent.indexOf(publishReport)).toBeLessThan(
      nightlyAgent.indexOf(commitReport)
    );
    expect(nightlyAgent.indexOf(publishReport)).toBeLessThan(
      nightlyAgent.indexOf(uploadReport)
    );
    expect(commitReport).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(commitReport).not.toContain('$GITHUB_ENV');
    expect(hasCommandScopedGitAuth(commitReport, 'pull')).toBe(true);
    expect(hasCommandScopedGitAuth(commitReport, 'push')).toBe(true);
    expect(persistentGitCredentialViolations(commitReport)).toEqual([]);
    expect(
      persistentGitCredentialViolations(
        reportJob.slice(0, reportJob.indexOf(publishReport))
      )
    ).toEqual([]);
    expect(readFileSync(guardScript, 'utf8')).toContain(
      "binding() + '|' + stageName + '\\n'"
    );
  });

  it('detects structured, attachment, labeled, and exact environment secrets', () => {
    const cases = [
      [
        '{"errors":[{"message":"exact-secret"}],"stdout":"exact-secret"}',
        { E2E_CLERK_USER_PASSWORD: 'exact-secret' },
        true,
      ],
      ['{"headers":[["authorization","Bearer fake-value"]]}', {}, true],
      ['{"tokenCount":123,"tokensUsed":7}', {}, false],
      ['Authorization: Bearer fake-value', {}, true],
      ['DATABASE_URL=[REDACTED]', {}, false],
      ['postgresql://user:fake-password@example.test/db', {}, true], // trufflehog:ignore
    ] as const;
    for (const [text, environment, unsafe] of cases)
      expect(artifactContainsSecret(text, environment), text).toBe(unsafe);
    const attachment = (type: string, body: string) =>
      JSON.stringify({
        attachments: [{ name: 'diagnostics', contentType: type, body }],
      });
    expect(
      artifactContainsSecret(
        attachment(
          'application/json',
          Buffer.from('{"password":"fake"}').toString('base64')
        ),
        {}
      )
    ).toBe(true);
    expect(
      artifactContainsSecret(attachment('application/json', 'not-base64!'), {})
    ).toBe(true);
    expect(
      artifactContainsSecret(attachment('application/octet-stream', 'AA=='), {})
    ).toBe(true);
    expect(
      artifactContainsSecret(
        attachment(
          'application/json',
          Buffer.from('{"password":"[REDACTED]"}').toString('base64')
        ),
        {}
      )
    ).toBe(false);
    for (const name of [
      'AWS_SECRET_ACCESS_KEY',
      'DOPPLER_TOKEN_PRD',
      'DATABASE_URL_MAIN',
      'E2E_CLERK_USER_PASSWORD_TEST',
      'CLERK_SECRET_KEY_STG',
      'SLACK_WEBHOOK_URL',
      'VERCEL_PRODUCTION_DEPLOY_HOOK',
      'GBRAIN_CONNECTION',
      'MAC_CERTIFICATE_BASE64',
      'UNSPLASH_ACCESS_KEY',
      'APPLE_WALLET_SIGNER_KEY_PASSPHRASE',
      'APPLE_WALLET_SIGNER_KEY_PEM',
      'METADATA_HASH_KEY',
      'DEPLOY_CAPABILITY_URL',
      'CSC_LINK',
      'GITLEAKS_LICENSE',
      'E2E_PROD_USER_EMAIL',
      'E2E_PROD_USER_CODE',
      'E2E_PROD_SIGNUP_EMAIL_BASE',
      'E2E_CLERK_USER_USERNAME',
      'E2E_CLERK_ADMIN_USERNAME',
      'E2E_ADMIN_CLERK_USER_USERNAME',
      'TWILIO_API_KEY_SECRET',
      'TWILIO_AUTH_TOKEN_SECONDARY',
      'SENTRY_DSN',
      'CLOUDINARY_API_SECRET',
    ])
      expect(isCredentialBearingName(name), name).toBe(true);
    for (const name of [
      'tokenCount',
      'tokenizer',
      'tokensUsed',
      'APPLE_API_KEY_ID',
      'UNSPLASH_ACCESS_KEY_ID',
      'APPLE_WALLET_SIGNER_KEY_ID',
      'MATCH_GIT_PRIVATE_KEY_ID',
      'METADATA_HASH_KEY_ID',
      'VERCEL_PRODUCTION_DEPLOY_HOOK_ID',
      'SPOTIFY_CLIENT_ID',
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'UPSTASH_REDIS_REST_URL',
      'BASE_URL',
      'DB_CONNECTION_POOL_SIZE',
      'CERTIFICATE_PATH',
      'DEPLOYMENT_URL_B64',
      'HAS_MAC_SIGNING_CREDENTIALS',
      'HAS_APPLE_API_CREDENTIALS',
      'CREDENTIAL_SOURCE',
      'TEST_AVATAR_PNG_BASE64',
      'PUBLIC_PAYLOAD_BASE64',
      'E2E_CLERK_USER_ID',
      'E2E_ADMIN_CLERK_USER_ID',
      'JOVIE_SYSTEM_CLERK_USER_ID',
      'DEMO_CLERK_USER_ID',
      'ACCOUNT_ID',
      'PROJECT_ID',
      'TWILIO_API_KEY_SID',
      'TWILIO_AUTH_TOKEN_SECONDARY_EXPIRES_AT',
      'NEXT_PUBLIC_SENTRY_DSN',
      'NEXT_PUBLIC_SENTRY_DSN_DEV',
      'CLOUDINARY_API_KEY',
    ])
      expect(isCredentialBearingName(name), name).toBe(false);
    const policy = fixture();
    write(join(policy, 'broken.jsonl'), '{"event":"failure"');
    write(join(policy, 'safe.md'), '# Safe diagnostics');
    write(join(policy, 'credential.md'), 'DATABASE_URL=fake-password');
    write(join(policy, 'artifact.bin'), 'opaque');
    for (const extension of 'avi har html mkv mov mp4 webm zip'.split(' '))
      write(join(policy, `artifact.${extension}`), 'unsafe');
    const findings = inspectPlaywrightArtifacts(
      [policy],
      {},
      { workspace: policy }
    );
    expect(
      findings.filter(item => item.category === 'forbidden-container')
    ).toHaveLength(8);
    expect(findings).toContainEqual({
      path: join(policy, 'broken.jsonl'),
      category: 'malformed-structured-text',
    });
    expect(findings).toContainEqual({
      path: join(policy, 'artifact.bin'),
      category: 'unknown-binary',
    });
    expect(
      inspectPlaywrightArtifacts(['safe.md'], {}, { workspace: policy })
    ).toHaveLength(1);
    expect(
      inspectPlaywrightArtifacts(
        ['safe.md'],
        {},
        { workspace: policy, allowMarkdown: true }
      )
    ).toEqual([]);
    expect(
      inspectPlaywrightArtifacts(
        ['credential.md'],
        {},
        { workspace: policy, allowMarkdown: true }
      )
    ).toContainEqual({
      path: join(policy, 'credential.md'),
      category: 'credential-text',
    });
  });

  it('accepts only decoded metadata-free Playwright PNG bytes', () => {
    const valid = png();
    expect(validPlaywrightPng(valid)).toBe(true);
    expect(validPlaywrightPng(png([], undefined, 6))).toBe(true);
    const badCrc = Buffer.from(valid);
    badCrc[badCrc.length - 1] ^= 1;
    const invalid = [
      Buffer.from('renamed plaintext'),
      ...['tEXt', 'zTXt', 'iTXt', 'eXIf', 'vpAg', 'ABCD'].map(type =>
        png([chunk(type, Buffer.from('metadata'))])
      ),
      Buffer.concat([valid, Buffer.from('trailing')]),
      badCrc,
      Buffer.concat([
        pngSignature,
        chunk('IDAT', deflateSync(pngRows)),
        chunk('IEND'),
      ]),
      png([], Buffer.from('not-zlib')),
      png([], Buffer.concat([deflateSync(pngRows), Buffer.from('hidden')])),
      png([], deflateSync(Buffer.from([5, 0, 0, 0]))),
      png([], deflateSync(Buffer.from([0, 0]))),
      png([], undefined, 3),
    ];
    for (const value of invalid) expect(validPlaywrightPng(value)).toBe(false);
    const workspace = fixture();
    write(join(workspace, 'valid.png'), valid);
    write(join(workspace, 'fake.png'), invalid[0]);
    expect(
      guardPlaywrightArtifacts(
        ['valid.png'],
        {},
        { workspace, allowImages: true }
      )
    ).toEqual([]);
    expect(
      guardPlaywrightArtifacts(['valid.png'], {}, { workspace })
    ).toHaveLength(1);
    expect(
      guardPlaywrightArtifacts(
        ['fake.png'],
        {},
        { workspace, allowImages: true }
      )
    ).toHaveLength(1);
    const comparison = fixture('.artifact-comparison-', webRoot);
    const comparisonConfig = join(comparison, 'playwright.config.ts');
    const comparisonSpec = join(comparison, 'comparison.spec.ts');
    write(
      comparisonConfig,
      "import{defineConfig}from'@playwright/test';export default defineConfig({testDir:'.',outputDir:'test-results',snapshotPathTemplate:'snapshots/{arg}{ext}',reporter:'line',use:{trace:'off',video:'off',screenshot:'off',viewport:{width:16,height:16}}})"
    );
    const comparisonSource = (color: string) =>
      `import{expect,test}from'@playwright/test';test('comparison',async({page})=>{await page.setContent('<style>html,body{margin:0;width:16px;height:16px;background:${color}}</style>');await expect(page).toHaveScreenshot('comparison.png',{animations:'disabled'})})`;
    write(comparisonSpec, comparisonSource('#000'));
    const runComparison = (update = false) =>
      spawnSync(
        'pnpm',
        [
          'exec',
          'playwright',
          'test',
          '--config',
          comparisonConfig,
          ...(update ? ['--update-snapshots'] : []),
        ],
        { cwd: webRoot, encoding: 'utf8', timeout: 90_000 }
      );
    const baseline = runComparison(true);
    expect(baseline.status, `${baseline.stdout}\n${baseline.stderr}`).toBe(0);
    write(comparisonSpec, comparisonSource('#fff'));
    const mismatch = runComparison();
    expect(mismatch.status, `${mismatch.stdout}\n${mismatch.stderr}`).toBe(1);
    const differences = globSync('test-results/**/*-diff.png', {
      cwd: comparison,
    });
    expect(differences).toHaveLength(1);
    const difference = readFileSync(join(comparison, differences[0]));
    expect(difference[25]).toBe(6);
    expect(validPlaywrightPng(difference)).toBe(true);
    expect(
      guardPlaywrightArtifacts(
        [differences[0]],
        {},
        { workspace: comparison, allowImages: true }
      )
    ).toEqual([]);
  }, 90_000);

  it('rejects outside, symlinked, and non-regular artifact paths', () => {
    const workspace = fixture();
    const outside = fixture();
    write(join(workspace, 'real', 'safe.json'), '{"ok":true}');
    write(join(outside, 'outside.json'), '{"ok":true}');
    symlinkSync(
      join(workspace, 'real', 'safe.json'),
      join(workspace, 'final.json')
    );
    symlinkSync(join(workspace, 'real'), join(workspace, 'alias'));
    const rootAlias = join(fixture(), 'workspace');
    symlinkSync(workspace, rootAlias);
    const fifo = join(workspace, 'pipe.json');
    expect(spawnSync('mkfifo', [fifo]).status).toBe(0);
    for (const path of [
      'final.json',
      'alias/safe.json',
      fifo,
      'missing/*.json',
      join(outside, 'outside.json'),
      '../outside-missing/*.json',
    ])
      expect(() => resolveArtifactFiles([path], workspace), path).toThrow();
    expect(() => resolveArtifactFiles(['real/safe.json'], rootAlias)).toThrow();
  });

  it('masks before the child, scans after failure, and permanently poisons leaks', () => {
    const workspace = fixture();
    const runner = fixture();
    const secret = 'mask%value\r\nnext-line';
    const leaking =
      "const f=require('node:fs');f.mkdirSync('out',{recursive:true});f.writeFileSync('out/report.json',JSON.stringify({errors:[{message:process.env.E2E_CLERK_USER_PASSWORD}],stdout:process.env.E2E_CLERK_USER_PASSWORD}));console.log('CHILD_SENTINEL')";
    const result = runChild(workspace, runner, leaking, {
      E2E_CLERK_USER_PASSWORD: secret,
    });
    expect(result.status).toBe(1);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(
      output.indexOf('::add-mask::mask%25value%0D%0Anext-line')
    ).toBeLessThan(output.indexOf('CHILD_SENTINEL'));
    expect(output).not.toContain('E2E_CLERK_USER_PASSWORD');
    expect(output).not.toContain(secret);
    const root = join(runner, 'safe-playwright-producer');
    expect(existsSync(join(root, 'blocked'))).toBe(true);
    expect(existsSync(join(root, 'pending'))).toBe(true);
    expect(
      runChild(
        workspace,
        runner,
        "require('node:fs').writeFileSync('child-ran','1')"
      ).status
    ).toBe(1);
    expect(existsSync(join(workspace, 'child-ran'))).toBe(false);
    for (const [name, value] of [
      ['SLACK_WEBHOOK_URL', 'https://hooks.example/%2Fsecret'],
      ['VERCEL_PRODUCTION_DEPLOY_HOOK', 'https://deploy.example/%2Fhook'],
      ['GBRAIN_CONNECTION', 'capability%2Fconnection'],
      ['MAC_CERTIFICATE_BASE64', 'certificate%2Fpayload'],
      ['UNSPLASH_ACCESS_KEY', 'access%2Fkey'],
      ['APPLE_WALLET_SIGNER_KEY_PASSPHRASE', 'pass%2Fphrase'],
      ['APPLE_WALLET_SIGNER_KEY_PEM', 'pem%2Fpayload'],
      ['METADATA_HASH_KEY', 'hash%2Fkey'],
      ['DEPLOY_CAPABILITY_URL', 'capability%2Furl'],
      ['CSC_LINK', 'csc%2Flink'],
      ['GITLEAKS_LICENSE', 'license%2Fvalue'],
      ['E2E_PROD_USER_EMAIL', 'standing%2Femail'],
      ['E2E_PROD_USER_CODE', '867%2F530'],
      ['E2E_PROD_SIGNUP_EMAIL_BASE', 'signup%2Fmailbox'],
      ['E2E_CLERK_USER_USERNAME', 'clerk%2Fusername'],
      ['E2E_CLERK_ADMIN_USERNAME', 'admin%2Fusername'],
      ['E2E_ADMIN_CLERK_USER_USERNAME', 'admin-clerk%2Fusername'],
    ]) {
      const categoryWorkspace = fixture();
      const category = runChild(
        categoryWorkspace,
        fixture(),
        `const f=require('node:fs');f.mkdirSync('out',{recursive:true});f.writeFileSync('out/result.json',JSON.stringify({stdout:process.env[${JSON.stringify(name)}]}));console.log('CATEGORY_CHILD')`,
        { [name]: value }
      );
      expect(category.status, name).toBe(1);
      const categoryOutput = `${category.stdout}\n${category.stderr}`;
      expect(
        categoryOutput.indexOf(`::add-mask::${value.replace('%', '%25')}`)
      ).toBeLessThan(categoryOutput.indexOf('CATEGORY_CHILD'));
      expect(categoryOutput).not.toContain(name);
      expect(categoryOutput).not.toContain(value);
    }
    for (const [value, allowed] of [
      ['a', false],
      ['ab', false],
      ['abc', false],
      ['abc ', true],
      ['', true],
      ['   ', true],
      ['***', true],
      ['[REDACTED]', true],
    ] as const) {
      const shortWorkspace = fixture();
      const short = runChild(
        shortWorkspace,
        fixture(),
        "const f=require('node:fs');f.mkdirSync('out',{recursive:true});f.writeFileSync('out/result.json','{}')",
        { FLAGS_SECRET: value }
      );
      expect(short.status, JSON.stringify(value)).toBe(allowed ? 0 : 1);
      if (!allowed)
        expect(existsSync(join(shortWorkspace, 'out/result.json'))).toBe(false);
      if (value === 'abc ')
        expect(short.stdout).toContain('::add-mask::abc \n');
      const directWorkspace = fixture();
      write(join(directWorkspace, 'out/report.json'), '{}');
      const direct = spawnSync(
        process.execPath,
        [guardScript, 'out/report.json'],
        {
          cwd: directWorkspace,
          encoding: 'utf8',
          env: baseEnv(directWorkspace, fixture(), { FLAGS_SECRET: value }),
        }
      );
      expect(direct.status, `direct ${JSON.stringify(value)}`).toBe(
        allowed ? 0 : 1
      );
      const directOutput = `${direct.stdout}\n${direct.stderr}`;
      expect(directOutput).not.toContain('FLAGS_SECRET');
      expect(directOutput).toContain(
        allowed ? 'secret guard passed' : 'inspection-error'
      );
    }
    for (const name of [
      'CSC_LINK',
      'GITLEAKS_LICENSE',
      'E2E_PROD_SIGNUP_EMAIL_BASE',
    ]) {
      const shortWorkspace = fixture();
      expect(
        runChild(
          shortWorkspace,
          fixture(),
          "require('node:fs').writeFileSync('child-ran','1')",
          { [name]: 'abc' }
        ).status
      ).toBe(1);
      expect(existsSync(join(shortWorkspace, 'child-ran'))).toBe(false);
    }
  }, 20_000);

  it('publishes safe nonzero output, immutable unions, and producer image policy', () => {
    const workspace = fixture();
    const runner = fixture();
    const first = runChild(
      workspace,
      runner,
      "const f=require('node:fs');f.mkdirSync('out',{recursive:true});f.writeFileSync('out/a.json','{\"a\":1}');f.writeFileSync('out/shared.json','{\"v\":1}');process.exit(23)"
    );
    expect(first.status).toBe(23);
    const stage1 = currentStage(runner);
    expect(stage1.pointer.endsWith('\n')).toBe(true);
    expect(readFileSync(join(stage1.stage, 'out/a.json'), 'utf8')).toBe(
      '{"a":1}'
    );
    expect(fileMode(join(stage1.stage, 'out/a.json'))).toBe(0o400);
    expect(fileMode(stage1.stage)).toBe(0o500);
    expect(existsSync(join(stage1.root, 'pending'))).toBe(false);
    const defaultWorkspace = fixture();
    const defaultRunner = fixture();
    const defaultEnv = baseEnv(defaultWorkspace, defaultRunner);
    delete (defaultEnv as Record<string, unknown>).PLAYWRIGHT_ARTIFACT_PATHS;
    const emptyRun = spawnSync(
      process.execPath,
      [guardScript, '--run', '--', process.execPath, '-e', ''],
      { cwd: defaultWorkspace, encoding: 'utf8', env: defaultEnv }
    );
    expect(emptyRun.status).toBe(0);
    expect(readdirSync(currentStage(defaultRunner).stage)).toEqual([]);
    const missingUpload = spawnSync(
      process.execPath,
      [guardScript, 'apps/web/missing-artifact'],
      {
        cwd: defaultWorkspace,
        encoding: 'utf8',
        env: {
          ...defaultEnv,
          PLAYWRIGHT_ARTIFACT_STAGE_DIR: join(defaultRunner, 'missing-stage'),
        },
      }
    );
    expect(missingUpload.status).toBe(1);
    const excludedWorkspace = fixture();
    const excludedRunner = fixture();
    const excluded = runChild(
      excludedWorkspace,
      excludedRunner,
      "const f=require('node:fs');f.mkdirSync('out',{recursive:true});f.writeFileSync('out/result.json','{}')",
      { PLAYWRIGHT_ARTIFACT_PATHS: 'out\n!out/**' }
    );
    expect(excluded.status).toBe(1);
    expect(
      existsSync(join(excludedRunner, 'safe-playwright-producer/blocked'))
    ).toBe(true);
    const defaultRun = spawnSync(
      process.execPath,
      [
        guardScript,
        '--run',
        '--',
        process.execPath,
        '-e',
        "const f=require('node:fs');f.mkdirSync('apps/web/test-results',{recursive:true});f.writeFileSync('apps/web/test-results/result.json','{}')",
      ],
      { cwd: defaultWorkspace, encoding: 'utf8', env: defaultEnv }
    );
    expect(defaultRun.status).toBe(0);
    const second = runChild(
      workspace,
      runner,
      "const f=require('node:fs');f.writeFileSync('out/b.json','{\"b\":2}');f.writeFileSync('out/shared.json','{\"v\":2}')"
    );
    expect(second.status).toBe(0);
    const stage2 = currentStage(runner).stage;
    expect(readFileSync(join(stage2, 'out/a.json'), 'utf8')).toBe('{"a":1}');
    expect(readFileSync(join(stage2, 'out/shared.json'), 'utf8')).toBe(
      '{"v":2}'
    );
    expect(readFileSync(join(stage1.stage, 'out/shared.json'), 'utf8')).toBe(
      '{"v":1}'
    );
    write(join(workspace, 'out/a.json'), '{"mutated":true}');
    expect(readFileSync(join(stage2, 'out/a.json'), 'utf8')).toBe('{"a":1}');
    const layoutWorkspace = fixture();
    write(join(layoutWorkspace, 'directory/.last-run.json'), '{"ok":true}');
    write(join(layoutWorkspace, 'directory/nested/result.json'), '{}');
    write(join(layoutWorkspace, 'file/report.json'), '{"kind":"file"}');
    write(join(layoutWorkspace, 'glob/a.json'), '{"kind":"a"}');
    write(join(layoutWorkspace, 'glob/b.json'), '{"kind":"b"}');
    write(join(layoutWorkspace, 'multi/left/a.json'), '{"side":"left"}');
    write(join(layoutWorkspace, 'multi/right/b.json'), '{"side":"right"}');
    write(join(layoutWorkspace, 'elsewhere/ignored.json'), '{}');
    const stageLayout = (name: string, paths: string[]) => {
      const runner = fixture();
      const stage = join(runner, name);
      const result = spawnSync(process.execPath, [guardScript, ...paths], {
        cwd: layoutWorkspace,
        encoding: 'utf8',
        env: baseEnv(layoutWorkspace, runner, {
          PLAYWRIGHT_ARTIFACT_STAGE_DIR: stage,
        }),
      });
      expect(result.status, `${name}: ${result.stdout}\n${result.stderr}`).toBe(
        0
      );
      return stage;
    };
    const directoryStage = stageLayout('directory-stage', ['directory/']);
    expect(readdirSync(directoryStage).sort()).toEqual([
      '.last-run.json',
      'nested',
    ]);
    expect(readFileSync(join(directoryStage, '.last-run.json'), 'utf8')).toBe(
      '{"ok":true}'
    );
    const fileStage = stageLayout('file-stage', [
      'file/report.json',
      '!elsewhere/ignored.json',
    ]);
    expect(readdirSync(fileStage)).toEqual(['report.json']);
    const globStage = stageLayout('glob-stage', ['glob/*.json']);
    expect(readdirSync(globStage).sort()).toEqual(['a.json', 'b.json']);
    const multiStage = stageLayout('multi-stage', [
      'multi/left/a.json',
      'multi/right/b.json',
    ]);
    expect(readFileSync(join(multiStage, 'left/a.json'), 'utf8')).toBe(
      '{"side":"left"}'
    );
    expect(readFileSync(join(multiStage, 'right/b.json'), 'utf8')).toBe(
      '{"side":"right"}'
    );
    const reportWorkspace = fixture();
    const reportRunner = fixture();
    const reportPaths = [
      'apps/web/test-results/nightly-agent/nightly-report.md',
      'apps/web/test-results/nightly-agent/skill-delta.json',
      'docs/NIGHTLY_TESTING_AGENT_REPORT.md',
      'apps/web/reports/nightly-agent/last-run.json',
    ];
    const reportContents = Object.fromEntries(
      reportPaths.map((path, index) => [
        path,
        path.endsWith('.md') ? `# original ${index}` : `{"original":${index}}`,
      ])
    );
    const reportProducer = runChild(
      reportWorkspace,
      reportRunner,
      `const f=require('node:fs'),p=require('node:path'),v=${JSON.stringify(reportContents)};for(const [n,c] of Object.entries(v)){f.mkdirSync(p.dirname(n),{recursive:true});f.writeFileSync(n,c)}`,
      {
        PLAYWRIGHT_ARTIFACT_PATHS: reportPaths.join('\n'),
        PLAYWRIGHT_ARTIFACT_ALLOW_MARKDOWN: 'true',
      }
    );
    expect(
      reportProducer.status,
      `${reportProducer.stdout}\n${reportProducer.stderr}`
    ).toBe(0);
    const immutableReport = currentStage(reportRunner).stage;
    for (const path of reportPaths)
      write(join(reportWorkspace, path), 'changed');
    const reportUploadRunner = fixture();
    const reportUploadStage = join(reportUploadRunner, 'report-upload');
    const reportUpload = spawnSync(
      process.execPath,
      [guardScript, ...reportPaths],
      {
        cwd: immutableReport,
        encoding: 'utf8',
        env: baseEnv(immutableReport, reportUploadRunner, {
          PLAYWRIGHT_ARTIFACT_ALLOW_MARKDOWN: 'true',
          PLAYWRIGHT_ARTIFACT_STAGE_DIR: reportUploadStage,
        }),
      }
    );
    expect(
      reportUpload.status,
      `${reportUpload.stdout}\n${reportUpload.stderr}`
    ).toBe(0);
    for (const [path, contents] of Object.entries(reportContents))
      expect(readFileSync(join(reportUploadStage, path), 'utf8'), path).toBe(
        contents
      );
    const traversalWorkspace = fixture();
    const traversalRunner = fixture();
    const traversalStage = join(traversalRunner, 'upload-stage');
    write(join(traversalWorkspace, 'out/safe.json'), '{"safe":true}');
    write(
      join(traversalWorkspace, 'out/.last-run.json'),
      '{"status":"passed"}'
    );
    const traversal = spawnSync(
      process.execPath,
      [guardScript, 'out/nested/../safe.json', 'out/.last-run.json'],
      {
        cwd: traversalWorkspace,
        encoding: 'utf8',
        env: baseEnv(traversalWorkspace, traversalRunner, {
          PLAYWRIGHT_ARTIFACT_STAGE_DIR: traversalStage,
        }),
      }
    );
    expect(traversal.status).toBe(0);
    expect(readFileSync(join(traversalStage, 'safe.json'), 'utf8')).toBe(
      '{"safe":true}'
    );
    expect(readFileSync(join(traversalStage, '.last-run.json'), 'utf8')).toBe(
      '{"status":"passed"}'
    );
    write(join(traversalWorkspace, 'out/safe.json'), '{"mutated":true}');
    expect(readFileSync(join(traversalStage, 'safe.json'), 'utf8')).toBe(
      '{"safe":true}'
    );
    write(
      join(traversalWorkspace, 'out/.credentials.json'),
      '{"password":"hidden-secret"}'
    );
    expect(
      spawnSync(process.execPath, [guardScript, 'out'], {
        cwd: traversalWorkspace,
        encoding: 'utf8',
        env: baseEnv(traversalWorkspace, fixture()),
      }).status
    ).toBe(1);
    const collisionWorkspace = fixture();
    const collisionRunner = fixture();
    expect(
      runChild(
        collisionWorkspace,
        collisionRunner,
        "const f=require('node:fs');f.mkdirSync('out',{recursive:true});f.writeFileSync('out/foo.json','{}')"
      ).status
    ).toBe(0);
    expect(
      runChild(
        collisionWorkspace,
        collisionRunner,
        "const f=require('node:fs');f.rmSync('out/foo.json');f.mkdirSync('out/foo.json');f.writeFileSync('out/foo.json/bar.json','{}')"
      ).status
    ).toBe(1);
    expect(
      existsSync(join(collisionRunner, 'safe-playwright-producer/blocked'))
    ).toBe(true);

    const imageWorkspace = fixture();
    const imageChild = `const f=require('node:fs');f.mkdirSync('out',{recursive:true});f.writeFileSync('out/shot.png',Buffer.from('${png().toString('base64')}','base64'))`;
    const omittedRunner = fixture();
    expect(runChild(imageWorkspace, omittedRunner, imageChild).status).toBe(0);
    expect(
      existsSync(join(currentStage(omittedRunner).stage, 'out/shot.png'))
    ).toBe(false);
    expect(runChild(imageWorkspace, omittedRunner, imageChild).status).toBe(0);
    const allowedRunner = fixture();
    expect(
      runChild(imageWorkspace, allowedRunner, imageChild, {
        PLAYWRIGHT_ARTIFACT_ALLOW_IMAGES: 'true',
      }).status
    ).toBe(0);
    expect(
      readFileSync(join(currentStage(allowedRunner).stage, 'out/shot.png'))
    ).toEqual(png());
    expect(
      runChild(
        imageWorkspace,
        allowedRunner,
        "require('node:fs').writeFileSync('out/result.json','{\"next\":true}')"
      ).status
    ).toBe(0);
    expect(
      existsSync(join(currentStage(allowedRunner).stage, 'out/shot.png'))
    ).toBe(false);
    expect(
      runChild(
        fixture(),
        fixture(),
        "const f=require('node:fs');f.mkdirSync('out',{recursive:true});f.writeFileSync('out/shot.png','fake')"
      ).status
    ).toBe(1);
    expect(
      runChild(fixture(), fixture(), imageChild, {
        E2E_CLERK_USER_PASSWORD: 'IHDR',
      }).status
    ).toBe(1);
  }, 30_000);

  it('fails stale, pending, and missing producer state closed', () => {
    for (const state of ['pending', 'stale']) {
      const workspace = fixture();
      const runner = fixture();
      const root = join(runner, 'safe-playwright-producer');
      mkdirSync(join(root, 'stage-1-1'), { recursive: true });
      write(
        join(root, state === 'pending' ? 'pending' : 'current'),
        state === 'pending' ? 'old' : 'other:1:job|stage-1-1\n'
      );
      expect(
        runChild(
          workspace,
          runner,
          "require('node:fs').writeFileSync('ran','1')"
        ).status
      ).toBe(1);
      expect(existsSync(join(root, 'blocked'))).toBe(true);
      expect(existsSync(join(workspace, 'ran'))).toBe(false);
    }
    const action = readFileSync(
      join(githubRoot, 'actions/upload-safe-playwright-artifact/action.yml'),
      'utf8'
    );
    expect(action).toMatch(/\[\[ -f "\$producer_root\/current"/);
    expect(action).toMatch(/\[\[ -d "\$source_root"/);
  });

  it('scans dynamically returned browser cookies and deletes their receipt', () => {
    const workspace = fixture();
    const runner = fixture();
    const receipt = join(runner, 'dynamic-cookie-values');
    const dynamicCookie = 'runtime-cookie-value';
    const leaking = `const f=require('node:fs');f.writeFileSync(process.env.PLAYWRIGHT_DYNAMIC_SECRETS_FILE,'${dynamicCookie}\\n',{mode:0o600});f.mkdirSync('out',{recursive:true});f.writeFileSync('out/report.json',JSON.stringify({diagnostic:'${dynamicCookie}'}))`;

    const result = runChild(workspace, runner, leaking, {
      PLAYWRIGHT_DYNAMIC_SECRETS_FILE: receipt,
    });

    expect(result.status).toBe(1);
    expect(existsSync(receipt)).toBe(false);
    expect(`${result.stdout}\n${result.stderr}`).toContain('credential-text:1');
    expect(
      existsSync(join(runner, 'safe-playwright-producer', 'blocked'))
    ).toBe(true);
  });

  it('fails closed when an unknown dynamic cookie value is shorter than four characters', () => {
    const workspace = fixture();
    const runner = fixture();
    const receipt = join(runner, 'dynamic-cookie-values');
    const child = `const f=require('node:fs');f.writeFileSync(process.env.PLAYWRIGHT_DYNAMIC_SECRETS_FILE,'xyz\\n',{mode:0o600});f.mkdirSync('out',{recursive:true});f.writeFileSync('out/report.json','{}')`;

    const result = runChild(workspace, runner, child, {
      PLAYWRIGHT_DYNAMIC_SECRETS_FILE: receipt,
    });

    expect(result.status).toBe(1);
    expect(existsSync(receipt)).toBe(false);
    expect(`${result.stdout}\\n${result.stderr}`).toContain(
      'categories=inspection-error:1'
    );
    expect(
      existsSync(join(runner, 'safe-playwright-producer', 'blocked'))
    ).toBe(true);
  });

  it('rejects a dynamic cookie receipt that is not mode 0600', () => {
    const workspace = fixture();
    const runner = fixture();
    const receipt = join(runner, 'dynamic-cookie-values');
    const child = `const f=require('node:fs');f.writeFileSync(process.env.PLAYWRIGHT_DYNAMIC_SECRETS_FILE,'runtime-cookie-value\\n',{mode:0o644});f.chmodSync(process.env.PLAYWRIGHT_DYNAMIC_SECRETS_FILE,0o644);f.mkdirSync('out',{recursive:true});f.writeFileSync('out/report.json','{}')`;

    const result = runChild(workspace, runner, child, {
      PLAYWRIGHT_DYNAMIC_SECRETS_FILE: receipt,
    });

    expect(result.status).toBe(1);
    expect(existsSync(receipt)).toBe(false);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'categories=inspection-error:1'
    );
    expect(
      existsSync(join(runner, 'safe-playwright-producer', 'blocked'))
    ).toBe(true);
  });
});
