import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium, devices } from 'playwright';
import {
  createContextFactory,
  launchIdentifiedBrowser,
} from '../../../../../scripts/product-crawl/browser-context.mjs';
import { createDirectFetch } from '../../../../../scripts/product-crawl/direct-fetch.mjs';
import {
  CRAWL_UA,
  createTrafficEvidence,
} from '../../../../../scripts/product-crawl/traffic-evidence.mjs';

/** Real-browser contract. Only two loopback servers receive traffic.
 * Service-worker updates and redirects are deliberately present, never suppressed.
 */
export async function runFollowupNetworkFixture() {
  const rows = [];
  let phase = 'baseline';
  const listen = async (server, host) => {
    await new Promise(resolve => server.listen(0, host, resolve));
    return `http://${host}:${server.address().port}`;
  };
  const foreign = createServer((request, response) => {
    rows.push({
      phase,
      party: 'foreign',
      path: request.url,
      headers: request.headers,
    });
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'text/html');
    response.end(
      request.url === '/normal-final'
        ? '<body>normal-redirect-equivalent</body>'
        : 'worker-redirect-equivalent'
    );
  });
  const foreignOrigin = (await listen(foreign, '127.0.0.1')).replace(
    '127.0.0.1',
    'localhost'
  );
  const first = createServer((request, response) => {
    rows.push({
      phase,
      party: 'first',
      path: request.url,
      headers: request.headers,
    });
    response.setHeader(
      'Cache-Control',
      request.url === '/cache-asset'
        ? 'public,max-age=31536000,immutable'
        : 'no-store'
    );
    response.setHeader(
      'Content-Type',
      request.url.endsWith('.js') ? 'application/javascript' : 'text/html'
    );
    if (request.url === '/sw.js') {
      response.end(
        "self.addEventListener('install',e=>e.waitUntil(caches.open('fixture').then(c=>c.add('/offline.html'))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(new URL(e.request.url).pathname==='/controlled')e.respondWith(fetch('/controlled-data').then(r=>r.text()).then(t=>new Response('<body>'+t+'</body>',{headers:{'content-type':'text/html'}})));if(new URL(e.request.url).pathname==='/cached')e.respondWith(caches.match('/offline.html'))})"
      );
    } else if (request.url === '/worker.js') {
      response.end(
        "fetch('/worker-redirect').then(r=>r.text()).then(postMessage)"
      );
    } else if (
      request.url === '/worker-redirect' ||
      request.url === '/normal-redirect' ||
      request.url === '/direct-redirect'
    ) {
      const path =
        request.url === '/normal-redirect' ? '/normal-final' : '/worker-final';
      response.writeHead(302, { Location: `${foreignOrigin}${path}` });
      response.end();
    } else if (request.url === '/cache-asset') response.end('cache-equivalent');
    else if (request.url === '/controlled-data')
      response.end('controlled-equivalent');
    else if (request.url === '/offline.html')
      response.end('<body>offline-cache-equivalent</body>');
    else if (request.url === '/cap')
      response.end(
        '<link rel="icon" href="data:,"><body>cap-fixture<script src="/cap-a.js"></script><script src="/cap-b.js"></script><script src="/cap-c.js"></script><script src="/cap-d.js"></script></body>'
      );
    else if (request.url.startsWith('/cap-'))
      response.end('globalThis.fixtureAsset=true;');
    else
      response.end(
        '<link rel="icon" href="data:,"><body>fixture-equivalent</body>'
      );
  });
  const origin = await listen(first, '127.0.0.1');
  let baselineBrowser;
  let candidateBrowser;
  const metadata = {
    run: 'fixture-run',
    deployment: 'dpl_fixture',
    invocation: 'fixture-invocation',
  };
  const protectionCookies = [
    {
      name: 'fixture-protection',
      value: 'host-only-fixture',
      url: origin,
      httpOnly: true,
    },
  ];
  const viewports = {
    desktop: { width: 1440, height: 900 },
    phone: { width: 390, height: 844 },
  };
  const records = label => rows.filter(row => row.phase === label);
  const runCoverage = async openContext => {
    const context = await openContext({
      viewport: 'desktop',
      identity: 'stranger',
    });
    const page = await context.newPage();
    try {
      await page.goto(`${origin}/start`, { waitUntil: 'load' });
      const cacheBodies = await page.evaluate(async () => [
        await (await fetch('/cache-asset')).text(),
        await (await fetch('/cache-asset')).text(),
      ]);
      await page.evaluate(async () => {
        await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
          await new Promise(resolve =>
            navigator.serviceWorker.addEventListener(
              'controllerchange',
              resolve,
              { once: true }
            )
          );
      });
      await page.goto(`${origin}/controlled`, { waitUntil: 'load' });
      const controlledBody = await page.textContent('body');
      const workerBody = await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const worker = new Worker('/worker.js');
            worker.onmessage = event => {
              worker.terminate();
              resolve(event.data);
            };
            worker.onerror = event => reject(new Error(event.message));
          })
      );
      // An explicit ordinary update exposes the known browser-process accounting
      // escape without sleeps, polling, unregistering or suppressing service workers.
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration.update();
      });
      await page.goto(`${origin}/cached`, { waitUntil: 'load' });
      const cachedBody = await page.textContent('body');
      await page.goto(`${origin}/normal-redirect`, { waitUntil: 'load' });
      const redirectBody = await page.textContent('body');
      return {
        cacheBodies,
        controlledBody,
        workerBody,
        cachedBody,
        redirectBody,
      };
    } finally {
      await context.close();
    }
  };
  try {
    baselineBrowser = await chromium.launch();
    const baseline = await runCoverage(async () => {
      const context = await baselineBrowser.newContext({
        viewport: viewports.desktop,
      });
      await context.addCookies(
        protectionCookies.map(cookie => ({ ...cookie }))
      );
      return context;
    });
    phase = 'baseline-cap';
    const unbounded = await baselineBrowser.newContext();
    try {
      const page = await unbounded.newPage();
      await page.goto(`${origin}/cap`, { waitUntil: 'load' });
    } finally {
      await unbounded.close();
    }
    assert.equal(records('baseline-cap').length, 5);
    await baselineBrowser.close();
    baselineBrowser = undefined;
    phase = 'candidate';
    const launched = await launchIdentifiedBrowser(chromium);
    candidateBrowser = launched.browser;
    const evidence = createTrafficEvidence({
      origin,
      maxInterceptedRequests: 100,
      pageIntervalMs: 0,
    });
    const openContext = createContextFactory({
      browser: candidateBrowser,
      origin,
      viewports,
      evidence,
      metadata,
      protectionCookies,
      deviceOptions: { phone: devices['iPhone 13'] },
      storageState: {
        cookies: [
          {
            name: 'fixture-account',
            value: 'signed-in-only',
            domain: '127.0.0.1',
            path: '/',
            expires: -1,
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
    });
    const candidate = await runCoverage(openContext);
    assert.deepEqual(
      candidate,
      baseline,
      'functional and cache-backed content coverage must match the native baseline'
    );
    assert.deepEqual(candidate, {
      cacheBodies: ['cache-equivalent', 'cache-equivalent'],
      controlledBody: 'controlled-equivalent',
      workerBody: 'worker-redirect-equivalent',
      cachedBody: 'offline-cache-equivalent',
      redirectBody: 'normal-redirect-equivalent',
    });
    assert.equal(
      records('baseline').filter(r => r.path === '/cache-asset').length,
      1
    );
    assert.equal(
      records('candidate').filter(r => r.path === '/cache-asset').length,
      1,
      'within-page native HTTP caching must survive request admission instrumentation'
    );
    assert.equal(
      records('candidate').filter(r => r.path === '/cached').length,
      0,
      'CacheStorage navigation stays local'
    );
    assert.ok(
      records('candidate').filter(r => r.path === '/sw.js').length >= 2,
      'main-script update escape was exercised'
    );
    for (const identity of ['signed-in', 'stranger']) {
      const context = await openContext({ viewport: 'desktop', identity });
      try {
        const page = await context.newPage();
        await page.goto(`${origin}/identity-${identity}`);
      } finally {
        await context.close();
      }
    }
    const phone = await openContext({
      viewport: 'phone',
      identity: 'stranger',
    });
    try {
      const page = await phone.newPage();
      await page.goto(`${origin}/phone`);
    } finally {
      await phone.close();
    }
    const phoneUA = records('candidate').find(r => r.path === '/phone').headers[
      'user-agent'
    ];
    assert.equal(phoneUA, `${devices['iPhone 13'].userAgent} ${CRAWL_UA}`);
    const accountRows = records('candidate').filter(r =>
      r.path.startsWith('/identity-')
    );
    assert.match(
      accountRows.find(r => r.path.endsWith('signed-in')).headers.cookie,
      /fixture-account=signed-in-only/
    );
    assert.doesNotMatch(
      accountRows.find(r => r.path.endsWith('stranger')).headers.cookie,
      /fixture-account=/
    );
    const direct = createDirectFetch({ origin, evidence, metadata });
    const firstDirect = await direct(`${origin}/direct-redirect`, {
      headers: {
        cookie: 'fixture-direct=own',
        'x-vercel-protection-bypass': 'fixture-only',
      },
    });
    assert.equal(
      firstDirect.status,
      302,
      'direct fetch must return redirects without following them automatically'
    );
    const foreignDirectUrl = new URL(
      firstDirect.headers.get('location'),
      origin
    ).href;
    await firstDirect.text();
    const foreignDirect = await direct(foreignDirectUrl, {
      headers: {
        cookie: 'fixture-direct=own',
        'x-vercel-protection-bypass': 'fixture-only',
        'x-vercel-set-bypass-cookie': 'true',
        'x-jovie-crawl-run': metadata.run,
        'x-synthetic-monitoring': 'product-crawl',
      },
    });
    await foreignDirect.text();
    await evidence.settle();
    const traffic = evidence.snapshot();
    assert.ok(traffic.observed.responseBodyBytes > 0);
    assert.ok(traffic.observed.requestsWithSizes > 0);
    assert.ok(
      traffic.observed.serviceWorkerResponses > 0,
      'logical SW deliveries stay identified separately'
    );
    assert.equal(traffic.observed.inFlight, 0);
    assert.equal(traffic.owners.directFetch.attempted, 2);
    assert.equal(traffic.owners.directFetch.requestsWithoutSizes, 2);
    assert.equal(traffic.accounting.complete, false);
    assert.equal(traffic.accounting.absoluteAllNetworkCapEnforced, false);
    assert.deepEqual(traffic.accounting.browserProcessRequests, {
      attempted: null,
      bytes: null,
      automaticServiceWorkerUpdatesPossible: true,
    });
    assert.deepEqual(traffic.cost, { estimatedUsd: null, billedUsd: null });
    assert.deepEqual(traffic.accounting.instrumentationErrors, []);
    const candidateRows = records('candidate');
    assert.equal(
      candidateRows.find(r => r.path === '/start').headers['user-agent'],
      `${launched.nativeUserAgent} ${CRAWL_UA}`
    );
    assert.equal(
      launched.nativeUserAgent,
      records('baseline').find(r => r.path === '/start').headers['user-agent']
    );
    for (const row of candidateRows) {
      assert.ok(
        row.headers['user-agent'].endsWith(CRAWL_UA),
        `generic traffic identity missing for ${row.path}`
      );
      if (row.party === 'foreign') {
        for (const key of [
          'cookie',
          'x-jovie-crawl-run',
          'x-jovie-crawl-deployment',
          'x-jovie-crawl-invocation',
          'x-synthetic-monitoring',
          'x-vercel-protection-bypass',
          'x-vercel-set-bypass-cookie',
        ])
          assert.equal(
            row.headers[key],
            undefined,
            `${key} leaked to the foreign origin`
          );
      }
    }
    for (const path of [
      '/start',
      '/normal-redirect',
      '/phone',
      '/direct-redirect',
    ]) {
      const row = candidateRows.find(r => r.path === path);
      assert.equal(
        row.headers['x-jovie-crawl-run'],
        metadata.run,
        `proven first-party metadata missing at ${path}`
      );
    }
    // Cookie scope is host-based, but invocation metadata is exact-origin.
    // Exercise another port on the same host independently of foreign-host
    // assertions; no cookie is repurposed to carry invocation metadata.
    phase = 'port';
    const portContext = await openContext({
      viewport: 'desktop',
      identity: 'stranger',
    });
    try {
      const page = await portContext.newPage();
      await page.goto(
        `${foreignOrigin.replace('localhost', '127.0.0.1')}/other-port`
      );
    } finally {
      await portContext.close();
    }
    const portRow = records('port')[0];
    assert.match(
      portRow.headers.cookie,
      /fixture-protection=host-only-fixture/
    );
    for (const name of [
      'x-synthetic-monitoring',
      'x-jovie-crawl-run',
      'x-jovie-crawl-deployment',
      'x-jovie-crawl-invocation',
    ])
      assert.equal(
        portRow.headers[name],
        undefined,
        `${name} crossed the first-party port boundary`
      );
    phase = 'cap';
    const cappedEvidence = createTrafficEvidence({
      origin,
      maxInterceptedRequests: 3,
      pageIntervalMs: 0,
    });
    const cappedOpen = createContextFactory({
      browser: candidateBrowser,
      origin,
      viewports,
      evidence: cappedEvidence,
      metadata: {},
      protectionCookies,
    });
    const capped = await cappedOpen({
      viewport: 'desktop',
      identity: 'stranger',
    });
    try {
      const page = await capped.newPage();
      await page.goto(`${origin}/cap`, { waitUntil: 'load' });
    } finally {
      await capped.close();
    }
    await cappedEvidence.settle();
    const cap = cappedEvidence.snapshot();
    assert.equal(cap.admission.admitted, 3);
    assert.ok(cap.admission.blocked > 0);
    assert.ok(
      cap.observed.failures > 0,
      'budget denials remain failed request evidence'
    );
    assert.equal(
      records('cap').length,
      3,
      'this fixture contains no redirects/internal requests and proves the finite intercepted ceiling'
    );
    return {
      baseline,
      candidate,
      cacheNetworkRequests: { baseline: 1, candidate: 1 },
      traffic,
      cap,
      network: candidateRows.map(row => ({
        party: row.party,
        path: row.path,
        genericMarker: row.headers['user-agent'].endsWith(CRAWL_UA),
        invocationMetadata: Boolean(row.headers['x-jovie-crawl-run']),
      })),
    };
  } finally {
    await baselineBrowser?.close();
    await candidateBrowser?.close();
    await new Promise(resolve => first.close(resolve));
    await new Promise(resolve => foreign.close(resolve));
  }
}
