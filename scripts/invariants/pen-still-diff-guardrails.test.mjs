import assert from 'node:assert/strict';
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { capturePathMatchesExpected } from './clef-screenshot-capture.mjs';
import {
  DEFAULT_PEN_CAPTURE_EMAIL,
  extractFreshOtp,
  isAllowedPenCaptureEmail,
  mintPenCaptureStorageState,
} from './pen-capture-auth.mjs';
import {
  evaluateManifestWithBrowser,
  formatComment,
  hasUsableStorageState,
  MANIFEST_SCHEMA,
  validateManifest,
} from './pen-still-diff.mjs';
import {
  encodePng,
  fillRect,
  judgePair,
  measureImage,
  solidImage,
  ssim,
} from './pen-still-diff-lib.mjs';

function makeStillFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'pen-guardrails-'));
  const img = solidImage(80, 60, [5, 6, 8, 255]);
  fillRect(img, 18, 16, 44, 28, [24, 26, 32, 255]);
  fillRect(img, 20, 8, 28, 3, [245, 247, 251, 255]);
  const pngBytes = encodePng(img);
  writeFileSync(join(root, 'anon.png'), pngBytes);
  writeFileSync(join(root, 'auth.png'), pngBytes);
  return { root, pngBytes };
}

test('auth: required frames fail closed with capture-auth-missing when no storageState is provided', async t => {
  const { root } = makeStillFixture(t);
  const manifest = {
    schema: MANIFEST_SCHEMA,
    frames: [
      {
        sectionId: 'chat/app-chat',
        penNodeId: 'hkkdJ',
        stillPath: 'auth.png',
        viewport: 1440,
        mode: 'dark',
        route: '/app/chat',
        auth: 'required',
        status: 'active',
      },
    ],
  };
  assert.equal(validateManifest(manifest).ok, true);
  assert.equal(hasUsableStorageState(undefined), false);
  assert.equal(hasUsableStorageState({ cookies: [], origins: [] }), false);

  const receipt = await evaluateManifestWithBrowser(manifest, {
    root,
    baseUrl: 'http://fixture.invalid',
    strict: true,
    launchBrowser: async () =>
      assert.fail('browser must not launch without usable auth state'),
  });
  assert.equal(receipt.pass, false);
  assert.equal(receipt.frames[0].verdict, 'waiting');
  assert.equal(receipt.frames[0].reason, 'capture-auth-missing');
  assert.match(formatComment(receipt), /waiting \(capture-auth-missing\)/u);
});

test('storageState is isolated to auth: required frames and never leaks to anonymous frames', async t => {
  const { root, pngBytes } = makeStillFixture(t);
  const statePath = join(root, 'state.json');
  writeFileSync(
    statePath,
    JSON.stringify({
      cookies: [
        {
          name: 'ba_session',
          value: 'tok',
          domain: 'fixture.invalid',
          path: '/',
        },
      ],
      origins: [],
    })
  );
  const manifest = {
    schema: MANIFEST_SCHEMA,
    frames: [
      {
        sectionId: 'signup-signin/signin',
        penNodeId: 'oaz9c',
        stillPath: 'anon.png',
        viewport: 1440,
        mode: 'dark',
        route: '/signin',
        status: 'active',
      },
      {
        sectionId: 'chat/app-chat',
        penNodeId: 'hkkdJ',
        stillPath: 'auth.png',
        viewport: 1440,
        mode: 'dark',
        route: '/app/chat',
        auth: 'required',
        status: 'active',
      },
    ],
  };
  const pageCalls = [];
  const launchBrowser = async () => ({
    isConnected: () => true,
    close: async () => {},
    newPage: async options => {
      let targetUrl = '';
      pageCalls.push(options);
      return {
        goto: async url => {
          targetUrl = url;
        },
        url: () => targetUrl,
        waitForTimeout: async () => {},
        screenshot: async () => pngBytes,
        locator: () => ({ evaluate: async () => null }),
        close: async () => {},
      };
    },
  });
  const receipt = await evaluateManifestWithBrowser(manifest, {
    root,
    baseUrl: 'http://fixture.invalid',
    storageState: statePath,
    strict: true,
    launchBrowser,
  });
  assert.equal(receipt.pass, true);
  assert.equal(pageCalls.length, 2);
  // /app/chat sorts before /signin alphabetically by route.
  assert.equal(pageCalls[0].storageState, statePath);
  assert.equal('storageState' in pageCalls[1], false);
});

test('capturePathMatchesExpected treats /app/chat/{id} as the chat surface', () => {
  assert.equal(capturePathMatchesExpected('/app/chat', '/app/chat'), true);
  assert.equal(
    capturePathMatchesExpected('/app/chat/thread-abc', '/app/chat'),
    true
  );
  assert.equal(capturePathMatchesExpected('/app/chat/', '/app/chat'), true);
  assert.equal(capturePathMatchesExpected('/start', '/app/chat'), false);
  assert.equal(capturePathMatchesExpected('/signin', '/app/chat'), false);
  assert.equal(capturePathMatchesExpected('/signin', '/signin'), true);
  assert.equal(capturePathMatchesExpected('/waitlist', '/signin'), false);
});

test('off-route redirect fails strict qualification and records capture-redirected-off-route', async t => {
  const { root, pngBytes } = makeStillFixture(t);
  const manifest = {
    schema: MANIFEST_SCHEMA,
    frames: [
      {
        sectionId: 'signup-signin/signin',
        penNodeId: 'oaz9c',
        stillPath: 'anon.png',
        viewport: 1440,
        mode: 'dark',
        route: '/signin',
        status: 'active',
      },
    ],
  };
  const receipt = await evaluateManifestWithBrowser(manifest, {
    root,
    baseUrl: 'http://fixture.invalid',
    strict: true,
    launchBrowser: async () => ({
      isConnected: () => true,
      close: async () => {},
      newPage: async () => ({
        goto: async () => {},
        url: () => 'http://fixture.invalid/waitlist',
        waitForTimeout: async () => {},
        screenshot: async () => pngBytes,
        locator: () => ({ evaluate: async () => null }),
        close: async () => {},
      }),
    }),
  });
  assert.equal(receipt.pass, false);
  assert.equal(receipt.frames[0].reason, 'capture-redirected-off-route');
  assert.match(
    formatComment(receipt),
    /waiting \(capture-redirected-off-route\)/u
  );
});

test('chat thread navigation /app/chat/{id} is comparable, not capture-redirected-off-route', async t => {
  const { root, pngBytes } = makeStillFixture(t);
  const statePath = join(root, 'state.json');
  writeFileSync(
    statePath,
    JSON.stringify({
      cookies: [
        {
          name: 'better-auth.session_token',
          value: 'fixture',
          domain: 'fixture.invalid',
          path: '/',
        },
      ],
      origins: [],
    })
  );
  const manifest = {
    schema: MANIFEST_SCHEMA,
    frames: [
      {
        sectionId: 'chat/app-chat',
        penNodeId: 'hkkdJ',
        stillPath: 'auth.png',
        viewport: 1440,
        mode: 'dark',
        route: '/app/chat',
        auth: 'required',
        status: 'active',
      },
    ],
  };
  const receipt = await evaluateManifestWithBrowser(manifest, {
    root,
    baseUrl: 'http://fixture.invalid',
    strict: true,
    storageState: statePath,
    launchBrowser: async () => ({
      isConnected: () => true,
      close: async () => {},
      newPage: async () => ({
        goto: async () => {},
        url: () => 'http://fixture.invalid/app/chat/thread-fixture',
        waitForTimeout: async () => {},
        screenshot: async () => pngBytes,
        locator: () => ({
          first: () => ({ screenshot: async () => pngBytes }),
          evaluate: async () => null,
        }),
        close: async () => {},
      }),
    }),
  });
  assert.equal(receipt.frames[0].reason, undefined);
  assert.notEqual(receipt.frames[0].verdict, 'waiting');
  assert.ok(
    receipt.frames[0].verdict === 'pass' || receipt.frames[0].verdict === 'fail'
  );
});

test('DEFAULT_PEN_CAPTURE_EMAIL is the chat-health canary', () => {
  assert.equal(DEFAULT_PEN_CAPTURE_EMAIL, 'browse-ready+chat-health@jov.ie');
  assert.equal(
    isAllowedPenCaptureEmail('browse-ready+canary-admitted@jov.ie'),
    true
  );
});

test('mockup-less form screen (oaz9c /signin geometry) ignores hollow 1px pills and 1px icon speckles', () => {
  const bg = [5, 6, 8, 255];
  const hairline = [42, 44, 48, 255];
  const ink = [245, 247, 251, 255];
  const pen = solidImage(1440, 900, bg);
  const render = solidImage(1440, 900, bg);

  for (const img of [pen, render]) {
    // Centered heading + subcopy + button text bands
    fillRect(img, 580, 310, 280, 24, ink);
    fillRect(img, 540, 350, 360, 14, ink);
    fillRect(img, 630, 420, 180, 14, ink);
    // Hollow 1px 360x40 email input outline
    fillRect(img, 540, 405, 360, 1, hairline);
    fillRect(img, 540, 444, 360, 1, hairline);
    fillRect(img, 540, 405, 1, 40, hairline);
    fillRect(img, 899, 405, 1, 40, hairline);
  }
  // Render has a 1px anti-aliased icon highlight row + 2-line split in place
  fillRect(render, 600, 490, 6, 1, ink);
  fillRect(pen, 610, 520, 220, 28, ink);
  fillRect(render, 610, 520, 220, 12, ink);
  fillRect(render, 610, 536, 220, 12, ink);

  const penM = measureImage(pen);
  const renderM = measureImage(render);
  assert.equal(penM.mockup, null);
  assert.equal(renderM.mockup, null);
  const judgment = judgePair(penM, renderM, ssim(pen, render));
  assert.equal(judgment.pass, true);
  assert.ok(judgment.ssim >= 0.99);
  assert.ok(judgment.textBlockYDelta <= 0.02);

  // Moving or adding a distant text block still fails textPass.
  const shifted = solidImage(1440, 900, bg);
  fillRect(shifted, 580, 310, 280, 24, ink);
  fillRect(shifted, 540, 350, 360, 14, ink);
  fillRect(shifted, 630, 420, 180, 14, ink);
  fillRect(shifted, 610, 760, 220, 24, ink);
  const badJudgment = judgePair(
    penM,
    measureImage(shifted),
    ssim(pen, shifted)
  );
  assert.equal(badJudgment.textPass, false);
  assert.equal(badJudgment.pass, false);
});

test('pen-capture-auth allowlists sanctioned canaries and writes 0600 storageState', async () => {
  assert.equal(isAllowedPenCaptureEmail(DEFAULT_PEN_CAPTURE_EMAIL), true);
  assert.equal(isAllowedPenCaptureEmail('attacker@example.com'), false);
  const now = Date.now();
  assert.equal(
    extractFreshOtp(
      {
        value: '123456:0',
        created_at: new Date(now - 1000).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
      },
      now,
      now
    ),
    '123456'
  );
  assert.equal(
    extractFreshOtp(
      {
        value: '123456:5',
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
      },
      now,
      now
    ),
    null
  );

  await assert.rejects(
    () =>
      mintPenCaptureStorageState({
        email: 'outside@jov.ie',
        loadRecord: async () => null,
      }),
    /Refusing non-canary/u
  );

  const dir = mkdtempSync(join(tmpdir(), 'pen-auth-state-'));
  const outPath = join(dir, 'state.json');
  const posts = [];
  const state = await mintPenCaptureStorageState({
    origin: 'https://jov.ie',
    outPath,
    loadRecord: async (_email, startedAtMs) => ({
      value: '654321:0',
      created_at: new Date(startedAtMs).toISOString(),
      expires_at: new Date(startedAtMs + 60_000).toISOString(),
    }),
    newRequestContext: async () => ({
      post: async (path, opts) => {
        posts.push([path, opts.data]);
        return { ok: () => true, status: () => 200 };
      },
      storageState: async () => ({
        cookies: [
          {
            name: 'better-auth.session_token',
            value: 's',
            domain: 'jov.ie',
            path: '/',
          },
        ],
        origins: [],
      }),
      dispose: async () => {},
    }),
  });
  assert.equal(state.cookies.length, 1);
  assert.equal(posts.length, 2);
  assert.equal(posts[1][1].otp, '654321');
  assert.equal(statSync(outPath).mode & 0o777, 0o600);
});
