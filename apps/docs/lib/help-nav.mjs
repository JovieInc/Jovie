/**
 * Navigation helpers for the Jovie Help Center shell.
 *
 * `buildHelpNav` converts the Nextra page map (already filtered to primary
 * articles by `filterNavigationPageMap`) into a minimal, serializable tree the
 * shell components render in the desktop rail and the responsive drawer.
 *
 * Pure module: no DOM, no React, so it can be unit tested with node --test.
 */

/**
 * @typedef {Object} HelpNavItem
 * @property {string} key Stable key derived from the page-map entry.
 * @property {string} title Human readable label.
 * @property {string|null} route Link target when the entry is navigable.
 * @property {HelpNavItem[]} children Nested entries.
 */

/**
 * @param {unknown} item Raw page-map entry.
 * @returns {boolean} True when the entry is a plain separator/data node.
 */
function isDataNode(item) {
  return (
    !!item &&
    typeof item === 'object' &&
    'data' in item &&
    !('route' in item) &&
    !('children' in item)
  );
}

/**
 * @param {unknown} item Raw page-map entry.
 * @returns {string|null} Absolute route or null for non-navigable nodes.
 */
function itemRoute(item) {
  if (item && typeof item === 'object' && typeof item.route === 'string') {
    return item.route;
  }
  return null;
}

/**
 * @param {unknown} item Raw page-map entry.
 * @returns {string} Best-effort display title.
 */
function itemTitle(item) {
  if (!item || typeof item !== 'object') return '';
  const frontMatterTitle = item.frontMatter?.title;
  if (typeof frontMatterTitle === 'string' && frontMatterTitle.length > 0) {
    return frontMatterTitle;
  }
  if (typeof item.title === 'string' && item.title.length > 0) {
    return item.title;
  }
  if (typeof item.name === 'string' && item.name.length > 0) {
    return item.name
      .split(/[-_]/)
      .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(' ');
  }
  return '';
}

/**
 * Convert one page-map entry, or null when the entry carries no navigable
 * content for the Help Center nav.
 * @param {unknown} item
 * @returns {HelpNavItem|null}
 */
function toNavItem(item) {
  if (!item || typeof item !== 'object' || isDataNode(item)) return null;
  const children = Array.isArray(item.children)
    ? item.children.map(toNavItem).filter(Boolean)
    : [];
  const route = itemRoute(item);
  const title = itemTitle(item);
  if (!route && children.length === 0) return null;
  if (!title && !route) return null;
  const key = route ?? `group:${item.name ?? title}`;
  return { key, title, route, children };
}

/**
 * @param {unknown[]} pageMap Nextra page map for the docs root.
 * @returns {HelpNavItem[]} Serializable nav tree for the shell.
 */
export function buildHelpNav(pageMap) {
  if (!Array.isArray(pageMap)) return [];
  return pageMap.map(toNavItem).filter(Boolean);
}

/** Selector shared by the drawer focus trap and its unit tests. */
export const HELP_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])';

/**
 * Compute the next focus index inside a trapped container.
 * @param {number} currentIndex Index of the currently focused element, or -1.
 * @param {number} count Number of focusable elements.
 * @param {boolean} backwards True for Shift+Tab.
 * @returns {number} Index that should receive focus.
 */
export function nextFocusIndex(currentIndex, count, backwards) {
  if (count <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= count)
    return backwards ? count - 1 : 0;
  return (currentIndex + (backwards ? -1 : 1) + count) % count;
}
