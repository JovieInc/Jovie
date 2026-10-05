import type { DisplayBounds } from './window-state';

/** Outer native bounds. Short work areas yield to reachable, scrolling content. */
export function authHandoffWindowBounds(workArea: DisplayBounds) {
  const width = Math.min(840, workArea.width);
  // Narrow displays use the 2:1 fallback; normal desktop keeps the 2.4:1 shell.
  const height = Math.min(
    width < 840 ? Math.max(280, Math.ceil(width / 2)) : 350,
    workArea.height
  );
  return {
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + Math.floor((workArea.height - height) / 2),
    width,
    height,
    minWidth: Math.min(680, width),
    minHeight: Math.min(280, height),
  };
}
