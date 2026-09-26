import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(repoRoot, '.github/workflows/ci.yml');
const visualRegressionWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/visual-regression.yml'
);
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

function getJobBlock(workflow: string, jobKey: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobKey}:`);

  expect(start, `Missing workflow job: ${jobKey}`).toBeGreaterThanOrEqual(0);

  const block: string[] = [];

  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!;

    if (index > start && /^  [a-zA-Z0-9_-]+:/.test(line)) break;

    block.push(line);
  }

  return block.join('\n');
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
  it('keeps source PR Ready fast and moves layout integration to merge_group', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const prReadyJob = getJobBlock(workflow, 'ci-pr-ready');
    const mergeReadyJob = getJobBlock(workflow, 'ci-merge-group-ready');
    const buildLayoutJob = getJobBlock(workflow, 'ci-build-layout');

    expect(prReadyJob).not.toMatch(
      /ci-a11y|ci-layout-guard|ci-build-layout|ci-build-ovie|ci-storybook-surfaces/
    );
    expect(mergeReadyJob).toContain('ci-build-layout');
    expect(mergeReadyJob).toContain(
      'BUILD_LAYOUT_RESULT="${{ needs.ci-build-layout.result }}"'
    );
    expect(mergeReadyJob).toContain(
      'OVIE_BUILD_RESULT="${{ needs.ci-build-ovie.result }}"'
    );
    expect(mergeReadyJob).toContain(
      'STORYBOOK_SURFACES_RESULT="${{ needs.ci-storybook-surfaces.result }}"'
    );
    expect(buildLayoutJob).toContain('runs-on: ubuntu-latest');
    expect(buildLayoutJob).toContain('Build exact combined head');
    expect(buildLayoutJob).toContain('Run deterministic layout behavior guard');
  });

  it('runs the combined Storybook surface matrix on two workers of a 4-vCPU hosted runner', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const storybookJob = getJobBlock(workflow, 'ci-storybook-surfaces');
    const storybookConfig = readFileSync(
      resolve(repoRoot, 'apps/web/playwright.config.storybook.ts'),
      'utf8'
    );

    // Public-repo ubuntu-latest has 4 vCPU: one Vite dev server plus two
    // Chromium workers. The specs write only per-test evidence names and
    // compare (never update) committed baselines, so workers stay isolated.
    expect(storybookJob).toContain('runs-on: ubuntu-latest');
    expect(storybookJob).toMatch(
      /--config=playwright\.config\.storybook\.ts --project=chromium --reporter=line \\\n\s+--workers=2\n/
    );
    expect(storybookJob).not.toContain('--update-snapshots');
    expect(storybookJob).not.toMatch(/--retries|--repeat-each|--shard/);
    // The config keeps its CI retry budget and one-worker default for every
    // other Storybook lane; only this lane opts into two workers.
    expect(storybookConfig).toContain('fullyParallel: true');
    expect(storybookConfig).toContain('retries: isCI ? 2 : 0');
    expect(storybookConfig).toContain('workers: isCI ? 1 : undefined');
  });

  it('boots the combined Storybook server ahead of independent setup and still gates on it', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const storybookJob = getJobBlock(workflow, 'ci-storybook-surfaces');
    const startAt = storybookJob.indexOf('- name: Start Storybook dev server');
    const checksAt = storybookJob.indexOf(
      '- name: Check extension and observability ingest'
    );
    const playwrightAt = storybookJob.indexOf(
      '- name: Setup Playwright (Chromium)'
    );
    const matrixAt = storybookJob.indexOf(
      '- name: Run surface elevation matrix (Storybook)'
    );
    const start = storybookJob.slice(startAt, checksAt);
    const matrix = storybookJob.slice(matrixAt);

    // The server boots first so its startup and Vite dependency bundling
    // overlap the independent checks and browser setup.
    expect(startAt).toBeGreaterThanOrEqual(0);
    expect(startAt).toBeLessThan(checksAt);
    expect(checksAt).toBeLessThan(playwrightAt);
    expect(playwrightAt).toBeLessThan(matrixAt);
    // Same server config as before the move: the manual axe suite drops the
    // automatic a11y addon server-side, so the start step must carry it.
    expect(start).toContain("JOVIE_STORYBOOK_MANUAL_AXE: '1'");
    expect(start).toContain('pnpm exec storybook dev -p 6006 --no-open');
    // Detached output goes to a file, never the finished step's stdout.
    expect(start).toContain('> "$RUNNER_TEMP/storybook-dev.log" 2>&1 &');
    expect(start).toContain('echo "STORYBOOK_PID=$!" >> "$GITHUB_ENV"');
    // The matrix fails closed without the server, on its death, and on a
    // readiness timeout, then prints its log and stops it.
    expect(matrix).not.toContain('storybook dev');
    expect(matrix).toContain(
      ': "${STORYBOOK_PID:?Storybook dev server was not started}"'
    );
    expect(matrix).toContain('kill -0 "$STORYBOOK_PID"');
    expect(matrix).toContain('echo "::error::Storybook dev server died"');
    expect(matrix).toContain(
      'echo "::error::Storybook dev server failed to start within 300s"'
    );
    expect(matrix).toContain('cat "$RUNNER_TEMP/storybook-dev.log"');
  });

  it('keeps refresh self-healing and makes missing-baseline compare fail-closed', () => {
    const workflow = readFileSync(visualRegressionWorkflowPath, 'utf8');
    const ciWorkflow = readFileSync(workflowPath, 'utf8');
    const visualJob = getJobBlock(workflow, 'visual-regression');
    const compareJob = getJobBlock(ciWorkflow, 'ci-visual-snapshot-compare');
    const mergeReadyJob = getJobBlock(ciWorkflow, 'ci-merge-group-ready');
    const prReadyJob = getJobBlock(ciWorkflow, 'ci-pr-ready');
    const loopbackHostnamePin = visualJob.indexOf('export HOSTNAME=localhost');
    const standaloneServerStart = visualJob.indexOf(
      'PORT=3100 node .next/standalone/apps/web/server.js'
    );

    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*merge_group:/m);
    expect(workflow).toMatch(/^\s*schedule:/m);
    expect(workflow).toMatch(/^\s*workflow_dispatch:/m);
    expect(workflow).toContain('Scheduled/manual deep evidence only');
    expect(workflow).not.toContain('Informational on PRs');
    expect(visualJob).not.toContain('continue-on-error:');
    expect(loopbackHostnamePin).toBeGreaterThanOrEqual(0);
    expect(loopbackHostnamePin).toBeLessThan(standaloneServerStart);
    expect(visualJob).toContain('--update-snapshots');
    expect(visualJob).toContain('if [ "$REFRESH_MODE" = "true" ]');
    expect(visualJob).toContain('BRANCH="visual-baselines/auto-update"');
    expect(visualJob).toContain('gh pr create');
    expect(visualJob).toContain('- name: Cleanup Neon branch');
    expect(visualJob).toContain('if: always()');

    expect(compareJob).toContain("github.event_name == 'merge_group'");
    expect(compareJob).toContain(
      'node scripts/visual-snapshot-compare.mjs compare'
    );
    expect(compareJob).not.toContain('--update-snapshots');
    expect(compareJob).not.toContain('continue-on-error');
    expect(compareJob).not.toContain('neon-create-branch');
    // Restore-only cache: read it, never persist or save it.
    expect(compareJob).toContain("TURBO_ENGINE_READ_ONLY: '1'");
    expect(compareJob).not.toContain('actions/cache/save@');
    expect(mergeReadyJob).toContain('ci-visual-snapshot-compare');
    expect(mergeReadyJob).toContain(
      'VISUAL_COMPARE_RESULT="${{ needs.ci-visual-snapshot-compare.result }}"'
    );
    // JOV-5960: homepage PRs carry the compare on the source lane too, and a
    // skipped compare is not green there.
    expect(compareJob).toContain(
      "needs.ci-path-changes.outputs.run_homepage_visual == 'true'"
    );
    expect(prReadyJob).toContain('ci-visual-snapshot-compare');
    expect(prReadyJob).toContain(
      'RUN_HOMEPAGE_VISUAL="${{ needs.ci-path-changes.outputs.run_homepage_visual }}"'
    );
    expect(prReadyJob).toContain(
      'VISUAL_COMPARE_RESULT="${{ needs.ci-visual-snapshot-compare.result }}"'
    );
    expect(prReadyJob).toContain('skipped is not green (JOV-5960)');
  });

  it('warms the homepage compare build from the trusted main Turbopack cache read-only', () => {
    const compareJob = getJobBlock(
      readFileSync(workflowPath, 'utf8'),
      'ci-visual-snapshot-compare'
    );
    const stepAt = (name: string) =>
      compareJob.indexOf(`      - name: ${name}\n`);
    const step = (name: string) => {
      const start = stepAt(name);
      expect(start, name).toBeGreaterThan(-1);
      const next = compareJob.indexOf('\n      - ', start + 1);
      return compareJob.slice(start, next === -1 ? undefined : next);
    };
    const restore = step('Restore Next build cache (read-only)');
    const homepageGate =
      "if: needs.ci-path-changes.outputs.run_homepage_visual == 'true'";

    expect(stepAt('Restore Next build cache (read-only)')).toBeLessThan(
      stepAt('Build homepage for rendered snapshot compare')
    );
    expect(step('Resolve Next build cache hour')).toContain(homepageGate);
    expect(restore).toContain(homepageGate);
    expect(restore).toContain('uses: actions/cache/restore@');
    expect(restore).toContain('path: apps/web/.next/cache/turbopack');
    // Same key family Build + Layout writes from push-to-main only.
    expect(restore).toContain(
      "key: ${{ runner.os }}-next-build-web-v1-${{ hashFiles('pnpm-lock.yaml', 'apps/web/package.json', 'apps/web/next.config.js') }}-${{ steps.next-build-cache-hour.outputs.hour }}"
    );
    expect(restore).toMatch(/^\s+\$\{\{ runner\.os \}\}-next-build-web-v1-$/m);

    // PR-controlled code never writes the cache, and only compiler state is
    // restored: no fetch/image cache and no build output.
    expect(compareJob).not.toContain('actions/cache/save@');
    expect(compareJob).not.toContain('uses: actions/cache@');
    expect(compareJob).not.toMatch(/path: apps\/web\/\.next\/cache\s*$/m);
    expect(compareJob).not.toContain('pull_request_target');
    expect(compareJob).not.toContain('secrets.');
  });

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

  it('preserves authenticated axe diagnostics when Playwright fails', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const authenticatedA11yJob = getJobBlock(workflow, 'ci-a11y-authed');

    expect(authenticatedA11yJob).not.toContain('--reporter=line');
    expect(authenticatedA11yJob).toContain(
      'uses: ./.github/actions/upload-safe-playwright-artifact'
    );
    expect(authenticatedA11yJob).toContain('path: |');
    // HTML playwright-report can embed webServer.env secrets — upload
    // only sanitized test-results via the safe artifact action.
    expect(authenticatedA11yJob).not.toContain('apps/web/playwright-report/');
    expect(authenticatedA11yJob).toContain('apps/web/test-results/');
    expect(authenticatedA11yJob).toContain('if-no-files-found: error');
  });

  it('stages only structured public axe diagnostics without masking failures', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const publicA11yJob = getJobBlock(workflow, 'ci-a11y');

    expect(publicA11yJob).toContain(
      'PLAYWRIGHT_ARTIFACT_PATHS: apps/web/test-results/**/*.json'
    );
    expect(publicA11yJob).toContain(
      'PLAYWRIGHT_JSON_OUTPUT_FILE: test-results/axe-a11y-results.json'
    );
    expect(publicA11yJob).toContain(
      'guard-playwright-artifacts.mjs" --run -- pnpm exec playwright test'
    );
    expect(publicA11yJob).toContain('--reporter=line,json');
    expect(publicA11yJob).toContain('path: apps/web/test-results/**/*.json');
    expect(publicA11yJob).not.toContain('continue-on-error');
    expect(publicA11yJob).not.toContain('.md');
    expect(publicA11yJob).not.toContain('.png');
    expect(publicA11yJob).not.toContain('PLAYWRIGHT_ARTIFACT_ALLOW_MARKDOWN');
    expect(publicA11yJob).not.toContain('PLAYWRIGHT_ARTIFACT_ALLOW_IMAGES');
  });
});
