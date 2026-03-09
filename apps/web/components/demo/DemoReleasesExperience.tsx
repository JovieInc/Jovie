'use client';

import { DemoAuthShell } from './DemoAuthShell';
import { DemoRealReleasesPanel } from './DemoRealReleasesPanel';

/**
 * DemoReleasesExperience — the full demo page content wrapped in the real
 * authenticated app shell (sidebar, header, nav) fed by mock data.
 *
 * Renders the releases table as the main content.
 */
export function DemoReleasesExperience({
  containerClassName: _containerClassName,
}: {
  readonly containerClassName?: string;
} = {}) {
  return (
    <DemoAuthShell>
      <DemoRealReleasesPanel />
    </DemoAuthShell>
  );
}
