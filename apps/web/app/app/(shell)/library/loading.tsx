import { LibraryLoadingState } from './LibraryLoadingState';

/**
 * Work route loading boundary (JOV-9024).
 *
 * The shell segment deliberately carries no loading.tsx, so a warm
 * navigation otherwise keeps the previous page mounted until the
 * destination resolves its server data — the Mac dogfood caught a
 * Profiles title/heading mismatch while the Work surface was still
 * fetching. This boundary lets the router commit the navigation
 * immediately and hold the same Work skeleton the shell first-boot
 * fallback already renders for library routes.
 */
export default function LibraryLoading() {
  return <LibraryLoadingState />;
}
