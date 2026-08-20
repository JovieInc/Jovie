import type { TemplateContext } from './types';

const REMOVED = 'Removed. Use in-repo Playwright (`pnpm exec playwright`), not the gstack browse daemon.';

export function generateCommandReference(_ctx: TemplateContext): string {
  return REMOVED;
}

export function generateSnapshotFlags(_ctx: TemplateContext): string {
  return REMOVED;
}

export function generateBrowseSetup(_ctx: TemplateContext): string {
  return REMOVED;
}
