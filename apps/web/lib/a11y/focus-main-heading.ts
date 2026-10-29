/**
 * Move focus to the main heading of the current document (JOV-9035).
 *
 * After a checkout success moment navigates to the unlocked feature, focus
 * must land on that feature's main h1 — never on `body` and never on an
 * unmounted node. Heading focus is also the correct landing for any route
 * arrival that carries the `focus=heading` marker.
 */

/** Focus the first main heading (or the main landmark as a fallback). */
export function focusMainHeading(root: ParentNode = document): boolean {
  const heading = root.querySelector<HTMLElement>(
    'main h1, [role="main"] h1, h1'
  );
  if (heading) {
    // Absent tabindex reads as tabIndex === 0 in the DOM IDL but does not
    // make the element focusable — only an explicit tabindex does.
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    heading.focus();
    return true;
  }
  const main = root.querySelector<HTMLElement>('main, [role="main"]');
  if (main) {
    if (!main.hasAttribute('tabindex')) main.tabIndex = -1;
    main.focus();
    return true;
  }
  return false;
}
