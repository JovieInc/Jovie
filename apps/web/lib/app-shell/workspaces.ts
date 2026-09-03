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

export interface CanonicalAppShellWorkspace<Id extends string = string>
  extends AppShellWorkspace<Id> {
  readonly role: 'primary' | 'secondary';
  readonly access: 'authenticated' | 'admin';
  readonly shellOwner: 'jovie';
  readonly chatOwner: 'jovie-chat';
  readonly chatMode: 'ov' | null;
  readonly selectedAgent: 'jovie' | 'summer';
  readonly dataScope: 'customer' | 'operator';
  readonly navigationDivergenceReason: 'operator-capabilities' | null;
}

export const JOVIE_APP_SHELL_WORKSPACE = {
  id: 'customer',
  label: 'Jovie',
  href: APP_ROUTES.DASHBOARD,
  brandVariant: 'jovie',
  role: 'primary',
  access: 'authenticated',
  shellOwner: 'jovie',
  chatOwner: 'jovie-chat',
  chatMode: null,
  selectedAgent: 'jovie',
  dataScope: 'customer',
  navigationDivergenceReason: null,
} as const satisfies CanonicalAppShellWorkspace<'customer'>;

export const OVIE_APP_SHELL_WORKSPACE = {
  id: 'ov',
  label: 'OV',
  href: APP_ROUTES.OV,
  brandVariant: 'ov',
  role: 'secondary',
  access: 'admin',
  shellOwner: 'jovie',
  chatOwner: 'jovie-chat',
  chatMode: 'ov',
  selectedAgent: 'summer',
  dataScope: 'operator',
  navigationDivergenceReason: 'operator-capabilities',
} as const satisfies CanonicalAppShellWorkspace<'ov'>;

export const APP_SHELL_WORKSPACES = [
  JOVIE_APP_SHELL_WORKSPACE,
  OVIE_APP_SHELL_WORKSPACE,
] as const satisfies readonly CanonicalAppShellWorkspace<AppShellMode>[];

export interface AppShellAccessContext {
  readonly isAdmin: boolean;
}

export interface AppShellContract {
  readonly launchWorkspaceId: 'customer';
  readonly primaryWorkspaceId: 'customer';
  readonly shellOwner: 'jovie';
  readonly chatOwner: 'jovie-chat';
  readonly workspaces: readonly CanonicalAppShellWorkspace<AppShellMode>[];
}

export function canAccessAppShellWorkspace(
  workspace: CanonicalAppShellWorkspace,
  context: AppShellAccessContext
): boolean {
  return workspace.access === 'authenticated' || context.isAdmin;
}

export function getPermittedAppShellWorkspaces(
  context: AppShellAccessContext
): readonly CanonicalAppShellWorkspace<AppShellMode>[] {
  return APP_SHELL_WORKSPACES.filter(workspace =>
    canAccessAppShellWorkspace(workspace, context)
  );
}

/**
 * One semantic contract for every Jovie shell consumer. Jovie is always the
 * launch/primary product; Ovie is a role-gated secondary workspace that keeps
 * the same shell and chat component owners while changing agent and data scope.
 */
export function getAppShellContract(
  context: AppShellAccessContext
): AppShellContract {
  return {
    launchWorkspaceId: 'customer',
    primaryWorkspaceId: 'customer',
    shellOwner: 'jovie',
    chatOwner: 'jovie-chat',
    workspaces: getPermittedAppShellWorkspaces(context),
  };
}

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
