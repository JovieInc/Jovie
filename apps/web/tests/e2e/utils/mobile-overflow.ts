import {
  expect,
  type Page,
  type Response,
  type TestInfo,
} from '@playwright/test';

export interface MobileOverflowMetrics {
  readonly documentScrollWidth: number;
  readonly documentClientWidth: number;
  readonly bodyScrollWidth: number;
  readonly bodyClientWidth: number;
  readonly windowInnerWidth: number;
  readonly documentOverflow: number;
  readonly bodyOverflow: number;
}

export interface OverflowingElement {
  readonly tag: string;
  readonly id: string;
  readonly className: string;
  readonly role: string | null;
  readonly ariaLabel: string | null;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly text: string;
}

type RedirectPage = Pick<Page, 'waitForURL'>;
type RedirectResponse = Pick<Response, 'text' | 'url'>;

function normalizeAttachmentName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export async function waitForPendingNextRedirect(
  page: RedirectPage,
  response: RedirectResponse | null,
  timeout: number
): Promise<void> {
  if (!response) return;

  const html = await response.text();
  const digest = html.match(
    /NEXT_REDIRECT;(?:replace|push);.*?;(?:303|307|308);(?=["'<>\\]|$)/s
  )?.[0];
  const target = digest?.split(';').slice(2, -2).join(';').trim();
  if (!target) return;

  const expectedUrl = new URL(target, response.url());
  await page.waitForURL(
    url =>
      url.origin === expectedUrl.origin &&
      url.pathname === expectedUrl.pathname &&
      url.search === expectedUrl.search,
    { waitUntil: 'domcontentloaded', timeout }
  );
}

export async function getMobileOverflowMetrics(
  page: Page
): Promise<MobileOverflowMetrics> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;

    const documentScrollWidth = root.scrollWidth;
    const documentClientWidth = root.clientWidth;
    const bodyScrollWidth = body?.scrollWidth ?? 0;
    const bodyClientWidth = body?.clientWidth ?? 0;
    const windowInnerWidth = window.innerWidth;

    return {
      documentScrollWidth,
      documentClientWidth,
      bodyScrollWidth,
      bodyClientWidth,
      windowInnerWidth,
      documentOverflow: documentScrollWidth - documentClientWidth,
      bodyOverflow: bodyScrollWidth - bodyClientWidth,
    };
  });
}

export async function getOverflowingElements(
  page: Page
): Promise<readonly OverflowingElement[]> {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const tolerance = 1;
    const clippingOverflowValues = new Set([
      'auto',
      'clip',
      'hidden',
      'scroll',
    ]);

    function hasClippedOrScrolledAncestor(element: Element): boolean {
      let current: Element | null = element;

      while (current && current !== document.documentElement) {
        if (current.getAttribute('aria-hidden') === 'true') {
          return true;
        }

        const style = window.getComputedStyle(current);
        if (clippingOverflowValues.has(style.overflowX)) {
          return true;
        }

        current = current.parentElement;
      }

      return false;
    }

    return Array.from(document.querySelectorAll('*'))
      .map(element => {
        const rect = element.getBoundingClientRect();
        const htmlElement = element as HTMLElement;
        const style = window.getComputedStyle(htmlElement);
        const className =
          typeof htmlElement.className === 'string'
            ? htmlElement.className
            : String(htmlElement.getAttribute('class') ?? '');

        return {
          tag: element.tagName.toLowerCase(),
          id: htmlElement.id,
          className,
          role: htmlElement.getAttribute('role'),
          ariaLabel: htmlElement.getAttribute('aria-label'),
          left: Math.round(rect.left * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
          text: (htmlElement.innerText || htmlElement.textContent || '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 80),
          isVisible:
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number.parseFloat(style.opacity || '1') > 0.01,
          isIntentionalClip: hasClippedOrScrolledAncestor(element),
        };
      })
      .filter(
        item =>
          item.isVisible &&
          !item.isIntentionalClip &&
          item.width > 0 &&
          (item.right > viewportWidth + tolerance || item.left < -tolerance)
      )
      .map(item => ({
        tag: item.tag,
        id: item.id,
        className: item.className,
        role: item.role,
        ariaLabel: item.ariaLabel,
        left: item.left,
        right: item.right,
        width: item.width,
        text: item.text,
      }))
      .slice(0, 20);
  });
}

export async function expectNoDocumentOverflow(
  page: Page,
  testInfo: TestInfo,
  label: string
): Promise<void> {
  const metrics = await getMobileOverflowMetrics(page);
  const offenders = await getOverflowingElements(page);

  if (metrics.documentOverflow > 0 || offenders.length > 0) {
    await testInfo.attach(
      `mobile-overflow-${normalizeAttachmentName(label)}.json`,
      {
        body: JSON.stringify({ label, metrics, offenders }, null, 2),
        contentType: 'application/json',
      }
    );
  }

  expect(
    metrics.documentOverflow,
    `${label} introduced document horizontal overflow: ${JSON.stringify(
      metrics,
      null,
      2
    )}`
  ).toBeLessThanOrEqual(0);

  expect(
    offenders,
    `${label} has visible elements clipped outside the viewport: ${JSON.stringify(
      { metrics, offenders },
      null,
      2
    )}`
  ).toHaveLength(0);
}

export interface ChildOverlapViolation {
  readonly container: string;
  readonly kind: 'overlap' | 'escapes-container';
  readonly a: string;
  readonly b: string | null;
}

/**
 * Layout guard for opt-in containers. Any element marked
 * `data-no-child-overlap` must keep its visible direct children from
 * intersecting each other and from poking out past the right edge of the
 * container. Catches the "button covers the title" class of mobile defect
 * that document overflow checks cannot see (Audience banner at 390px,
 * 2026-10-24).
 */
export async function getChildOverlapViolations(
  page: Page
): Promise<ChildOverlapViolation[]> {
  return page.evaluate(() => {
    const TOLERANCE = 1;
    const describe = (el: Element) => {
      const testId = el.getAttribute('data-testid');
      const text = (el.textContent ?? '').trim().slice(0, 30);
      return `${el.tagName.toLowerCase()}${testId ? `[${testId}]` : ''}:${text}`;
    };
    const out: {
      container: string;
      kind: 'overlap' | 'escapes-container';
      a: string;
      b: string | null;
    }[] = [];
    for (const container of document.querySelectorAll(
      '[data-no-child-overlap]'
    )) {
      const cRect = container.getBoundingClientRect();
      if (cRect.width === 0 || cRect.height === 0) continue;
      const kids = [...container.children]
        .map(el => ({ el, r: el.getBoundingClientRect() }))
        .filter(
          ({ el, r }) =>
            r.width > 0 &&
            r.height > 0 &&
            getComputedStyle(el).visibility !== 'hidden'
        );
      for (const { el, r } of kids) {
        if (r.right > cRect.right + TOLERANCE) {
          out.push({
            container: describe(container),
            kind: 'escapes-container',
            a: describe(el),
            b: null,
          });
        }
      }
      for (let i = 0; i < kids.length; i += 1) {
        for (let j = i + 1; j < kids.length; j += 1) {
          const a = kids[i].r;
          const b = kids[j].r;
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > TOLERANCE && h > TOLERANCE) {
            out.push({
              container: describe(container),
              kind: 'overlap',
              a: describe(kids[i].el),
              b: describe(kids[j].el),
            });
          }
        }
      }
    }
    return out;
  });
}

export async function expectNoChildOverlap(
  page: Page,
  label: string
): Promise<void> {
  const violations = await getChildOverlapViolations(page);
  expect(
    violations,
    `${label}: children of [data-no-child-overlap] containers must not overlap or escape`
  ).toEqual([]);
}
