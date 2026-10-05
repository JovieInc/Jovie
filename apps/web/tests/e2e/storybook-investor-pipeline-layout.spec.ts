import { expect, type Page, type TestInfo, test } from '@playwright/test';

const STORY_PREFIX = 'features-admin-investors-investorpipelinetable--';
const MAC_CONTENT_VIEWPORT = { width: 1512, height: 949 } as const;
const NARROW_VIEWPORT = { width: 390, height: 844 } as const;

type ColumnGeometry = {
  readonly display: string;
  readonly left: number;
  readonly right: number;
  readonly width: number;
};

type TableGeometry = {
  readonly tableLayout: string;
  readonly headers: ColumnGeometry[];
  readonly rows: ColumnGeometry[][];
};

async function openStory(
  page: Page,
  story: 'one-row' | 'multiple-rows',
  viewport: { readonly width: number; readonly height: number }
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.addInitScript(() => {
    localStorage.setItem('jovie-theme-storybook', 'dark');
  });
  await page.goto(`/iframe.html?id=${STORY_PREFIX}${story}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
  });
  const table = page.getByRole('table', { name: 'Investor pipeline' });
  await expect(table).toBeVisible({ timeout: 60_000 });
  return table;
}

async function readGeometry(page: Page): Promise<TableGeometry> {
  return page.getByTestId('admin-investors-table').evaluate(root => {
    const readCells = (cells: Element[]) =>
      cells.map(cell => {
        const bounds = cell.getBoundingClientRect();
        return {
          display: getComputedStyle(cell).display,
          left: bounds.left,
          right: bounds.right,
          width: bounds.width,
        };
      });
    const table = root.querySelector('table');
    if (!table) throw new Error('Investor table did not render');
    return {
      tableLayout: getComputedStyle(table).tableLayout,
      headers: readCells(Array.from(table.querySelectorAll('thead th'))),
      rows: Array.from(table.querySelectorAll('tbody tr')).map(row =>
        readCells(Array.from(row.querySelectorAll(':scope > td')))
      ),
    };
  });
}

function expectAlignedColumns(geometry: TableGeometry, expectedRows: number) {
  expect(geometry.tableLayout).toBe('fixed');
  expect(geometry.headers).toHaveLength(7);
  expect(geometry.rows).toHaveLength(expectedRows);
  for (const header of geometry.headers) {
    expect(header.display).toBe('table-cell');
  }
  for (const row of geometry.rows) {
    expect(row).toHaveLength(7);
    for (const [index, cell] of row.entries()) {
      const header = geometry.headers[index]!;
      expect(cell.display).toBe('table-cell');
      expect(Math.abs(cell.left - header.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(cell.right - header.right)).toBeLessThanOrEqual(1);
      expect(Math.abs(cell.width - header.width)).toBeLessThanOrEqual(1);
    }
  }
}

async function auditSettledLayoutShift(page: Page) {
  await page.evaluate(() => {
    const observed: number[] = [];
    Object.assign(globalThis, { __investorLayoutShifts: observed });
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        };
        if (!shift.hadRecentInput && typeof shift.value === 'number') {
          observed.push(shift.value);
        }
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
    Object.assign(globalThis, { __investorLayoutShiftObserver: observer });
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const cls = await page.evaluate(() => {
    const values = (
      globalThis as typeof globalThis & { __investorLayoutShifts?: number[] }
    ).__investorLayoutShifts;
    return values?.reduce((sum, value) => sum + value, 0) ?? 0;
  });
  expect(cls).toBe(0);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('aligns a populated investor row at the Mac content-window width without shifting', async ({
  page,
}, testInfo) => {
  await openStory(page, 'one-row', MAC_CONTENT_VIEWPORT);
  const before = await readGeometry(page);
  expectAlignedColumns(before, 1);

  await auditSettledLayoutShift(page);
  await page.getByRole('button', { name: 'Reveal investor token' }).click();
  await expect(
    page.getByRole('button', { name: 'Hide investor token' })
  ).toBeVisible();
  expect(await readGeometry(page)).toEqual(before);
  await attachScreenshot(page, testInfo, 'mac-content-window-one-row');
});

test('aligns every populated investor row at the Mac content-window width', async ({
  page,
}, testInfo) => {
  await openStory(page, 'multiple-rows', MAC_CONTENT_VIEWPORT);
  expectAlignedColumns(await readGeometry(page), 3);
  await auditSettledLayoutShift(page);
  await attachScreenshot(page, testInfo, 'mac-content-window-multiple-rows');
});

test('uses table-owned horizontal scrolling at a deliberate narrow width', async ({
  page,
}, testInfo) => {
  await openStory(page, 'multiple-rows', NARROW_VIEWPORT);
  expectAlignedColumns(await readGeometry(page), 3);

  const scrollState = await page
    .getByTestId('admin-investors-table')
    .evaluate(root => {
      const scroller = root.firstElementChild as HTMLElement | null;
      if (!scroller) throw new Error('Investor table scroller did not render');
      const style = getComputedStyle(scroller);
      return {
        clientWidth: scroller.clientWidth,
        scrollWidth: scroller.scrollWidth,
        overflowX: style.overflowX,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
      };
    });
  expect(scrollState.overflowX).toBe('auto');
  expect(scrollState.scrollWidth).toBeGreaterThanOrEqual(760);
  expect(scrollState.scrollWidth).toBeGreaterThan(scrollState.clientWidth);
  expect(scrollState.documentWidth).toBeLessThanOrEqual(
    scrollState.viewportWidth
  );

  await page.getByTestId('admin-investors-table').evaluate(root => {
    const scroller = root.firstElementChild as HTMLElement;
    scroller.scrollLeft = scroller.scrollWidth;
  });
  expectAlignedColumns(await readGeometry(page), 3);
  await auditSettledLayoutShift(page);
  await attachScreenshot(page, testInfo, 'narrow-horizontal-scroll');
});
