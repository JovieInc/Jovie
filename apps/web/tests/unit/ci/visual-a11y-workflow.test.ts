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

    expect(prReadyJob).not.toMatch(/ci-a11y|ci-layout-guard|ci-build-layout/);
    expect(mergeReadyJob).toContain('ci-build-layout');
    expect(mergeReadyJob).toContain(
      'BUILD_LAYOUT_RESULT="${{ needs.ci-build-layout.result }}"'
    );
    expect(buildLayoutJob).toContain('runs-on: ubuntu-latest');
    expect(buildLayoutJob).toContain('Build exact combined head');
    expect(buildLayoutJob).toContain('Run deterministic layout behavior guard');
  });

  it('keeps visual compare informational while refresh remains self-healing', () => {
    const workflow = readFileSync(visualRegressionWorkflowPath, 'utf8');
    const visualJob = getJobBlock(workflow, 'visual-regression');
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
    expect(visualJob).toContain('BRANCH="visual-baselines/auto-update"');
    expect(visualJob).toContain('gh pr create');
    expect(visualJob).toContain('- name: Cleanup Neon branch');
    expect(visualJob).toContain('if: always()');
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
