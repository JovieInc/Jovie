import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

// JOV-7707: workflow contracts here read parsed YAML and execute the shipped
// step shell with stubbed tools; PR/merge-group gate aggregation is covered by
// ready-gates.test.ts.

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
};
type Job = {
  'runs-on'?: unknown;
  if?: string;
  env?: Record<string, unknown>;
  'continue-on-error'?: unknown;
  steps: Step[];
};
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job> };

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const loadWorkflow = (name: string) =>
  parseYaml(
    readFileSync(resolve(repoRoot, '.github/workflows', name), 'utf8')
  ) as Workflow;
const ci = loadWorkflow('ci.yml');
const chatVisualSpecPath = resolve(
  repoRoot,
  'apps/web/tests/e2e/chat-visual.spec.ts'
);
const visualRegressionSpecPath = resolve(
  repoRoot,
  'apps/web/tests/e2e/visual-regression.spec.ts'
);
const authVisualSpecPath = resolve(
  repoRoot,
  'apps/web/tests/e2e/auth-visual.spec.ts'
);
const newLandingSpecPath = resolve(
  repoRoot,
  'apps/web/tests/e2e/new-landing.spec.ts'
);
const newLandingSnapshotDir = resolve(
  repoRoot,
  'apps/web/tests/e2e/__snapshots__/new-landing.spec.ts'
);
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function job(id: string): Job {
  const found = ci.jobs[id];
  expect(found, `missing job ${id}`).toBeDefined();
  return found as Job;
}

function step(owner: Job, name: string) {
  const index = owner.steps.findIndex(entry => entry.name === name);
  expect(index, `missing step ${name}`).toBeGreaterThanOrEqual(0);
  return { index, step: owner.steps[index] as Step };
}

// Runs a step's shell in a temp workspace with stub tools on PATH. Each stub
// appends its argv to calls.log; `stubs` maps a tool to extra shell.
function runStep(
  run: string,
  stubs: Record<string, string>,
  env: Record<string, string> = {}
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jovie-step-')));
  roots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  mkdirSync(join(root, 'apps/web'), { recursive: true });
  for (const [tool, body] of Object.entries(stubs))
    writeFileSync(
      join(bin, tool),
      `#!/bin/bash\necho "${tool} $*" >> "${root}/calls.log"\n${body}\n`,
      { mode: 0o755 }
    );
  const result = spawnSync('bash', ['-c', run], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      HOME: root,
      RUNNER_TEMP: root,
      GITHUB_WORKSPACE: root,
      GITHUB_ENV: join(root, 'github-env'),
      NODE_ENV: 'test',
      ...env,
    },
  });
  const calls = existsSync(join(root, 'calls.log'))
    ? readFileSync(join(root, 'calls.log'), 'utf8')
    : '';
  return { ...result, calls, root };
}

function getPageScopedLocatorCalls(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    'chat-visual.spec.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const calls: string[] = [];

  function getPageMethod(expression: ts.LeftHandSideExpression): string | null {
    if (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'page'
    ) {
      return expression.name.text;
    }

    if (
      ts.isElementAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'page'
    ) {
      return expression.argumentExpression &&
        ts.isStringLiteralLike(expression.argumentExpression)
        ? expression.argumentExpression.text
        : '<computed>';
    }

    return null;
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const method = getPageMethod(node.expression);

      if (
        method === '<computed>' ||
        method === 'locator' ||
        method?.startsWith('getBy') ||
        (method !== null && /^\$\$?$/.test(method))
      ) {
        const firstArgument = node.arguments[0]?.getText(sourceFile) ?? '';
        calls.push(`${method}:${firstArgument}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

function getScreenshotArguments(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    'visual-spec.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const argumentsFound: string[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'toHaveScreenshot'
    ) {
      argumentsFound.push(node.arguments[0]?.getText(sourceFile) ?? '');
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return argumentsFound;
}

describe('CI accessibility and visual gate contracts (JOV-4060)', () => {
  it('runs build + layout on hosted capacity for combined heads and main only', () => {
    const buildLayout = job('ci-build-layout');
    expect(buildLayout['runs-on']).toBe('ubuntu-latest');
    for (const name of [
      'Build exact combined head',
      'Run deterministic layout behavior guard',
    ])
      step(buildLayout, name);
    expect(buildLayout.if).toContain("github.event_name == 'merge_group'");
    expect(buildLayout.if).not.toContain("github.event_name == 'pull_request'");
  });

  it('runs the Storybook matrix on two workers of a hosted runner', () => {
    const storybook = job('ci-storybook-surfaces');
    expect(storybook['runs-on']).toBe('ubuntu-latest');
    const matrix = step(storybook, 'Run surface elevation matrix (Storybook)');
    const command = String(matrix.step.run).replace(/\s*\\\n\s*/g, ' ');
    expect(command).toMatch(
      /--config=playwright\.config\.storybook\.ts --project=chromium --reporter=line --workers=2/
    );
    expect(command).not.toMatch(
      /--update-snapshots|--retries|--repeat-each|--shard/
    );
    const config = readFileSync(
      resolve(repoRoot, 'apps/web/playwright.config.storybook.ts'),
      'utf8'
    );
    expect(config).toContain('retries: isCI ? 2 : 0');
    expect(config).toContain('workers: isCI ? 1 : undefined');
  });

  it('boots Storybook ahead of setup, then gates the matrix on a live server', () => {
    const storybook = job('ci-storybook-surfaces');
    const start = step(storybook, 'Start Storybook dev server');
    const checks = step(storybook, 'Check extension and observability ingest');
    const playwright = step(storybook, 'Setup Playwright (Chromium)');
    const matrix = step(storybook, 'Run surface elevation matrix (Storybook)');
    expect(
      [start, checks, playwright, matrix].map(entry => entry.index)
    ).toEqual(
      [start.index, checks.index, playwright.index, matrix.index].sort(
        (a, b) => a - b
      )
    );
    expect(start.step.env?.JOVIE_STORYBOOK_MANUAL_AXE).toBe('1');
    expect(matrix.step.env?.JOVIE_STORYBOOK_MANUAL_AXE).toBe('1');

    // Start: the server is detached, logged to a file, and its pid exported.
    const started = runStep(String(start.step.run), {
      pnpm: 'echo storybook-output; sleep 0',
    });
    expect(started.status, started.stderr).toBe(0);
    expect(readFileSync(join(started.root, 'github-env'), 'utf8')).toMatch(
      /^STORYBOOK_PID=\d+$/m
    );

    const matrixRun = String(matrix.step.run);
    const stubs = {
      curl: 'exit 0',
      node: 'exit 0',
      sleep: 'exit 0',
    };
    const missing = runStep(matrixRun, stubs);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('Storybook dev server was not started');

    const dead = runStep(matrixRun, stubs, { STORYBOOK_PID: '999999' });
    expect(dead.status).toBe(1);
    expect(dead.stdout).toContain('::error::Storybook dev server died');
    expect(dead.calls).not.toContain('node ');

    const live = spawnSync(
      'bash',
      ['-c', 'sleep 30 >/dev/null 2>&1 & echo $!'],
      {
        encoding: 'utf8',
      }
    );
    const pid = live.stdout.trim();
    const ready = runStep(matrixRun, stubs, { STORYBOOK_PID: pid });
    expect(ready.status, ready.stderr).toBe(0);
    expect(ready.calls).toMatch(
      /node .*guard-playwright-artifacts\.mjs --run -- pnpm exec playwright test/
    );
    // The EXIT trap stops the server and prints its log.
    expect(spawnSync('kill', ['-0', pid]).status).not.toBe(0);
    expect(ready.stdout).toContain('Storybook dev server log');

    const neverReady = runStep(
      matrixRun,
      { ...stubs, curl: 'exit 7' },
      {
        STORYBOOK_PID: spawnSync(
          'bash',
          ['-c', 'sleep 30 >/dev/null 2>&1 & echo $!'],
          { encoding: 'utf8' }
        ).stdout.trim(),
      }
    );
    expect(neverReady.status).toBe(1);
    expect(neverReady.stdout).toContain('failed to start within 300s');
    // Spawns the shipped shell with stub tools several times.
  }, 60_000);

  it('keeps scheduled visual refresh self-healing and the compare fail-closed', () => {
    const visualRegression = loadWorkflow('visual-regression.yml');
    expect(Object.keys(visualRegression.on).sort()).toEqual([
      'schedule',
      'workflow_dispatch',
    ]);
    const refresh = visualRegression.jobs['visual-regression'] as Job;
    expect(refresh['continue-on-error']).toBeUndefined();
    expect(step(refresh, 'Cleanup Neon branch').step.if).toBe('always()');
    expect(
      step(refresh, 'Create or update baseline PR (refresh only)').step.if
    ).toContain("env.REFRESH_MODE == 'true'");

    const compare = job('ci-visual-snapshot-compare');
    expect(compare['continue-on-error']).toBeUndefined();
    expect(compare.if).toContain("github.event_name == 'merge_group'");
    expect(compare.if).toContain(
      "needs.ci-path-changes.outputs.run_homepage_visual == 'true'"
    );
    const runs = compare.steps.map(entry => entry.run ?? '').join('\n');
    expect(runs).not.toContain('--update-snapshots');
    expect(JSON.stringify(compare)).not.toContain('neon-create-branch');
    expect(
      step(compare, 'Build homepage for rendered snapshot compare').step.env
        ?.TURBO_ENGINE_READ_ONLY
    ).toBe('1');
  });

  it('warms the compare build from the trusted main cache, read-only and secret-free', () => {
    const compare = job('ci-visual-snapshot-compare');
    const restore = step(compare, 'Restore Next build cache (read-only)');
    const build = step(compare, 'Build homepage for rendered snapshot compare');
    expect(restore.index).toBeLessThan(build.index);
    expect(restore.step.uses).toMatch(/^actions\/cache\/restore@/);
    expect(restore.step.with?.path).toBe('apps/web/.next/cache/turbopack');
    // Same key family Build + Layout saves from push-to-main only.
    const layoutSave = job('ci-build-layout').steps.find(entry =>
      /^actions\/cache\/restore@/.test(entry.uses ?? '')
    );
    expect(restore.step.with?.key).toBe(layoutSave?.with?.key);
    expect(
      compare.steps.filter(entry =>
        /^actions\/cache(?:\/save)?@/.test(entry.uses ?? '')
      )
    ).toEqual([]);
    expect(JSON.stringify(compare)).not.toContain('secrets.');
  });

  it('serves the compare build where its public URLs point', () => {
    const compare = job('ci-visual-snapshot-compare');
    const build = step(compare, 'Build homepage for rendered snapshot compare');
    const render = step(compare, 'Render and compare homepage snapshots');
    const origin = 'http://localhost:3230';
    for (const entry of [build.step, render.step])
      expect(entry.env).toMatchObject({
        NEXT_PUBLIC_APP_URL: origin,
        NEXT_PUBLIC_BETTER_AUTH_URL: origin,
      });
    expect(build.step.env).not.toHaveProperty('DATABASE_URL');
    expect(build.step.env).not.toHaveProperty('VERCEL_ENV');
    expect(build.step.env).toMatchObject({
      NEXT_DISABLE_TOOLBAR: '1',
      NEXT_PUBLIC_E2E_MODE: '1',
    });
    expect(render.step.env?.BASE_URL).toBe(origin);

    const stubs = {
      // The server stub records its bind env, then signals readiness.
      node: 'if [ "$1" = .next/standalone/apps/web/server.js ]; then echo "server PORT=$PORT HOSTNAME=$HOSTNAME" >> calls.log; touch server-started; fi',
      // The readiness probe answers only once the server has started.
      curl: 'for _ in $(seq 1 200); do [ -f server-started ] && exit 0; /bin/sleep 0.05; done; exit 7',
      sleep: 'exit 0',
    };
    const prepared = (extra: Record<string, string>) => {
      const result = runStep(
        `mkdir -p apps/web/.next/standalone/apps/web && touch apps/web/.next/standalone/apps/web/server.js\n${render.step.run}`,
        { ...stubs, ...extra }
      );
      return result;
    };
    const served = prepared({});
    expect(served.status, served.stderr).toBe(0);
    expect(served.calls).toContain('curl -sf http://localhost:3230');
    expect(served.calls).toMatch(
      /guard-playwright-artifacts\.mjs --run -- pnpm exec playwright test tests\/e2e\/visual-regression\.spec\.ts .*--grep homepage/
    );
    expect(
      readFileSync(join(served.root, 'apps/web/calls.log'), 'utf8')
    ).toContain('server PORT=3230 HOSTNAME=localhost');
    const unready = prepared({ curl: 'exit 7' });
    expect(unready.status).toBe(1);
    expect(unready.calls).not.toContain('playwright test');
    // Spawns the shipped shell with stub tools several times.
  }, 60_000);

  it('scopes chat visual interactions to the active visible composer', () => {
    const chatVisualSpec = readFileSync(chatVisualSpecPath, 'utf8');

    expect(getPageScopedLocatorCalls(chatVisualSpec)).toEqual([
      'locator:COMPOSER_SURFACE',
      'locator:SLASH_MENU',
    ]);
    expect(
      getPageScopedLocatorCalls(
        "page.getByLabel /* duplicate-sensitive */ ('Chat Message Input')"
      )
    ).toEqual(["getByLabel:'Chat Message Input'"]);
    expect(
      getPageScopedLocatorCalls("page['getByLabel']('Chat Message Input')")
    ).toEqual(["getByLabel:'Chat Message Input'"]);
    expect(getPageScopedLocatorCalls('page[method](selector)')).toEqual([
      '<computed>:selector',
    ]);
    expect(chatVisualSpec).toContain('.filter({ visible: true })');
    expect(chatVisualSpec).toContain('surface.locator(COMPOSER_TEXTAREA)');
    expect(chatVisualSpec).toContain('page.locator(SLASH_MENU)');
    expect(
      chatVisualSpec.match(/getVisibleComposerSurface\(page\)/g)
    ).toHaveLength(4);
  });

  it('keeps auth screenshot baseline ownership non-overlapping', () => {
    const visualRegressionSpec = readFileSync(visualRegressionSpecPath, 'utf8');
    const authVisualSpec = readFileSync(authVisualSpecPath, 'utf8');
    const newLandingSpec = readFileSync(newLandingSpecPath, 'utf8');

    expect(
      getScreenshotArguments(visualRegressionSpec).filter(argument =>
        /signin|signup|route\.slice/.test(argument)
      )
    ).toEqual(['`${route.slice(1)}-dark.png`']);
    expect(visualRegressionSpec).toContain(
      "test.describe('JOV-2081: Viewport matrix — /sign-up'"
    );
    expect(visualRegressionSpec).toContain(
      "test.describe('JOV-2081: Viewport matrix — /sign-in'"
    );
    expect(visualRegressionSpec).toContain('assertNoHorizontalScroll');
    expect(visualRegressionSpec).toContain('assertPrimaryCtaVisible');
    expect(authVisualSpec).toContain('modal-signin-${bp.name}.png');
    expect(authVisualSpec).toContain('modal-signup-${bp.name}.png');
    expect(authVisualSpec).toContain('signin-page-${bp.name}.png');
    expect(authVisualSpec).toContain('signup-page-${bp.name}.png');
    expect(authVisualSpec).toContain(
      'async function neutralizeAuthScreenshotPointer'
    );
    expect(authVisualSpec).toContain('await page.mouse.move(0, 0);');

    const authScreenshotSegments = authVisualSpec.split(
      'await expect(page).toHaveScreenshot'
    );
    expect(authScreenshotSegments).toHaveLength(5);
    for (const segmentBeforeScreenshot of authScreenshotSegments.slice(0, -1)) {
      expect(segmentBeforeScreenshot.trimEnd()).toMatch(
        /await neutralizeAuthScreenshotPointer\(page\);$/
      );
    }
    expect(getScreenshotArguments(newLandingSpec)).toEqual([]);
    expect(
      existsSync(resolve(newLandingSnapshotDir, 'landing-hero-mobile.png'))
    ).toBe(false);
    expect(
      existsSync(resolve(newLandingSnapshotDir, 'landing-release-section.png'))
    ).toBe(false);
  });

  it('uploads only sanitized authenticated axe diagnostics on failure', () => {
    const authed = job('ci-a11y-authed');
    const upload = step(authed, 'Upload Playwright Report on Failure').step;
    expect(upload.uses).toBe(
      './.github/actions/upload-safe-playwright-artifact'
    );
    expect(String(upload.with?.path).trim()).toBe('apps/web/test-results/');
    expect(upload.with?.['if-no-files-found']).toBe('error');
    const runs = authed.steps.map(entry => entry.run ?? '').join('\n');
    expect(runs).not.toContain('--reporter=line ');
    expect(runs).not.toContain('playwright-report');
  });

  it('stages only structured public axe JSON without masking failures', () => {
    const publicA11y = job('ci-a11y');
    expect(publicA11y.env).toMatchObject({
      PLAYWRIGHT_ARTIFACT_PATHS: 'apps/web/test-results/**/*.json',
      PLAYWRIGHT_JSON_OUTPUT_FILE: 'test-results/axe-a11y-results.json',
    });
    const audit = step(publicA11y, 'Run axe a11y audit (public routes)').step;
    expect(String(audit.run).replace(/\s*\\\n\s*/g, ' ')).toMatch(
      /guard-playwright-artifacts\.mjs" --run -- pnpm exec playwright test .*--reporter=line,json/
    );
    expect(
      step(publicA11y, 'Upload Playwright Report on Failure').step.with?.path
    ).toBe('apps/web/test-results/**/*.json');
    const serialized = JSON.stringify(publicA11y);
    expect(serialized).not.toContain('continue-on-error');
    expect(serialized).not.toContain('PLAYWRIGHT_ARTIFACT_ALLOW_MARKDOWN');
    expect(serialized).not.toContain('PLAYWRIGHT_ARTIFACT_ALLOW_IMAGES');
  });
});
