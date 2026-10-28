import { existsSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  lcp: 2500,
  cls: 0,
  status: 0,
  report: null as Record<string, unknown> | null,
  assets: null as { trace: unknown; devtoolsLog: unknown } | null,
  rawReport: null as string | null,
  oversizedAsset: false,
  malformedAsset: false,
  childThrows: false,
  sampleModes: [] as number[],
  previousSampleExists: [] as boolean[],
  childOutput: [] as unknown[],
  calls: [] as string[][],
}));

vi.mock('node:child_process', () => ({
  spawnSync: (_node: string, args: string[], options: { stdio: unknown }) => {
    const previous = state.calls
      .at(-1)
      ?.find(arg => arg.startsWith('--output-path='));
    if (previous)
      state.previousSampleExists.push(
        existsSync(path.dirname(previous.slice('--output-path='.length)))
      );
    state.calls.push(args);
    state.childOutput.push(options.stdio);
    const out = args.find(arg => arg.startsWith('--output-path='));
    if (out)
      state.sampleModes.push(
        statSync(path.dirname(out.slice('--output-path='.length))).mode & 0o777
      );
    if (out && state.assets && args.includes('--save-assets')) {
      const prefix = out
        .slice('--output-path='.length)
        .replace(/\.\w{2,4}$/, '');
      writeFileSync(
        `${prefix}-0.trace.json`,
        JSON.stringify(state.assets.trace)
      );
      writeFileSync(
        `${prefix}-0.devtoolslog.json`,
        JSON.stringify(state.assets.devtoolsLog)
      );
      if (state.malformedAsset)
        writeFileSync(`${prefix}-0.trace.json`, '{"synthetic-private":');
      if (state.oversizedAsset)
        truncateSync(`${prefix}-0.trace.json`, 64 * 1024 * 1024 + 1);
    }
    if (state.childThrows) throw new Error('synthetic-private-child-error');
    if (out && state.status === 0) {
      writeFileSync(
        out.slice('--output-path='.length),
        state.rawReport ??
          JSON.stringify(
            state.report ?? {
              audits: {
                'largest-contentful-paint': { numericValue: state.lcp },
                'cumulative-layout-shift': { numericValue: state.cls },
              },
            }
          )
      );
    }
    return { status: state.status };
  },
}));

import { main } from './lighthouse-entry-gate';

// Reduced synthetic inputs exercise the installed LH13 producer, not a mock
// of its correlation. Shapes were verified against one localhost-only native
// LH13.4.1 run; no captured browser payload or external request is retained.
function imageAssets() {
  const imageUrl = 'https://fixture.test/image.png?synthetic=private';
  const event = (
    name: string,
    ts: number,
    args: Record<string, unknown>,
    cat = 'loading,rail,devtools.timeline',
    ph = 'R'
  ) => ({ name, ts, args, pid: 1, tid: 1, cat, ph });
  const trace = {
    traceEvents: [
      event('thread_name', 0, { name: 'CrRendererMain' }, '__metadata', 'M'),
      event(
        'TracingStartedInBrowser',
        1,
        { data: { frames: [{ frame: 'main', processId: 1 }] } },
        'disabled-by-default-devtools.timeline',
        'I'
      ),
      event(
        'navigationStart',
        1_000_000,
        {
          frame: 'main',
          data: {
            documentLoaderURL: 'https://fixture.test/',
            isLoadingMainFrame: true,
            isOutermostMainFrame: true,
            navigationId: 'nav',
          },
        },
        'blink.user_timing'
      ),
      event('firstContentfulPaint', 1_200_000, {
        frame: 'main',
        data: { navigationId: 'nav' },
      }),
      event(
        'LargestImagePaint::Candidate',
        1_400_000,
        { frame: 'main', data: { DOMNodeId: 10, size: 14_400, imageUrl } },
        'loading'
      ),
      event('largestContentfulPaint::Candidate', 1_500_000, {
        frame: 'main',
        data: {
          nodeId: 10,
          size: 14_400,
          isMainFrame: true,
          isOutermostMainFrame: true,
          type: 'image',
          navigationId: 'nav',
        },
      }),
    ],
  };
  const devtoolsLog = [
    {
      method: 'Network.requestWillBeSent',
      params: {
        requestId: 'image',
        loaderId: 'nav',
        frameId: 'main',
        timestamp: 1.1,
        type: 'Image',
        request: {
          url: imageUrl,
          method: 'GET',
          headers: { 'x-fixture': 'header-private' },
          initialPriority: 'High',
        },
        initiator: { type: 'parser', url: 'https://fixture.test/' },
      },
    },
    {
      method: 'Network.responseReceived',
      params: {
        requestId: 'image',
        loaderId: 'nav',
        frameId: 'main',
        timestamp: 1.2,
        type: 'Image',
        response: {
          url: imageUrl,
          status: 200,
          mimeType: 'image/png',
          protocol: 'h2',
          headers: {},
          encodedDataLength: 100,
        },
      },
    },
    {
      method: 'Network.dataReceived',
      params: {
        requestId: 'image',
        timestamp: 1.25,
        dataLength: 1024,
        encodedDataLength: 412,
      },
    },
    {
      method: 'Network.loadingFinished',
      params: { requestId: 'image', timestamp: 1.3, encodedDataLength: 512 },
    },
  ];
  return { trace, devtoolsLog };
}

function resourceDiagnostics() {
  const line = vi
    .mocked(console.log)
    .mock.calls.map(args => args.join(' '))
    .find(value => value.startsWith('  claim-link diagnostics '));
  expect(line).toBeDefined();
  return JSON.parse(line!.slice('  claim-link diagnostics '.length));
}

const claimArgs = [
  '--base-url',
  'https://fixture.test',
  '--route-id',
  'claim-link',
  '--runs',
  '1',
];

function expectSampleDeleted() {
  const reportPath = state.calls[0]
    .find(arg => arg.startsWith('--output-path='))!
    .slice('--output-path='.length);
  expect(existsSync(path.dirname(reportPath))).toBe(false);
  expect(existsSync(path.dirname(path.dirname(reportPath)))).toBe(false);
}

async function nativeLighthouseLogger() {
  const require = createRequire(import.meta.url);
  const lhciDir = path.dirname(require.resolve('@lhci/cli/package.json'));
  const computed = require.resolve(
    'lighthouse/core/computed/lcp-image-record.js',
    { paths: [lhciDir] }
  );
  return (
    await import(
      pathToFileURL(createRequire(computed).resolve('lighthouse-logger')).href
    )
  ).default;
}

describe('lighthouse entry gate main', () => {
  beforeEach(() => {
    state.lcp = 2500;
    state.cls = 0;
    state.status = 0;
    state.report = null;
    state.assets = null;
    state.rawReport = null;
    state.oversizedAsset = false;
    state.malformedAsset = false;
    state.childThrows = false;
    state.sampleModes = [];
    state.previousSampleExists = [];
    state.childOutput = [];
    state.calls = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    delete process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET;
  });

  it('requires a base url', async () => {
    await expect(main([])).rejects.toThrow('--base-url is required');
  });

  it('silences the actual LH13 logger and restores its sink after success and malformed trace rejection', async () => {
    const logger = await nativeLighthouseLogger();
    const original = logger._logToStdErr;
    const sink = vi.fn();
    logger._logToStdErr = sink;
    try {
      logger.verbose('fixture', 'synthetic-private-request');
      expect(sink).toHaveBeenCalled();
      sink.mockClear();
      for (const assets of [
        imageAssets(),
        { trace: { traceEvents: [] }, devtoolsLog: [] },
      ]) {
        state.assets = assets;
        expect(await main(claimArgs)).toBe(0);
        expect(logger._logToStdErr).toBe(sink);
        expect(sink).not.toHaveBeenCalled();
      }
    } finally {
      logger._logToStdErr = original;
    }
  });

  it.each(['frame', 'node', 'size', 'url'] as const)(
    'does not attribute a paint from a different %s to LCP',
    async mismatch => {
      const assets = imageAssets();
      const paint = assets.trace.traceEvents.find(
        event => event.name === 'LargestImagePaint::Candidate'
      )!;
      if (mismatch === 'frame') paint.args.frame = 'other';
      else if (mismatch === 'url')
        (paint.args.data as Record<string, unknown>).imageUrl =
          'https://fixture.test/another-private-image';
      else
        (paint.args.data as Record<string, unknown>)[
          mismatch === 'node' ? 'DOMNodeId' : 'size'
        ] = 999;
      state.assets = assets;
      expect(await main(claimArgs)).toBe(0);
      expect(resourceDiagnostics().lcpResource).toEqual({
        status: 'unavailable',
        reason: 'no-image-match',
      });
      expectSampleDeleted();
    }
  );

  it('rejects an upstream match whose request starts after LCP without changing the numeric verdict', async () => {
    const assets = imageAssets();
    for (const entry of assets.devtoolsLog) entry.params.timestamp += 1;
    state.assets = assets;
    expect(await main(claimArgs)).toBe(0);
    expect(resourceDiagnostics().lcpResource).toEqual({
      status: 'unavailable',
      reason: 'request-after-lcp',
    });
  });

  it('retains a request that starts before LCP and finishes after paint', async () => {
    const assets = imageAssets();
    assets.devtoolsLog[3].params.timestamp = 1.8;
    state.assets = assets;
    expect(await main(claimArgs)).toBe(0);
    expect(resourceDiagnostics().lcpResource).toMatchObject({
      status: 'matched',
      requestDurationMs: 700,
    });
  });

  it('omits malformed measurements and unrecognized enums from the upstream record', async () => {
    const assets = imageAssets();
    Object.assign(assets.devtoolsLog[0].params.request!, {
      initialPriority: 'synthetic-private-priority',
    });
    Object.assign(assets.devtoolsLog[1].params.response!, {
      mimeType: 'synthetic-private-mime',
      encodedDataLength: -100,
    });
    assets.devtoolsLog[2].params.dataLength = -100;
    assets.devtoolsLog[2].params.encodedDataLength = -100;
    assets.devtoolsLog[3].params.encodedDataLength = -100;
    state.assets = assets;
    expect(await main(claimArgs)).toBe(0);
    const resource = resourceDiagnostics().lcpResource;
    expect(resource.status).toBe('matched');
    expect(resource).not.toHaveProperty('transferSizeBytes');
    expect(resource).not.toHaveProperty('resourceSizeBytes');
    expect(resource).not.toHaveProperty('priority');
    expect(resource).not.toHaveProperty('mimeType');
    expect(JSON.stringify(resource)).not.toContain('synthetic-private');
  });

  it('preserves upstream earliest-completed selection for duplicate image requests and ignores another frame', async () => {
    const assets = imageAssets();
    const duplicate = structuredClone(assets.devtoolsLog);
    for (const entry of duplicate) {
      entry.params.requestId = 'duplicate';
      entry.params.timestamp += 0.05;
      if (entry.method === 'Network.loadingFinished')
        entry.params.encodedDataLength = 999;
    }
    const unrelated = structuredClone(assets.devtoolsLog);
    for (const entry of unrelated) {
      entry.params.requestId = 'other-frame';
      if ('frameId' in entry.params) entry.params.frameId = 'other';
      entry.params.timestamp -= 0.05;
    }
    assets.devtoolsLog.push(...duplicate, ...unrelated);
    assets.devtoolsLog.sort((a, b) => a.params.timestamp - b.params.timestamp);
    state.assets = assets;
    expect(await main(claimArgs)).toBe(0);
    expect(resourceDiagnostics().lcpResource).toMatchObject({
      status: 'matched',
      transferSizeBytes: 512,
      method: 'lighthouse-lcp-image-record',
    });
  });

  it('follows the matched image redirect and emits only origin/optimizer booleans', async () => {
    const assets = imageAssets();
    const [request, response] = assets.devtoolsLog;
    if (!request.params.request || !response.params.response)
      throw new Error('redirect fixture requires a request and response');
    const redirectedUrl =
      'https://fixture.test/_next/image?url=synthetic-private';
    const redirect = {
      method: 'Network.requestWillBeSent',
      params: {
        ...request.params,
        timestamp: 1.15,
        request: { ...request.params.request, url: redirectedUrl },
        redirectResponse: { ...response.params.response, status: 302 },
      },
    };
    response.params.response.url = redirectedUrl;
    assets.devtoolsLog.splice(1, 0, redirect);
    state.assets = assets;
    state.report = {
      finalDisplayedUrl: 'https://fixture.test/tim?claim=1',
      audits: {
        'largest-contentful-paint': { numericValue: 2500 },
        'cumulative-layout-shift': { numericValue: 0 },
      },
    };
    expect(await main(claimArgs)).toBe(0);
    expect(resourceDiagnostics().lcpResource).toMatchObject({
      status: 'matched',
      transferSizeBytes: 512,
      sameOrigin: true,
      sameOriginNextImage: true,
    });
    expect(JSON.stringify(resourceDiagnostics())).not.toContain(
      'synthetic-private'
    );
  });

  it('preserves a measured zero-byte cached image', async () => {
    const assets = imageAssets();
    Object.assign(assets.devtoolsLog[1].params.response!, {
      fromDiskCache: true,
      encodedDataLength: 0,
    });
    assets.devtoolsLog[2].params.encodedDataLength = 0;
    assets.devtoolsLog[3].params.encodedDataLength = 0;
    state.assets = assets;
    expect(await main(claimArgs)).toBe(0);
    expect(resourceDiagnostics().lcpResource).toMatchObject({
      status: 'matched',
      cache: 'disk',
      transferSizeBytes: 0,
    });
  });

  it.each(['missing', 'shape', 'oversized', 'malformed'] as const)(
    'keeps the numeric verdict when optional assets are %s',
    async kind => {
      state.assets =
        kind === 'missing'
          ? null
          : kind === 'shape'
            ? { trace: null, devtoolsLog: {} }
            : imageAssets();
      state.oversizedAsset = kind === 'oversized';
      state.malformedAsset = kind === 'malformed';
      state.lcp = 7320;
      expect(await main(claimArgs)).toBe(1);
      expect(resourceDiagnostics().lcpResource).toEqual({
        status: 'unavailable',
        reason: {
          missing: 'asset-read',
          shape: 'asset-shape',
          oversized: 'asset-size',
          malformed: 'asset-json',
        }[kind],
      });
      expectSampleDeleted();
    }
  );

  it.each([
    'process-status',
    'process-throw',
    'report-json',
    'report-shape',
  ] as const)(
    'deletes raw assets and headers on %s failure without raw errors',
    async kind => {
      state.assets = imageAssets();
      process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET = 'synthetic-header-private';
      if (kind === 'process-status') state.status = 1;
      if (kind === 'process-throw') state.childThrows = true;
      if (kind === 'report-json') state.rawReport = '{"synthetic-private":';
      if (kind === 'report-shape') state.rawReport = 'null';
      await expect(main(claimArgs)).rejects.toThrow(
        /^lighthouse (failed|report unavailable|produced no LCP\/CLS)$/
      );
      expectSampleDeleted();
    }
  );

  it('reports the trace-correlated image request without leaking its URL or headers and deletes each sample before the next', async () => {
    state.assets = imageAssets();
    state.lcp = 7320;
    const code = await main([
      '--base-url',
      'https://fixture.test',
      '--route-id',
      'claim-link',
      '--runs',
      '3',
    ]);
    expect(code).toBe(1);
    expect(state.calls).toHaveLength(3);
    expect(resourceDiagnostics().lcpResource).toMatchObject({
      status: 'matched',
      method: 'lighthouse-lcp-image-record',
      transferSizeBytes: 512,
      resourceSizeBytes: 1024,
      priority: 'High',
      cache: 'none',
      resourceType: 'Image',
      requestDurationMs: 200,
    });
    expect(state.calls.every(args => args.includes('--save-assets'))).toBe(
      true
    );
    expect(state.sampleModes).toEqual([0o700, 0o700, 0o700]);
    expect(state.previousSampleExists).toEqual([false, false]);
    expect(state.childOutput).toEqual(['ignore', 'ignore', 'ignore']);
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).not.toMatch(
      /private|fixture\.test\/image|headers|requestId/
    );
    for (const args of state.calls) {
      const reportPath = args
        .find(arg => arg.startsWith('--output-path='))!
        .slice('--output-path='.length);
      expect(existsSync(path.dirname(reportPath))).toBe(false);
    }
  });

  it('rejects a route id that selects nothing', async () => {
    await expect(
      main(['--base-url', 'https://x.test', '--route-id', 'nope'])
    ).rejects.toThrow('no entry routes selected');
  });

  it('passes (exit 0) when every sampled route is inside budget', async () => {
    const code = await main([
      '--base-url',
      'https://x.test',
      '--route-id',
      'start',
      '--runs',
      '3',
    ]);
    expect(code).toBe(0);
    expect(state.calls).toHaveLength(3);
    expect(state.calls[0].some(a => a.startsWith('--extra-headers'))).toBe(
      false
    );
  });

  it('fails (exit 1) when LCP exceeds the budget', async () => {
    state.lcp = 9000;
    const code = await main([
      '--base-url',
      'https://x.test',
      '--route-id',
      'start',
      '--runs',
      '1',
    ]);
    expect(code).toBe(1);
  });

  it('retains safe LH13 failure diagnostics without changing the sampled verdict or leaking report secrets', async () => {
    process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET = 'bypass-private-value';
    const destination = new URL(
      'https://preview.example.test/signin?token=query-private-value#fragment-private-value'
    );
    destination.username = 'private-user';
    destination.password = 'private-password';
    state.report = {
      lighthouseVersion: '13.4.1',
      finalDisplayedUrl: destination.href,
      configSettings: {
        extraHeaders: { authorization: 'header-private-value' },
      },
      audits: {
        'largest-contentful-paint': { numericValue: 7317 },
        'cumulative-layout-shift': { numericValue: 0 },
        'lcp-breakdown-insight': {
          details: {
            type: 'list',
            items: [
              {
                type: 'table',
                items: [
                  { subpart: 'timeToFirstByte', duration: 120 },
                  { subpart: 'resourceLoadDelay', duration: 30 },
                  { subpart: 'resourceLoadDuration', duration: 200 },
                  { subpart: 'elementRenderDelay', duration: 50 },
                ],
              },
              {
                type: 'node',
                snippet:
                  '<img src="https://example.test/image?token=node-private-value">',
                selector: '#private-user-id > img',
                nodeLabel: 'private-profile-name',
              },
            ],
          },
        },
      },
    };
    const code = await main([
      '--base-url',
      'https://preview.example.test',
      '--route-id',
      'claim-link',
      '--runs',
      '3',
    ]);
    expect(code).toBe(1);
    expect(state.calls).toHaveLength(3);
    expect(
      state.calls.every(
        args => args[1] === 'https://preview.example.test/tim?claim=1'
      )
    ).toBe(true);
    const logs = vi.mocked(console.log).mock.calls.map(args => args.join(' '));
    const diagnosticLines = logs.filter(line =>
      line.startsWith('  claim-link diagnostics ')
    );
    expect(diagnosticLines).toHaveLength(3);
    expect(
      JSON.parse(diagnosticLines[0].slice('  claim-link diagnostics '.length))
    ).toEqual({
      lighthouseVersion: '13.4.1',
      finalOrigin: 'https://preview.example.test',
      finalPath: '/signin',
      element: { tag: 'img' },
      observedLcpBreakdownMs: {
        timeToFirstByte: 120,
        resourceLoadDelay: 30,
        resourceLoadDuration: 200,
        elementRenderDelay: 50,
      },
      diagnosticSource: 'lcp-breakdown-insight',
      lcpResource: { status: 'unavailable', reason: 'asset-read' },
    });
    expect(logs.join('\n')).toContain(
      'FAIL claim-link: LCP 7317ms / 7000ms, CLS 0.000 / 0.05'
    );
    expect(logs.join('\n')).not.toMatch(/private|<img|authorization/);
    for (const args of state.calls) {
      for (const prefix of ['--output-path=', '--extra-headers=']) {
        const fileArg = args.find(arg => arg.startsWith(prefix));
        expect(fileArg).toBeDefined();
        expect(existsSync(fileArg!.slice(prefix.length))).toBe(false);
      }
    }
  });

  it('passes the Vercel bypass as a private headers file when configured', async () => {
    process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET = 'secret-for-test';
    await main([
      '--base-url',
      'https://x.test',
      '--route-id',
      'start',
      '--runs',
      '1',
    ]);
    expect(state.calls[0].some(a => a.startsWith('--extra-headers='))).toBe(
      true
    );
  });

  it('surfaces a lighthouse process failure', async () => {
    state.status = 1;
    await expect(
      main([
        '--base-url',
        'https://x.test',
        '--route-id',
        'start',
        '--runs',
        '1',
      ])
    ).rejects.toThrow(/lighthouse failed/);
  });
});
