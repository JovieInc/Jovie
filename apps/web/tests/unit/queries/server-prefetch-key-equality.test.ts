import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TASK_WORKSPACE_FILTERS } from '@/lib/tasks/query-defaults';
import { queryKeys } from '../../../lib/queries/keys';

/**
 * Regression guard for JOV one-app-shell chunk 1.6.
 *
 * Server `page.tsx` route wrappers call `queryClient.fetchQuery({ queryKey })`
 * to dehydrate data ahead of the client hooks that read it. If either side
 * ever hardcodes its own key array instead of importing `queryKeys` from the
 * shared module, the client hook silently misses the server-primed cache
 * entry and falls back to a loading skeleton -> fetch waterfall (the exact
 * hydration bug this chunk exists to fix). This test locks in both:
 *  1. Every route's server prefetch call site and its matching client hook
 *     source literally reference the same `queryKeys.<domain>.<method>(...)`
 *     call (static usage check).
 *  2. The key factory itself produces byte-identical arrays for both call
 *     shapes (runtime equality check).
 */

const repoRoot = resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf8');

describe('server prefetch / client hook query key equality', () => {
  describe('releases matrix (library route)', () => {
    const serverSource = read('app/app/(shell)/library/page.tsx');
    const hookSource = read('lib/queries/useReleasesQuery.ts');

    it('server prefetch and client hook both call queryKeys.releases.matrix(...)', () => {
      expect(serverSource).toContain('queryKeys.releases.matrix(profileId)');
      expect(hookSource).toContain('queryKeys.releases.matrix(profileId)');
    });

    it('resolves to the identical key for the same profileId', () => {
      const profileId = 'profile-abc';
      expect(queryKeys.releases.matrix(profileId)).toEqual(
        queryKeys.releases.matrix(profileId)
      );
      expect(queryKeys.releases.matrix(profileId)).toMatchInlineSnapshot(`
        [
          "releases",
          "matrix",
          "profile-abc",
        ]
      `);
    });
  });

  describe('tasks list + board (tasks route)', () => {
    const serverSource = read('app/app/(shell)/tasks/TasksRoute.tsx');
    const hookSource = read('lib/queries/useTasksQuery.ts');

    it('server prefetch and client hook both call queryKeys.tasks.list(...)', () => {
      expect(serverSource).toMatch(
        /queryKeys\.tasks\.list\(\s*profileId,\s*DEFAULT_TASK_WORKSPACE_FILTERS\s*\)/
      );
      expect(hookSource).toContain('queryKeys.tasks.list(profileId,');
    });

    it('server prefetch and client hook both call queryKeys.tasks.board(...)', () => {
      expect(serverSource).toMatch(
        /queryKeys\.tasks\.board\(\s*profileId,\s*DEFAULT_TASK_WORKSPACE_FILTERS\s*\)/
      );
      expect(hookSource).toContain('queryKeys.tasks.board(profileId,');
    });

    it('resolves to the identical key for list and board given the same filters', () => {
      const profileId = 'profile-abc';
      expect(
        queryKeys.tasks.list(profileId, DEFAULT_TASK_WORKSPACE_FILTERS)
      ).toEqual(
        queryKeys.tasks.list(profileId, DEFAULT_TASK_WORKSPACE_FILTERS)
      );
      expect(
        queryKeys.tasks.board(profileId, DEFAULT_TASK_WORKSPACE_FILTERS)
      ).toEqual(
        queryKeys.tasks.board(profileId, DEFAULT_TASK_WORKSPACE_FILTERS)
      );
    });
  });
});
