import type { Page } from '@playwright/test';
import type { RouteDomFinding } from './route-dom-detector';

type DomRectParts = Record<
  'x' | 'y' | 'width' | 'height' | 'right' | 'bottom',
  number
>;

/**
 * Marketing outcome detectors that read the rendered DOM: placeholder copy
 * (text, img alt, aria), one primary text axis per page (axis-mixing) and
 * fixed chrome over proof media (overlay-on-proof). Split out of
 * inspectRouteDom (route-dom-detector.ts), which appends these findings
 * after its own marketing findings; the helpers below match the ones there.
 */
export async function inspectMarketingOutcomeDom(
  page: Page
): Promise<RouteDomFinding[]> {
  return page.evaluate(() => {
    const findings: RouteDomFinding[] = [];
    const root = document.querySelector('main') ?? document.body;
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
      const siblings = Array.from(element.parentElement?.children ?? []).filter(
        candidate => candidate.tagName === element.tagName
      );
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
    const optedOut = (element: Element): boolean =>
      element.closest('[data-dom-certification="ignore"]') !== null;

    const topLevelSections = Array.from(
      root.querySelectorAll('section, article')
    ).filter(element => {
      const ancestor = element.parentElement?.closest('section, article');
      return !optedOut(element) && !(ancestor && root.contains(ancestor));
    });

    const visibleIn = (element: Element): boolean =>
      isRendered(element) &&
      !optedOut(element) &&
      !element.closest('[aria-hidden="true"], [inert]');

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
        Array.from(element.querySelectorAll('h1, h2, h3')).find(visibleIn) ??
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
          media => visibleIn(media) && !media.closest('[aria-hidden="true"]')
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
        !overlays.some(other => other !== element && other.contains(element)) &&
        rect.height < window.innerHeight * 0.6
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
    return findings;
  });
}
