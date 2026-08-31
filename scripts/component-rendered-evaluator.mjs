#!/usr/bin/env node

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateRenderedSnapshots } from './component-rendered-invariant-policy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRequire = createRequire(
  resolve(__dirname, '../apps/web/package.json')
);
const AxeBuilder = workspaceRequire('@axe-core/playwright').default;
const { chromium } = workspaceRequire('playwright');
const VIEWPORTS = Object.freeze([
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'compact', width: 390, height: 844 },
]);

function parseArgs(argv) {
  const flags = {
    storybookUrl: null,
    captureDir: null,
    components: [],
    storyPaths: [],
  };
  for (const arg of argv) {
    if (arg.startsWith('--storybook-url='))
      flags.storybookUrl = arg.slice(16).replace(/\/$/, '');
    else if (arg.startsWith('--capture-dir='))
      flags.captureDir = resolve(arg.slice(14));
    else if (arg.startsWith('--component='))
      flags.components.push(arg.slice(12));
    else if (arg.startsWith('--story-path='))
      flags.storyPaths.push(arg.slice(13));
  }
  return flags;
}

function normalizeImportPath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '');
}

function storyRequestGroups(flags) {
  const requests = flags.storyPaths
    .map(normalizeImportPath)
    .filter(Boolean)
    .map(storyPath => ({ label: storyPath, candidates: [storyPath] }));
  for (const component of flags.components) {
    const normalized = normalizeImportPath(component);
    if (!normalized) continue;
    const stem = basename(normalized).replace(/\.tsx$/i, '');
    const directory = dirname(normalized);
    requests.push({
      label: normalized,
      candidates: [
        `${directory}/${stem}.stories.tsx`,
        `${directory}/${stem}.stories.ts`,
      ],
    });
  }
  return requests;
}

export function storyCandidates(index, flags) {
  const requests = storyRequestGroups(flags);
  const matched = Object.values(index.entries ?? {})
    .filter(entry => entry.type === 'story')
    .map(entry => ({
      entry,
      importPath: normalizeImportPath(entry.importPath),
    }));
  const stories = [];
  const storyIds = new Set();
  const missingRequests = [];

  for (const request of requests) {
    const candidatePaths = new Set(request.candidates.map(normalizeImportPath));
    const requestMatches = matched
      .filter(({ importPath }) => candidatePaths.has(importPath))
      .map(({ entry }) => entry);
    const certified = requestMatches.filter(entry =>
      entry.tags?.includes('jovie-certification')
    );
    const selected = certified.length > 0 ? certified : requestMatches;
    if (selected.length === 0) {
      missingRequests.push(request.label);
      continue;
    }
    for (const story of selected) {
      if (storyIds.has(story.id)) continue;
      storyIds.add(story.id);
      stories.push(story);
    }
  }

  return { stories, missingRequests };
}

function slug(value) {
  return String(value)
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

async function resolveVariantTarget(wrapper) {
  const explicit = wrapper.locator('[data-jovie-eval-target]').first();
  if ((await explicit.count()) > 0) return explicit;

  const child = wrapper.locator(':scope > *').first();
  if ((await child.count()) > 0) return child;

  return wrapper;
}

async function collectSnapshots(page, story, viewport, storybookUrl) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await page.goto(
    `${storybookUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`,
    {
      // Storybook keeps a development websocket open, so network-idle is not a
      // meaningful readiness signal. The certified component root below is.
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    }
  );
  await page
    .locator('[data-jovie-eval-family]')
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-jovie-eval-family]')].every(
        element =>
          element.getAttribute('data-jovie-eval-theme') ===
          (document.documentElement.classList.contains('dark')
            ? 'dark'
            : 'light')
      ),
    undefined,
    { timeout: 5_000 }
  );

  const roots = page.locator('[data-jovie-eval-family]');
  const rootCount = await roots.count();
  const snapshots = [];

  for (let rootIndex = 0; rootIndex < rootCount; rootIndex += 1) {
    const root = roots.nth(rootIndex);
    const instanceId = `${slug(story.id)}-${rootIndex}`;
    await root.evaluate((element, id) => {
      element.setAttribute('data-jovie-eval-instance', id);
    }, instanceId);
    await page.evaluate(() => {
      // Storybook's a11y tooling may leave a different axe-core build on the
      // preview window. The evaluator injects its own pinned build per root.
      Reflect.deleteProperty(window, 'axe');
    });
    const axe = await new AxeBuilder({ page })
      .include(`[data-jovie-eval-instance="${instanceId}"]`)
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const snapshot = await root.evaluate(
      (element, context) => {
        const parseColor = value => {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return null;
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = value;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
          return { r, g, b, a: a / 255 };
        };
        const sameColor = (left, right) => {
          if (!left || !right) return false;
          return ['r', 'g', 'b', 'a'].every(
            key =>
              Math.abs(left[key] - right[key]) <= (key === 'a' ? 1 / 255 : 1)
          );
        };
        const luminance = color => {
          const linear = channel => {
            const value = channel / 255;
            return value <= 0.04045
              ? value / 12.92
              : ((value + 0.055) / 1.055) ** 2.4;
          };
          return (
            0.2126 * linear(color.r) +
            0.7152 * linear(color.g) +
            0.0722 * linear(color.b)
          );
        };
        const contrast = (foreground, background) => {
          if (!foreground || !background) return null;
          const bright = Math.max(luminance(foreground), luminance(background));
          const dark = Math.min(luminance(foreground), luminance(background));
          return (bright + 0.05) / (dark + 0.05);
        };
        const tokenColor = token => {
          const value = getComputedStyle(document.documentElement)
            .getPropertyValue(token)
            .trim();
          return parseColor(value);
        };
        const px = value => Number.parseFloat(value) || 0;
        const tokenLength = token => {
          if (!token) return Number.NaN;
          const probe = document.createElement('div');
          probe.style.cssText = `position:fixed;visibility:hidden;width:var(${token});`;
          document.body.append(probe);
          const value = px(getComputedStyle(probe).width);
          probe.remove();
          return value;
        };
        const anatomy = node => {
          const children = [...node.children]
            .map(child => anatomy(child))
            .join(',');
          return `${node.tagName.toLowerCase()}[${children}]`;
        };
        const focusableSelector =
          'a[href],button,input,select,textarea,[tabindex],[contenteditable=""],[contenteditable="true"]';
        const isSequentiallyFocusable = node => {
          if (!(node instanceof HTMLElement)) return false;
          if (node.closest('[hidden],[inert]')) return false;
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
          }
          if (node.matches(':disabled')) return false;
          if (node instanceof HTMLInputElement && node.type === 'hidden') {
            return false;
          }
          const tabindex = node.getAttribute('tabindex');
          if (tabindex !== null) {
            const parsed = Number.parseInt(tabindex, 10);
            return Number.isFinite(parsed) && parsed >= 0;
          }
          if (node instanceof HTMLAnchorElement)
            return node.hasAttribute('href');
          return (
            node instanceof HTMLButtonElement ||
            node instanceof HTMLInputElement ||
            node instanceof HTMLSelectElement ||
            node instanceof HTMLTextAreaElement ||
            node.isContentEditable
          );
        };
        const actualTheme = document.documentElement.classList.contains('dark')
          ? 'dark'
          : 'light';
        const surfaceStyle = getComputedStyle(element);
        const surfaceToken = element.dataset.jovieEvalSurfaceToken ?? '';
        const mapping = JSON.parse(element.dataset.jovieEvalMapping || '{}');
        const owner = element.dataset.jovieEvalOwner ?? '';
        const variants = [
          ...element.querySelectorAll('[data-jovie-eval-variant]'),
        ].map(wrapper => {
          const target =
            wrapper.querySelector('[data-jovie-eval-target]') ||
            wrapper.firstElementChild ||
            wrapper;
          const style = getComputedStyle(target);
          const paddingXToken = wrapper.dataset.jovieEvalPaddingX ?? '';
          const paddingYToken = wrapper.dataset.jovieEvalPaddingY ?? '';
          const radiusToken = wrapper.dataset.jovieEvalRadius ?? '';
          const interactive = wrapper.dataset.jovieEvalInteractive === 'true';
          const rect = target.getBoundingClientRect();
          const radiusCorners = {
            topLeft: px(style.borderTopLeftRadius),
            topRight: px(style.borderTopRightRadius),
            bottomRight: px(style.borderBottomRightRadius),
            bottomLeft: px(style.borderBottomLeftRadius),
          };
          const targetBackground = parseColor(style.backgroundColor);
          const inheritedBackground =
            targetBackground?.a > 0
              ? targetBackground
              : parseColor(surfaceStyle.backgroundColor);
          const foreground = parseColor(style.color);
          const radiusValue = tokenLength(radiusToken);
          const variantKey = wrapper.dataset.jovieEvalVariant ?? '';
          const expectedToneMapped = Object.prototype.hasOwnProperty.call(
            mapping,
            variantKey
          );
          const expectedTone = expectedToneMapped ? mapping[variantKey] : null;
          const tabbables = [
            target,
            ...target.querySelectorAll(focusableSelector),
          ].filter(isSequentiallyFocusable).length;
          const fontSize = px(style.fontSize);
          const fontWeight = Number.parseFloat(style.fontWeight) || 0;
          const largeText =
            fontSize >= 24 || (fontSize >= 18.67 && fontWeight >= 700);
          return {
            key: variantKey,
            tone: wrapper.dataset.jovieEvalTone ?? null,
            expectedTone,
            expectedToneMapped,
            owner: wrapper.dataset.jovieEvalOwner ?? owner,
            anatomy: anatomy(target),
            geometry: {
              paddingTop: px(style.paddingTop),
              paddingRight: px(style.paddingRight),
              paddingBottom: px(style.paddingBottom),
              paddingLeft: px(style.paddingLeft),
              borderRadius: radiusCorners.topLeft,
              borderTopLeftRadius: radiusCorners.topLeft,
              borderTopRightRadius: radiusCorners.topRight,
              borderBottomRightRadius: radiusCorners.bottomRight,
              borderBottomLeftRadius: radiusCorners.bottomLeft,
              borderTop: px(style.borderTopWidth),
              borderRight: px(style.borderRightWidth),
              borderBottom: px(style.borderBottomWidth),
              borderLeft: px(style.borderLeftWidth),
              minHeight: px(style.minHeight),
              height: rect.height,
              fontSize,
              lineHeight: px(style.lineHeight),
              fontWeight,
            },
            paddingTokenMatched:
              Boolean(paddingXToken && paddingYToken) &&
              Math.abs(px(style.paddingLeft) - tokenLength(paddingXToken)) <=
                0.5 &&
              Math.abs(px(style.paddingRight) - tokenLength(paddingXToken)) <=
                0.5 &&
              Math.abs(px(style.paddingTop) - tokenLength(paddingYToken)) <=
                0.5 &&
              Math.abs(px(style.paddingBottom) - tokenLength(paddingYToken)) <=
                0.5,
            radiusTokenMatched:
              Boolean(radiusToken) &&
              Object.values(radiusCorners).every(
                radius => Math.abs(radius - radiusValue) <= 0.5
              ),
            concentricRadius: [
              ...target.querySelectorAll('[data-jovie-eval-inner-edge]'),
            ].every(child => {
              const childStyle = getComputedStyle(child);
              const childCorners = {
                topLeft: px(childStyle.borderTopLeftRadius),
                topRight: px(childStyle.borderTopRightRadius),
                bottomRight: px(childStyle.borderBottomRightRadius),
                bottomLeft: px(childStyle.borderBottomLeftRadius),
              };
              if (Object.values(childCorners).every(radius => radius === 0)) {
                return true;
              }
              const expectedChildCorners = {
                topLeft:
                  radiusCorners.topLeft -
                  Math.min(px(style.paddingTop), px(style.paddingLeft)),
                topRight:
                  radiusCorners.topRight -
                  Math.min(px(style.paddingTop), px(style.paddingRight)),
                bottomRight:
                  radiusCorners.bottomRight -
                  Math.min(px(style.paddingBottom), px(style.paddingRight)),
                bottomLeft:
                  radiusCorners.bottomLeft -
                  Math.min(px(style.paddingBottom), px(style.paddingLeft)),
              };
              return Object.entries(expectedChildCorners).every(
                ([corner, expected]) =>
                  Math.abs(childCorners[corner] - Math.max(0, expected)) <= 1
              );
            }),
            textContrast: contrast(foreground, inheritedBackground),
            requiredContrast: largeText ? 3 : 4.5,
            overflowX: target.scrollWidth - target.clientWidth > 1,
            overflowY: target.scrollHeight - target.clientHeight > 1,
            zoomOverflow: false,
            interactive,
            keyboardReachable: !interactive || tabbables > 0,
            tabbableCount: tabbables,
            text: target.textContent?.trim() ?? '',
            hoverBoxBefore: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
            selector: `[data-jovie-eval-variant="${CSS.escape(wrapper.dataset.jovieEvalVariant ?? '')}"]`,
          };
        });
        return {
          family: element.dataset.jovieEvalFamily ?? '',
          instanceId: context.instanceId,
          storyId: context.storyId,
          viewport: context.viewport,
          zoom: context.zoom,
          declaredTheme: element.dataset.jovieEvalTheme ?? '',
          actualTheme,
          surfaceToken,
          surfaceMatchesToken: sameColor(
            parseColor(surfaceStyle.backgroundColor),
            tokenColor(surfaceToken)
          ),
          canonicalOwner: owner,
          axeViolations: context.axeViolations,
          variants,
        };
      },
      {
        storyId: story.id,
        viewport: viewport.name,
        instanceId,
        zoom: 1,
        axeViolations: axe.violations.map(violation => violation.id),
      }
    );

    for (const variant of snapshot.variants) {
      if (!variant.interactive) continue;
      const wrapper = root.locator(variant.selector).first();
      const target = await resolveVariantTarget(wrapper);
      try {
        await target.hover({ timeout: 5_000 });
        variant.hoverBoxAfter = await target.boundingBox();
      } catch (error) {
        variant.hoverBoxAfter = null;
        variant.hoverError =
          error instanceof Error ? error.message : String(error);
      }
    }

    snapshots.push(snapshot);
  }

  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await page.waitForTimeout(50);
  const zoomSnapshots = await page
    .locator('[data-jovie-eval-family]')
    .evaluateAll(elements =>
      elements.map(element => {
        const variants = [
          ...element.querySelectorAll('[data-jovie-eval-variant]'),
        ].map(wrapper => {
          const target =
            wrapper.querySelector('[data-jovie-eval-target]') ||
            wrapper.firstElementChild ||
            wrapper;
          return {
            key: wrapper.dataset.jovieEvalVariant ?? '',
            overflowX: target.scrollWidth - target.clientWidth > 1,
            overflowY: target.scrollHeight - target.clientHeight > 1,
          };
        });
        return {
          family: element.dataset.jovieEvalFamily ?? '',
          instanceId: element.getAttribute('data-jovie-eval-instance') ?? '',
          variants,
        };
      })
    );
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });

  for (const snapshot of snapshots) {
    const zoom =
      zoomSnapshots.find(
        candidate => candidate.instanceId === snapshot.instanceId
      ) ??
      zoomSnapshots.find(candidate => candidate.family === snapshot.family);
    const zoomVariants = new Map(
      (zoom?.variants ?? []).map(variant => [variant.key, variant])
    );
    for (const variant of snapshot.variants) {
      const zoomVariant = zoomVariants.get(variant.key);
      variant.zoomOverflowX = zoomVariant?.overflowX ?? false;
      variant.zoomOverflowY = zoomVariant?.overflowY ?? false;
      variant.zoomOverflow = variant.zoomOverflowX || variant.zoomOverflowY;
    }
  }
  return snapshots;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (!flags.storybookUrl) throw new Error('--storybook-url is required');
  const indexResponse = await fetch(`${flags.storybookUrl}/index.json`);
  if (!indexResponse.ok)
    throw new Error(`Storybook index unavailable (${indexResponse.status})`);
  const index = await indexResponse.json();
  const { stories, missingRequests } = storyCandidates(index, flags);
  if (stories.length === 0)
    throw new Error(
      'No Storybook stories matched the requested components/story paths'
    );
  if (flags.captureDir) mkdirSync(flags.captureDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: flags.storybookUrl,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const snapshots = [];
  const missingContracts = [];
  try {
    for (const story of stories) {
      for (const viewport of VIEWPORTS) {
        try {
          const storySnapshots = await collectSnapshots(
            page,
            story,
            viewport,
            flags.storybookUrl
          );
          snapshots.push(...storySnapshots);
          if (flags.captureDir) {
            await page.screenshot({
              path: join(
                flags.captureDir,
                `${slug(story.id)}-${viewport.name}.png`
              ),
              fullPage: true,
            });
          }
        } catch (error) {
          missingContracts.push({
            storyId: story.id,
            viewport: viewport.name,
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } finally {
    await browser.close();
  }

  const evaluated = evaluateRenderedSnapshots(snapshots);
  const report = {
    schemaVersion: 1,
    gate: 'component-rendered-evaluator',
    storybookUrl: flags.storybookUrl,
    stories: stories.map(story => story.id),
    captures: flags.captureDir,
    missingRequests,
    missingContracts,
    ...evaluated,
    ok:
      evaluated.ok &&
      missingContracts.length === 0 &&
      missingRequests.length === 0,
  };
  console.log(JSON.stringify(report));
  process.exit(report.ok ? 0 : 1);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    console.log(
      JSON.stringify({
        schemaVersion: 1,
        gate: 'component-rendered-evaluator',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    process.exit(2);
  });
}
