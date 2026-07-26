import { describe, expect, it } from 'vitest';
import {
  APP_SHELL_WORKSPACES,
  type AppShellWorkspace,
  getCurrentAppShellWorkspace,
  getNextAppShellWorkspace,
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
    ] as const satisfies readonly AppShellWorkspace[];

    expect(getNextAppShellWorkspace(workspaces, 'ov')?.id).toBe('support');
    expect(getNextAppShellWorkspace(workspaces, 'support')?.id).toBe(
      'customer'
    );
  });
});
