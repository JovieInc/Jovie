import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { getInteractionHotPathManifest } from './performance-interaction-manifest';

const receiptsDir = resolve(
  import.meta.dirname,
  '../../../docs/performance/generated'
);

function latestReceipt() {
  const names = readdirSync(receiptsDir)
    .filter(name => /^interaction-latency-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();
  const name = names.at(-1);
  if (!name)
    throw new Error(`No interaction latency receipt in ${receiptsDir}`);
  return JSON.parse(readFileSync(resolve(receiptsDir, name), 'utf8')) as {
    budgetsChanged: boolean;
    productShellMeasured: boolean;
    measurementSurface: string;
    runsPerScenario: number;
    device: { os: string; cpuModel: string; cpuCount: number };
    browser: string;
    scenarios: readonly {
      id: string;
      runs: number;
      medianFirstFeedbackMs: number | null;
      p95FirstFeedbackMs: number | null;
      passed: boolean | null;
    }[];
  };
}

describe('interaction latency receipt', () => {
  it('records a measured median and p95 for every declared scenario', () => {
    const receipt = latestReceipt();
    expect(receipt.budgetsChanged).toBe(false);
    expect(receipt.productShellMeasured).toBe(false);
    expect(receipt.measurementSurface).toContain(
      'authenticated Jovie app shell was not measured'
    );
    expect(receipt.device.os.length).toBeGreaterThan(0);
    expect(receipt.device.cpuModel.length).toBeGreaterThan(0);
    expect(receipt.device.cpuCount).toBeGreaterThan(0);
    expect(receipt.browser).toContain('Chromium');
    expect(receipt.browser).toContain('Playwright');

    const ids = receipt.scenarios.map(scenario => scenario.id);
    expect(ids).toEqual(
      getInteractionHotPathManifest().map(scenario => scenario.id)
    );
    for (const scenario of receipt.scenarios) {
      expect(scenario.runs).toBe(receipt.runsPerScenario);
      expect(typeof scenario.medianFirstFeedbackMs).toBe('number');
      expect(typeof scenario.p95FirstFeedbackMs).toBe('number');
      expect(typeof scenario.passed).toBe('boolean');
    }
  });
});
