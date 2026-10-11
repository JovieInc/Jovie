import type { Page } from '@playwright/test';

/**
 * Single-material main plane detector (JOV-7710, AM-017).
 *
 * The shell's main panel (`main#main-content`: header + route content) is one
 * semantic elevation level. A large descendant that paints a different
 * material inside it (an inset header strip, a boxed table region, a tinted
 * empty state) is a seam even when every class uses a design token, so this
 * measures the rendered, alpha-composited background instead of class names.
 *
 * Small controls (buttons, chips, inputs, avatars) are ignored by an area
 * floor; declared elevations (menus, dialogs, popovers, explicitly raised
 * surfaces) are skipped with their subtree.
 */
export interface ShellMaterialFinding {
  readonly kind: 'nested-surface-material';
  readonly element: string;
  readonly plane: string;
  readonly painted: string;
  readonly box: { x: number; y: number; width: number; height: number };
}

export interface ShellMaterialReport {
  readonly plane: string | null;
  readonly inspected: number;
  readonly findings: readonly ShellMaterialFinding[];
}

/** Fraction of the plane's width a region must span to count as a material. */
export const MATERIAL_MIN_WIDTH_RATIO = 0.5;
/** Minimum painted height in CSS px; a 40px header strip qualifies. */
export const MATERIAL_MIN_HEIGHT_PX = 24;
/** Per-channel tolerance (0-255) after compositing. */
export const MATERIAL_CHANNEL_TOLERANCE = 2;

export const DECLARED_ELEVATION_SELECTOR = [
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="tooltip"]',
  '[data-radix-popper-content-wrapper]',
  '[data-surface-variant]',
  '[data-surface]',
  '[data-elevation]',
  'input',
  'textarea',
  'select',
].join(',');

export async function inspectShellMaterial(
  page: Page,
  rootSelector = 'main#main-content'
): Promise<ShellMaterialReport> {
  return page.evaluate(
    ({ rootSelector, minWidthRatio, minHeight, tolerance, declared }) => {
      type Rgba = [number, number, number, number];
      const parse = (value: string): Rgba | null => {
        const match = value.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = match[1]
          .split(/[,\s/]+/)
          .filter(Boolean)
          .map(Number);
        return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
      };
      const over = (top: Rgba, under: Rgba): Rgba => {
        const a = top[3] + under[3] * (1 - top[3]);
        if (a === 0) return [0, 0, 0, 0];
        const mix = (i: number) =>
          (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
        return [mix(0), mix(1), mix(2), a];
      };
      const fmt = (c: Rgba) =>
        `rgb(${c
          .slice(0, 3)
          .map(v => Math.round(v))
          .join(' ')})`;
      // Composite an element's background over everything painted beneath
      // it in its own ancestor chain, ending on an opaque base.
      const effective = (element: Element): Rgba => {
        const chain: Rgba[] = [];
        for (
          let node: Element | null = element;
          node;
          node = node.parentElement
        ) {
          const color = parse(getComputedStyle(node).backgroundColor);
          if (color && color[3] > 0) {
            chain.push(color);
            if (color[3] >= 1) break;
          }
        }
        let result: Rgba = [255, 255, 255, 1];
        for (const color of chain.reverse()) result = over(color, result);
        return result;
      };
      const root = document.querySelector(rootSelector);
      if (!(root instanceof HTMLElement))
        return { plane: null, inspected: 0, findings: [] };
      const plane = effective(root);
      const planeBox = root.getBoundingClientRect();
      const findings: ShellMaterialFinding[] = [];
      let inspected = 0;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const element = node as HTMLElement;
        // A declared surface and everything inside it own their material.
        const owner = element.closest(declared);
        if (owner && root.contains(owner)) continue;
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        const own = parse(style.backgroundColor);
        if (!own || own[3] === 0) continue;
        const box = element.getBoundingClientRect();
        if (
          box.width < planeBox.width * minWidthRatio ||
          box.height < minHeight
        )
          continue;
        inspected += 1;
        const painted = effective(element);
        const differs = [0, 1, 2].some(
          i => Math.abs(painted[i] - plane[i]) > tolerance
        );
        if (!differs) continue;
        const id = element.id ? `#${element.id}` : '';
        const testId = element.dataset.testid
          ? `[data-testid="${element.dataset.testid}"]`
          : '';
        findings.push({
          kind: 'nested-surface-material',
          element: `${element.tagName.toLowerCase()}${id}${testId}`,
          plane: fmt(plane),
          painted: fmt(painted),
          box: {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
          },
        });
      }
      return { plane: fmt(plane), inspected, findings };
    },
    {
      rootSelector,
      minWidthRatio: MATERIAL_MIN_WIDTH_RATIO,
      minHeight: MATERIAL_MIN_HEIGHT_PX,
      tolerance: MATERIAL_CHANNEL_TOLERANCE,
      declared: DECLARED_ELEVATION_SELECTOR,
    }
  );
}
