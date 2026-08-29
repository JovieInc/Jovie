/**
 * Bounded Playwright collector for live Storybook certification (JOV-5454).
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, relative, resolve } from 'node:path';
import {
  CANONICAL_LIVE_STORIES,
  LIVE_VIEWPORTS,
  REPO_ROOT,
  runLiveStorybookCertification,
  seededPassingObservations,
  validateCanonicalStoryInventory,
} from './component-live-storybook-certification.mjs';
import {
  killProcessGroup,
  spawnProcessGroup,
  waitForUrl,
  withBoundedLifecycle,
} from './component-live-storybook-lifecycle.mjs';

const require = createRequire(import.meta.url);
const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
});

function failCollect(message) {
  throw new Error(message);
}

function serveStatic(root) {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = resolve(root, `.${rel}`);
    if (!file.startsWith(resolve(root))) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    res.end(readFileSync(file));
  });
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('live Storybook server did not bind a TCP port'));
        return;
      }
      resolveListen({ server, port: address.port });
    });
  });
}

function closeServer(server) {
  return new Promise(resolveClose => {
    if (!server) {
      resolveClose();
      return;
    }
    server.close(() => resolveClose());
  });
}

function readStoryIndex(staticRoot) {
  for (const name of ['index.json', 'stories.json']) {
    const path = join(staticRoot, name);
    if (!existsSync(path)) continue;
    return JSON.parse(readFileSync(path, 'utf8'));
  }
  failCollect('Storybook index.json is missing after build; fail closed');
}

function assertIndexContainsCanonicalStories(index, repoRoot) {
  const entries = index?.entries ?? index?.stories ?? {};
  const issues = [];
  for (const story of CANONICAL_LIVE_STORIES) {
    const entry = entries[story.id];
    if (!entry || (entry.type && entry.type !== 'story')) {
      issues.push(
        `${story.id}: built Storybook index is missing the canonical story`
      );
      continue;
    }
    if (entry.importPath) {
      const normalized = relative(
        repoRoot,
        resolve(repoRoot, entry.importPath)
      ).replace(/\\/g, '/');
      if (
        !normalized.endsWith(story.importPath) &&
        normalized !== story.importPath
      ) {
        issues.push(
          `${story.id}: built import path ${normalized} does not match ${story.importPath}`
        );
      }
    }
  }
  if (issues.length) failCollect(issues.join('\n'));
}

function ownerSelector(owner) {
  if (owner === 'atom.button') return 'button, [role="button"]';
  if (owner === 'atom.badge') return 'span[data-variant], span[data-tone]';
  return '[data-variant="hoverable"], [data-variant="default"]';
}

/**
 * @param {string} outputDir
 * @param {{ register: (child: import('node:child_process').ChildProcess) => import('node:child_process').ChildProcess, signal: AbortSignal }} ctx
 */
async function buildStorybook(outputDir, ctx) {
  const child = ctx.register(
    spawnProcessGroup(
      'pnpm',
      [
        '--filter',
        '@jovie/web',
        'exec',
        'storybook',
        'build',
        '--output-dir',
        outputDir,
        '--quiet',
      ],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, JOVIE_LIVE_STORYBOOK_CERT: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
  );
  const output = { stdout: '', stderr: '' };
  child.stdout?.on('data', chunk => {
    output.stdout += chunk;
  });
  child.stderr?.on('data', chunk => {
    output.stderr += chunk;
  });
  const code = await new Promise((resolveExit, reject) => {
    const onAbort = () => {
      killProcessGroup(child, 'SIGKILL');
      reject(new Error('live Storybook build aborted; fail closed'));
    };
    if (ctx.signal?.aborted) {
      onAbort();
      return;
    }
    ctx.signal?.addEventListener('abort', onAbort, { once: true });
    child.once('error', reject);
    child.once('exit', (status, signalName) => {
      ctx.signal?.removeEventListener('abort', onAbort);
      resolveExit(status ?? (signalName ? 1 : 0));
    });
  });
  if (code !== 0) {
    failCollect(
      `Storybook build failed closed (${code}): ${(output.stderr || output.stdout || '').slice(0, 4000)}`
    );
  }
}

function resolveAxePath() {
  try {
    return require.resolve('axe-core/axe.min.js', {
      paths: [resolve(REPO_ROOT, 'apps/web')],
    });
  } catch {
    try {
      return require.resolve('axe-core/axe.min.js');
    } catch {
      failCollect('axe-core is not resolvable; fail closed');
    }
  }
}

function extractPaddingTokens(className) {
  return String(className || '')
    .split(/\s+/)
    .filter(token => /^(p[xytblr]?-\d|px-2\.5|py-0\.5)/.test(token));
}

function extractRadiusToken(className) {
  return (
    String(className || '')
      .split(/\s+/)
      .find(token => token.startsWith('rounded-')) ?? null
  );
}

function parseRgb(raw) {
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(
    raw || ''
  );
  if (!rgb) return null;
  const r = Number(rgb[1]) / 255;
  const g = Number(rgb[2]) / 255;
  const b = Number(rgb[3]) / 255;
  const luminance = 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  return {
    r,
    g,
    b,
    luminance: luminance < 0.5 ? 'dark' : 'light',
    raw,
  };
}

function srgb(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(a, b) {
  if (!a || !b) return null;
  const [x, y] = [
    0.2126 * srgb(a.r) + 0.7152 * srgb(a.g) + 0.0722 * srgb(a.b),
    0.2126 * srgb(b.r) + 0.7152 * srgb(b.g) + 0.0722 * srgb(b.b),
  ];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

async function measureStory(page, story, viewport, axePath) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await page.addInitScript(() => {
    try {
      const { localStorage } = /** @type {any} */ (globalThis);
      localStorage.setItem('jovie-theme-storybook', 'dark');
    } catch {
      // ignore
    }
  });
  await page.goto(`/iframe.html?id=${story.id}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const selector = ownerSelector(story.owner);
  await page.waitForSelector(`#storybook-root ${selector}, ${selector}`, {
    timeout: 30_000,
  });
  await page.addScriptTag({ path: axePath });

  const snapshot = await page.evaluate(
    ({ owner, selector: ownerSel }) => {
      const { document, getComputedStyle } = /** @type {any} */ (globalThis);
      const root =
        document.getElementById('storybook-root') ||
        document.getElementById('root') ||
        document.body;
      const el = root.querySelector(ownerSel);
      if (!el) return { missing: true };

      const classOf = node =>
        typeof node.className === 'string' ? node.className : '';
      const paddingClassSource = [];
      const visit = (node, depth) => {
        if (!node || depth > 4) return;
        paddingClassSource.push(classOf(node));
        for (const child of node.children) visit(child, depth + 1);
      };
      visit(el, 0);
      const classes = [classOf(el), ...paddingClassSource].join(' ');
      const style = getComputedStyle(el);
      const opaqueBg = node => {
        let current = node;
        while (current && current !== document.documentElement) {
          const bg = getComputedStyle(current).backgroundColor;
          if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
            return bg;
          }
          current = current.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const overflowOf = node => ({
        x: node.scrollWidth > node.clientWidth + 1,
        y: node.scrollHeight > node.clientHeight + 1,
      });
      const cssLengthToPx = value => {
        const raw = String(value || '').trim();
        if (!raw) return null;
        const probe = document.createElement('div');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.width = raw;
        document.body.appendChild(probe);
        const px = probe.getBoundingClientRect().width;
        probe.remove();
        return Number.isFinite(px) ? px : null;
      };
      const parsePx = value => {
        const n = Number.parseFloat(value);
        return Number.isFinite(n) ? n : null;
      };
      const box = el.getBoundingClientRect();
      const htmlTheme = document.documentElement.classList.contains('light')
        ? 'light'
        : 'dark';
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      const interactive = role === 'button' || el.tagName === 'BUTTON';
      const matchesOwner =
        owner === 'atom.badge'
          ? el.tagName === 'SPAN' &&
            (el.hasAttribute('data-variant') || el.hasAttribute('data-tone'))
          : owner === 'atom.button'
            ? interactive
            : classOf(el).includes('rounded-(--system-b-radius-card)') &&
              (el.getAttribute('data-variant') === 'default' ||
                el.getAttribute('data-variant') === 'hoverable');

      return {
        copy:
          (el.innerText || el.textContent || '').trim().split('\n')[0] || '',
        classes,
        variant: el.getAttribute('data-variant'),
        tone: el.getAttribute('data-tone'),
        role: interactive ? 'button' : role,
        interactive,
        accessibleName: (
          el.getAttribute('aria-label') ||
          el.innerText ||
          ''
        ).trim(),
        pageBackgroundColor: opaqueBg(document.body),
        backgroundColor: opaqueBg(el),
        color: style.color,
        outerRadiusPx: parsePx(style.borderTopLeftRadius),
        innerRadiusPx: cssLengthToPx(
          style.getPropertyValue('--system-b-radius-card-inner')
        ),
        insetPx: cssLengthToPx(style.getPropertyValue('--space-1')),
        overflow: overflowOf(el),
        box: { width: box.width, height: box.height },
        theme: htmlTheme,
        matchesOwner,
      };
    },
    { owner: story.owner, selector }
  );

  if (snapshot.missing) {
    failCollect(
      `${story.id}@${viewport.id}: story root rendered no nodes; fail closed`
    );
  }

  const before = snapshot.box;
  let hoverShiftPx = { width: 0, height: 0 };
  try {
    const locator = page.locator(`#storybook-root ${selector}`).first();
    await locator.hover({ timeout: 5_000 });
    const after = await locator.boundingBox();
    if (after) {
      hoverShiftPx = {
        width: after.width - before.width,
        height: after.height - before.height,
      };
    }
  } catch {
    hoverShiftPx = { width: 0, height: 0 };
  }

  let keyboardReached = false;
  if (story.owner === 'atom.button') {
    await page
      .locator('body')
      .click({ position: { x: 1, y: 1 } })
      .catch(() => undefined);
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      keyboardReached = await page.evaluate(() => {
        const { document } = /** @type {any} */ (globalThis);
        const active = document.activeElement;
        return Boolean(
          active &&
            (active.tagName === 'BUTTON' ||
              active.getAttribute('role') === 'button')
        );
      });
      if (keyboardReached) break;
    }
  }

  await page.evaluate(() => {
    const { document } = /** @type {any} */ (globalThis);
    document.documentElement.style.zoom = '2';
  });
  const zoomOverflow = await page.evaluate(ownerSel => {
    const { document } = /** @type {any} */ (globalThis);
    const root =
      document.getElementById('storybook-root') ||
      document.getElementById('root') ||
      document.body;
    const el = root.querySelector(ownerSel) || root.firstElementChild;
    if (!el) return { x: true, y: true };
    return {
      x: el.scrollWidth > el.clientWidth + 1,
      y: el.scrollHeight > el.clientHeight + 1,
    };
  }, selector);
  await page.evaluate(() => {
    const { document } = /** @type {any} */ (globalThis);
    document.documentElement.style.zoom = '';
  });

  const axe = await page.evaluate(async () => {
    const { document, axe: axeRuntime } = /** @type {any} */ (globalThis);
    const root =
      document.getElementById('storybook-root') ||
      document.getElementById('root') ||
      document.body;
    const results = await axeRuntime.run(root, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return results.violations.map(item => ({
      id: item.id,
      impact: item.impact,
    }));
  });

  const pageFill = parseRgb(snapshot.pageBackgroundColor);
  const fill = parseRgb(snapshot.backgroundColor);
  const foreground = parseRgb(snapshot.color);
  const paddingTokens = extractPaddingTokens(snapshot.classes);
  const radiusToken = extractRadiusToken(snapshot.classes);

  return {
    id: `${story.id}@${viewport.id}`,
    storyId: story.id,
    importPath: story.importPath,
    owner: story.owner,
    viewport: viewport.id,
    surface: { theme: snapshot.theme, luminance: snapshot.theme },
    copy: snapshot.copy,
    classes: snapshot.classes,
    variant: snapshot.variant,
    tone: snapshot.tone || undefined,
    interactive: snapshot.interactive,
    keyboardReached,
    accessibleName: snapshot.accessibleName,
    padding: {
      tokens: paddingTokens,
      arbitrary: paddingTokens.some(token => /\[[^\]]+\]/.test(token)),
    },
    radius: {
      token: radiusToken,
      px: snapshot.outerRadiusPx,
      innerPx: snapshot.innerRadiusPx,
      insetPx: snapshot.insetPx,
      arbitrary: Boolean(radiusToken && /\[[^\]]+\]/.test(radiusToken)),
    },
    fill: pageFill ?? fill,
    foreground,
    contrastRatio: contrastRatio(fill, foreground),
    axeViolations: axe,
    overflow: snapshot.overflow,
    zoomOverflow,
    hoverShiftPx,
    geometry: { matchesOwner: snapshot.matchesOwner === true },
  };
}

export async function collectLiveObservations(options = {}) {
  const inventory = validateCanonicalStoryInventory({
    repoRoot: options.repoRoot ?? REPO_ROOT,
  });
  if (!inventory.ok) failCollect(inventory.issues.join('\n'));
  const axePath = resolveAxePath();

  return withBoundedLifecycle(
    { timeoutMs: options.timeoutMs, prefix: 'jovie-live-sb-' },
    async ({ dir, register, signal }) => {
      const staticRoot = join(dir, 'storybook-static');
      await buildStorybook(staticRoot, { register, signal });
      if (signal.aborted)
        failCollect('live Storybook collect aborted; fail closed');
      assertIndexContainsCanonicalStories(
        readStoryIndex(staticRoot),
        options.repoRoot ?? REPO_ROOT
      );
      const { server, port } = await serveStatic(staticRoot);
      await waitForUrl(`http://127.0.0.1:${port}/iframe.html`, {
        signal,
        timeoutMs: 30_000,
      });
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const observations = [];
      try {
        const context = await browser.newContext({
          baseURL: `http://127.0.0.1:${port}`,
        });
        const page = await context.newPage();
        for (const story of CANONICAL_LIVE_STORIES) {
          for (const viewport of LIVE_VIEWPORTS) {
            if (signal.aborted) {
              failCollect('live Storybook collect aborted; fail closed');
            }
            observations.push(
              await measureStory(page, story, viewport, axePath)
            );
          }
        }
      } finally {
        await browser.close().catch(() => undefined);
        await closeServer(server);
      }
      return observations;
    }
  );
}

export async function collectAndCertify(options = {}) {
  const observations = await collectLiveObservations(options);
  const templates = new Map(
    seededPassingObservations().map(item => [item.id, item])
  );
  const merged = observations.map(item => {
    const template = templates.get(item.id);
    if (!template) return item;
    return {
      ...template,
      ...item,
      applicable: template.applicable,
      notApplicable: template.notApplicable,
    };
  });
  return runLiveStorybookCertification({
    headSha: options.headSha,
    observations: merged,
    repoRoot: options.repoRoot,
  });
}
