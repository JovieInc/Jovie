/** Shared capture policy for both page and locator screenshots. */
export function getAnimationFrozenScreenshotOptions(path: string) {
  return {
    animations: 'disabled' as const,
    path,
    type: 'png' as const,
  };
}
