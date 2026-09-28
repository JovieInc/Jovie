import type { Page } from '@playwright/test';

// Invariant consumer: JOV-INV-019 product-page-shows-product and
// one-hero-per-story, plus the public-profile extension in JOV-6915.

export const ROUTE_DOM_CERTIFICATION_SCHEMA =
  'jovie-route-dom-certification/v1' as const;

export type RouteDomFindingKind =
  | 'duplicate-hero'
  | 'semantic-duplicate'
  | 'text-dump-section'
  | 'unintended-overlap'
  | 'container-width-sheet'
  | 'unreachable-content'
  | 'raw-control';

export interface RouteDomFinding {
  readonly kind: RouteDomFindingKind;
  readonly message: string;
  readonly elements: readonly string[];
  readonly measurements?: Readonly<Record<string, number>>;
}

export interface SemanticBlockSnapshot {
  readonly element: string;
  readonly heading: string;
  readonly lede: string;
  readonly normalizedCluster: string;
  readonly visible: boolean;
  readonly accessibilityTree: boolean;
  readonly indexableDocument: boolean;
  readonly stateScope: string | null;
}

export interface RouteDomSnapshot {
  readonly findings: readonly RouteDomFinding[];
  readonly semanticBlocks: readonly SemanticBlockSnapshot[];
  readonly ariaSnapshot: string;
  readonly inspectedAt: string;
  readonly documentUrl: string;
  readonly viewport: { readonly width: number; readonly height: number };
}

interface RouteDomDetectorOptions {
  readonly surface: 'marketing' | 'public-profile';
}

/**
 * Inspect the rendered browser DOM rather than source JSX. The semantic pass
 * intentionally includes CSS-hidden ordinary HTML because responsive
 * alternates remain indexable unless they are removed from the document.
 */
export async function inspectRouteDom(
  page: Page,
  options: RouteDomDetectorOptions
): Promise<RouteDomSnapshot> {
  const [dom, ariaSnapshot] = await Promise.all([
    page.evaluate(({ surface }) => {
      type Rect = {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly right: number;
        readonly bottom: number;
      };

      type Finding = {
        readonly kind:
          | 'duplicate-hero'
          | 'semantic-duplicate'
          | 'text-dump-section'
          | 'unintended-overlap'
          | 'container-width-sheet'
          | 'unreachable-content'
          | 'raw-control';
        readonly message: string;
        readonly elements: readonly string[];
        readonly measurements?: Readonly<Record<string, number>>;
      };

      const findings: Finding[] = [];
      const root =
        surface === 'public-profile'
          ? (document.querySelector(
              '[data-testid="public-profile-layout-shell"]'
            ) ?? document.body)
          : (document.querySelector('main') ?? document.body);

      const round = (value: number): number => Math.round(value * 100) / 100;
      const rectOf = (element: Element): Rect => {
        const rect = element.getBoundingClientRect();
        return {
          x: round(rect.x),
          y: round(rect.y),
          width: round(rect.width),
          height: round(rect.height),
          right: round(rect.right),
          bottom: round(rect.bottom),
        };
      };
      const normalizedText = (value: string | null | undefined): string =>
        (value ?? '')
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/[\u201c\u201d]/g, '"')
          .replace(/\s+/g, ' ')
          .trim()
          .toLocaleLowerCase('en-US');
      const describe = (element: Element): string => {
        const testId = element.getAttribute('data-testid');
        if (testId)
          return `${element.tagName.toLowerCase()}[data-testid="${testId}"]`;
        if (element.id) return `${element.tagName.toLowerCase()}#${element.id}`;
        const parent = element.parentElement;
        const siblings = parent
          ? Array.from(parent.children).filter(
              candidate => candidate.tagName === element.tagName
            )
          : [];
        const suffix =
          siblings.length > 1
            ? `:nth-of-type(${siblings.indexOf(element) + 1})`
            : '';
        return `${element.tagName.toLowerCase()}${suffix}`;
      };
      const isRendered = (element: Element): boolean => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = getComputedStyle(element);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.visibility !== 'collapse' &&
          Number.parseFloat(style.opacity || '1') > 0
        );
      };
      const isAccessibilityExposed = (element: Element): boolean => {
        if (!isRendered(element)) return false;
        if (element.closest('[aria-hidden="true"], [inert]')) return false;
        return true;
      };
      const optedOut = (element: Element): boolean =>
        element.closest('[data-dom-certification="ignore"]') !== null;

      const topLevelSections = Array.from(
        root.querySelectorAll('section, article')
      ).filter(element => {
        if (optedOut(element)) return false;
        const ancestor = element.parentElement?.closest('section, article');
        return !ancestor || !root.contains(ancestor);
      });

      const semanticBlocks = topLevelSections.flatMap(element => {
        const heading = element.querySelector('h1, h2, h3');
        const lede =
          element.querySelector('[data-lede]') ??
          Array.from(element.querySelectorAll('p')).find(candidate => {
            const className = candidate.getAttribute('class') ?? '';
            return (
              !/(?:^|[-_])(eyebrow|kicker)(?:$|[-_])/.test(className) &&
              normalizedText(candidate.textContent).length >= 20
            );
          }) ??
          element.querySelector('p');
        if (!heading || !lede) return [];
        const headingText = normalizedText(heading.textContent);
        const ledeText = normalizedText(lede.textContent);
        if (!headingText || !ledeText) return [];
        return [
          {
            element: describe(element),
            heading: headingText,
            lede: ledeText,
            normalizedCluster: `${headingText}\n${ledeText}`,
            visible: isRendered(element),
            accessibilityTree: isAccessibilityExposed(element),
            indexableDocument:
              !element.closest('template, noscript') &&
              !element.hasAttribute('data-noindex'),
            stateScope:
              element
                .closest('[data-certification-state-scope]')
                ?.getAttribute('data-certification-state-scope') ?? null,
          },
        ];
      });

      const semanticPairs = new Set<string>();
      for (
        let leftIndex = 0;
        leftIndex < semanticBlocks.length;
        leftIndex += 1
      ) {
        const left = semanticBlocks[leftIndex];
        if (!left?.indexableDocument) continue;
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < semanticBlocks.length;
          rightIndex += 1
        ) {
          const right = semanticBlocks[rightIndex];
          if (!right?.indexableDocument) continue;
          if (left.normalizedCluster !== right.normalizedCluster) continue;
          const explicitlyStateScoped =
            left.stateScope !== null &&
            right.stateScope !== null &&
            left.stateScope !== right.stateScope;
          if (explicitlyStateScoped) continue;
          const key = `${left.element}|${right.element}|${left.normalizedCluster}`;
          if (semanticPairs.has(key)) continue;
          semanticPairs.add(key);
          findings.push({
            kind: 'semantic-duplicate',
            message:
              'A heading and lede argument cluster is duplicated in the rendered, indexable document.',
            elements: [left.element, right.element],
          });
        }
      }

      const visibleTopLevelSections = topLevelSections.filter(isRendered);
      const intro = (element: Element) => {
        const heading = element.querySelector('h1, h2');
        const lede =
          element.querySelector('[data-lede]') ??
          Array.from(element.querySelectorAll('p')).find(candidate => {
            const className = candidate.getAttribute('class') ?? '';
            return (
              !/(?:^|[-_])(eyebrow|kicker)(?:$|[-_])/.test(className) &&
              normalizedText(candidate.textContent).length >= 20
            );
          }) ??
          element.querySelector('p');
        return heading && lede
          ? {
              heading: normalizedText(heading.textContent),
              level: Number.parseInt(heading.tagName.slice(1), 10),
              lede: normalizedText(lede.textContent),
            }
          : null;
      };
      const isStandaloneIntro = (element: Element): boolean => {
        const semanticNodes = element.querySelectorAll(
          'h1, h2, p, [data-lede]'
        );
        const substantiveContent = element.querySelector(
          'a[href], article, button, canvas, dl, figure, form, iframe, img, input, ol, picture, pre, select, table, textarea, ul, video, [data-component], [data-testid*="card"], [data-testid*="mockup"], [class~="card"], [class*="-card"], [class*="mockup"]'
        );
        return semanticNodes.length === 2 && !substantiveContent;
      };
      for (
        let index = 0;
        index < visibleTopLevelSections.length - 1;
        index += 1
      ) {
        const first = visibleTopLevelSections[index];
        const second = visibleTopLevelSections[index + 1];
        if (!first || !second) continue;
        const firstIntro = intro(first);
        const secondIntro = intro(second);
        if (!firstIntro || !secondIntro) continue;
        if (
          firstIntro.level !== 1 ||
          secondIntro.level > 2 ||
          !isStandaloneIntro(first) ||
          !isStandaloneIntro(second)
        ) {
          continue;
        }
        findings.push({
          kind: 'duplicate-hero',
          message:
            'Adjacent top-level sections each present an h1/h2 introduction and lede.',
          elements: [describe(first), describe(second)],
        });
      }

      const heroIndex = visibleTopLevelSections.findIndex(element => {
        return Boolean(
          element.querySelector('h1') ||
            element.matches('[data-testid*="hero"], [class*="hero"]')
        );
      });
      const richContentSelector = [
        'img',
        'picture',
        'video',
        'audio',
        'canvas',
        'svg',
        'iframe',
        'figure',
        'article',
        'table',
        'form',
        'a[href]',
        'button',
        'input',
        'select',
        'textarea',
        '[role="img"]',
        '[data-component]',
        '[class*="code"]',
        '[class*="cta"]',
        '[class*="feature"]',
        '[class*="grid"]',
        '[class*="panel"]',
        '[class*="step"]',
        '[class*="timeline"]',
        '[data-testid*="card"]',
        '[data-testid*="callout"]',
        '[data-testid*="mockup"]',
        '[class~="card"]',
        '[class*="-card"]',
        '[class*="callout"]',
        '[class*="mockup"]',
      ].join(',');
      if (heroIndex >= 0) {
        for (const element of visibleTopLevelSections.slice(heroIndex + 1)) {
          const text = normalizedText(element.textContent);
          if (text.length < 24 || element.querySelector(richContentSelector)) {
            continue;
          }
          const leafTags = Array.from(element.querySelectorAll('*'))
            .filter(candidate => candidate.children.length === 0)
            .map(candidate => candidate.tagName.toLowerCase());
          const textOnlyTags = new Set([
            'a',
            'br',
            'em',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'li',
            'p',
            'span',
            'strong',
          ]);
          if (leafTags.every(tag => textOnlyTags.has(tag))) {
            findings.push({
              kind: 'text-dump-section',
              message:
                'A top-level section below the hero contains only headings, paragraphs, lists, and inline text.',
              elements: [describe(element)],
            });
          }
        }
      }

      const overlapSelector = [
        'article',
        'figure',
        'table',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'p',
        'ul',
        'ol',
        '[data-testid*="card"]',
        '[data-testid*="callout"]',
        '[data-testid*="mockup"]',
        '[class~="card"]',
        '[class*="-card"]',
        '[class*="callout"]',
        '[class*="mockup"]',
      ].join(',');
      const overlapCandidates = Array.from(
        root.querySelectorAll(overlapSelector)
      ).filter(
        element =>
          isRendered(element) &&
          !optedOut(element) &&
          element.getAttribute('data-overlap') !== 'intentional'
      );
      const overlapPairs = new Set<string>();
      for (const element of overlapCandidates) {
        const siblings = overlapCandidates.filter(
          candidate =>
            candidate !== element &&
            candidate.parentElement === element.parentElement
        );
        const firstRect = rectOf(element);
        for (const sibling of siblings) {
          const pair = [describe(element), describe(sibling)].sort();
          const pairKey = pair.join('|');
          if (overlapPairs.has(pairKey)) continue;
          overlapPairs.add(pairKey);
          const secondRect = rectOf(sibling);
          const overlapX = round(
            Math.min(firstRect.right, secondRect.right) -
              Math.max(firstRect.x, secondRect.x)
          );
          const overlapY = round(
            Math.min(firstRect.bottom, secondRect.bottom) -
              Math.max(firstRect.y, secondRect.y)
          );
          if (overlapX > 2 && overlapY > 2) {
            findings.push({
              kind: 'unintended-overlap',
              message:
                'Sibling cards, callouts, mockups, or text blocks overlap by more than 2px.',
              elements: pair,
              measurements: { overlapX, overlapY },
            });
          }
        }
      }

      if (surface === 'public-profile') {
        const viewportRect: Rect = {
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight,
          right: window.innerWidth,
          bottom: window.innerHeight,
        };
        const profileContainer = document.querySelector(
          '[data-testid="profile-compact-shell"]'
        );
        const dialogs = Array.from(
          document.querySelectorAll(
            'dialog[open], [role="dialog"][aria-modal="true"], [data-vaul-drawer][data-state="open"]'
          )
        ).filter(element => isRendered(element) && !optedOut(element));
        const profileInspectionRoots = [root, ...dialogs];
        for (const dialog of dialogs) {
          const dialogRect = rectOf(dialog);
          const ancestorContainer = dialog.closest(
            '[data-sheet-container], [data-testid="profile-compact-shell"]'
          );
          const candidateContainer = ancestorContainer ?? profileContainer;
          const candidateRect = candidateContainer
            ? rectOf(candidateContainer)
            : viewportRect;
          const containerRect =
            candidateRect.width < viewportRect.width - 2
              ? candidateRect
              : viewportRect;
          const widthDelta = round(
            Math.abs(containerRect.width - dialogRect.width)
          );
          const leftDelta = round(Math.abs(containerRect.x - dialogRect.x));
          if (widthDelta > 2 || leftDelta > 2) {
            findings.push({
              kind: 'container-width-sheet',
              message:
                'An open sheet, drawer, or dialog does not span its phone-column or viewport container within 2px.',
              elements: [
                describe(dialog),
                describe(candidateContainer ?? root),
              ],
              measurements: { widthDelta, leftDelta },
            });
          }
        }

        const clippedContainers = Array.from(
          new Set(
            profileInspectionRoots.flatMap(inspectionRoot =>
              Array.from(inspectionRoot.querySelectorAll('*'))
            )
          )
        ).filter(element => {
          if (!isRendered(element) || optedOut(element)) return false;
          const style = getComputedStyle(element);
          const clips = ['hidden', 'clip'].includes(style.overflowY);
          const className = element.getAttribute('class') ?? '';
          const explicitlySized =
            element instanceof HTMLElement &&
            (element.style.height !== '' || element.style.maxHeight !== '');
          return (
            clips &&
            (explicitlySized ||
              /(?:^|\s)(?:h-|max-h-|min-h-|.*height)/.test(className))
          );
        });
        for (const container of clippedContainers) {
          const containerRect = rectOf(container);
          const overflowingContent = Array.from(
            container.querySelectorAll(
              'a[href], button, h1, h2, h3, h4, h5, h6, li, p, [role="button"], [role="link"]'
            )
          ).filter(element => {
            if (!isRendered(element)) return false;
            if (element.closest('[data-modal-backdrop]')) return false;
            const rect = rectOf(element);
            return (
              rect.bottom > containerRect.bottom + 2 ||
              rect.y < containerRect.y - 2
            );
          });
          const unreachable = overflowingContent.find(element => {
            let ancestor = element.parentElement;
            while (ancestor && ancestor !== container) {
              const style = getComputedStyle(ancestor);
              if (
                ['auto', 'scroll'].includes(style.overflowY) &&
                ancestor.scrollHeight > ancestor.clientHeight + 2
              ) {
                return false;
              }
              ancestor = ancestor.parentElement;
            }
            return true;
          });
          if (unreachable) {
            findings.push({
              kind: 'unreachable-content',
              message:
                'Meaningful content exceeds a fixed-height overflow-hidden container without a scrollable region.',
              elements: [describe(container), describe(unreachable)],
              measurements: {
                containerHeight: containerRect.height,
                contentBottomDelta: round(
                  rectOf(unreachable).bottom - containerRect.bottom
                ),
              },
            });
          }
        }

        const rawControls = Array.from(
          new Set(
            profileInspectionRoots.flatMap(inspectionRoot =>
              Array.from(inspectionRoot.querySelectorAll('button, a[href]'))
            )
          )
        )
          .filter(element => isRendered(element) && !optedOut(element))
          .filter(element => {
            if (element.getAttribute('class')?.trim()) return false;
            return Boolean(
              element.closest(
                'header, nav, dialog, [role="dialog"], [data-testid*="chrome"], [data-testid*="drawer"]'
              )
            );
          });
        for (const control of rawControls) {
          findings.push({
            kind: 'raw-control',
            message:
              'Product chrome renders an unstyled button or link without a class.',
            elements: [describe(control)],
          });
        }
      }

      return {
        findings,
        semanticBlocks,
        documentUrl: window.location.href,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    }, options),
    page.locator('body').ariaSnapshot(),
  ]);

  return {
    ...dom,
    ariaSnapshot,
    inspectedAt: new Date().toISOString(),
  };
}
