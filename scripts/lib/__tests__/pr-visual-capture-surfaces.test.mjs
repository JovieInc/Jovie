import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { prepareLaunchCapture } from '../../../.github/scripts/pr-visual-capture-launch.mjs';
import {
  prepareContactsCapture,
  routeChangedFiles,
} from '../../../.github/scripts/pr-visual-capture-surfaces.mjs';
import { evaluateVisualEvidence } from '../../../.github/scripts/pr-visual-evidence-gate.mjs';
import { validateCaptureManifest } from '../../../.github/scripts/pr-visual-review.mjs';

describe('Contacts surface route', () => {
  it.each([
    'apps/web/app/(marketing)/card/JovieCardLanding.tsx',
    'apps/web/app/(marketing)/card/page.tsx',
    'apps/web/app/(marketing)/card/JovieCardInterestCapture.tsx',
    'apps/web/data/jovieCardCopy.ts',
  ])('captures the actual Card route for %s', file => {
    expect(routeChangedFiles([file])).toEqual({
      shouldReview: true,
      routes: ['/card'],
      reason: 'ui-change',
      review_status: 'advisory',
    });
  });

  it('does not confuse unrelated card components with the Card route', () => {
    expect(
      routeChangedFiles([
        'apps/web/components/molecules/ContentSurfaceCard.tsx',
      ]).routes
    ).toEqual(['/']);
    expect(
      routeChangedFiles(['apps/web/data/jovieCardCopy.ts.backup']).shouldReview
    ).toBe(false);
  });

  it('routes UI changes only to deterministic public surfaces', () => {
    expect(
      routeChangedFiles([
        'apps/web/app/(home)/page.tsx',
        'packages/ui/src/button.tsx',
        'docs/README.md',
      ])
    ).toEqual({
      shouldReview: true,
      routes: ['/'],
      reason: 'ui-change',
      review_status: 'advisory',
    });
  });

  it('routes known profiles to the real fixture and never invents demo routes', () => {
    expect(
      routeChangedFiles(['apps/web/app/(dynamic)/[username]/page.tsx'])
    ).toEqual({
      shouldReview: true,
      routes: ['/demo/showcase/public-profile'],
      reason: 'ui-change',
      review_status: 'advisory',
    });
    expect(routeChangedFiles(['apps/web/app/(admin)/page.tsx'])).toMatchObject({
      routes: [],
      review_status: 'unavailable',
      missingCoverage: [
        {
          file: 'apps/web/app/(admin)/page.tsx',
          reason: 'unsupported-surface',
        },
      ],
    });
    expect(routeChangedFiles(['scripts/format.mjs'])).toEqual({
      shouldReview: false,
      routes: [],
      reason: 'no-ui-change',
      review_status: 'skipped',
    });
  });

  // Done-check: the exact PR26959 surface must show the selected contact rail,
  // never the homepage, at desktop and mobile capture widths.
  it('routes the Contacts detail cleanup to its actual workspace', () => {
    expect(
      routeChangedFiles([
        'apps/web/components/features/dashboard/organisms/contacts-table/ContactDetailSidebar.tsx',
        'apps/web/components/features/dashboard/organisms/contacts-table/columns.tsx',
      ]).routes
    ).toEqual(['/app/contacts']);
  });
});

describe('Contacts capture state contract', () => {
  function pageFixture({
    loaded = true,
    matchingRail = true,
    authenticated = true,
  } = {}) {
    const events = [];
    const locator = path => ({
      filter: options =>
        locator(`${path}:${options.hasText ? 'loaded' : 'filtered'}`),
      first: () => locator(path),
      getByTestId: id => locator(`${path}/${id}`),
      getByRole: role => locator(`${path}/${role}`),
      locator: selector => locator(`${path}/${selector}`),
      getByText: text => locator(`${path}/match:${text}`),
      innerText: async () => 'Priya Anand',
      click: async () => events.push('select-existing-contact'),
      waitFor: async () => {
        if (!authenticated && path.includes('contacts-workspace'))
          throw new Error('Authenticated Contacts workspace unavailable');
        if (!loaded && path.includes('contacts-toolbar-count'))
          throw new Error('Contacts data unavailable');
        if (!matchingRail && path.includes('match:'))
          throw new Error('Selected contact detail missing');
        events.push(path);
      },
    });
    return { page: locator('page'), events };
  }

  it('requires populated data, selects an existing contact, and verifies matching detail', async () => {
    const { page, events } = pageFixture();
    expect(await prepareContactsCapture(page)).toEqual({
      state: 'contacts-selected-detail',
      selectedContact: 'Priya Anand',
    });
    expect(events).toContain('select-existing-contact');
    expect(events.at(-1)).toContain('match:Priya Anand');
  });

  it('cannot certify an empty/error table or an unrelated detail rail', async () => {
    const loading = pageFixture({ loaded: false });
    await expect(prepareContactsCapture(loading.page)).rejects.toThrow(
      'Contacts data unavailable'
    );
    expect(loading.events).not.toContain('select-existing-contact');
    await expect(
      prepareContactsCapture(pageFixture({ matchingRail: false }).page)
    ).rejects.toThrow('Selected contact detail missing');
  });

  it('cannot certify an unauthenticated page as Contacts coverage', async () => {
    const fixture = pageFixture({ authenticated: false });
    await expect(prepareContactsCapture(fixture.page)).rejects.toThrow(
      'Authenticated Contacts workspace unavailable'
    );
    expect(fixture.events).not.toContain('select-existing-contact');
  });

  it('requires selected-detail evidence even if a Contacts PNG was recorded', () => {
    const manifest = {
      routes: ['/app/contacts'],
      viewports: { desktop: {} },
      captures: [
        {
          route: '/app/contacts',
          viewport: 'desktop',
          status: 'captured',
          path: 'contacts.png',
        },
      ],
    };
    expect(validateCaptureManifest(manifest).ok).toBe(false);
    manifest.captures[0].observed = {
      state: 'contacts-selected-detail',
      selectedContact: 'Priya Anand',
    };
    expect(validateCaptureManifest(manifest).ok).toBe(true);
  });

  it('keeps unsupported native/admin coverage missing beside a valid homepage capture', async () => {
    const files = [
      'apps/ios/Jovie/ContactsView.swift',
      'apps/macos/Jovie/ContactsView.swift',
      'apps/web/app/(admin)/page.tsx',
      'apps/web/app/(home)/page.tsx',
    ];
    const routing = routeChangedFiles(files);
    expect(routing.routes).toEqual(['/']);
    expect(routing.missingCoverage.map(item => item.file)).toEqual(
      files.slice(0, 3)
    );
    const dir = await mkdtemp(join(tmpdir(), 'visual-missing-surface-'));
    try {
      await writeFile(join(dir, 'routing.json'), JSON.stringify(routing));
      await writeFile(
        join(dir, 'manifest.json'),
        JSON.stringify({ captures: [{ route: '/', status: 'captured' }] })
      );
      const result = evaluateVisualEvidence({
        artifactDir: dir,
        stages: { capture: 'success' },
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe('unavailable');
      expect(result.missingEvidence).toContain(
        `unsupported-surface:${files[0]}`
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

it('admits Mac-only PRs, routes before Chromium, and preserves unavailable evidence without browser work', async () => {
  const workflow = /** @type {any} */ (
    loadYaml(readFileSync('.github/workflows/pr-visual-review.yml', 'utf8'))
  );
  const steps = workflow.jobs.capture.steps;
  const route = steps.find(step => step.id === 'route');
  const chromium = steps.find(
    step => step.name === 'Setup Playwright Chromium'
  );
  for (const folder of ['mac', 'macos']) {
    expect(workflow.on.pull_request.paths).toContain(`apps/${folder}/**`);
    expect(steps.indexOf(route)).toBeLessThan(steps.indexOf(chromium));
    const dir = await mkdtemp(join(tmpdir(), 'native-visual-admission-'));
    const out = join(dir, 'artifacts');
    const head = 'a'.repeat(40);
    const changed = `apps/${folder}/Jovie/ContactsView.swift`;
    const env = {
      ...process.env,
      RUNNER_TEMP: dir,
      PR_VISUAL_OUT: out,
      GITHUB_OUTPUT: join(dir, 'outputs'),
      MERGE_BASE_AVAILABLE: 'true',
      HEAD_SHA: head,
      BASE_REF: 'main',
      BASE_SHA: head,
    };
    try {
      await mkdir(out);
      await writeFile(join(dir, 'changed-files.txt'), `${changed}\n`);
      const script = route.run.match(
        /node --input-type=module - <<'NODE'\n([\s\S]*?)\nNODE/
      )[1];
      const routed = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', script],
        { env, encoding: 'utf8', timeout: 10000 }
      );
      expect(routed.status, routed.stderr).toBe(0);
      const outputs = await readFile(env.GITHUB_OUTPUT, 'utf8');
      expect(outputs).toContain('has_routes=false');
      const routing = JSON.parse(
        await readFile(join(out, 'routing.json'), 'utf8')
      );
      expect(routing).toMatchObject({
        routes: [],
        review_status: 'unavailable',
        missingCoverage: [{ file: changed }],
      });
      for (const step of [
        chromium,
        ...steps.filter(step =>
          ['build', 'server', 'routed_capture'].includes(step.id)
        ),
      ]) {
        expect(step.if).toContain("steps.route.outputs.has_routes == 'true'");
      }
      const gate = steps.find(
        step => step.name === 'Enforce visual evidence (fail-closed)'
      );
      expect(gate.if).toBe('always()');
      expect(steps.find(step => step.id === 'upload').if).toBe('always()');
      const checked = spawnSync(
        process.execPath,
        ['.github/scripts/pr-visual-evidence-gate.mjs'],
        {
          env: {
            ...env,
            PR_VISUAL_EXPECTED_HEAD_SHA: head,
            BUILD_OUTCOME: 'skipped',
            SERVER_OUTCOME: 'skipped',
            CAPTURE_OUTCOME: 'skipped',
          },
          encoding: 'utf8',
          timeout: 10000,
        }
      );
      expect(checked.status).toBe(1);
      const outcome = JSON.parse(
        await readFile(join(out, 'advisory-outcome.json'), 'utf8')
      );
      expect(outcome.status).toBe('unavailable');
      expect(outcome.missingEvidence).toContain(
        `unsupported-surface:${changed}`
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('launch presentation producers', () => {
  function pageFixture({
    missing = '',
    document = '/app/library?document=00000000-0000-4000-8000-000000000203',
    uncertain = 'mixed',
  } = {}) {
    const events = [];
    const check = path => {
      if (missing && path.includes(missing))
        throw new Error(`Missing ${missing}`);
    };
    const locator = path => ({
      filter: () => locator(path),
      first: () => locator(path),
      locator: selector => locator(`${path}/${selector}`),
      getByTestId: id => locator(`${path}/${id}`),
      getByRole: (role, options) =>
        locator(`${path}/${role}:${options?.name ?? ''}`),
      getByText: text => locator(`${path}/${text}`),
      getByLabel: text => locator(`${path}/${text}`),
      waitFor: async () => check(path),
      click: async () => {
        check(path);
        events.push(path);
      },
      scrollIntoViewIfNeeded: async () => {},
      isEnabled: async () => !/Saving…|Checking…/.test(path),
      getAttribute: async name => (name === 'href' ? document : uncertain),
    });
    return { page: locator('page'), events };
  }

  it('opens the actual key disclosure and requires a populated read-only list', async () => {
    const { page, events } = pageFixture();
    expect(await prepareLaunchCapture(page, '/app/settings/account')).toEqual({
      state: 'account-api-keys-loaded',
      selectedKey: 'Release planning agent',
      presentationOnly: true,
    });
    expect(events).toEqual(['page/summary']);
    await expect(
      prepareLaunchCapture(
        pageFixture({ missing: 'listitem' }).page,
        '/app/settings/account'
      )
    ).rejects.toThrow('Missing listitem');
  });

  it('selects the actual task and requires an enabled action and current document link', async () => {
    const { page, events } = pageFixture();
    expect(
      await prepareLaunchCapture(page, '/app/tasks?capture=recording-prepared')
    ).toMatchObject({
      state: 'task-recording-prepared',
      selectedTask: 'Record my release announcement',
      presentationOnly: true,
    });
    expect(events).toEqual([
      'page/tasks-workspace/Record my release announcement',
    ]);
    await expect(
      prepareLaunchCapture(
        pageFixture({ missing: 'Recording Action' }).page,
        '/app/tasks?capture=recording-prepared'
      )
    ).rejects.toThrow('Missing Recording Action');
    await expect(
      prepareLaunchCapture(
        pageFixture({
          document:
            'https://other.example/app/library?document=00000000-0000-4000-8000-000000000203',
        }).page,
        '/app/tasks?capture=recording-prepared'
      )
    ).rejects.toThrow('document link');
  });

  it('requires all takes decision states and never shows uncertainty as settled', async () => {
    const route = '/renders/surfaces/task-recording-takes';
    const { page, events } = pageFixture();
    expect(await prepareLaunchCapture(page, route)).toEqual({
      state: 'recording-takes-decision-states',
      decisionStates: ['saved', 'saving', 'checking', 'unknown'],
      presentationOnly: true,
    });
    expect(events).toEqual([]);
    await expect(
      prepareLaunchCapture(pageFixture({ uncertain: 'true' }).page, route)
    ).rejects.toThrow('Unknown recording choice was shown as settled');
    await expect(
      prepareLaunchCapture(pageFixture({ missing: 'Retry Keep' }).page, route)
    ).rejects.toThrow('Missing Retry Keep');
  });

  it('does not substitute these fixtures for unrelated routes', async () => {
    const { page, events } = pageFixture();
    expect(await prepareLaunchCapture(page, '/app/chat')).toBeNull();
    expect(events).toEqual([]);
  });

  it('routes only the named account/task/studio inputs to their actual producers', () => {
    expect(
      routeChangedFiles([
        'apps/web/components/features/dashboard/organisms/account-settings/ApiKeysCard.tsx',
        'apps/web/lib/queries/task-readback.ts',
        'apps/web/components/features/teleprompter-studio/StudioTakesSheet.tsx',
      ])
    ).toMatchObject({
      routes: [
        '/app/settings/account',
        '/app/tasks',
        '/renders/surfaces/task-recording-takes',
      ],
      review_status: 'advisory',
    });
    const unknown = 'apps/web/lib/tasks/new-recording-presentation.ts';
    expect(routeChangedFiles([unknown])).toMatchObject({
      review_status: 'unavailable',
      missingCoverage: [{ file: unknown, reason: 'unsupported-surface' }],
    });
  });

  it('skips reviewed server adapters but keeps neighboring client and unknown routes visible', () => {
    expect(
      routeChangedFiles([
        'apps/web/lib/auth/agent-api-key.ts',
        'apps/web/lib/actions/owner/dispatcher.ts',
        'apps/web/lib/tasks/recording-workflow.server.ts',
        'apps/web/lib/tasks/recording-attention.server.ts',
        'apps/web/lib/tasks/playbooks/materialize-release-plan.server.ts',
        'apps/web/lib/db/schema/api-keys.ts',
      ])
    ).toMatchObject({ shouldReview: false, review_status: 'skipped' });
    for (const file of [
      'apps/web/lib/auth/client.ts',
      'apps/web/lib/auth/api-key-policy.ts',
    ]) {
      expect(routeChangedFiles([file]).routes).toEqual([
        '/app/settings/account',
      ]);
    }
    const unknown = 'apps/web/app/api/auth/unreviewed/route.ts';
    expect(routeChangedFiles([unknown])).toMatchObject({
      review_status: 'unavailable',
      missingCoverage: [{ file: unknown, reason: 'unsupported-surface' }],
    });
  });

  it.each([
    '/app/settings/account',
    '/app/tasks?capture=recording-prepared',
    '/renders/surfaces/task-recording-takes',
  ])(
    'rejects an empty shell PNG for %s and accepts only its observed presentation state',
    async route => {
      const manifest = {
        routes: [route],
        viewports: { desktop: {} },
        captures: [
          {
            route,
            viewport: 'desktop',
            status: 'captured',
            path: 'actual.png',
          },
        ],
      };
      expect(validateCaptureManifest(manifest).ok).toBe(false);
      manifest.captures[0].observed = await prepareLaunchCapture(
        pageFixture().page,
        route
      );
      expect(validateCaptureManifest(manifest).ok).toBe(true);
      manifest.captures[0].observed.presentationOnly = false;
      expect(validateCaptureManifest(manifest).ok).toBe(false);
    }
  );
});
