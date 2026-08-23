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

describe('product lane classifier', () => {
  it('selects only the isolated product lane', () => {
    const ios = classifyProductLanes(['apps/ios/Jovie/App.swift']);
    expect(ios.selectedLanes).toEqual(['ios']);
    expect(ios.skippedLanes.map(item => item.lane)).toContain('web');

    const mac = classifyProductLanes(['apps/desktop/src/main.ts']);
    expect(mac.selectedLanes).toEqual(['mac']);

    const web = classifyProductLanes(['apps/web/app/page.tsx']);
    expect(web.selectedLanes).toEqual(['web']);
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
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
