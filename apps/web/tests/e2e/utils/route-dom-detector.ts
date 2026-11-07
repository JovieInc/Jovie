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
  | 'raw-control'
  // Marketing taste invariants (ui.md, DESIGN_INVARIANTS.md). Ratcheted by
  // route-dom-marketing-baseline.json until existing routes are fixed.
  | 'nested-decorative-surface'
  | 'stranded-text'
  | 'heading-hierarchy-inversion'
  | 'clipped-heading'
  | 'misaligned-text-stack'
  | 'placeholder-copy'
  | 'orphaned-line'
  // Outcome detectors (2026-11-07 homepage miss): see OUTCOME_DETECTOR_MODES.
  | 'blank-media'
  | 'axis-mixing'
  | 'overlay-on-proof'
  | 'layout-shift';

/**
 * Outcome detectors added after the 2026-11-07 homepage shipped a blank
 * product image, placeholder profile copy, mixed text axes and a cookie banner
 * over proof. `blocking` kinds fail on any finding (strict zero) on marketing
 * routes. `calibrating` kinds are ratcheted through the taste baseline until
 * scripts/invariants/marketing-critic/calibrate.mjs shows precision >= 0.9
 * (Wilson lower bound) over enough labeled routes; promoting one is a one-line
 * change here plus its calibration evidence. Never advisory.
 */
export const OUTCOME_DETECTOR_MODES: Readonly<
  Record<
    'blank-media' | 'placeholder-copy' | 'axis-mixing' | 'overlay-on-proof',
    'blocking' | 'calibrating'
  >
> = {
  'blank-media': 'calibrating',
  'placeholder-copy': 'calibrating',
  'axis-mixing': 'calibrating',
  'overlay-on-proof': 'calibrating',
};

export const MARKETING_TASTE_FINDING_KINDS: readonly RouteDomFindingKind[] = [
  'nested-decorative-surface',
  'stranded-text',
  'heading-hierarchy-inversion',
  'clipped-heading',
  'misaligned-text-stack',
  'orphaned-line',
  ...(Object.entries(OUTCOME_DETECTOR_MODES)
    .filter(([, mode]) => mode === 'calibrating')
    .map(([kind]) => kind) as RouteDomFindingKind[]),
];

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

type DomRectParts = Record<
  'x' | 'y' | 'width' | 'height' | 'right' | 'bottom',
  number
>;

/**
 * Inspect the rendered browser DOM rather than source JSX. The semantic pass
 * intentionally includes CSS-hidden ordinary HTML because responsive
 * alternates remain indexable unless they are removed from the document.
 */
export async function inspectRouteDom(
  page: Page,
  options: { readonly surface: 'marketing' | 'public-profile' }
): Promise<RouteDomSnapshot> {
  const [dom, ariaSnapshot] = await Promise.all([
    page.evaluate(({ surface }) => {
      const findings: RouteDomFinding[] = [];
      const root =
        surface === 'public-profile'
          ? (document.querySelector(
              '[data-testid="public-profile-layout-shell"]'
            ) ?? document.body)
          : (document.querySelector('main') ?? document.body);

      const round = (value: number): number => Math.round(value * 100) / 100;
      const rectOf = (element: Element): DomRectParts => {
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
        const siblings = Array.from(
          element.parentElement?.children ?? []
        ).filter(candidate => candidate.tagName === element.tagName);
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
      const isAccessibilityExposed = (element: Element): boolean =>
        isRendered(element) &&
        !element.closest('[aria-hidden="true"], [inert]');
      const optedOut = (element: Element): boolean =>
        element.closest('[data-dom-certification="ignore"]') !== null;

      const topLevelSections = Array.from(
        root.querySelectorAll('section, article')
      ).filter(element => {
        const ancestor = element.parentElement?.closest('section, article');
        return !optedOut(element) && !(ancestor && root.contains(ancestor));
      });

      const ledeOf = (element: Element): Element | null =>
        element.querySelector('[data-lede]') ??
        Array.from(element.querySelectorAll('p')).find(candidate => {
          const className = candidate.getAttribute('class') ?? '';
          return (
            !/(?:^|[-_])(eyebrow|kicker)(?:$|[-_])/.test(className) &&
            normalizedText(candidate.textContent).length >= 20
          );
        }) ??
        element.querySelector('p');

      const semanticBlocks = topLevelSections.flatMap(element => {
        const heading = element.querySelector('h1, h2, h3');
        const lede = ledeOf(element);
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
      for (const [leftIndex, left] of semanticBlocks.entries()) {
        if (!left?.indexableDocument) continue;
        for (const right of semanticBlocks.slice(leftIndex + 1)) {
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
        const lede = ledeOf(element);
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
          'a[href],article,button,canvas,dl,figure,form,iframe,img,input,ol,picture,pre,select,table,textarea,ul,video,[data-component],[data-testid*="card"],[data-testid*="mockup"],[class~="card"],[class*="-card"],[class*="mockup"]'
        );
        return semanticNodes.length === 2 && !substantiveContent;
      };
      for (const [index, first] of visibleTopLevelSections.entries()) {
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

      const heroIndex = visibleTopLevelSections.findIndex(
        element =>
          element.querySelector('h1') ??
          element.matches('[data-testid*="hero"], [class*="hero"]')
      );
      const richContentSelector =
        'img,picture,video,audio,canvas,svg,iframe,figure,article,table,form,a[href],button,input,select,textarea,[role="img"],[data-component],[class*="code"],[class*="cta"],[class*="feature"],[class*="grid"],[class*="panel"],[class*="step"],[class*="timeline"],[data-testid*="card"],[data-testid*="callout"],[data-testid*="mockup"],[class~="card"],[class*="-card"],[class*="callout"],[class*="mockup"]';
      if (heroIndex >= 0) {
        for (const element of visibleTopLevelSections.slice(heroIndex + 1)) {
          const text = normalizedText(element.textContent);
          if (text.length < 24 || element.querySelector(richContentSelector)) {
            continue;
          }
          const leafTags = Array.from(element.querySelectorAll('*'))
            .filter(candidate => candidate.children.length === 0)
            .map(candidate => candidate.tagName.toLowerCase());
          const textOnlyTags = new Set(
            'a br em h1 h2 h3 h4 h5 h6 li p span strong'.split(' ')
          );
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

      const overlapSelector =
        'article,figure,table,h1,h2,h3,h4,h5,h6,p,ul,ol,[data-testid*="card"],[data-testid*="callout"],[data-testid*="mockup"],[class~="card"],[class*="-card"],[class*="callout"],[class*="mockup"]';
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

      if (surface === 'marketing') {
        const visibleIn = (element: Element): boolean =>
          isRendered(element) &&
          !optedOut(element) &&
          !element.closest('[aria-hidden="true"], [inert]');
        const px = (value: string): number => Number.parseFloat(value) || 0;
        const isSurface = (element: Element): boolean => {
          const style = getComputedStyle(element);
          const bordered =
            ['Top', 'Right', 'Bottom', 'Left'].filter(
              side =>
                px(
                  style.getPropertyValue(`border-${side.toLowerCase()}-width`)
                ) > 0 &&
                style.getPropertyValue(`border-${side.toLowerCase()}-style`) !==
                  'none'
            ).length === 4;
          const shadowed = style.boxShadow !== 'none';
          return (bordered || shadowed) && px(style.borderTopLeftRadius) >= 8;
        };
        const interactive =
          'a,button,input,select,textarea,label,[role="button"],[role="tab"],[role="dialog"],dialog';

        // 1. Decorative surface nested in another (ui.md "nested decorative
        //    carding"). Small chips/badges inside a card are fine: the inner
        //    surface must cover at least half of the outer one.
        const surfaces = Array.from(root.querySelectorAll('*')).filter(
          element =>
            visibleIn(element) &&
            !element.matches(interactive) &&
            !element.closest('form') &&
            isSurface(element)
        );
        const nestedPairs = new Set<Element>();
        for (const inner of surfaces) {
          const outer = surfaces.find(
            candidate => candidate !== inner && candidate.contains(inner)
          );
          if (!outer || nestedPairs.has(outer)) continue;
          const outerRect = rectOf(outer);
          const innerRect = rectOf(inner);
          const coverage =
            (innerRect.width * innerRect.height) /
            Math.max(1, outerRect.width * outerRect.height);
          // Overflowing children (coverage > 1) are not visually nested.
          if (coverage < 0.5 || coverage > 1.02) continue;
          nestedPairs.add(outer);
          findings.push({
            kind: 'nested-decorative-surface',
            message:
              'A bordered or shadowed rounded surface wraps another one covering most of it.',
            elements: [describe(outer), describe(inner)],
            measurements: { coverage: round(coverage) },
          });
        }

        // 2. Copy stranded between composed blocks (MKT-D06): a paragraph
        //    outside any section whose only siblings are composed blocks.
        const composed =
          'section,article,header,footer,figure,form,li,dialog,nav,aside,table,[role="dialog"]';
        for (const paragraph of Array.from(root.querySelectorAll('p'))) {
          if (!visibleIn(paragraph) || paragraph.closest(composed)) continue;
          if (!normalizedText(paragraph.textContent)) continue;
          const siblings = Array.from(
            paragraph.parentElement?.children ?? []
          ).filter(element => element !== paragraph && visibleIn(element));
          if (
            siblings.length === 0 ||
            !siblings.every(element => element.matches(composed))
          ) {
            continue;
          }
          findings.push({
            kind: 'stranded-text',
            message:
              'A paragraph sits alone between composed sections instead of inside one.',
            elements: [describe(paragraph)],
          });
        }

        // 3. A section heading must not out-scale the page headline.
        const h1 = Array.from(root.querySelectorAll('h1')).find(visibleIn);
        if (h1) {
          const h1Size = px(getComputedStyle(h1).fontSize);
          for (const heading of Array.from(root.querySelectorAll('h2, h3'))) {
            if (!visibleIn(heading)) continue;
            const size = px(getComputedStyle(heading).fontSize);
            if (size <= h1Size + 1) continue;
            findings.push({
              kind: 'heading-hierarchy-inversion',
              message: `${heading.tagName.toLowerCase()} renders larger than the page h1.`,
              elements: [describe(heading), describe(h1)],
              measurements: { headingPx: size, h1Px: h1Size },
            });
          }
        }

        // 4. Headings must not be truncated (JOV-6906). Tight display
        //    leading makes glyphs overflow their box without hiding text, so
        //    measure the clamp itself: the unclamped height must fit.
        const inkContext = document.createElement('canvas').getContext('2d');
        for (const heading of Array.from(root.querySelectorAll('h1, h2, h3'))) {
          if (!visibleIn(heading) || !(heading instanceof HTMLElement)) {
            continue;
          }
          const style = getComputedStyle(heading);
          const headingRect = heading.getBoundingClientRect();
          // Tailwind's sr-only headings remain accessible but have no visible
          // ink, just as in the image-contrast detector.
          if (
            headingRect.width <= 1 &&
            headingRect.height <= 1 &&
            (style.clip === 'rect(0px, 0px, 0px, 0px)' ||
              style.clipPath === 'inset(50%)')
          ) {
            continue;
          }
          const clamp = style.getPropertyValue('-webkit-line-clamp');
          const clipsY =
            style.overflowY === 'hidden' || style.overflowY === 'clip';
          let hiddenY = 0;
          if ((clamp && clamp !== 'none') || clipsY) {
            // A clamp is often paired with a block-size cap (the marketing h1
            // two-line rule), so lifting the clamp alone measures the capped
            // box and misses the hidden lines (/launch hero, 2026-10-04).
            const clampedHeight = heading.getBoundingClientRect().height;
            const lifted = [
              ['-webkit-line-clamp', 'unset'],
              ['max-block-size', 'none'],
              ['max-height', 'none'],
            ] as const;
            const previous = lifted.map(([name]) => [
              name,
              heading.style.getPropertyValue(name),
              heading.style.getPropertyPriority(name),
            ]);
            for (const [name, value] of lifted) {
              heading.style.setProperty(name, value, 'important');
            }
            const fullHeight = heading.getBoundingClientRect().height;
            for (const [name, value, priority] of previous) {
              heading.style.setProperty(name, value, priority);
            }
            hiddenY = fullHeight - clampedHeight;
          }
          const lineHeight =
            px(style.lineHeight) || px(style.fontSize) * 1.2 || 16;
          const hiddenX =
            style.textOverflow === 'ellipsis'
              ? heading.scrollWidth - heading.clientWidth
              : 0;
          // scrollHeight includes the font box's empty descent and positioned
          // descendants. Measure painted text instead: Range locates each
          // glyph's baseline; canvas gives its actual ascent/descent.
          let clippedInk = 0;
          if (
            clipsY &&
            inkContext &&
            heading.scrollHeight > heading.clientHeight + 1
          ) {
            const clipTop = headingRect.top + px(style.borderTopWidth);
            const clipBottom = headingRect.bottom - px(style.borderBottomWidth);
            const walker = document.createTreeWalker(
              heading,
              NodeFilter.SHOW_TEXT
            );
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const parent = node.parentElement;
              if (!parent || !visibleIn(parent)) continue;
              const textStyle = getComputedStyle(parent);
              inkContext.font = `${textStyle.fontStyle} ${textStyle.fontWeight} ${textStyle.fontSize} ${textStyle.fontFamily}`;
              const range = document.createRange();
              const text = node.textContent ?? '';
              let offset = 0;
              for (const glyph of text) {
                range.setStart(node, offset);
                offset += glyph.length;
                range.setEnd(node, offset);
                if (!glyph.trim()) continue;
                const rect = range.getBoundingClientRect();
                const paintedGlyph =
                  textStyle.textTransform === 'uppercase'
                    ? glyph.toLocaleUpperCase()
                    : textStyle.textTransform === 'lowercase'
                      ? glyph.toLocaleLowerCase()
                      : glyph;
                const ink = inkContext.measureText(paintedGlyph);
                const baseline = rect.top + ink.fontBoundingBoxAscent;
                clippedInk = Math.max(
                  clippedInk,
                  clipTop - (baseline - ink.actualBoundingBoxAscent),
                  baseline + ink.actualBoundingBoxDescent - clipBottom
                );
              }
            }
          }
          if (clippedInk <= 1) clippedInk = 0;
          if (hiddenY < lineHeight / 2 && hiddenX <= 2 && clippedInk === 0) {
            continue;
          }
          findings.push({
            kind: 'clipped-heading',
            message:
              clippedInk > 0 && hiddenY < lineHeight / 2 && hiddenX <= 2
                ? 'A heading clips glyph ink (descenders) at its block-size cap.'
                : 'A heading is clamped or clipped and hides part of its text.',
            elements: [describe(heading)],
            measurements: {
              hiddenY: round(hiddenY),
              hiddenX: round(hiddenX),
              clippedInk: round(clippedInk),
            },
          });
        }

        // 5. Heading, lede, and actions in one stack share an axis. Text
        //    axis comes from text-align (not ink, which includes clamped
        //    lines); actions use the union of their controls.
        const controlSelector = 'a[href],button,input,select,textarea';
        type Axis = { readonly mode: 'left' | 'center'; readonly at: number };
        const textAxis = (element: Element): Axis => {
          const style = getComputedStyle(element);
          const rect = rectOf(element);
          return style.textAlign === 'center'
            ? { mode: 'center', at: rect.x + rect.width / 2 }
            : { mode: 'left', at: rect.x + px(style.paddingLeft) };
        };
        for (const heading of Array.from(root.querySelectorAll('h1, h2'))) {
          if (!visibleIn(heading)) continue;
          const siblings = Array.from(heading.parentElement?.children ?? []);
          const after = siblings.slice(siblings.indexOf(heading) + 1);
          const lede = after.find(
            element => element.tagName === 'P' && visibleIn(element)
          );
          const actions = after.find(
            element =>
              element.tagName !== 'P' &&
              visibleIn(element) &&
              (element.matches(controlSelector) ||
                element.querySelector(controlSelector))
          );
          if (!lede || !actions) continue;
          const controls = (
            actions.matches(controlSelector)
              ? [actions]
              : Array.from(actions.querySelectorAll(controlSelector))
          ).filter(visibleIn);
          if (controls.length === 0) continue;
          // A form's field sits inside its own framed box (prefix, padding);
          // the form's edge is the visible action edge.
          const form = actions.matches('form')
            ? actions
            : actions.querySelector('form');
          const boxes = form && visibleIn(form) ? [form] : controls;
          const actionLeft = Math.min(...boxes.map(c => rectOf(c).x));
          const actionRight = Math.max(...boxes.map(c => rectOf(c).right));
          const headingAxis = textAxis(heading);
          const ledeAxis = textAxis(lede);
          const actionAt =
            headingAxis.mode === 'center'
              ? (actionLeft + actionRight) / 2
              : actionLeft;
          const aligned =
            headingAxis.mode === ledeAxis.mode &&
            Math.abs(headingAxis.at - ledeAxis.at) <= 6 &&
            Math.abs(headingAxis.at - actionAt) <= 6;
          if (aligned) continue;
          findings.push({
            kind: 'misaligned-text-stack',
            message:
              'A heading, its lede, and its actions do not share one left edge or center axis.',
            elements: [describe(heading), describe(lede), describe(actions)],
            measurements: {
              headingAt: round(headingAxis.at),
              ledeAt: round(ledeAxis.at),
              actionAt: round(actionAt),
            },
          });
        }

        // 7. Line-break quality (ui.md): a single word alone on the last
        //    rendered line of a headline, lede, or CTA label is a design bug.
        const wordLines = (element: Element): string[][] => {
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT
          );
          const words: { word: string; top: number }[] = [];
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.textContent ?? '';
            for (const match of text.matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, match.index ?? 0);
              range.setEnd(node, (match.index ?? 0) + match[0].length);
              const rect = range.getClientRects()[0];
              if (rect && rect.width > 0) {
                words.push({ word: match[0], top: Math.round(rect.top) });
              }
            }
          }
          const lines: string[][] = [];
          let lineTop: number | null = null;
          for (const { word, top } of words) {
            if (lineTop === null || Math.abs(top - lineTop) > 4) {
              lines.push([]);
              lineTop = top;
            }
            lines[lines.length - 1]?.push(word);
          }
          return lines;
        };
        const lineBreakTargets = Array.from(
          root.querySelectorAll(
            'h1, h2, h3, [data-lede], section > p:first-of-type, a[href], button'
          )
        ).filter(
          element =>
            visibleIn(element) &&
            !element.closest('nav, footer, [role="dialog"], form') &&
            normalizedText(element.textContent).split(' ').length >= 3
        );
        for (const element of lineBreakTargets) {
          const lines = wordLines(element);
          const last = lines.at(-1);
          if (lines.length < 2 || !last || last.length !== 1) continue;
          findings.push({
            kind: 'orphaned-line',
            message: `A single word ("${last[0]}") sits alone on the last line.`,
            elements: [describe(element)],
            measurements: { lines: lines.length },
          });
        }

        // 6. Placeholder content presented as the product. Whole-element
        //    matches catch short labels ("Your Name", "YN"); unambiguous
        //    tokens (lorem ipsum, jov.ie/you, John Doe) match inside longer
        //    text. Word boundaries keep real copy ("Claim your name",
        //    "jov.ie/yourname") clean. The same rules apply to img alt and
        //    aria-label/title text, which is what a screen reader announces.
        const placeholderWhole =
          /^(?:your name|your artist name|artist name|lorem(?: ipsum\b.*)?|placeholder|untitled(?: (?:track|release|song|project|artist|page))?|tbd|tba|todo|n\/a|john doe|jane doe|jov\.ie\/you)$/i;
        const placeholderInline =
          /\blorem ipsum\b|\bjov\.ie\/you(?![\w-])|\b(?:john|jane) doe\b/i;
        const placeholderInlineCase = /\bTBD\b/;
        const initialsPlaceholder = /^y\.?n\.?$/i;
        const placeholderReason = (
          raw: string | null | undefined,
          avatarContext: boolean
        ): string | null => {
          const text = normalizedText(raw);
          if (!text) return null;
          if (text.length <= 40 && placeholderWhole.test(text)) return text;
          if (avatarContext && initialsPlaceholder.test(text)) return text;
          const inline =
            (raw ?? '').match(placeholderInline) ??
            (raw ?? '').match(placeholderInlineCase);
          return inline ? inline[0] : null;
        };
        const avatarContextOf = (element: Element): boolean =>
          element.matches('[data-avatar], [role="img"]') ||
          /avatar|initials|monogram/i.test(
            `${element.getAttribute('class') ?? ''} ${element.parentElement?.getAttribute('class') ?? ''} ${element.getAttribute('data-slot') ?? ''} ${element.getAttribute('data-testid') ?? ''}`
          );
        for (const element of Array.from(
          root.querySelectorAll(
            'h1,h2,h3,h4,h5,h6,p,span,li,figcaption,a,button,label,div,small,strong,em,td,th'
          )
        )) {
          if (element.children.length > 0 || !visibleIn(element)) continue;
          const reason = placeholderReason(
            element.textContent,
            avatarContextOf(element)
          );
          if (!reason) continue;
          findings.push({
            kind: 'placeholder-copy',
            message: `Placeholder copy ("${reason}") renders as product content.`,
            elements: [describe(element)],
          });
        }
        for (const element of Array.from(
          root.querySelectorAll('img[alt], [aria-label], [role="img"][title]')
        )) {
          if (!visibleIn(element)) continue;
          const value =
            element.getAttribute('alt') ??
            element.getAttribute('aria-label') ??
            element.getAttribute('title');
          const reason = placeholderReason(value, avatarContextOf(element));
          if (!reason) continue;
          findings.push({
            kind: 'placeholder-copy',
            message: `Placeholder text ("${reason}") in an image alt or aria label.`,
            elements: [describe(element)],
          });
        }

        // 8. Outcome detectors (axis-mixing, overlay-on-proof). Blank media
        //    needs pixels, so it runs after this evaluate (inspectBlankMedia).
        const designedMarked = Array.from(
          document.querySelectorAll('[data-pen-section]')
        ).filter(visibleIn);
        const designedSections =
          designedMarked.length > 0
            ? designedMarked
            : topLevelSections.filter(visibleIn);
        const sectionName = (element: Element): string =>
          element.getAttribute('data-pen-section') ?? describe(element);

        // 8a. One primary text axis per page. A section may declare its own
        //     with data-axis (ignored here); otherwise a hero on a different axis than
        //     the body, or centre -> left -> centre, is mixed alignment.
        type PageAxis = 'center' | 'left' | 'right';
        const sectionAxis = (element: Element): PageAxis | null => {
          if (element.closest('[data-axis]')) return null;
          const lead =
            Array.from(element.querySelectorAll('h1, h2, h3')).find(
              visibleIn
            ) ??
            Array.from(element.querySelectorAll('p')).find(
              candidate =>
                visibleIn(candidate) &&
                normalizedText(candidate.textContent).length >= 20
            );
          if (!lead) return null;
          const align = getComputedStyle(lead).textAlign;
          if (align === 'center') return 'center';
          if (align === 'right' || align === 'end') return 'right';
          return 'left';
        };
        const axes = designedSections
          .map(element => ({ element, axis: sectionAxis(element) }))
          .filter(
            (entry): entry is { element: Element; axis: PageAxis } =>
              entry.axis !== null
          );
        let axisSwitches = 0;
        for (let index = 1; index < axes.length; index += 1) {
          if (axes[index]?.axis !== axes[index - 1]?.axis) axisSwitches += 1;
        }
        // A lone trailing switch (left chapters, centred closing CTA) is a
        // common deliberate close; a hero on a different axis than the body,
        // or two or more switches, is mixing.
        const heroAxisDiffers =
          axes.length >= 3 &&
          axes[0]?.axis !== axes[1]?.axis &&
          axes[1]?.axis === axes[2]?.axis;
        if (axisSwitches >= 2 || heroAxisDiffers) {
          findings.push({
            kind: 'axis-mixing',
            message: `Primary text axis switches ${axisSwitches} times across sections (${axes
              .map(entry => entry.axis)
              .join(' > ')}) without data-axis.`,
            elements: axes.map(entry => sectionName(entry.element)),
            measurements: { switches: axisSwitches, sections: axes.length },
          });
        }

        // 8b. Fixed/sticky chrome (consent banner, sticky nav) must not sit
        //     over proof media in a designed section: either it overlaps the
        //     media in the first viewport, or the media would fit the
        //     viewport but never fits the part the chrome leaves free.
        const proofMedia = designedSections.flatMap(section =>
          Array.from(section.querySelectorAll('img, video, canvas'))
            .filter(
              media =>
                visibleIn(media) && !media.closest('[aria-hidden="true"]')
            )
            .filter(media => {
              const rect = rectOf(media);
              return rect.width >= 120 && rect.height >= 80;
            })
            .map(media => ({ media, section }))
        );
        const overlays = Array.from(document.body.querySelectorAll('*')).filter(
          element => {
            if (!visibleIn(element)) return false;
            const style = getComputedStyle(element);
            if (style.position !== 'fixed' && style.position !== 'sticky')
              return false;
            if (style.pointerEvents === 'none') return false;
            const rect = rectOf(element);
            return rect.width >= 120 && rect.height >= 24;
          }
        );
        const topOverlays = overlays.filter(element => {
          const rect = rectOf(element);
          return (
            !overlays.some(
              other => other !== element && other.contains(element)
            ) && rect.height < window.innerHeight * 0.6
          );
        });
        const stuckTop = Math.max(
          0,
          ...topOverlays
            .map(rectOf)
            .filter(rect => rect.y <= 8)
            .map(rect => rect.bottom)
        );
        const stuckBottom = Math.max(
          0,
          ...topOverlays
            .map(rectOf)
            .filter(rect => rect.bottom >= window.innerHeight - 8)
            .map(rect => window.innerHeight - rect.y)
        );
        const freeBand = window.innerHeight - stuckTop - stuckBottom;
        const overlayHits = new Set<string>();
        for (const { media, section } of proofMedia) {
          const mediaRect = rectOf(media);
          const docTop = mediaRect.y + window.scrollY;
          const firstViewport =
            docTop < window.innerHeight && docTop + mediaRect.height > 0;
          for (const overlay of topOverlays) {
            if (section.contains(overlay) || overlay.contains(media)) continue;
            const overlayRect = rectOf(overlay);
            const ix = Math.max(
              0,
              Math.min(mediaRect.right, overlayRect.right) -
                Math.max(mediaRect.x, overlayRect.x)
            );
            const iy = Math.max(
              0,
              Math.min(docTop + mediaRect.height, overlayRect.bottom) -
                Math.max(docTop, overlayRect.y)
            );
            const visibleHeight = Math.max(
              1,
              Math.min(docTop + mediaRect.height, window.innerHeight) -
                Math.max(docTop, 0)
            );
            const covered = (ix * iy) / (mediaRect.width * visibleHeight);
            if (firstViewport && covered >= 0.15) {
              overlayHits.add(
                `${describe(overlay)} covers ${describe(media)} in ${sectionName(section)} (${Math.round(covered * 100)}%, first viewport)`
              );
            }
          }
          if (
            mediaRect.height <= window.innerHeight &&
            mediaRect.height > freeBand &&
            (stuckTop > 0 || stuckBottom > 0) &&
            mediaRect.height - freeBand >= mediaRect.height * 0.15
          ) {
            overlayHits.add(
              `${describe(media)} in ${sectionName(section)} fits the viewport (${round(mediaRect.height)}px) but fixed chrome leaves only ${round(freeBand)}px, so it is always partly covered while scrolling`
            );
          }
        }
        for (const hit of overlayHits) {
          findings.push({
            kind: 'overlay-on-proof',
            message: hit,
            elements: [hit.split(' ')[0] ?? 'overlay'],
            measurements: { freeBand: round(freeBand) },
          });
        }
      }

      if (surface === 'public-profile') {
        const viewportRect: DomRectParts = {
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

  const blankMedia =
    options.surface === 'marketing' ? await inspectBlankMedia(page) : [];
  return {
    ...dom,
    findings: [...dom.findings, ...blankMedia],
    ariaSnapshot,
    inspectedAt: new Date().toISOString(),
  };
}

/** Near-uniform pixels: luma stddev under this (0-255) reads as blank. */
export const BLANK_MEDIA_LUMA_STDDEV_MAX = 3;
/** ...and at least this share of pixels sit within 6 levels of the mean. */
export const BLANK_MEDIA_DOMINANT_SHARE_MIN = 0.985;
/** Share of 16x16 grid cells that are flat (stddev < 2.5) above which the media is mostly empty. */
export const BLANK_MEDIA_EMPTY_CELL_SHARE_MAX = 0.6;
const BLANK_MEDIA_MAX_PROBES = 16;

/**
 * Blank-media: an img, video or canvas inside a designed section (a
 * [data-pen-section], else any top-level section) whose rendered pixels are
 * near-uniform. Pixels come from an element screenshot decoded in the page, so
 * what is judged is what a visitor sees (object-fit, poster, canvas draw),
 * not naturalWidth. Opt out with data-decorative or data-dom-certification.
 */
export async function inspectBlankMedia(
  page: Page
): Promise<RouteDomFinding[]> {
  const probes = await page.evaluate(max => {
    const marked = Array.from(document.querySelectorAll('[data-pen-section]'));
    const root = document.querySelector('main') ?? document.body;
    const sections =
      marked.length > 0
        ? marked
        : Array.from(root.querySelectorAll('section, article'));
    const seen = new Set<Element>();
    const out: { id: number; label: string; broken: boolean }[] = [];
    for (const section of sections) {
      for (const media of Array.from(
        section.querySelectorAll('img, video, canvas')
      )) {
        if (seen.has(media) || out.length >= max) continue;
        seen.add(media);
        if (
          media.closest(
            '[data-decorative], [data-dom-certification="ignore"], [aria-hidden="true"], [hidden]'
          )
        )
          continue;
        const style = getComputedStyle(media);
        const rect = media.getBoundingClientRect();
        if (
          rect.width < 120 ||
          rect.height < 80 ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number.parseFloat(style.opacity || '1') === 0
        )
          continue;
        const id = out.length;
        media.setAttribute('data-blank-probe', String(id));
        const tag = media.tagName.toLowerCase();
        const sectionName =
          section.getAttribute('data-pen-section') ??
          section.tagName.toLowerCase();
        const label =
          tag === 'img'
            ? `img[src="${(media.getAttribute('src') ?? '').slice(0, 80)}"] in ${sectionName}`
            : `${tag} in ${sectionName}`;
        out.push({
          id,
          label,
          broken:
            media instanceof HTMLImageElement &&
            media.complete &&
            media.naturalWidth === 0,
        });
      }
    }
    return out;
  }, BLANK_MEDIA_MAX_PROBES);

  const findings: RouteDomFinding[] = [];
  for (const probe of probes) {
    if (probe.broken) {
      findings.push({
        kind: 'blank-media',
        message: 'Media failed to load (naturalWidth 0), so the slot is blank.',
        elements: [probe.label],
      });
      continue;
    }
    let png: Buffer;
    try {
      png = await page
        .locator(`[data-blank-probe="${probe.id}"]`)
        .screenshot({ animations: 'disabled', timeout: 5000 });
    } catch {
      continue;
    }
    const stats = await page.evaluate(async b64 => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${b64}`)).blob()
      );
      const side = 128;
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, side, side);
      const { data } = context.getImageData(0, 0, side, side);
      const lumas: number[] = [];
      for (let index = 0; index < data.length; index += 4) {
        lumas.push(
          0.2126 * (data[index] ?? 0) +
            0.7152 * (data[index + 1] ?? 0) +
            0.0722 * (data[index + 2] ?? 0)
        );
      }
      const mean = lumas.reduce((sum, v) => sum + v, 0) / lumas.length;
      const variance =
        lumas.reduce((sum, v) => sum + (v - mean) ** 2, 0) / lumas.length;
      const dominant =
        lumas.filter(v => Math.abs(v - mean) <= 6).length / lumas.length;
      const grid = 16;
      const cell = side / grid;
      let flatCells = 0;
      for (let gy = 0; gy < grid; gy += 1) {
        for (let gx = 0; gx < grid; gx += 1) {
          const values: number[] = [];
          for (let y = 0; y < cell; y += 1) {
            for (let x = 0; x < cell; x += 1) {
              values.push(lumas[(gy * cell + y) * side + gx * cell + x] ?? 0);
            }
          }
          const cellMean =
            values.reduce((sum, v) => sum + v, 0) / values.length;
          const cellStd = Math.sqrt(
            values.reduce((sum, v) => sum + (v - cellMean) ** 2, 0) /
              values.length
          );
          if (cellStd < 2.5) flatCells += 1;
        }
      }
      return {
        stddev: Math.sqrt(variance),
        dominant,
        mean,
        emptyShare: flatCells / (grid * grid),
      };
    }, png.toString('base64'));
    if (!stats) continue;
    if (stats.emptyShare >= BLANK_MEDIA_EMPTY_CELL_SHARE_MAX) {
      findings.push({
        kind: 'blank-media',
        message: `Media is mostly empty: ${Math.round(stats.emptyShare * 100)}% of its area is flat pixels.`,
        elements: [probe.label],
        measurements: {
          emptyShare: Math.round(stats.emptyShare * 1000) / 1000,
        },
      });
      continue;
    }
    if (
      stats.stddev < BLANK_MEDIA_LUMA_STDDEV_MAX &&
      stats.dominant >= BLANK_MEDIA_DOMINANT_SHARE_MIN
    ) {
      findings.push({
        kind: 'blank-media',
        message: `Media renders near-uniform pixels (luma stddev ${stats.stddev.toFixed(2)}), so the slot reads as empty.`,
        elements: [probe.label],
        measurements: {
          lumaStddev: Math.round(stats.stddev * 100) / 100,
          dominantShare: Math.round(stats.dominant * 1000) / 1000,
        },
      });
    }
  }
  await page.evaluate(() => {
    for (const node of Array.from(
      document.querySelectorAll('[data-blank-probe]')
    ))
      node.removeAttribute('data-blank-probe');
  });
  return findings;
}

/**
 * Layout stability (DESIGN.md "Layout Shift Prevention"): cumulative layout
 * shift from load through a full scroll must stay under Google's "good"
 * threshold. Install before navigation; measure after inspection.
 */
export const LAYOUT_SHIFT_BUDGET = 0.1;

export async function installLayoutShiftObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = {
      value: 0,
      observed: false,
      sessionValue: 0,
      sessionStart: 0,
      lastShift: 0,
    };
    Object.defineProperty(window, '__jovieLayoutShift', { value: state });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { value: number; hadRecentInput: boolean }
      >) {
        if (entry.hadRecentInput) continue;
        // CLS uses the largest session window (1s gap, at most 5s), not an
        // unbounded sum of unrelated shifts during a long scroll.
        if (
          entry.startTime - state.lastShift > 1000 ||
          entry.startTime - state.sessionStart > 5000
        ) {
          state.sessionStart = entry.startTime;
          state.sessionValue = 0;
        }
        state.lastShift = entry.startTime;
        state.sessionValue += entry.value;
        state.value = Math.max(state.value, state.sessionValue);
      }
    }).observe({ type: 'layout-shift', buffered: true });
    state.observed =
      PerformanceObserver.supportedEntryTypes.includes('layout-shift');
  });
}

export async function measureLayoutShift(
  page: Page
): Promise<RouteDomFinding | null> {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
  const cls = await page.evaluate(() => {
    const state = (
      window as unknown as {
        __jovieLayoutShift?: { value: number; observed: boolean };
      }
    ).__jovieLayoutShift;
    if (!state?.observed || !Number.isFinite(state.value) || state.value < 0) {
      throw new Error('Layout-shift observation is unavailable');
    }
    return state.value;
  });
  if (cls <= LAYOUT_SHIFT_BUDGET) return null;
  return {
    kind: 'layout-shift',
    message: `Cumulative layout shift ${cls.toFixed(3)} exceeds ${LAYOUT_SHIFT_BUDGET}.`,
    elements: ['document'],
    measurements: { cls: Math.round(cls * 1000) / 1000 },
  };
}
