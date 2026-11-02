import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidElement } from 'react';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  auth: vi.fn(),
  shell: vi.fn(),
  flag: vi.fn(),
  load: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mocks.access,
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.auth }));
vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: mocks.flag }));
vi.mock('../../dashboard/actions', () => ({
  getDashboardShellData: mocks.shell,
}));
vi.mock('../../profiles/data', () => ({
  loadProfilesWorkspaceData: mocks.load,
}));
vi.mock('../../profiles/ProfilesWorkspace', () => ({
  ProfilesWorkspace: () => null,
}));

import PresencePage from '../../presence/page';
import AdminPresencePage from './page';

const routeDir = resolve('app/app/(shell)/admin/presence');
const wrapperSource = () => readFileSync(resolve(routeDir, 'page.tsx'), 'utf8');

// Structural guard only; the tests below exercise the shared loader boundary.
function assertThinWrapper(source: string) {
  const file = ts.createSourceFile(
    'page.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const imports = file.statements.filter(ts.isImportDeclaration);
  expect(
    imports.map(node => (node.moduleSpecifier as ts.StringLiteral).text).sort()
  ).toEqual(['../../presence/page', '@/lib/admin/page-access', 'next'].sort());
  const functions = file.statements.filter(ts.isFunctionDeclaration);
  expect(functions).toHaveLength(1);
  expect(
    functions[0]?.body?.statements.map(node =>
      node.getText(file).replace(/\s+/g, ' ')
    )
  ).toEqual([
    'await requireCurrentAdminPageAccess();',
    'return PresencePage();',
  ]);
  expect(
    file.statements
      .filter(
        node => !ts.isImportDeclaration(node) && !ts.isFunctionDeclaration(node)
      )
      .map(node => {
        expect(ts.isVariableStatement(node)).toBe(true);
        return ts.isVariableStatement(node)
          ? node.declarationList.declarations[0]?.name.getText(file)
          : null;
      })
      .sort()
  ).toEqual(['metadata', 'runtime']);
}

describe('Ovie Presence consumes canonical Presence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue('actor');
    mocks.auth.mockResolvedValue({ userId: 'actor' });
    mocks.flag.mockResolvedValue(true);
  });
  it.each(['customer-identity', 'company-identity'])(
    'uses the same loader, workspace and identity scope for %s',
    async identityId => {
      mocks.shell.mockResolvedValue({
        user: { id: 'database-user' },
        selectedProfile: { id: identityId },
        needsOnboarding: false,
      });
      const data = { profileId: identityId, rows: [] };
      mocks.load.mockResolvedValue(data);
      const customer = await PresencePage();
      mocks.load.mockClear();
      const operator = await AdminPresencePage();
      expect(mocks.access).toHaveBeenCalledOnce();
      expect(mocks.load).toHaveBeenCalledExactlyOnceWith({
        clerkUserId: 'actor',
        databaseUserId: 'database-user',
        profileId: identityId,
      });
      if (!isValidElement(customer) || !isValidElement(operator))
        throw new Error('Expected canonical workspace');
      expect(operator.type).toBe(customer.type);
      expect(operator.props).toEqual(customer.props);
      expect(operator.props).toEqual({
        data,
        scope: { actorId: 'actor', workspaceId: identityId, target: 'creator' },
      });
    }
  );
  it.each(['NEXT_REDIRECT', 'OVIE_PRIVACY_LOCKED'])(
    'awaits %s before loading any product data',
    async reason => {
      mocks.access.mockRejectedValue(new Error(reason));
      await expect(AdminPresencePage()).rejects.toThrow(reason);
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.shell).not.toHaveBeenCalled();
      expect(mocks.load).not.toHaveBeenCalled();
    }
  );
  it('contains only an operator gate and the canonical product call', () => {
    assertThinWrapper(wrapperSource());
    expect(
      readdirSync(routeDir).filter(
        name => !name.includes('.test.') && /\.tsx?$/.test(name)
      )
    ).toEqual(['page.tsx']);
    expect(existsSync(resolve('lib/ovie/company-presence'))).toBe(false);
  });
  it.each([
    'const ranked = rows.sort();',
    'return loadCompanyPresenceData();',
    'function rankCompanyPresence() {}',
  ])('rejects a deliberately reintroduced product fork: %s', fork => {
    const source = wrapperSource();
    expect(() =>
      assertThinWrapper(source.replace('return PresencePage();', fork))
    ).toThrow();
  });
});
