import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertVisualCompareWorkflowContract,
  classifyVisualSnapshotOutcome,
  expectedSnapshotDir,
  inventoryMissingBaselines,
  isMissingBaselineSignal,
  parseStaticScreenshotNames,
  runVisualSnapshotCompare,
  VISUAL_COMPARE_MODE,
  VISUAL_REFRESH_MODE,
  VISUAL_SNAPSHOT_SPECS,
} from '../visual-snapshot-compare.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

describe('visual snapshot compare (JOV-5459)', () => {
  it('treats missing baseline/ENOENT as fail in compare mode', () => {
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_COMPARE_MODE,
        error: { code: 'ENOENT', message: 'no such file' },
      })
    ).toMatchObject({ ok: false, status: 'fail', reason: 'missing-baseline' });
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_COMPARE_MODE,
        error: { message: "A snapshot doesn't exist at foo.png" },
      })
    ).toMatchObject({ ok: false, reason: 'missing-baseline' });
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_COMPARE_MODE,
        missingBaselinePaths: ['apps/web/tests/e2e/__snapshots__/missing.png'],
      })
    ).toMatchObject({ ok: false, reason: 'missing-baseline' });
  });

  it('never treats advisory success or --update-snapshots as a compare pass', () => {
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_COMPARE_MODE,
        advisory: true,
      })
    ).toMatchObject({
      ok: false,
      reason: 'compare-must-not-be-advisory',
    });
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_COMPARE_MODE,
        updateSnapshots: true,
      })
    ).toMatchObject({
      ok: false,
      reason: 'compare-must-not-update-snapshots',
    });
  });

  it('lets refresh self-heal missing baselines only with --update-snapshots', () => {
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_REFRESH_MODE,
        updateSnapshots: true,
        error: { code: 'ENOENT' },
      })
    ).toMatchObject({
      ok: true,
      status: 'refresh-update',
      reason: 'refresh-self-heal',
    });
    expect(
      classifyVisualSnapshotOutcome({
        mode: VISUAL_REFRESH_MODE,
        updateSnapshots: false,
        error: { code: 'ENOENT' },
      })
    ).toMatchObject({ ok: false, reason: 'missing-baseline' });
  });

  it('detects Playwright missing-snapshot wording as ENOENT-equivalent', () => {
    expect(
      isMissingBaselineSignal({ message: "A snapshot doesn't exist" })
    ).toBe(true);
    expect(isMissingBaselineSignal({ code: 'ENOENT' })).toBe(true);
    expect(isMissingBaselineSignal({ message: 'pixels differ' })).toBe(false);
  });

  it('inventories static toHaveScreenshot names onto the Playwright snapshot path', () => {
    expect(
      parseStaticScreenshotNames("toHaveScreenshot('composer-empty.png')")
    ).toEqual(['composer-empty.png']);
    expect(
      parseStaticScreenshotNames(
        'toHaveScreenshot(`homepage-${viewport.label}.png`)'
      )
    ).toEqual([]);
    expect(expectedSnapshotDir('apps/web/tests/e2e/chat-visual.spec.ts')).toBe(
      'apps/web/tests/e2e/__snapshots__/chat-visual.spec.ts'
    );
    const files = {
      'apps/web/tests/e2e/chat-visual.spec.ts':
        "await expect(surface).toHaveScreenshot('composer-empty.png');\n",
    };
    expect(
      inventoryMissingBaselines({
        repoRoot: '/repo',
        specs: ['apps/web/tests/e2e/chat-visual.spec.ts'],
        existsSync: path =>
          path === '/repo/apps/web/tests/e2e/chat-visual.spec.ts' ||
          path === '/repo/apps/web/tests/e2e/__snapshots__/chat-visual.spec.ts',
        readFileSync: path => files[path.replace('/repo/', '')],
      })
    ).toEqual([
      'apps/web/tests/e2e/__snapshots__/chat-visual.spec.ts/composer-empty.png',
    ]);
  });

  it('fails closed when a homepage PR could skip the compare (JOV-5960)', () => {
    const visualRegressionYaml = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/visual-regression.yml'),
      'utf8'
    );
    // Minimal split-lane fixtures: one shared build job plus three suite jobs.
    const buildJob = [
      '  ci-visual-snapshot-compare:',
      '    name: Visual Snapshot Compare',
      '    needs: [ci-path-changes]',
      "    if: github.event_name == 'merge_group'",
      '    steps:',
      '      - run: node scripts/visual-snapshot-compare.mjs compare',
    ].join('\n');
    const homepageSuiteJob = [
      '  ci-visual-snapshot-homepage:',
      '    name: Visual Snapshot Compare (homepage)',
      '    needs: [ci-path-changes, ci-visual-snapshot-compare]',
      "    if: needs.ci-path-changes.outputs.run_homepage_visual == 'true'",
      '    steps:',
      '      - uses: actions/download-artifact@v8',
      '        with:',
      '          name: visual-compare-build-${{ github.run_id }}',
    ].join('\n');
    const marketingDomSuiteJob = [
      '  ci-visual-marketing-dom:',
      '    name: Visual Snapshot Compare (marketing DOM)',
      '    needs: [ci-path-changes, ci-visual-snapshot-compare]',
      "    if: needs.ci-path-changes.outputs.run_marketing_dom == 'true'",
      '    steps:',
      '      - uses: actions/download-artifact@v8',
      '        with:',
      '          name: visual-compare-build-${{ github.run_id }}',
      '      - run: node .github/scripts/guard-playwright-artifacts.mjs --run -- pnpm exec playwright test tests/product-screenshots/route-dom-certification.spec.ts --workers=1',
    ].join('\n');
    const marketingRoutesSuiteJob = [
      '  ci-visual-marketing-routes:',
      '    name: Visual Snapshot Compare (marketing routes)',
      '    needs: [ci-path-changes, ci-visual-snapshot-compare]',
      "    if: needs.ci-path-changes.outputs.run_marketing_dom == 'true'",
      '    steps:',
      '      - uses: actions/download-artifact@v8',
      '        with:',
      '          name: visual-compare-build-${{ github.run_id }}',
      '      - run: node .github/scripts/guard-playwright-artifacts.mjs --run -- pnpm exec playwright test tests/product-screenshots/marketing-routes.spec.ts --workers=4',
    ].join('\n');
    const partialMergeReady = [
      '  ci-merge-group-ready:',
      '    needs: [ci-visual-snapshot-compare]',
    ].join('\n');
    const fastSourceReady = [
      '  ci-pr-ready:',
      '    needs: [ci-path-changes, ci-fast]',
      '    steps:',
      '      - run: echo ok',
    ].join('\n');
    const issues = assertVisualCompareWorkflowContract({
      visualRegressionYaml,
      ciYaml: [
        buildJob,
        homepageSuiteJob,
        marketingDomSuiteJob,
        marketingRoutesSuiteJob,
        partialMergeReady,
        fastSourceReady,
      ].join('\n'),
    });
    expect(issues).toContain(
      'compare job must run on homepage pull_request paths (run_homepage_visual)'
    );
    expect(issues).toContain(
      'compare job must build once and publish the shared visual compare build artifact'
    );
    expect(issues).toContain(
      'homepage visual compare must render and compare the Playwright homepage snapshots'
    );
    expect(issues).toContain(
      'merge-group PR Ready must require visual snapshot compare'
    );
    expect(issues).toContain(
      'source PR Ready must require visual snapshot compare on homepage paths'
    );
    expect(issues).toContain(
      'source PR Ready must fail closed when a homepage PR skips visual snapshot compare'
    );

    const gatedBuildJob = buildJob.replace(
      "    if: github.event_name == 'merge_group'",
      [
        '    if: >-',
        "      github.event_name == 'merge_group' ||",
        "      needs.ci-path-changes.outputs.run_homepage_visual == 'true'",
      ].join('\n')
    );
    const renderedBuildJob = gatedBuildJob.replace(
      '      - run: node scripts/visual-snapshot-compare.mjs compare',
      [
        '      - run: node scripts/visual-snapshot-compare.mjs compare',
        '      - uses: ./.github/actions/setup-node-pnpm',
        '      - run: pnpm turbo build --filter=@jovie/web',
        '      - run: tar -cf "${{ runner.temp }}/visual-compare-build.tar" --exclude=\'.next/cache\' -C apps/web .next',
        '      - uses: actions/upload-artifact@v7',
        '        with:',
        '          name: visual-compare-build-${{ github.run_id }}',
      ].join('\n')
    );
    const renderedHomepageSuiteJob = homepageSuiteJob
      .replace(
        '      - uses: actions/download-artifact@v8',
        [
          '      - uses: ./.github/actions/setup-node-pnpm',
          '      - uses: ./.github/actions/setup-playwright',
          '      - uses: actions/download-artifact@v8',
        ].join('\n')
      )
      .replace(
        '          name: visual-compare-build-${{ github.run_id }}',
        [
          '          name: visual-compare-build-${{ github.run_id }}',
          '      - run: node .github/scripts/guard-playwright-artifacts.mjs --run -- pnpm exec playwright test tests/e2e/visual-regression.spec.ts --project=chromium --grep homepage',
        ].join('\n')
      );
    const fullyWiredMergeReady = [
      '  ci-merge-group-ready:',
      '    needs: [ci-visual-snapshot-compare, ci-visual-snapshot-homepage, ci-visual-marketing-dom, ci-visual-marketing-routes]',
      '    steps:',
      '      - run: |',
      '          VISUAL_HOMEPAGE_RESULT="${{ needs.ci-visual-snapshot-homepage.result }}"',
      '          VISUAL_MARKETING_DOM_RESULT="${{ needs.ci-visual-marketing-dom.result }}"',
      '          VISUAL_MARKETING_ROUTES_RESULT="${{ needs.ci-visual-marketing-routes.result }}"',
      '          RUN_HOMEPAGE_VISUAL="${{ needs.ci-path-changes.outputs.run_homepage_visual }}"',
      '          RUN_MARKETING_DOM="${{ needs.ci-path-changes.outputs.run_marketing_dom }}"',
      '          for selected_gate in \\',
      '            "Homepage Visual Compare:$RUN_HOMEPAGE_VISUAL:$VISUAL_HOMEPAGE_RESULT" \\',
      '            "Marketing DOM Certification:$RUN_MARKETING_DOM:$VISUAL_MARKETING_DOM_RESULT" \\',
      '            "Marketing Route Capture:$RUN_MARKETING_DOM:$VISUAL_MARKETING_ROUTES_RESULT"; do',
      '            if [[ "$selected" == "true" && "$result" != "success" ]]; then exit 1; fi',
      '            if [[ "$selected" != "true" && "$result" != "skipped" ]]; then exit 1; fi',
      '          done',
    ].join('\n');
    const gatedSourceReady = [
      '  ci-pr-ready:',
      '    needs: [ci-path-changes, ci-fast, ci-visual-snapshot-compare, ci-visual-snapshot-homepage, ci-visual-marketing-dom, ci-visual-marketing-routes]',
      '    steps:',
      '      - run: |',
      '          RUN_HOMEPAGE_VISUAL="${{ needs.ci-path-changes.outputs.run_homepage_visual }}"',
      '          RUN_MARKETING_DOM="${{ needs.ci-path-changes.outputs.run_marketing_dom }}"',
      '          VISUAL_COMPARE_RESULT="${{ needs.ci-visual-snapshot-compare.result }}"',
      '          VISUAL_HOMEPAGE_RESULT="${{ needs.ci-visual-snapshot-homepage.result }}"',
      '          VISUAL_MARKETING_DOM_RESULT="${{ needs.ci-visual-marketing-dom.result }}"',
      '          VISUAL_MARKETING_ROUTES_RESULT="${{ needs.ci-visual-marketing-routes.result }}"',
      '          if [[ "$RUN_HOMEPAGE_VISUAL" == "true" && "$VISUAL_COMPARE_RESULT" != "success" ]]; then exit 1; fi',
      '          if [[ "$RUN_HOMEPAGE_VISUAL" == "true" && "$VISUAL_HOMEPAGE_RESULT" != "success" ]]; then exit 1; fi',
      '          if [[ "$RUN_MARKETING_DOM" == "true" && "$VISUAL_MARKETING_DOM_RESULT" != "success" ]]; then exit 1; fi',
      '          if [[ "$RUN_MARKETING_DOM" == "true" && "$VISUAL_MARKETING_ROUTES_RESULT" != "success" ]]; then exit 1; fi',
    ].join('\n');
    expect(
      assertVisualCompareWorkflowContract({
        visualRegressionYaml,
        ciYaml: [
          renderedBuildJob,
          renderedHomepageSuiteJob,
          marketingDomSuiteJob,
          marketingRoutesSuiteJob,
          fullyWiredMergeReady,
          gatedSourceReady,
        ].join('\n'),
      })
    ).toEqual([]);

    // Review item: an aggregate that wires all four needs but keeps only the
    // legacy build-result check must still be rejected — every selected suite
    // needs its own fail-closed result check.
    const uncheckedSourceReady = gatedSourceReady
      .replace(
        /\n *if \[\[ "\$RUN_HOMEPAGE_VISUAL" == "true" && "\$VISUAL_HOMEPAGE_RESULT" != "success" \]\]; then exit 1; fi/,
        ''
      )
      .replace(
        /\n *if \[\[ "\$RUN_MARKETING_DOM" == "true" && "\$VISUAL_MARKETING_DOM_RESULT" != "success" \]\]; then exit 1; fi/,
        ''
      )
      .replace(
        /\n *if \[\[ "\$RUN_MARKETING_DOM" == "true" && "\$VISUAL_MARKETING_ROUTES_RESULT" != "success" \]\]; then exit 1; fi/,
        ''
      );
    // Merge-group side: assignments and needs alone must not satisfy the
    // validator — each suite's selected-gate entry must survive, and the
    // enforcing loop must exist. Per-suite negatives keep the assignments and
    // drop only that suite's gate entry; a final one drops the whole loop.
    const dropLine = needle => fullyWiredMergeReady.replace(needle, '');
    const dropLoop = () =>
      fullyWiredMergeReady.replace(
        /\n *for selected_gate in [\s\S]*?\n *done/,
        '\n'
      );
    const mergeReadyNegatives = [
      [
        'homepage gate entry',
        dropLine(
          '            "Homepage Visual Compare:$RUN_HOMEPAGE_VISUAL:$VISUAL_HOMEPAGE_RESULT" \\\n'
        ),
      ],
      [
        'marketing DOM gate entry',
        dropLine(
          '            "Marketing DOM Certification:$RUN_MARKETING_DOM:$VISUAL_MARKETING_DOM_RESULT" \\\n'
        ),
      ],
      [
        'marketing routes gate entry',
        dropLine(
          '            "Marketing Route Capture:$RUN_MARKETING_DOM:$VISUAL_MARKETING_ROUTES_RESULT"; do\n'
        ),
      ],
      ['entire enforcing loop', dropLoop()],
    ];
    for (const [label, crippledMergeReady] of mergeReadyNegatives) {
      expect(crippledMergeReady, label).not.toBe(fullyWiredMergeReady);
      expect(
        assertVisualCompareWorkflowContract({
          visualRegressionYaml,
          ciYaml: [
            renderedBuildJob,
            renderedHomepageSuiteJob,
            marketingDomSuiteJob,
            marketingRoutesSuiteJob,
            crippledMergeReady,
            gatedSourceReady,
          ].join('\n'),
        })
      ).toContain(
        'merge-group PR Ready must validate every selected visual suite result'
      );
    }
    expect(uncheckedSourceReady).not.toBe(gatedSourceReady);
    expect(
      assertVisualCompareWorkflowContract({
        visualRegressionYaml,
        ciYaml: [
          renderedBuildJob,
          renderedHomepageSuiteJob,
          marketingDomSuiteJob,
          marketingRoutesSuiteJob,
          fullyWiredMergeReady,
          uncheckedSourceReady,
        ].join('\n'),
      })
    ).toContain(
      'source PR Ready must fail closed when a homepage PR skips visual snapshot compare'
    );
  });

  it('passes the committed snapshot inventory and workflow contract', () => {
    const visualRegressionYaml = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/visual-regression.yml'),
      'utf8'
    );
    const ciYaml = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/ci.yml'),
      'utf8'
    );
    expect(
      inventoryMissingBaselines({
        repoRoot: REPO_ROOT,
        existsSync,
        readFileSync,
        specs: VISUAL_SNAPSHOT_SPECS,
      })
    ).toEqual([]);
    expect(
      assertVisualCompareWorkflowContract({ visualRegressionYaml, ciYaml })
    ).toEqual([]);
    expect(
      runVisualSnapshotCompare({
        repoRoot: REPO_ROOT,
        mode: VISUAL_COMPARE_MODE,
        existsSync,
        readFileSync,
        visualRegressionYaml,
        ciYaml,
      })
    ).toMatchObject({ ok: true, reason: 'matched' });
  });
});
