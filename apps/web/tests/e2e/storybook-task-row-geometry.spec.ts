import { expect, test } from '@playwright/test';

const STORY_ID = 'dashboard-tasks-taskdatatable--multiline-task-rows';
const VIEWPORTS = [
  { name: 'normal desktop split', width: 1280 },
  { name: 'narrow desktop split', width: 390 },
] as const;

for (const viewport of VIEWPORTS) {
  for (const theme of ['dark', 'light']) {
    const suffix = theme === 'light' ? '-light' : '';
    test(`contains padded inline badges in a ${viewport.name} (${theme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: 820 });
      await page.goto(
        `/iframe.html?id=organisms-table-atoms-tablecell--inline-badges${suffix}&viewMode=story`,
        { waitUntil: 'domcontentloaded' }
      );
      await expect(page.getByTestId('inline-badge-table')).toBeVisible();

      for (const align of ['left', 'center', 'right']) {
        const badge = page.getByTestId(`badge-${align}`);
        const geometry = await badge.evaluate(element => {
          const content = element.closest(
            '[data-table-cell-content="stable"]'
          )!;
          const bounds = element.getBoundingClientRect();
          const container = content.getBoundingClientRect();
          const longLabel = element
            .closest('tr')!
            .lastElementChild!.querySelector(
              '[data-table-cell-content="stable"]'
            )!;
          return {
            top: bounds.top - container.top,
            bottom: container.bottom - bounds.bottom,
            left: bounds.left - container.left,
            right: container.right - bounds.right,
            labelScrollWidth: longLabel.scrollWidth,
            labelClientWidth: longLabel.clientWidth,
            labelScrollHeight: longLabel.scrollHeight,
            labelClientHeight: longLabel.clientHeight,
          };
        });
        expect(geometry.top, `${align} badge top`).toBeGreaterThanOrEqual(0);
        expect(geometry.bottom, `${align} badge bottom`).toBeGreaterThanOrEqual(
          0
        );
        expect(Math.abs(geometry.top - geometry.bottom)).toBeLessThanOrEqual(2);
        if (align === 'center') {
          expect(Math.abs(geometry.left - geometry.right)).toBeLessThanOrEqual(
            1
          );
        } else {
          expect(geometry[align as 'left' | 'right']).toBeLessThanOrEqual(1);
        }
        expect(geometry.labelScrollWidth).toBeGreaterThan(
          geometry.labelClientWidth
        );
        expect(geometry.labelScrollHeight).toBeLessThanOrEqual(
          geometry.labelClientHeight
        );
      }
    });
    test(`keeps creator avatars and focused actions whole in a ${viewport.name} (${theme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: 820 });
      await page.goto(
        `/iframe.html?id=organisms-table-atoms-tablecell--creator-identity${suffix}&viewMode=story`,
        { waitUntil: 'domcontentloaded' }
      );
      const table = page.getByTestId('creator-identity-table');
      await expect(table).toBeVisible();
      const avatar = table.locator('[data-slot="app-avatar"]');
      await expect(avatar).toBeVisible();
      await expect
        .poll(() =>
          avatar
            .locator('img')
            .evaluate(
              image =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0
            )
        )
        .toBe(true);
      // Measure the whole circular frame, not pixels intentionally masked by its radius.
      const clipping = await avatar.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const violations: string[] = [];
        for (
          let parent = element.parentElement;
          parent;
          parent = parent.parentElement
        ) {
          const style = getComputedStyle(parent);
          const rect = parent.getBoundingClientRect();
          if (
            ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY) &&
            (bounds.top < rect.top - 1 || bounds.bottom > rect.bottom + 1)
          )
            violations.push(parent.className);
          if (
            ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX) &&
            (bounds.left < rect.left - 1 || bounds.right > rect.right + 1)
          )
            violations.push(parent.className);
        }
        return violations;
      });
      expect(
        clipping,
        'interior avatar must fit every clipping ancestor'
      ).toEqual([]);
      for (const action of [
        table.getByRole('button', {
          name: 'Copy link for @long_creator_username',
        }),
        table.getByRole('link', {
          name: 'Open profile for @long_creator_username',
        }),
      ]) {
        await action.focus();
        await expect(action).toBeFocused();
        await expect(action).toHaveCSS('opacity', '1');
        const bounds = await action.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const content = element
            .closest('[data-table-cell-content="stable"]')!
            .getBoundingClientRect();
          return {
            top: rect.top - content.top,
            bottom: content.bottom - rect.bottom,
            left: rect.left - content.left,
            right: content.right - rect.right,
            hitAtLeft:
              document
                .elementFromPoint(rect.left + 1, rect.top + rect.height / 2)
                ?.closest('button, a') === element,
            hitAtRight:
              document
                .elementFromPoint(rect.right - 1, rect.top + rect.height / 2)
                ?.closest('button, a') === element,
          };
        });
        // The canonical focus ring is 2px plus a 2px offset.
        for (const inset of [
          bounds.top,
          bounds.bottom,
          bounds.left,
          bounds.right,
        ]) {
          expect(inset).toBeGreaterThanOrEqual(4);
        }
        expect(bounds.hitAtLeft).toBe(true);
        expect(bounds.hitAtRight).toBe(true);
        const avatarBounds = await avatar.boundingBox();
        const tableBounds = await table.boundingBox();
        expect(avatarBounds).not.toBeNull();
        expect(tableBounds).not.toBeNull();
        expect(avatarBounds!.x).toBeGreaterThanOrEqual(tableBounds!.x);
        expect(avatarBounds!.x + avatarBounds!.width).toBeLessThanOrEqual(
          tableBounds!.x + tableBounds!.width
        );
      }
    });
  }
}

test.describe('Tasks multiline row geometry', () => {
  for (const viewport of VIEWPORTS) {
    test(`keeps title and wrapped metadata visible in a ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: 820 });
      await page.goto(`/iframe.html?id=${STORY_ID}&viewMode=story`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(page.locator('#storybook-root')).not.toBeEmpty({
        timeout: 60_000,
      });
      await expect(page.getByTestId('task-row-geometry-frame')).toBeVisible();

      const rowBounds: Array<{ top: number; bottom: number }> = [];
      for (const taskId of ['task-row-short', 'task-row-long']) {
        const row = page.getByTestId(`task-list-row-${taskId}`);
        const title = row.locator('p');
        const metadata = row.getByTestId(`task-list-row-meta-${taskId}`);

        await expect(title).toBeVisible();
        await expect(metadata).toBeVisible();

        const geometry = await row.evaluate(element => {
          const tableRow = element.closest('tr');
          const cellContent = tableRow?.querySelector<HTMLElement>(
            '[data-table-cell-content="stable"]'
          );
          const titleElement = element.querySelector<HTMLElement>('p');
          const metadataElement = element.querySelector<HTMLElement>(
            '[data-testid^="task-list-row-meta-"]'
          );
          if (!cellContent || !titleElement || !metadataElement) return null;

          const rect = (node: HTMLElement) => {
            const bounds = node.getBoundingClientRect();
            return { top: bounds.top, bottom: bounds.bottom };
          };
          const metadataChildTops = Array.from(metadataElement.children)
            .map(child => child.getBoundingClientRect().top)
            .sort((left, right) => left - right);
          const metadataRows = metadataChildTops.reduce<number[]>(
            (rows, top) => {
              if (rows.length === 0 || top - rows[rows.length - 1]! >= 8) {
                rows.push(top);
              }
              return rows;
            },
            []
          ).length;
          return {
            row: rect(tableRow as HTMLElement),
            cell: rect(cellContent),
            title: rect(titleElement),
            metadata: rect(metadataElement),
            metadataRows,
            cellOverflowY: getComputedStyle(cellContent).overflowY,
            cellScrollHeight: cellContent.scrollHeight,
            cellClientHeight: cellContent.clientHeight,
            metadataScrollHeight: metadataElement.scrollHeight,
            metadataClientHeight: metadataElement.clientHeight,
          };
        });

        expect(geometry, `${taskId} rendered geometry`).not.toBeNull();
        if (!geometry) continue;
        rowBounds.push(geometry.row);
        expect(
          geometry.title.top,
          `${taskId} title stays within its row: ${JSON.stringify(geometry)}`
        ).toBeGreaterThanOrEqual(geometry.row.top - 2);
        expect(
          geometry.title.bottom,
          `${taskId} title stays within its row: ${JSON.stringify(geometry)}`
        ).toBeLessThanOrEqual(geometry.row.bottom + 2);
        expect(
          geometry.metadata.top,
          `${taskId} metadata stays within its row: ${JSON.stringify(geometry)}`
        ).toBeGreaterThanOrEqual(geometry.row.top - 2);
        expect(
          geometry.metadata.bottom,
          `${taskId} metadata stays within its row: ${JSON.stringify(geometry)}`
        ).toBeLessThanOrEqual(geometry.row.bottom + 2);
        expect(
          geometry.metadataRows,
          `${taskId} exercises wrapped metadata: ${JSON.stringify(geometry)}`
        ).toBeGreaterThan(1);
        expect(
          geometry.title.top,
          `${taskId} title top: ${JSON.stringify(geometry)}`
        ).toBeGreaterThanOrEqual(geometry.cell.top - 2);
        expect(
          geometry.title.bottom,
          `${taskId} title bottom: ${JSON.stringify(geometry)}`
        ).toBeLessThanOrEqual(geometry.cell.bottom + 2);
        expect(
          geometry.metadata.top,
          `${taskId} metadata top: ${JSON.stringify(geometry)}`
        ).toBeGreaterThanOrEqual(geometry.cell.top - 2);
        expect(
          geometry.metadata.bottom,
          `${taskId} metadata bottom: ${JSON.stringify(geometry)}`
        ).toBeLessThanOrEqual(geometry.cell.bottom + 2);
        expect(
          geometry.cellScrollHeight,
          `${taskId} cell content clips overflow: ${JSON.stringify(geometry)}`
        ).toBeLessThanOrEqual(geometry.cellClientHeight + 1);
        expect(
          geometry.metadataScrollHeight,
          `${taskId} metadata clips overflow: ${JSON.stringify(geometry)}`
        ).toBeLessThanOrEqual(geometry.metadataClientHeight + 1);
      }
      expect(rowBounds).toHaveLength(2);
      expect(rowBounds[0]!.bottom).toBeLessThanOrEqual(rowBounds[1]!.top + 1);
    });
  }
});

test('keeps default table cell content at its canonical single-line height', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto(
    '/iframe.html?id=dashboard-tasks-taskdatatable--default&viewMode=story',
    {
      waitUntil: 'domcontentloaded',
    }
  );

  const cellContent = page
    .locator('[data-table-cell-content="stable"]')
    .first();
  await expect(cellContent).toBeVisible();
  const cellHeight = await cellContent.evaluate(
    element => element.getBoundingClientRect().height
  );
  expect(cellHeight).toBe(32);
});
