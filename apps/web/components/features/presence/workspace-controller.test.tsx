import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { CompanyPresencePage } from './company-types';
import type { ProfileWorkspaceRow } from './types';
import {
  COMPANY_PRESENCE_ADAPTER,
  CREATOR_PRESENCE_ADAPTER,
} from './workspace-adapters';
import {
  type PresenceWorkspaceAdapter,
  PresenceWorkspaceBoundary,
  type PresenceWorkspaceScope,
  presenceWorkspaceScopeKey,
  usePresenceWorkspaceController,
} from './workspace-controller';

const creator: ProfileWorkspaceRow = {
  id: 'row',
  rowType: 'surface',
  kind: 'website',
  platform: 'website',
  label: 'Original',
  handle: null,
  url: 'https://example.com',
  trackedUrl: null,
  qualificationStatus: 'qualified',
  isOfficial: true,
  monitoringState: 'active',
  rank: null,
  previousRank: null,
  lastObservedAt: null,
};
const unwired = { state: 'unconfigured' as const, reason: 'No source.' };
const company: CompanyPresencePage = {
  id: 'row',
  path: '/',
  label: 'Original',
  kind: 'marketing',
  checks: {
    indexed: unwired,
    seo_certification: unwired,
    copy_gate: unwired,
    lighthouse: unwired,
  },
};

function controllerContract<
  Row extends { id: string; label: string },
  Filter extends string,
>(
  target: PresenceWorkspaceScope['target'],
  row: Row,
  adapter: PresenceWorkspaceAdapter<Row, Filter>,
  all: Filter,
  other: Filter
) {
  const scope: PresenceWorkspaceScope = {
    actorId: 'actor-a',
    workspaceId: 'workspace-a',
    target,
  };
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <PresenceWorkspaceBoundary scope={scope}>
        {children}
      </PresenceWorkspaceBoundary>
    );
  }
  const result = renderHook(
    ({ sourceRows }) =>
      usePresenceWorkspaceController({
        sourceRows,
        adapter,
        initialFilter: all,
      }),
    { initialProps: { sourceRows: [row] }, wrapper }
  );
  act(() => result.result.current.setSelected(row));
  expect(result.result.current.selected?.label).toBe('Original');
  const updated = { ...row, label: 'Current authorized data' };
  result.rerender({ sourceRows: [updated] });
  expect(result.result.current.selected?.label).toBe('Current authorized data');
  act(() => result.result.current.setFilter(other));
  expect(result.result.current.selected).toBeNull();
  act(() => {
    result.result.current.setFilter(all);
    result.result.current.setSelected(updated);
  });
  result.rerender({ sourceRows: [] });
  expect(result.result.current.selected).toBeNull();
  result.rerender({ sourceRows: [updated] });
  expect(result.result.current.selected).toBeNull();
  result.unmount();
}

describe('shared Presence target adapters', () => {
  it('keeps creator selection current, clears it on filtering and removes revoked rows', () =>
    controllerContract(
      'creator',
      creator,
      CREATOR_PRESENCE_ADAPTER,
      'all',
      'catalog'
    ));
  it('keeps company selection current, clears it on filtering and removes revoked rows', () =>
    controllerContract(
      'company',
      company,
      COMPANY_PRESENCE_ADAPTER,
      'all',
      'legal'
    ));
  it.each(['actorId', 'workspaceId', 'target'] as const)(
    'remounts target draft and controller state when %s changes',
    changed => {
      let scope: PresenceWorkspaceScope = {
        actorId: 'a',
        workspaceId: 'w',
        target: 'creator',
      };
      function wrapper({ children }: { children: ReactNode }) {
        return (
          <PresenceWorkspaceBoundary scope={scope}>
            {children}
          </PresenceWorkspaceBoundary>
        );
      }
      const { result, rerender } = renderHook(
        () =>
          usePresenceWorkspaceController({
            sourceRows: [creator],
            adapter: CREATOR_PRESENCE_ADAPTER,
            initialFilter: 'all' as const,
          }),
        { wrapper }
      );
      act(() => {
        result.current.setSelected(creator);
        result.current.setFilter('catalog');
      });
      const oldSetter = result.current.setFilter;
      scope = {
        ...scope,
        [changed]: changed === 'target' ? 'company' : 'other',
      };
      rerender();
      expect(result.current.filter).toBe('all');
      expect(result.current.selected).toBeNull();
      act(() => oldSetter('catalog'));
      expect(result.current.filter).toBe('all');
    }
  );
  it('keeps actor, workspace and target cache keys distinct without concatenation collisions', () => {
    const scope: PresenceWorkspaceScope = {
      actorId: 'a:b',
      workspaceId: 'c',
      target: 'creator',
    };
    expect(presenceWorkspaceScopeKey(scope)).not.toBe(
      presenceWorkspaceScopeKey({ ...scope, actorId: 'a', workspaceId: 'b:c' })
    );
    for (const changed of ['actorId', 'workspaceId', 'target'] as const)
      expect(presenceWorkspaceScopeKey(scope)).not.toBe(
        presenceWorkspaceScopeKey({
          ...scope,
          [changed]: changed === 'target' ? 'company' : 'other',
        })
      );
  });
});
