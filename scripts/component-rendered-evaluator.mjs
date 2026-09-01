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
    expectedFamilies: [],
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
    else if (arg.startsWith('--expected-family='))
      flags.expectedFamilies.push(arg.slice(18));
  }
  return flags;
}
function normalizeImportPath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '');
}
function parseStoryPathRequest(value) {
  const raw = String(value ?? '');
  const separator = raw.lastIndexOf('#');
  if (separator === -1) {
    return {
      storyPath: normalizeImportPath(raw),
      storyName: null,
    };
  }
  return {
    storyPath: normalizeImportPath(raw.slice(0, separator)),
    storyName: raw.slice(separator + 1).trim() || null,
  };
}
function nameSlug(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
function storyNameMatches(entry, storyName) {
  const expected = nameSlug(storyName);
  if (!expected) return false;
  const idSuffix = String(entry.id ?? '')
    .split('--')
    .pop();
  return [entry.name, entry.exportName, idSuffix].some(
    candidate => nameSlug(candidate) === expected
  );
}
function componentFamilyName(component) {
  return basename(normalizeImportPath(component)).replace(
    /\.(?:tsx?|jsx?)$/i,
    ''
  );
}
function missingExpectedFamilies(snapshots, flags) {
  const expected = [
    ...flags.expectedFamilies,
    ...flags.components.map(componentFamilyName),
  ]
    .filter(Boolean)
    .map(nameSlug);
  const rendered = new Set(
    snapshots.map(snapshot => nameSlug(snapshot.family))
  );
  return [...new Set(expected)].filter(family => !rendered.has(family));
}
function storyRequestGroups(flags) {
  const requests = flags.storyPaths
    .map(parseStoryPathRequest)
    .filter(request => request.storyPath)
    .map(request => ({
      label: request.storyName
        ? `${request.storyPath}#${request.storyName}`
        : request.storyPath,
      candidates: [request.storyPath],
      storyName: request.storyName,
    }));
  for (const component of flags.components) {
    const normalized = normalizeImportPath(component);
    if (!normalized) continue;
    const stem = basename(normalized).replace(/\.(?:tsx?|jsx?)$/i, '');
    const directory = dirname(normalized);
    requests.push({
      label: normalized,
      candidates: [
        `${directory}/${stem}.stories.tsx`,
        `${directory}/${stem}.stories.ts`,
        `${directory}/${stem}.stories.jsx`,
        `${directory}/${stem}.stories.js`,
      ],
      storyName: null,
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
    const namedMatches = request.storyName
      ? requestMatches.filter(entry =>
          storyNameMatches(entry, request.storyName)
        )
      : requestMatches;
    const certified = namedMatches.filter(entry =>
      entry.tags?.includes('jovie-certification')
    );
    const selected = request.storyName
      ? namedMatches
      : certified.length > 0
        ? certified
        : namedMatches;
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

async function exerciseKeyboardActivation(page, target) {
  for (const key of ['Enter', 'Space']) {
    const marker = `__jovieKeyboardActivation${Date.now()}${key}`;
    try {
      await target.evaluate((node, markerName) => {
        globalThis[markerName] = false;
        node.addEventListener('click', () => {
          globalThis[markerName] = true;
        });
      }, marker);
      await target.focus({ timeout: 5_000 });
      await page.keyboard.press(key);
      await page.waitForTimeout(20);
      if (
        await page.evaluate(
          markerName => globalThis[markerName] === true,
          marker
        )
      )
        return true;
    } catch {}
  }
  return false;
}

async function clearInteractionState(page) {
  await page.mouse.move(-10, -10);
  await page.evaluate(() => {
    const { document, HTMLElement } = /** @type {any} */ (globalThis);
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  await page.waitForTimeout(20);
}

async function collectSnapshots(
  page,
  story,
  viewport,
  storybookUrl,
  capturePath = null
) {
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
    () => {
      const { document } = /** @type {any} */ (globalThis);
      return [...document.querySelectorAll('[data-jovie-eval-family]')].every(
        element =>
          element.getAttribute('data-jovie-eval-theme') ===
          (document.documentElement.classList.contains('dark')
            ? 'dark'
            : 'light')
      );
    },
    undefined,
    { timeout: 5_000 }
  );
  await clearInteractionState(page);
  if (capturePath) await page.screenshot({ path: capturePath, fullPage: true });

  const roots = page.locator('[data-jovie-eval-family]');
  const rootCount = await roots.count();
  const snapshots = [];

  for (let rootIndex = 0; rootIndex < rootCount; rootIndex += 1) {
    const root = roots.nth(rootIndex);
    const instanceId = `${slug(story.id)}-${rootIndex}`;
    await root.evaluate((element, id) => {
      element.setAttribute('data-jovie-eval-instance', id);
    }, instanceId);
    await page.evaluate(() =>
      Reflect.deleteProperty(/** @type {any} */ (globalThis).window, 'axe')
    );
    const axe = await new AxeBuilder({ page })
      .include(`[data-jovie-eval-instance="${instanceId}"]`)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const snapshot = await root.evaluate(
      (element, context) => {
        const parseColor = value => {
          if (!value || !globalThis.CSS?.supports?.('color', value.trim()))
            return null;
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
        const {
          CSS,
          document,
          HTMLAnchorElement,
          HTMLButtonElement,
          HTMLElement,
          HTMLInputElement,
          HTMLSelectElement,
          HTMLTextAreaElement,
          getComputedStyle,
        } = /** @type {any} */ (globalThis);
        const composite = (source, backdrop) => {
          if (!source) return null;
          if (!backdrop || source.a >= 1) return source;
          const alpha = source.a + backdrop.a * (1 - source.a);
          if (alpha <= 0) return null;
          return {
            r:
              (source.r * source.a + backdrop.r * backdrop.a * (1 - source.a)) /
              alpha,
            g:
              (source.g * source.a + backdrop.g * backdrop.a * (1 - source.a)) /
              alpha,
            b:
              (source.b * source.a + backdrop.b * backdrop.a * (1 - source.a)) /
              alpha,
            a: alpha,
          };
        };
        const tokenColor = token => {
          const value = getComputedStyle(document.documentElement)
            .getPropertyValue(token)
            .trim();
          if (!value) return null;
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
        const graphicPaintColor = node => {
          const candidates = [
            ...(node.matches?.('svg') ? [node] : []),
            ...node.querySelectorAll('svg, svg *'),
          ];
          for (const candidate of candidates) {
            const candidateStyle = getComputedStyle(candidate);
            for (const property of ['fill', 'stroke']) {
              const rawValue = candidateStyle[property];
              if (!rawValue || rawValue === 'none') continue;
              const value =
                rawValue === 'currentColor' ? candidateStyle.color : rawValue;
              const color = parseColor(value);
              if (color?.a > 0) return color;
            }
          }
          return null;
        };
        const belongsToFamily = (node, familyRoot) =>
          node.closest('[data-jovie-eval-family]') === familyRoot;
        const findScopedTarget = (wrapper, familyRoot) => {
          if (
            wrapper.matches('[data-jovie-eval-target]') &&
            belongsToFamily(wrapper, familyRoot)
          ) {
            return wrapper;
          }
          const explicit = [
            ...wrapper.querySelectorAll('[data-jovie-eval-target]'),
          ].find(node => belongsToFamily(node, familyRoot));
          if (explicit) return explicit;
          if (
            wrapper.firstElementChild &&
            belongsToFamily(wrapper.firstElementChild, familyRoot)
          ) {
            return wrapper.firstElementChild;
          }
          return wrapper;
        };
        const isRenderedVisible = node => {
          if (!(node instanceof HTMLElement)) return false;
          if (node.closest('[hidden],[inert]')) return false;
          const style = getComputedStyle(node);
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            Number.parseFloat(style.opacity) <= 0
          ) {
            return false;
          }
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
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
        ].filter(wrapper => belongsToFamily(wrapper, element));
        const variantKeyCounts = variants.reduce((counts, wrapper) => {
          const key = wrapper.dataset.jovieEvalVariant ?? '';
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return counts;
        }, new Map());
        const bodyBackground = parseColor(
          getComputedStyle(document.body).backgroundColor
        ) ?? {
          r: 255,
          g: 255,
          b: 255,
          a: 1,
        };
        const surfaceBackground =
          composite(parseColor(surfaceStyle.backgroundColor), bodyBackground) ??
          bodyBackground;
        const variantSnapshots = variants.map((wrapper, variantIndex) => {
          const target = findScopedTarget(wrapper, element);
          const variantInstanceId = `${context.instanceId}-variant-${variantIndex}`;
          const targetInstanceId = `${variantInstanceId}-target`;
          wrapper.setAttribute(
            'data-jovie-eval-variant-instance',
            variantInstanceId
          );
          target.setAttribute(
            'data-jovie-eval-target-instance',
            targetInstanceId
          );
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
              ? composite(targetBackground, surfaceBackground)
              : surfaceBackground;
          const text = target.textContent?.trim() ?? '';
          const hasText = text.length > 0;
          const rawForeground = hasText
            ? parseColor(style.color)
            : graphicPaintColor(target);
          const foreground = composite(rawForeground, inheritedBackground);
          const radiusValue = tokenLength(radiusToken);
          const variantKey = wrapper.dataset.jovieEvalVariant ?? '';
          const expectedToneMapped = Object.prototype.hasOwnProperty.call(
            mapping,
            variantKey
          );
          const expectedTone = expectedToneMapped ? mapping[variantKey] : null;
          const focusTargets = [
            target,
            ...target.querySelectorAll(focusableSelector),
          ].filter(
            node =>
              belongsToFamily(node, element) && isSequentiallyFocusable(node)
          );
          const keyboardTarget = focusTargets[0] ?? null;
          const keyboardTargetInstanceId = keyboardTarget
            ? `${variantInstanceId}-keyboard`
            : null;
          if (keyboardTarget && keyboardTargetInstanceId) {
            keyboardTarget.setAttribute(
              'data-jovie-eval-keyboard-target-instance',
              keyboardTargetInstanceId
            );
          }
          const fontSize = px(style.fontSize);
          const fontWeight = Number.parseFloat(style.fontWeight) || 0;
          const largeText =
            fontSize >= 24 || (fontSize >= 18.67 && fontWeight >= 700);
          const requiredContrast = hasText ? (largeText ? 3 : 4.5) : 3;
          return {
            key: variantKey,
            variantInstanceId,
            variantKeyDuplicate: (variantKeyCounts.get(variantKey) ?? 0) > 1,
            variantKeyMissing: variantKey.length === 0,
            targetVisible: isRenderedVisible(target),
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
            requiredContrast: foreground ? requiredContrast : null,
            overflowX: target.scrollWidth - target.clientWidth > 1,
            overflowY: target.scrollHeight - target.clientHeight > 1,
            zoomOverflow: false,
            interactive,
            keyboardReachable: !interactive || focusTargets.length > 0,
            keyboardActivatable: !interactive,
            tabbableCount: focusTargets.length,
            text,
            hoverBoxBefore: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
            selector: `[data-jovie-eval-variant-instance="${CSS.escape(variantInstanceId)}"]`,
            targetSelector: `[data-jovie-eval-target-instance="${CSS.escape(targetInstanceId)}"]`,
            keyboardTargetSelector: keyboardTargetInstanceId
              ? `[data-jovie-eval-keyboard-target-instance="${CSS.escape(keyboardTargetInstanceId)}"]`
              : null,
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
          variants: variantSnapshots,
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
      const target = variant.targetSelector
        ? root.locator(variant.targetSelector).first()
        : await resolveVariantTarget(wrapper);
      const keyboardTarget = variant.keyboardTargetSelector
        ? root.locator(variant.keyboardTargetSelector).first()
        : target;
      if (variant.keyboardReachable) {
        variant.keyboardActivatable = await exerciseKeyboardActivation(
          page,
          keyboardTarget
        );
      }
      try {
        await target.scrollIntoViewIfNeeded({ timeout: 5_000 });
        variant.hoverRootBoxBefore = await root.boundingBox();
        variant.hoverBoxBefore = await target.boundingBox();
        await target.hover({ timeout: 5_000 });
        variant.hoverBoxAfter = await target.boundingBox();
        variant.hoverRootBoxAfter = await root.boundingBox();
      } catch (error) {
        variant.hoverRootBoxBefore ??= null;
        variant.hoverBoxBefore ??= null;
        variant.hoverBoxAfter = null;
        variant.hoverRootBoxAfter = null;
        variant.hoverError =
          error instanceof Error ? error.message : String(error);
      }
    }

    snapshots.push(snapshot);
  }

  await clearInteractionState(page);
  await page.setViewportSize({
    width: Math.max(1, Math.floor(viewport.width / 2)),
    height: Math.max(1, Math.floor(viewport.height / 2)),
  });
  await page.waitForTimeout(50);
  const zoomSnapshots = await page
    .locator('[data-jovie-eval-family]')
    .evaluateAll(elements =>
      elements.map(element => {
        const belongsToFamily = node =>
          node.closest('[data-jovie-eval-family]') === element;
        const findScopedTarget = wrapper => {
          if (
            wrapper.matches('[data-jovie-eval-target]') &&
            belongsToFamily(wrapper)
          )
            return wrapper;
          const explicit = [
            ...wrapper.querySelectorAll('[data-jovie-eval-target]'),
          ].find(belongsToFamily);
          if (explicit) return explicit;
          if (
            wrapper.firstElementChild &&
            belongsToFamily(wrapper.firstElementChild)
          )
            return wrapper.firstElementChild;
          return wrapper;
        };
        const { document, window } = /** @type {any} */ (globalThis);
        const rootRect = element.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const documentOverflowX =
          document.documentElement.scrollWidth -
            document.documentElement.clientWidth >
          1;
        const rootOverflowX =
          element.scrollWidth - element.clientWidth > 1 ||
          rootRect.left < -1 ||
          rootRect.right - viewportWidth > 1 ||
          documentOverflowX;
        const variants = [
          ...element.querySelectorAll('[data-jovie-eval-variant]'),
        ]
          .filter(
            wrapper => wrapper.closest('[data-jovie-eval-family]') === element
          )
          .map(wrapper => {
            const target = findScopedTarget(wrapper);
            return {
              key: wrapper.dataset.jovieEvalVariant ?? '',
              variantInstanceId:
                wrapper.getAttribute('data-jovie-eval-variant-instance') ?? '',
              overflowX: target.scrollWidth - target.clientWidth > 1,
              overflowY: target.scrollHeight - target.clientHeight > 1,
            };
          });
        return {
          family: element.dataset.jovieEvalFamily ?? '',
          instanceId: element.getAttribute('data-jovie-eval-instance') ?? '',
          overflowX: rootOverflowX,
          variants,
        };
      })
    );

  for (const snapshot of snapshots) {
    const zoom =
      zoomSnapshots.find(
        candidate => candidate.instanceId === snapshot.instanceId
      ) ??
      zoomSnapshots.find(candidate => candidate.family === snapshot.family);
    const zoomVariants = new Map(
      (zoom?.variants ?? []).map(variant => [variant.key, variant])
    );
    const zoomVariantsByInstance = new Map(
      (zoom?.variants ?? [])
        .filter(variant => variant.variantInstanceId)
        .map(variant => [variant.variantInstanceId, variant])
    );
    for (const variant of snapshot.variants) {
      const zoomVariant =
        zoomVariantsByInstance.get(variant.variantInstanceId) ??
        zoomVariants.get(variant.key);
      variant.zoomOverflowX = zoomVariant?.overflowX ?? false;
      variant.zoomOverflowY = zoomVariant?.overflowY ?? false;
      variant.zoomOverflow =
        variant.zoomOverflowX ||
        variant.zoomOverflowY ||
        zoom?.overflowX === true;
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
            flags.storybookUrl,
            flags.captureDir
              ? join(flags.captureDir, `${slug(story.id)}-${viewport.name}.png`)
              : null
          );
          snapshots.push(...storySnapshots);
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
  const missingFamilies = missingExpectedFamilies(snapshots, flags);
  const report = {
    schemaVersion: 1,
    gate: 'component-rendered-evaluator',
    storybookUrl: flags.storybookUrl,
    stories: stories.map(story => story.id),
    captures: flags.captureDir,
    missingRequests,
    missingFamilies,
    missingContracts,
    ...evaluated,
    ok:
      evaluated.ok &&
      missingContracts.length === 0 &&
      missingRequests.length === 0 &&
      missingFamilies.length === 0,
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
