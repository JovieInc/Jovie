import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  auditUiStoryCoverage,
  classifyUiPath,
  resolveUiStoryCoverageMode,
  validateUiStoryCoveragePolicy,
} from '../../../../../scripts/ui-story-coverage-policy.mjs';
import { getPublicSurfaceManifestForRuntimeSync } from '../../e2e/utils/public-surface-manifest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../../../../..');
const webWorkspace = resolve(repositoryRoot, 'apps/web');

describe('visual CI harness', () => {
  it('keeps the Chromatic config reachable from the filtered web workspace', () => {
    const configPath = resolve(webWorkspace, '../../chromatic.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      onlyChanged?: boolean;
      projectId?: string;
      zip?: boolean;
    };

    expect(configPath).toBe(resolve(repositoryRoot, 'chromatic.config.json'));
    expect(config).toEqual({
      onlyChanged: true,
      projectId: 'Project:68a7da03dd53297b6349f724',
      zip: true,
    });
  });

  it('keeps database-backed redirects out of DB-free visual smoke', () => {
    const withoutDatabase = getPublicSurfaceManifestForRuntimeSync({
      database: false,
    }).map(surface => surface.id);
    const withDatabase = getPublicSurfaceManifestForRuntimeSync({
      database: true,
    }).map(surface => surface.id);

    expect(withoutDatabase).not.toContain('profile-shop');
    expect(withoutDatabase).not.toContain('profile-claim');
    expect(withDatabase).toContain('profile-shop');
    expect(withDatabase).toContain('profile-claim');
  });

  it('keeps the new coverage gate forward-only during baseline audit', () => {
    const policy = JSON.parse(
      readFileSync(
        resolve(repositoryRoot, '.github/ui-story-coverage-policy.json'),
        'utf8'
      )
    );

    expect(validateUiStoryCoveragePolicy(policy)).toEqual(policy);
    expect(
      resolveUiStoryCoverageMode({
        policy,
        pullRequestNumber: 99_999,
        openedAt: '2026-07-27T00:00:00Z',
      })
    ).toBe('audit');
    expect(classifyUiPath('apps/web/lib/backend-only.ts')).toBeNull();
    expect(classifyUiPath('apps/web/components/example/NewCard.tsx')).toBe(
      'component'
    );

    const workflow = readFileSync(
      resolve(repositoryRoot, '.github/workflows/ui-story-coverage-audit.yml'),
      'utf8'
    );
    expect(workflow).toContain(
      'Initial UI coverage rollout must bootstrap in audit mode.'
    );
    expect(workflow).toContain(
      'Base UI coverage policy is only partially installed.'
    );
  });

  it('reports missing UI evidence without hiding harness defects', () => {
    const result = auditUiStoryCoverage({
      root: repositoryRoot,
      changedFiles: ['apps/web/components/example/NewCard.tsx'],
    });

    expect(result.applicable).toBe(true);
    expect(result.clean).toBe(false);
    expect(result.issues).toContainEqual({
      path: 'apps/web/components/example/NewCard.tsx',
      reason: 'changed reusable UI component has no adjacent Storybook story',
    });
  });

  it('rejects blocking rollout without five authoritative clean runs', () => {
    expect(() =>
      validateUiStoryCoveragePolicy({
        schemaVersion: 1,
        owner: 'Gem',
        mode: 'blocking',
        cleanBaselineRunsRequired: 5,
        verifiedCleanRunIds: [1, 2, 3, 4],
        blockingAfter: '2026-07-27T00:00:00Z',
        minimumPullRequestNumber: 15_000,
      })
    ).toThrow('five authoritative clean runs');
  });

  it('grandfathers historical PRs after a proven blocking graduation', () => {
    const policy = {
      schemaVersion: 1,
      owner: 'Gem',
      mode: 'blocking',
      cleanBaselineRunsRequired: 5,
      verifiedCleanRunIds: [101, 102, 103, 104, 105],
      blockingAfter: '2026-07-27T00:00:00Z',
      minimumPullRequestNumber: 15_000,
    };

    expect(
      resolveUiStoryCoverageMode({
        policy,
        pullRequestNumber: 14_999,
        openedAt: '2026-07-28T00:00:00Z',
      })
    ).toBe('grandfathered');
    expect(
      resolveUiStoryCoverageMode({
        policy,
        pullRequestNumber: 15_001,
        openedAt: '2026-07-26T00:00:00Z',
      })
    ).toBe('grandfathered');
    expect(
      resolveUiStoryCoverageMode({
        policy,
        pullRequestNumber: 15_001,
        openedAt: '2026-07-28T00:00:00Z',
      })
    ).toBe('blocking');
  });

  it('keeps the observation workflow outside production and merge readiness', () => {
    const workflow = readFileSync(
      resolve(repositoryRoot, '.github/workflows/ui-story-coverage-audit.yml'),
      'utf8'
    );

    expect(workflow).not.toContain('merge_group:');
    expect(workflow).not.toContain('production-controller');
    expect(workflow).toContain(
      'git show "${base}:scripts/ui-story-coverage-policy.mjs"'
    );
    expect(workflow).toContain('Upload authoritative audit report');
    expect(workflow).toContain(
      'if [ "$mode" = "blocking" ] && [ "$status" -ne 0 ]'
    );
  });

  it('does not gate homepage viewport screenshots on whole-page network idle', () => {
    const source = readFileSync(
      resolve(webWorkspace, 'tests/e2e/visual-regression.spec.ts'),
      'utf8'
    );
    const blockStart = source.indexOf(
      "test.describe('JOV-2081: Viewport matrix — homepage'"
    );
    const blockEnd = source.indexOf(
      "test.describe('JOV-2081: Viewport matrix — /sign-up'",
      blockStart
    );

    expect(blockStart).toBeGreaterThanOrEqual(0);
    expect(blockEnd).toBeGreaterThan(blockStart);

    const homepageViewportBlock = source.slice(blockStart, blockEnd);
    const screenshotStart = homepageViewportBlock.indexOf(
      'test(`homepage screenshot at ${viewport.label}px`'
    );
    const screenshotEnd = homepageViewportBlock.indexOf(
      '\n    });',
      screenshotStart
    );

    expect(screenshotStart).toBeGreaterThanOrEqual(0);
    expect(screenshotEnd).toBeGreaterThan(screenshotStart);

    const screenshotCase = homepageViewportBlock.slice(
      screenshotStart,
      screenshotEnd
    );
    expect(screenshotCase).toContain("waitUntil: 'domcontentloaded'");
    expect(screenshotCase).not.toContain("waitUntil: 'networkidle'");
    expect(screenshotCase).toContain(
      "await expect(page.locator('h1').first()).toBeVisible"
    );
  });

  it('does not gate auth modal entry navigation on whole-page network idle', () => {
    const source = readFileSync(
      resolve(webWorkspace, 'tests/e2e/auth-visual.spec.ts'),
      'utf8'
    );
    const helperStart = source.indexOf(
      'async function openInterceptedAuthModal('
    );
    const helperEnd = source.indexOf('\n// --------', helperStart);

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);

    const helper = source.slice(helperStart, helperEnd);
    const gotoStart = helper.indexOf("await page.goto('/', {");
    const gotoEnd = helper.indexOf('\n  });', gotoStart);

    expect(gotoStart).toBeGreaterThanOrEqual(0);
    expect(gotoEnd).toBeGreaterThan(gotoStart);

    const gotoCall = helper.slice(gotoStart, gotoEnd);
    expect(gotoCall).toContain("waitUntil: 'domcontentloaded'");
    expect(gotoCall).not.toContain("waitUntil: 'networkidle'");
    expect(source.match(/waitUntil: 'domcontentloaded'/g)).toHaveLength(3);
    expect(source).not.toContain("waitUntil: 'networkidle'");
    expect(helper).toContain("await page.waitForLoadState('networkidle'");
  });
});
