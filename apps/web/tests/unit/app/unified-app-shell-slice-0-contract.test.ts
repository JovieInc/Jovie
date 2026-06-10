import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { getEndUserPerfRouteById } from '@/scripts/performance-route-manifest';

const REPO_ROOT = join(process.cwd(), '../..');
const CONTRACT_DOC_PATH = join(
  REPO_ROOT,
  'docs/unified-app-shell-slice-0-contract.md'
);
const SHELL_PERSISTENCE_SPEC_PATH = join(
  process.cwd(),
  'tests/e2e/shell-route-persistence.spec.ts'
);
const EXP_IMPORT_BOUNDARY_TEST_PATH = join(
  process.cwd(),
  'tests/unit/app/exp-import-boundary.test.ts'
);

const REQUIRED_CONTRACT_SECTIONS = [
  '## Hard Constraints',
  '## HOT ZONE Ownership',
  '## Route UX And Data Contracts',
  '## Data Ownership And Request Budgets',
  '## `/exp/*` Inventory Format',
  '## Screenshot And Pixel Target Matrix',
  '## Slice Exit Checklist For Implementers',
] as const;

const SLICE_0_PERF_MANIFEST_ROUTE_IDS = [
  { id: 'creator-chat', group: 'creator-shell', path: APP_ROUTES.CHAT },
  { id: 'creator-chat-thread', group: 'creator-shell', path: '/app/chat/[id]' },
  { id: 'creator-releases', group: 'creator-shell', path: APP_ROUTES.RELEASES },
  { id: 'creator-library', group: 'creator-shell', path: APP_ROUTES.LIBRARY },
  { id: 'creator-tasks', group: 'creator-shell', path: APP_ROUTES.TASKS },
  {
    id: 'creator-lyrics',
    group: 'creator-shell',
    path: `${APP_ROUTES.LYRICS}/[trackId]`,
  },
  { id: 'onboarding', group: 'onboarding', path: '/start' },
] as const;

const SHELL_PERSISTENCE_ROUTE_MARKERS = [
  'chat',
  'releases',
  'library',
  'tasks',
  'JOV-2219 baseline',
  'data-app-shell-frame="true"',
] as const;

describe('unified app shell slice 0 contract harness', () => {
  it('keeps the slice 0 contract doc present with required sections', () => {
    expect(existsSync(CONTRACT_DOC_PATH)).toBe(true);

    const contractDoc = readFileSync(CONTRACT_DOC_PATH, 'utf8');
    expect(contractDoc).toContain('Issue: JOV-2219');
    expect(contractDoc).toContain(
      'No production import may reference `apps/web/app/exp/*`.'
    );

    for (const section of REQUIRED_CONTRACT_SECTIONS) {
      expect(contractDoc, `missing ${section}`).toContain(section);
    }
  });

  it('maps slice 0 screenshot-matrix routes to performance manifest entries', () => {
    for (const expectation of SLICE_0_PERF_MANIFEST_ROUTE_IDS) {
      const route = getEndUserPerfRouteById(expectation.id);
      expect(
        route,
        `${expectation.id} missing from perf manifest`
      ).toBeDefined();
      expect(route?.group).toBe(expectation.group);
      expect(route?.path).toBe(expectation.path);
      expect(route?.readySelectors.content?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('keeps the shell route persistence harness wired to core slice routes', () => {
    expect(existsSync(SHELL_PERSISTENCE_SPEC_PATH)).toBe(true);

    const harnessSource = readFileSync(SHELL_PERSISTENCE_SPEC_PATH, 'utf8');
    for (const marker of SHELL_PERSISTENCE_ROUTE_MARKERS) {
      expect(harnessSource, `missing ${marker}`).toContain(marker);
    }
  });

  it('keeps the experimental import boundary guard in the slice 0 harness', () => {
    expect(existsSync(EXP_IMPORT_BOUNDARY_TEST_PATH)).toBe(true);

    const boundarySource = readFileSync(EXP_IMPORT_BOUNDARY_TEST_PATH, 'utf8');
    expect(boundarySource).toContain('app/exp');
    expect(boundarySource).toContain(
      'production source from importing app/exp'
    );
    expect(relative(REPO_ROOT, EXP_IMPORT_BOUNDARY_TEST_PATH)).toBe(
      'apps/web/tests/unit/app/exp-import-boundary.test.ts'
    );
  });
});
