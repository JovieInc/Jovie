import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test, vi } from 'vitest';
import {
  lighthouseOnce,
  main,
  pageFacts,
} from '../../benchmarks/vs-linktree.mjs';

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function temp() {
  const dir = mkdtempSync(join(tmpdir(), 'claims-test-'));
  dirs.push(dir);
  return dir;
}
function report() {
  const audit = numericValue => ({ numericValue });
  return {
    audits: {
      'network-requests': {
        details: {
          items: [
            {
              url: 'https://example.com/app.js',
              resourceType: 'Script',
              transferSize: 123,
            },
          ],
        },
      },
      'largest-contentful-paint': audit(1200),
      'first-contentful-paint': audit(800),
      'total-blocking-time': audit(10),
      'total-byte-weight': audit(2000),
    },
    categories: { performance: { score: 0.9 } },
  };
}
function successRun() {
  return vi.fn((_cmd, args) => {
    const out = args
      .find(x => x.startsWith('--output-path='))
      .slice('--output-path='.length);
    writeFileSync(out, JSON.stringify(report()));
    return { status: 0 };
  });
}
test('does not treat HTTP error markup as a successful page observation', async () => {
  const response = new Response('<html>error</html>', { status: 503 });
  const text = vi.spyOn(response, 'text');
  await expect(
    pageFacts('https://example.com', async () => response)
  ).rejects.toThrow('HTTP 503');
  expect(text).not.toHaveBeenCalled();
});
test('parses successful markup and retains pinch-zoom behavior', async () => {
  const request = vi
    .fn()
    .mockResolvedValue(
      new Response(
        '<meta name="viewport" content="width=device-width, user-scalable=no">',
        { status: 200 }
      )
    );
  expect(await pageFacts('https://example.com', request)).toEqual({
    zoom: 0,
    music: 0,
  });
  expect(request).toHaveBeenCalledOnce();
});
test('measures once when Lighthouse succeeds', () => {
  const run = successRun();
  expect(
    lighthouseOnce('https://example.com', temp(), 'ok', run)
  ).toMatchObject({ lcp: 1200, js: 123, score: 90, thirdParty: 0 });
  expect(run).toHaveBeenCalledOnce();
});
test('recovers one transient Lighthouse failure without discarding the measurement', () => {
  const run = successRun().mockImplementationOnce(() => ({
    status: 1,
    stderr: 'temporary Chrome startup failure',
  }));
  expect(lighthouseOnce('https://example.com', temp(), 'retry', run).lcp).toBe(
    1200
  );
  expect(run).toHaveBeenCalledTimes(2);
});
test('keeps repeated Lighthouse failure red after a bounded retry', () => {
  const run = vi.fn().mockReturnValue({ status: null, stderr: 'timeout' });
  expect(() =>
    lighthouseOnce('https://example.com', temp(), 'failed', run)
  ).toThrow('lighthouse failed');
  expect(run).toHaveBeenCalledTimes(2);
});

test('the actual CLI exits 2 and emits no claim receipt when measurement fails', () => {
  const dir = temp();
  const npm = join(dir, 'npm');
  const cwdReceipt = join(dir, 'working-directory.txt');
  const output = join(dir, 'receipt.json');
  writeFileSync(npm, '#!/bin/sh\npwd > "$CLAIMS_BENCHMARK_CWD"\nexit 1\n');
  chmodSync(npm, 0o755);
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../../benchmarks/vs-linktree.mjs', import.meta.url)
      ),
      '--runs',
      '1',
      '--out',
      output,
    ],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        TMPDIR: dir,
        CLAIMS_BENCHMARK_CWD: cwdReceipt,
      },
    }
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('measurement-failed: lighthouse failed');
  expect(result.stdout).not.toContain('CLAIM-FLAG');
  expect(existsSync(output)).toBe(false);
  expect(existsSync(readFileSync(cwdReceipt, 'utf8').trim())).toBe(false);
});

function liveSample(jovie) {
  return jovie
    ? {
        lcp: 1864,
        fcp: 1567,
        tbt: 305,
        bytes: 1228847,
        js: 999716,
        score: 91,
        thirdParty: 0,
      }
    : {
        lcp: 11672,
        fcp: 2426,
        tbt: 1134,
        bytes: 2138728,
        js: 1550370,
        score: 43,
        thirdParty: 5,
      };
}
test('alternates complete measurements, writes a dated receipt and fails a real regression', async () => {
  const calls = [];
  const outPath = join(temp(), 'receipt.json');
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const previousExit = process.exitCode;
  try {
    process.exitCode = 7;
    const status = await main({
      runs: 3,
      outPath,
      measure: (url, _dir, index) => {
        calls.push(index);
        return liveSample(url.includes('jov.ie'));
      },
      factsForPage: async url => ({
        zoom: url.includes('jov.ie') ? 1 : 0,
        music: url.includes('jov.ie') ? 1 : 0,
      }),
    });
    expect(calls).toEqual(['j0', 'c0', 'j1', 'c1', 'j2', 'c2']);
    const receipt = JSON.parse(readFileSync(outPath, 'utf8'));
    expect(receipt.schema).toBe('jovie-vs-linktree-receipt/v1');
    expect(Number.isFinite(Date.parse(receipt.measuredAt))).toBe(true);
    expect(receipt.evaluations).toHaveLength(9);
    expect(receipt.evaluations.every(x => x.holds)).toBe(true);
    expect(status).toBe(0);
    expect(process.exitCode).toBe(7);
    const failedStatus = await main({
      runs: 1,
      outPath,
      measure: () => liveSample(true),
      factsForPage: async () => ({ zoom: 1, music: 1 }),
    });
    expect(failedStatus).toBe(1);
    expect(process.exitCode).toBe(7);
    expect(
      JSON.parse(readFileSync(outPath, 'utf8')).evaluations.some(x => !x.holds)
    ).toBe(true);
    expect(log.mock.calls.some(([line]) => line.startsWith('CLAIM-FLAG'))).toBe(
      true
    );
  } finally {
    process.exitCode = previousExit;
    log.mockRestore();
  }
});
