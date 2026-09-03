import { describe, expect, it } from 'vitest';
import {
  APP_SHELL_WORKSPACES,
  type AppShellWorkspace,
  getAppShellContract,
  getCurrentAppShellWorkspace,
  getNextAppShellWorkspace,
  getPermittedAppShellWorkspaces,
} from './workspaces';

describe('app shell workspaces', () => {
  it('resolves the current workspace from the canonical route mode', () => {
    expect(getCurrentAppShellWorkspace('/app/tasks').id).toBe('customer');
    expect(getCurrentAppShellWorkspace('/app/ov/ops').id).toBe('ov');
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
