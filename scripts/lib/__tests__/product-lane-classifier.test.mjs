import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyProductLanes,
  evaluateProductLaneResults,
  formatGitHubSummary,
  ProductLaneClassificationError,
  runProductLaneClassifier,
} from '../product-lane-classifier.mjs';

const SKIPPED_UNSELECTED = {
  operations: ['skipped'],
  'cross-product': ['skipped'],
};

describe('product lane classifier', () => {
  it('selects only the isolated product lane', () => {
    const ios = classifyProductLanes(['apps/ios/Jovie/App.swift']);
    expect(ios.selectedLanes).toEqual(['ios']);
    expect(ios.skippedLanes.map(item => item.lane)).toEqual([
      'mac',
      'web',
      'operations',
      'cross-product',
    ]);

    const mac = classifyProductLanes(['apps/desktop/src/main.ts']);
    expect(mac.selectedLanes).toEqual(['mac']);
    expect(mac.skippedLanes.map(item => item.lane)).toContain('ios');
    expect(mac.skippedLanes.map(item => item.lane)).toContain('web');

    const web = classifyProductLanes(['apps/web/app/page.tsx']);
    expect(web.selectedLanes).toEqual(['web']);
    expect(web.skippedLanes.map(item => item.lane)).toContain('ios');
    expect(web.skippedLanes.map(item => item.lane)).toContain('mac');
  });

  it('names every affected product and cross-product gate for shared contracts', () => {
    const receipt = classifyProductLanes(['packages/auth-routing/index.ts']);
    expect(receipt.sharedContract).toEqual({
      changed: true,
      affectedProducts: ['ios', 'mac', 'web'],
      paths: ['packages/auth-routing/index.ts'],
    });
    expect(receipt.selectedLanes.join(',')).toBe('ios,mac,web,cross-product');
  });

  it('bootstraps admission-control repairs through operations evidence only', () => {
    const receipt = classifyProductLanes([
      '.github/workflows/ci.yml',
      '.github/ci-harness/manifest.json',
      'scripts/ci-fast-lanes.mjs',
      'scripts/lib/product-lane-classifier.mjs',
      'scripts/lib/__tests__/merge-group-workflow-contract.test.mjs',
      'apps/web/tests/unit/ci/deploy-workflow.test.ts',
    ]);

    expect(receipt.selectedLanes).toEqual(['operations']);
    expect(receipt.sharedContract).toEqual({
      changed: false,
      affectedProducts: [],
      paths: [],
    });
    expect(receipt.skippedLanes.map(item => item.lane)).toEqual([
      'ios',
      'mac',
      'web',
      'cross-product',
    ]);

    expect(
      classifyProductLanes(['.github/workflows/ios-ci.yml']).selectedLanes
    ).toEqual(['ios']);
    expect(
      classifyProductLanes(['.github/workflows/desktop-release.yml'])
        .selectedLanes
    ).toEqual(['mac']);
    expect(
      classifyProductLanes(['.github/workflows/production-release.yml'])
        .selectedLanes
    ).toEqual(['web']);
  });

  it('keeps a broken isolated product from blocking unrelated unselected lanes', () => {
    for (const [broken, path] of Object.entries({
      ios: 'apps/ios/Jovie/App.swift',
      mac: 'apps/desktop/src/main.ts',
      web: 'apps/web/app/page.tsx',
    })) {
      const receipt = classifyProductLanes([path]);
      const results = {
        ios: ['skipped'],
        mac: ['skipped'],
        web: ['skipped'],
        ...SKIPPED_UNSELECTED,
        [broken]: ['failure'],
      };
      const evaluation = evaluateProductLaneResults(receipt, results);
      expect(evaluation.aggregatePassed, broken).toBe(false);
      expect(evaluation.admissions[broken].selected, broken).toBe(true);
      expect(evaluation.independentlyShippableProducts, broken).toEqual([]);
      for (const lane of ['ios', 'mac', 'web'].filter(
        item => item !== broken
      )) {
        expect(evaluation.admissions[lane].selected, `${broken}->${lane}`).toBe(
          false
        );
        expect(evaluation.admissions[lane].passed, `${broken}->${lane}`).toBe(
          false
        );
      }
    }
  });

  it('keeps a healthy selected product independently shippable when another is red', () => {
    const receipt = classifyProductLanes(['packages/auth-routing/index.ts']);
    const green = {
      ios: ['success'],
      mac: ['success'],
      web: ['success', 'success'],
      operations: ['skipped'],
      'cross-product': ['success'],
    };
    for (const [broken, independentlyShippable] of Object.entries({
      ios: ['mac', 'web'],
      mac: ['ios', 'web'],
      web: ['ios', 'mac'],
      'cross-product': [],
    })) {
      const result = evaluateProductLaneResults(receipt, {
        ...green,
        [broken]: ['failure'],
      });
      expect(result.aggregatePassed, broken).toBe(false);
      expect(result.independentlyShippableProducts, broken).toEqual(
        independentlyShippable
      );
    }
  });

  it('fails closed when an unselected lane reports a non-skipped result', () => {
    const receipt = classifyProductLanes(['apps/ios/Jovie/App.swift']);
    expect(() =>
      evaluateProductLaneResults(receipt, {
        ios: ['success'],
        web: ['failure'],
      })
    ).toThrow('Unselected web lane produced a non-skipped result');
  });

  it('fails closed with a visible classification error for unknown paths', () => {
    expect(() => classifyProductLanes(['new-product/main.ts'])).toThrow(
      ProductLaneClassificationError
    );
    expect(() => classifyProductLanes(['new-product/main.ts'])).toThrow(
      'Unmapped changed paths: new-product/main.ts'
    );
  });

  it('keeps every tracked repository path explicitly mapped', () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);
    expect(() => classifyProductLanes(tracked)).not.toThrow();
  });

  it('emits the complete human-readable and machine-readable intake receipt', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-product-lanes-'));
    const files = join(root, 'files.txt');
    const json = join(root, 'receipt.json');
    const summary = join(root, 'summary.md');
    const outputs = join(root, 'github-output.txt');

    try {
      writeFileSync(files, 'packages/auth-routing/index.ts\ndocs/ci.md\n');
      runProductLaneClassifier([
        '--files-from',
        files,
        '--json-out',
        json,
        '--summary-out',
        summary,
        '--github-output',
        outputs,
      ]);

      const receipt = JSON.parse(readFileSync(json, 'utf8'));
      expect(receipt.authority).toBe('Summer');
      expect(receipt.selectedLanes.join(',')).toBe(
        'ios,mac,web,operations,cross-product'
      );
      expect(readFileSync(summary, 'utf8')).toBe(formatGitHubSummary(receipt));
      expect(readFileSync(outputs, 'utf8')).toContain('run_web=true');
      expect(readFileSync(outputs, 'utf8')).toContain('run_macos=true');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
