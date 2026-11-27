import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  hasLaunchCaptureState,
  prepareLaunchCapture,
} from '../../../.github/scripts/pr-visual-capture-launch.mjs';
import {
  RECORDING_HOST_CAPTURE_ROUTE,
  RECORDING_TAKES_CAPTURE_ROUTE,
  RECORDING_TASK_CAPTURE_ROUTE,
  routeChangedFiles,
  TASKS_CAPTURE_ROUTE,
} from '../../../.github/scripts/pr-visual-capture-surfaces.mjs';
import { validateCaptureManifest } from '../../../.github/scripts/pr-visual-review.mjs';

const taskTitle = "Approve single artwork for 'Neon Skyline'";

/**
 * @param {{
 *   missing?: string,
 *   title?: string,
 *   recordEnabled?: boolean,
 *   phase?: string,
 *   duringEvaluate?: (guard: (route: ReturnType<typeof requestFixture>['route']) => Promise<unknown>) => unknown,
 * }} [options]
 */
function pageFixture({
  missing = '',
  title = taskTitle,
  recordEnabled = false,
  phase = 'ready',
  duringEvaluate,
} = {}) {
  const actions = [];
  const dispatched = [];
  const guards = [];
  let realCameraCalls = 0;
  const sandbox = {
    navigator: {
      mediaDevices: {
        getUserMedia: () => {
          realCameraCalls += 1;
          throw new Error('Real camera must not be used');
        },
      },
    },
    DOMException,
    CustomEvent: class {
      constructor(type, { detail }) {
        this.type = type;
        this.detail = detail;
      }
    },
    dispatchEvent: event => dispatched.push(event),
  };
  const check = path => {
    if (missing && path.includes(missing))
      throw new Error(`Missing ${missing}`);
  };
  const locator = path => ({
    path,
    filter: options => locator(`${path}${options.has ? '/matching-row' : ''}`),
    first: () => locator(path),
    or: other => locator(`${path}|${other.path}`),
    getByTestId: id => locator(`${path}/${id}`),
    getByRole: (role, options) =>
      locator(`${path}/${role}:${options?.name ?? ''}`),
    getByText: text => locator(`${path}/text:${text}`),
    getByLabel: text => locator(`${path}/label:${text}`),
    waitFor: async () => check(path),
    click: async () => {
      check(path);
      actions.push(path);
    },
    scrollIntoViewIfNeeded: async () => {},
    inputValue: async () => title,
    isEnabled: async () => recordEnabled,
    getAttribute: async name => (name === 'data-phase' ? phase : null),
  });
  const page = {
    ...locator('page'),
    route: async (pattern, handler) => guards.push({ pattern, handler }),
    evaluate: async (fn, arg) => {
      sandbox.input = arg;
      await runInNewContext(`(${fn.toString()})(input)`, sandbox);
      await duringEvaluate?.(guards[0].handler);
    },
  };
  return {
    page,
    actions,
    dispatched,
    guards,
    sandbox,
    realCameraCalls: () => realCameraCalls,
  };
}

function requestFixture(method, path) {
  const actions = [];
  return {
    actions,
    route: {
      request: () => ({
        method: () => method,
        url: () => `http://capture.invalid${path}`,
      }),
      continue: async () => actions.push('continue'),
      abort: async () => actions.push('abort'),
    },
  };
}

function manifestFor(route, observed) {
  return {
    routes: [route],
    viewports: { desktop: {} },
    captures: [
      {
        route,
        viewport: 'desktop',
        status: 'captured',
        path: 'actual.png',
        observed,
      },
    ],
  };
}

test('cache changes use the populated task producer without recording UI', () => {
  for (const file of [
    'apps/web/lib/queries/task-mutation-cache.ts',
    'apps/web/lib/queries/task-readback.ts',
    'apps/web/lib/queries/useTaskMutations.ts',
    'apps/web/lib/queries/useTasksQuery.ts',
  ]) {
    assert.deepEqual(routeChangedFiles([file]).routes, [TASKS_CAPTURE_ROUTE]);
  }
});

test('recording server Host and hook inputs do not require later take or task fixtures', () => {
  for (const file of [
    'apps/web/components/features/teleprompter-studio/TeleprompterStudioHost.tsx',
    'apps/web/components/features/teleprompter-studio/use-studio-takes.ts',
    'apps/web/lib/tasks/recording-contract.ts',
    'apps/web/lib/teleprompter/takes/contract.ts',
    'apps/web/lib/teleprompter/types.ts',
  ]) {
    const routed = routeChangedFiles([file]);
    assert.deepEqual(routed.routes, [RECORDING_HOST_CAPTURE_ROUTE]);
    assert.equal(routed.review_status, 'advisory');
  }
});

test('actual recording controls retain prepared-action and take-state coverage', () => {
  assert.deepEqual(
    routeChangedFiles([
      'apps/web/components/features/dashboard/tasks/TaskRecordingAction.tsx',
      'apps/web/components/features/teleprompter-studio/StudioTakesSheet.tsx',
    ]).routes,
    [RECORDING_TASK_CAPTURE_ROUTE, RECORDING_TAKES_CAPTURE_ROUTE]
  );
  const file =
    'apps/web/components/features/teleprompter-studio/UnknownHost.tsx';
  assert.deepEqual(routeChangedFiles([file]).missingCoverage, [
    { file, reason: 'unsupported-surface' },
  ]);
});

test('generic capture selects an existing row and verifies the actual detail value', async () => {
  const fixture = pageFixture();
  const observed = await prepareLaunchCapture(
    fixture.page,
    TASKS_CAPTURE_ROUTE
  );
  assert.deepEqual(observed, {
    state: 'tasks-populated-detail',
    selectedTask: taskTitle,
    presentationOnly: true,
  });
  assert.equal(fixture.actions.length, 1);
  assert.match(fixture.actions[0], /matching-row/);
  assert.equal(fixture.dispatched.length, 0);
  assert.equal(fixture.guards.length, 0);
  assert.equal(fixture.realCameraCalls(), 0);
  for (const options of [
    { title: 'Unrelated task' },
    { missing: 'label:' },
    { missing: 'matching-row' },
    { missing: 'tasks-workspace' },
  ]) {
    await assert.rejects(
      prepareLaunchCapture(pageFixture(options).page, TASKS_CAPTURE_ROUTE),
      /detail did not match|Missing/
    );
  }
});

test('Host capture opens the real event boundary with denied media and no task execution binding', async () => {
  const fixture = pageFixture();
  const observed = await prepareLaunchCapture(
    fixture.page,
    RECORDING_HOST_CAPTURE_ROUTE
  );
  assert.equal(observed.state, 'recording-host-camera-denied');
  assert.equal(
    hasLaunchCaptureState(RECORDING_HOST_CAPTURE_ROUTE, observed),
    true
  );
  assert.equal(fixture.actions.length, 1);
  assert.match(fixture.actions[0], /matching-row/);
  assert.equal(fixture.guards[0].pattern, '**/*');
  assert.equal(fixture.dispatched.length, 1);
  const event = fixture.dispatched[0];
  assert.equal(event.type, 'jovie:teleprompter-start');
  assert.equal(event.detail.source, 'task_recording');
  assert.equal(event.detail.profileId, '00000000-0000-4000-8000-000000000102');
  assert.equal('taskRecording' in event.detail, false);
  await assert.rejects(fixture.sandbox.navigator.mediaDevices.getUserMedia(), {
    name: 'NotAllowedError',
  });
  assert.equal(fixture.realCameraCalls(), 0);
});

test('Host refuses missing denial UI, enabled recording, or an active recording phase', async () => {
  for (const options of [
    { missing: 'teleprompter-studio-camera-blocked' },
    { missing: 'Jovie needs your camera and mic' },
    { recordEnabled: true },
    { phase: 'recording' },
  ]) {
    await assert.rejects(
      prepareLaunchCapture(
        pageFixture(options).page,
        RECORDING_HOST_CAPTURE_ROUTE
      ),
      /Missing|able to record/
    );
  }
});

test('all unsafe requests are aborted and invalidate even a previously returned Host receipt', async () => {
  for (const [method, path] of [
    ['POST', '/app/tasks'],
    ['POST', '/api/teleprompter/takes'],
    ['PATCH', '/api/teleprompter/takes/take'],
    ['PUT', '/private-upload'],
    ['DELETE', '/api/teleprompter/takes/take'],
  ]) {
    const fixture = pageFixture();
    const observed = await prepareLaunchCapture(
      fixture.page,
      RECORDING_HOST_CAPTURE_ROUTE
    );
    const manifest = manifestFor(RECORDING_HOST_CAPTURE_ROUTE, observed);
    assert.equal(validateCaptureManifest(manifest).ok, true);
    const request = requestFixture(method, path);
    await fixture.guards[0].handler(request.route);
    assert.deepEqual(request.actions, ['abort']);
    assert.deepEqual(observed.blockedMutations, [{ method, path }]);
    assert.equal(validateCaptureManifest(manifest).ok, false);
  }
});

test('Host permits reads and rejects unsafe requests attempted before its assertions complete', async () => {
  const fixture = pageFixture();
  const observed = await prepareLaunchCapture(
    fixture.page,
    RECORDING_HOST_CAPTURE_ROUTE
  );
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const request = requestFixture(method, '/_next/static/studio.js');
    await fixture.guards[0].handler(request.route);
    assert.deepEqual(request.actions, ['continue']);
  }
  assert.equal(
    hasLaunchCaptureState(RECORDING_HOST_CAPTURE_ROUTE, observed),
    true
  );
  const request = requestFixture('POST', '/app/tasks');
  await assert.rejects(
    prepareLaunchCapture(
      pageFixture({ duringEvaluate: guard => guard(request.route) }).page,
      RECORDING_HOST_CAPTURE_ROUTE
    ),
    /mutating request/
  );
  assert.deepEqual(request.actions, ['abort']);
});

test('empty PNGs and another task or recording state cannot satisfy required evidence', async () => {
  for (const route of [TASKS_CAPTURE_ROUTE, RECORDING_HOST_CAPTURE_ROUTE]) {
    assert.equal(validateCaptureManifest(manifestFor(route)).ok, false);
    const observed = await prepareLaunchCapture(pageFixture().page, route);
    assert.equal(
      validateCaptureManifest(manifestFor(route, observed)).ok,
      true
    );
    for (const other of [
      TASKS_CAPTURE_ROUTE,
      RECORDING_HOST_CAPTURE_ROUTE,
      RECORDING_TASK_CAPTURE_ROUTE,
      RECORDING_TAKES_CAPTURE_ROUTE,
    ].filter(other => other !== route)) {
      assert.equal(hasLaunchCaptureState(other, observed), false);
    }
    observed.presentationOnly = false;
    assert.equal(
      validateCaptureManifest(manifestFor(route, observed)).ok,
      false
    );
  }
});

test('combined recording and Agent UI stays within the existing twelve-capture limit', () => {
  const routed = routeChangedFiles([
    'apps/web/app/app/(shell)/dashboard/tasks/_lib/screen-cert-fixture.ts',
    'apps/web/components/features/dashboard/tasks/TaskRecordingAction.tsx',
    'apps/web/components/features/teleprompter-studio/TeleprompterStudioHost.tsx',
    'apps/web/components/features/teleprompter-studio/StudioTakesSheet.tsx',
    'apps/web/components/features/dashboard/release-tasks/ReleaseTaskAssigneeBadge.tsx',
  ]);
  assert.equal(routed.review_status, 'advisory');
  assert.equal(routed.routes.length, 6);
  assert.equal(new Set(routed.routes).size, 6);
  const manifest = {
    routes: routed.routes,
    viewports: { desktop: {}, mobile: {} },
    captures: routed.routes.flatMap(route =>
      ['desktop', 'mobile'].map(viewport => ({ route, viewport }))
    ),
  };
  assert.equal(manifest.captures.length, 12);
  // Missing states still fail; this checks only the unchanged capture budget.
  const result = validateCaptureManifest(manifest);
  assert.equal(result.ok, false);
  assert.equal(
    result.failures.some(item => item.startsWith('too many')),
    false
  );
});
