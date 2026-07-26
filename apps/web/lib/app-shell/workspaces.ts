import { APP_ROUTES } from '@/constants/routes';
import type { BrandVariant } from '@/lib/brand/tokens';
import type { AppShellMode } from '@/types/app-shell';
import { resolveAppShellModeFromPathname } from './mode';

export interface AppShellWorkspace<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  readonly href: string;
  readonly brandVariant: BrandVariant;
}

export const APP_SHELL_WORKSPACES = [
  {
    id: 'customer',
    label: 'Jovie',
    href: APP_ROUTES.DASHBOARD,
    brandVariant: 'jovie',
  },
  {
    id: 'ov',
    label: 'OV',
    href: APP_ROUTES.OV,
    brandVariant: 'ov',
  },
] as const satisfies readonly AppShellWorkspace<AppShellMode>[];

export function getNextAppShellWorkspace<Workspace extends AppShellWorkspace>(
  workspaces: readonly Workspace[],
  currentId: Workspace['id']
): Workspace | undefined {
  if (workspaces.length === 0) return undefined;
  const currentIndex = workspaces.findIndex(
    workspace => workspace.id === currentId
  );
  return workspaces[(currentIndex + 1) % workspaces.length] ?? workspaces[0];
}

export function getCurrentAppShellWorkspace(pathname: string | null) {
  const mode = resolveAppShellModeFromPathname(pathname);
  return (
    APP_SHELL_WORKSPACES.find(workspace => workspace.id === mode) ??
    APP_SHELL_WORKSPACES[0]
  );
}
