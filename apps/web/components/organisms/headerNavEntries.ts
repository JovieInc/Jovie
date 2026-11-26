/**
 * Header nav entries. A dropdown caret promises more than one destination, so
 * the caret is derived from the entry's type, never from a flag: only a
 * `flyout` entry (two or more links, enforced by the tuple type) can render
 * one. An empty menu disappears; a one-link menu is a plain link.
 */
export interface HeaderFlyoutLink {
  readonly href: string;
  readonly label: string;
  /** Omit for a compact list menu (label + arrow), e.g. Customers. */
  readonly description?: string;
}

/** Links as authored; may be empty (e.g. every audience filtered out). */
export interface HeaderFlyoutMenu {
  readonly id: string;
  readonly label: string;
  readonly heading: string;
  readonly links: ReadonlyArray<HeaderFlyoutLink>;
}

export type TwoOrMoreLinks = readonly [
  HeaderFlyoutLink,
  HeaderFlyoutLink,
  ...HeaderFlyoutLink[],
];

export interface HeaderFlyoutMultiMenu extends Omit<HeaderFlyoutMenu, 'links'> {
  readonly links: TwoOrMoreLinks;
}

export type HeaderNavEntry =
  | {
      readonly kind: 'link';
      readonly id: string;
      readonly href: string;
      readonly label: string;
    }
  | { readonly kind: 'flyout'; readonly menu: HeaderFlyoutMultiMenu };

export function toHeaderNavEntry(
  menu: HeaderFlyoutMenu
): HeaderNavEntry | null {
  const [first, second, ...rest] = menu.links;
  if (!first) return null;
  if (!second) {
    return { kind: 'link', id: menu.id, href: first.href, label: menu.label };
  }
  return {
    kind: 'flyout',
    menu: { ...menu, links: [first, second, ...rest] },
  };
}

export function toHeaderNavEntries(
  menus: readonly HeaderFlyoutMenu[]
): readonly HeaderNavEntry[] {
  return menus.flatMap(menu => toHeaderNavEntry(menu) ?? []);
}
