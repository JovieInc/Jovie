import { expect, type Page, type TestInfo } from '@playwright/test';

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

function normalizeAttachmentName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
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

    return Array.from(document.querySelectorAll('*'))
      .map(element => {
        const rect = element.getBoundingClientRect();
        const htmlElement = element as HTMLElement;
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
        };
      })
      .filter(
        item => item.width > 0 && (item.right > viewportWidth || item.left < 0)
      )
      .slice(0, 20);
  });
}

export async function expectNoDocumentOverflow(
  page: Page,
  testInfo: TestInfo,
  label: string
): Promise<void> {
  const metrics = await getMobileOverflowMetrics(page);

  if (metrics.documentOverflow > 0) {
    const offenders = await getOverflowingElements(page);
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
}
