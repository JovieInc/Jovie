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
function successRun(payload = () => JSON.stringify(report())) {
  return vi.fn((_cmd, args) => {
    const out = args
      .find(x => x.startsWith('--output-path='))
      .slice('--output-path='.length);
    writeFileSync(out, payload());
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

const malformedReports = [
  [
    'invalid runtime error marker',
    value => {
      value.runtimeError = false;
    },
  ],
  [
    'empty request type',
    value => {
      value.audits['network-requests'].details.items[0].resourceType = '';
    },
  ],
  [
    'overflowing total script bytes',
    value => {
      const item = value.audits['network-requests'].details.items[0];
      value.audits['network-requests'].details.items = [
        { ...item, transferSize: 1e308 },
        { ...item, transferSize: 1e308 },
      ];
    },
  ],
  [
    'runtime error',
    value => {
      value.runtimeError = { code: 'NO_FCP' };
    },
  ],
  ...[undefined, null, '0.9', -0.1, 1.1].map(score => [
    `invalid score ${String(score)}`,
    value => {
      value.categories.performance.score = score;
    },
  ]),
  ...[
    'largest-contentful-paint',
    'first-contentful-paint',
    'total-blocking-time',
    'total-byte-weight',
  ].flatMap(id =>
    [undefined, null, '100', -1].map(number => [
      `invalid ${id} ${String(number)}`,
      value => {
        value.audits[id].numericValue = number;
      },
    ])
  ),
  ...[undefined, null, {}].map(items => [
    `invalid network array ${String(items)}`,
    value => {
      value.audits['network-requests'].details.items = items;
    },
  ]),
  [
    'null request',
    value => {
      value.audits['network-requests'].details.items = [null];
    },
  ],
  [
    'missing request type',
    value => {
      delete value.audits['network-requests'].details.items[0].resourceType;
    },
  ],
  [
    'missing request URL',
    value => {
      delete value.audits['network-requests'].details.items[0].url;
    },
  ],
  [
    'invalid request URL',
    value => {
      value.audits['network-requests'].details.items[0].url = 'not a URL';
    },
  ],
  ...[null, '123', -1].map(size => [
    `invalid script bytes ${String(size)}`,
    value => {
      value.audits['network-requests'].details.items[0].transferSize = size;
    },
  ]),
];

test.each(malformedReports)(
  'rejects a successful process with %s',
  (_name, edit) => {
    const value = report();
    const mutate = /** @type {(value: ReturnType<typeof report>) => void} */ (
      edit
    );
    mutate(value);
    const run = successRun(() => JSON.stringify(value));
    expect(() =>
      lighthouseOnce('https://example.com', temp(), 'invalid', run)
    ).toThrow('invalid Lighthouse report');
    expect(run).toHaveBeenCalledOnce();
  }
);

test.each([
  ['score', '"score":0.9', '"score":1e400'],
  ['lcp', '"numericValue":1200', '"numericValue":1e400'],
  ['fcp', '"numericValue":800', '"numericValue":1e400'],
  ['tbt', '"numericValue":10', '"numericValue":1e400'],
  ['bytes', '"numericValue":2000', '"numericValue":1e400'],
  ['script bytes', '"transferSize":123', '"transferSize":1e400'],
])('rejects nonfinite JSON numeric values for %s', (_name, before, after) => {
  const run = successRun(() => JSON.stringify(report()).replace(before, after));
  expect(() =>
    lighthouseOnce('https://example.com', temp(), 'infinite', run)
  ).toThrow('invalid Lighthouse report');
});

test('retains genuine zero-valued performance measurements', () => {
  const value = report();
  value.runtimeError = null;
  value.categories.performance.score = 0;
  for (const id of [
    'largest-contentful-paint',
    'first-contentful-paint',
    'total-blocking-time',
    'total-byte-weight',
  ])
    value.audits[id].numericValue = 0;
  value.audits['network-requests'].details.items[0].transferSize = 0;
  const run = successRun(() => JSON.stringify(value));
  expect(lighthouseOnce('https://example.com', temp(), 'zero', run)).toEqual({
    lcp: 0,
    fcp: 0,
    tbt: 0,
    bytes: 0,
    js: 0,
    score: 0,
    thirdParty: 0,
  });
  expect(run).toHaveBeenCalledOnce();
});

test('never certifies an unavailable competitor score or writes a claim receipt', async () => {
  const value = report();
  value.categories.performance.score = null;
  const outPath = join(temp(), 'receipt.json');
  const facts = vi.fn(async () => ({ zoom: 1, music: 1 }));
  await expect(
    main({
      runs: 1,
      outPath,
      factsForPage: facts,
      measure: (url, dir, index) =>
        url.includes('jov.ie')
          ? liveSample(true)
          : lighthouseOnce(
              url,
              dir,
              index,
              successRun(() => JSON.stringify(value))
            ),
    })
  ).rejects.toThrow('invalid Lighthouse report');
  expect(existsSync(outPath)).toBe(false);
  expect(facts).not.toHaveBeenCalled();
});

test('rejects a retry that succeeds without replacing a failed attempt report', async () => {
  const outPath = join(temp(), 'receipt.json');
  const run = successRun()
    .mockImplementationOnce((_command, args) => {
      const out = args
        .find(value => value.startsWith('--output-path='))
        .slice('--output-path='.length);
      writeFileSync(out, JSON.stringify(report()));
      return {
        status: 1,
        stderr: 'Chrome failed after writing a partial report',
      };
    })
    .mockImplementationOnce(() => ({ status: 0 }));
  const facts = vi.fn(async () => ({ zoom: 1, music: 1 }));
  await expect(
    main({
      runs: 1,
      outPath,
      factsForPage: facts,
      measure: (url, dir, index) =>
        index === 'j0'
          ? lighthouseOnce(url, dir, index, run)
          : liveSample(false),
    })
  ).rejects.toThrow();
  expect(run).toHaveBeenCalledTimes(2);
  expect(existsSync(outPath)).toBe(false);
  expect(facts).not.toHaveBeenCalled();
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
