import type { Page } from '@playwright/test';

/**
 * Samples the settings route, profile pane, form column and profile rail in
 * one frame for settings-profile-pane.spec.ts. Returns null geometry unless
 * each surface resolves to exactly one visible element.
 */
export async function readPaneGeometry(page: Page) {
  return page.evaluate(() => {
    const visible = (selector: string) =>
      [...document.querySelectorAll<HTMLElement>(selector)].filter(element => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          box.width > 0 &&
          box.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0 &&
          !element.closest('[hidden], [inert], [aria-hidden="true"]')
        );
      });
    const selectors = {
      route: '[data-testid="app-shell-scroll"]',
      pane: '[data-testid="settings-shell-content"]',
      column: '[data-settings-layout-column="true"]',
      field: '#displayName',
      rail: '#shell-artist-profile-rail',
    };
    // Rail lifecycle evidence rides with every sample. The matrix artifacts
    // are the only readable record of the drawer's phase when a lifecycle
    // assertion fails, so the observed phase/hiding state must travel with
    // the geometry instead of living only in the moment of the assertion.
    const railLifecycle = (() => {
      const element = document.querySelector<HTMLElement>(
        '#shell-artist-profile-rail'
      );
      return {
        present: element !== null,
        railPhase: element?.getAttribute('data-rail-phase') ?? null,
        ariaHidden: element?.getAttribute('aria-hidden') ?? null,
        modalSheet:
          element?.getAttribute('role') === 'dialog' &&
          element?.getAttribute('aria-modal') === 'true',
      };
    })();
    const elements = Object.fromEntries(
      Object.entries(selectors).map(([name, selector]) => [
        name,
        visible(selector),
      ])
    );
    const counts = Object.fromEntries(
      Object.entries(elements).map(([name, matches]) => [name, matches.length])
    );
    if (Object.values(counts).some(count => count !== 1)) {
      return { counts, railLifecycle, geometry: null };
    }
    const box = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    };
    const route = box(elements.route[0]);
    const pane = box(elements.pane[0]);
    const column = box(elements.column[0]);
    const field = box(elements.field[0]);
    const rail = box(elements.rail[0]);
    // The rail column's allocation is independent of the route pane marker.
    // A narrowed empty marker cannot certify an overflowing form.
    const railMount = elements.rail[0].closest<HTMLElement>(
      '[data-testid="app-shell-right-rail"]'
    );
    if (!railMount) return { counts, geometry: null };
    const occupiedRail = box(railMount);
    const fieldRect = elements.field[0].getBoundingClientRect();
    const hit = document.elementFromPoint(
      fieldRect.left + fieldRect.width / 2,
      fieldRect.top + fieldRect.height / 2
    );
    return {
      counts,
      railLifecycle,
      geometry: {
        route,
        pane,
        column,
        field,
        rail,
        occupiedRail,
        relationships: {
          routeContainsPane: elements.route[0].contains(elements.pane[0]),
          paneContainsColumn: elements.pane[0].contains(elements.column[0]),
          columnContainsField: elements.column[0].contains(elements.field[0]),
          // The rail is a sibling column of the route in one main plane, so
          // it pushes the route instead of laying on top of it.
          sameShell:
            railMount.parentElement ===
              elements.route[0].closest('[data-app-shell-main-plane="true"]') &&
            !railMount.parentElement
              ?.querySelector('[data-app-shell-main-content="true"]')
              ?.contains(railMount),
          fieldHit:
            hit === elements.field[0] || elements.field[0].contains(hit),
        },
        columnOverflow:
          elements.column[0].scrollWidth - elements.column[0].clientWidth,
        paneOverflow:
          elements.pane[0].scrollWidth - elements.pane[0].clientWidth,
        overflowingElements: [
          ...elements.column[0].querySelectorAll<HTMLElement>('*'),
        ]
          .filter(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== 'hidden' &&
              (rect.right > column.right + 1 || rect.left < column.left - 1)
            );
          })
          .slice(0, 30)
          .map(element => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName,
              id: element.id,
              className: element.className,
              left: rect.left,
              right: rect.right,
              width: rect.width,
            };
          }),
        centerDelta: Math.abs(
          (column.left + column.right - pane.left - pane.right) / 2
        ),
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      },
    };
  });
}
