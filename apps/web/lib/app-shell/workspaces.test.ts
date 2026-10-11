import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  APP_SHELL_WORKSPACES,
  type AppShellWorkspace,
  getAppShellContract,
  getCurrentAppShellWorkspace,
  getNextAppShellWorkspace,
  getNextPermittedAppShellWorkspace,
  getPermittedAppShellWorkspaces,
  shouldLockOperatorWorkspace,
  shouldRenderOperatorChrome,
} from './workspaces';

describe('app shell workspaces', () => {
  it('resolves the current workspace from the canonical route mode', () => {
    expect(getCurrentAppShellWorkspace('/app/tasks').id).toBe('customer');
    expect(getCurrentAppShellWorkspace('/app/ov/ops').id).toBe('ov');
    expect(getCurrentAppShellWorkspace(APP_ROUTES.HUD).id).toBe('ov');
  });

  it('cycles the two shipped workspaces', () => {
    expect(getNextAppShellWorkspace(APP_SHELL_WORKSPACES, 'customer')?.id).toBe(
      'ov'
    );
    expect(getNextAppShellWorkspace(APP_SHELL_WORKSPACES, 'ov')?.id).toBe(
      'customer'
    );
  });

  it('supports an ordered list of more than two workspaces', () => {
    const workspaces = [
      ...APP_SHELL_WORKSPACES,
      {
        id: 'support',
        label: 'Support',
        href: '/app/support',
        brandVariant: 'jovie',
      },
    ] as const;

    expect(getNextAppShellWorkspace(workspaces, 'ov')?.id).toBe('support');
    expect(getNextAppShellWorkspace(workspaces, 'support')?.id).toBe(
      'customer'
    );
  });

  it('fails closed for an empty registry', () => {
    expect(
      getNextAppShellWorkspace([] as readonly AppShellWorkspace[], 'missing')
    ).toBeUndefined();
  });

  it('starts at the first workspace when the current id is unknown at runtime', () => {
    expect(
      getNextAppShellWorkspace(
        APP_SHELL_WORKSPACES as readonly AppShellWorkspace[],
        'missing'
      )?.id
    ).toBe('customer');
  });

  it('keeps launch and ordinary navigation Jovie-first', () => {
    const contract = getAppShellContract({ isAdmin: false });

    expect(contract.launchWorkspaceId).toBe('customer');
    expect(contract.primaryWorkspaceId).toBe('customer');
    expect(contract.workspaces.map(workspace => workspace.id)).toEqual([
      'customer',
    ]);
    expect(contract.workspaces[0]).toMatchObject({
      label: 'Jovie',
      role: 'primary',
      access: 'authenticated',
      selectedAgent: 'jovie',
      dataScope: 'customer',
    });
  });

  it('fails deliberate-red role leakage by hiding Ovie from ordinary users', () => {
    const ordinaryIds = getPermittedAppShellWorkspaces({ isAdmin: false }).map(
      workspace => workspace.id
    );
    const adminIds = getPermittedAppShellWorkspaces({ isAdmin: true }).map(
      workspace => workspace.id
    );

    expect(ordinaryIds).not.toContain('ov');
    expect(adminIds).toEqual(['customer', 'ov']);
  });

  it('keeps Ovie secondary and limits divergence to typed operator capabilities', () => {
    const contract = getAppShellContract({ isAdmin: true });
    const ov = contract.workspaces.find(workspace => workspace.id === 'ov');

    expect(ov).toMatchObject({
      href: APP_ROUTES.ADMIN_CHAT,
      role: 'secondary',
      access: 'admin',
      selectedAgent: 'summer',
      dataScope: 'operator',
      navigationDivergenceReason: 'operator-capabilities',
    });
  });

  it('detects duplicate shell and chat owners across Jovie and Ovie', () => {
    const contract = getAppShellContract({ isAdmin: true });

    expect(
      new Set(contract.workspaces.map(workspace => workspace.shellOwner))
    ).toEqual(new Set([contract.shellOwner]));
    expect(
      new Set(contract.workspaces.map(workspace => workspace.chatOwner))
    ).toEqual(new Set([contract.chatOwner]));
  });
});

describe('operator surfaces stay in Ovie (JOV-6771)', () => {
  it('keeps Jovie usable despite legacy lock cookies or stale step-up', () => {
    for (const isAdmin of [false, true]) {
      expect(
        shouldLockOperatorWorkspace({
          mode: 'customer',
          isAdmin,
          needsAdminStepUp: true,
          hasLegacyLockCookie: true,
        })
      ).toBe(false);
    }
  });

  it('preserves existing Ovie cookie and step-up gates', () => {
    expect(
      shouldLockOperatorWorkspace({
        mode: 'ov',
        isAdmin: true,
        needsAdminStepUp: false,
        hasLegacyLockCookie: true,
      })
    ).toBe(true);
    expect(
      shouldLockOperatorWorkspace({
        mode: 'ov',
        isAdmin: true,
        needsAdminStepUp: true,
        hasLegacyLockCookie: false,
      })
    ).toBe(true);
  });
  it('gives non-admins no workspace switch target anywhere', () => {
    for (const pathname of ['/app', '/app/chat', APP_ROUTES.OV, null]) {
      expect(
        getNextPermittedAppShellWorkspace({ isAdmin: false }, pathname)
      ).toBeUndefined();
    }
  });

  it('lets admins switch between Jovie and Ovie', () => {
    expect(
      getNextPermittedAppShellWorkspace({ isAdmin: true }, '/app/chat')?.id
    ).toBe('ov');
    expect(
      getNextPermittedAppShellWorkspace({ isAdmin: true }, APP_ROUTES.OV)?.id
    ).toBe('customer');
  });

  it('never renders operator chrome for non-admins', () => {
    expect(shouldRenderOperatorChrome('customer', { isAdmin: false })).toBe(
      false
    );
    expect(shouldRenderOperatorChrome('ov', { isAdmin: false })).toBe(false);
  });

  it('renders operator chrome for admins only inside Ovie', () => {
    expect(shouldRenderOperatorChrome('customer', { isAdmin: true })).toBe(
      false
    );
    expect(shouldRenderOperatorChrome('ov', { isAdmin: true })).toBe(true);
  });
});
