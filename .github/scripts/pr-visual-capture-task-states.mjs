import {
  RECORDING_HOST_CAPTURE_ROUTE,
  TASKS_CAPTURE_ROUTE,
} from './pr-visual-capture-surfaces.mjs';

const visible = locator => locator.filter({ visible: true }).first();
// Existing reserved Tasks fixture; no recording or external-agent row is needed.
const TASK_TITLE = "Approve single artwork for 'Neon Skyline'";
const STUDIO_TITLE = 'Task recording preview';

async function preparePopulatedTasks(page, timeout) {
  const workspace = visible(page.getByTestId('tasks-workspace'));
  await workspace.waitFor({ state: 'visible', timeout });
  const has = page.getByText(TASK_TITLE, { exact: true });
  const row = visible(
    workspace
      .getByRole('row')
      .filter({ has })
      .or(workspace.getByTestId('mobile-task-row').filter({ has }))
  );
  await row.waitFor({ state: 'visible', timeout });
  await row.click({ timeout });
  const title = visible(page.getByLabel(/^Task title$/i));
  await title.waitFor({ state: 'visible', timeout });
  if ((await title.inputValue()) !== TASK_TITLE)
    throw new Error('Selected task detail did not match its populated row');
  await title.scrollIntoViewIfNeeded();
  return {
    state: 'tasks-populated-detail',
    selectedTask: TASK_TITLE,
    presentationOnly: true,
  };
}

/** Real mounted Host and Studio; denied media is a presentation input only. */
async function prepareRecordingHost(page, timeout) {
  // Exercise a real client selection before dispatching the mounted Host event.
  // The existing fixture detail is read-only and needs no recording binding.
  await preparePopulatedTasks(page, timeout);
  const blockedMutations = [];
  // Remains installed until this isolated capture context closes. Late writes
  // also invalidate the observed receipt, instead of escaping after assertions.
  await page.route('**/*', async route => {
    const request = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      return route.continue();
    blockedMutations.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
    });
    return route.abort();
  });
  await page.evaluate(title => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException(
            'Display fixture denies media',
            'NotAllowedError'
          );
        },
        enumerateDevices: async () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    globalThis.dispatchEvent(
      new CustomEvent('jovie:teleprompter-start', {
        detail: {
          profileId: '00000000-0000-4000-8000-000000000102',
          kind: 'promo',
          title,
          script: 'A display-only script preview.',
          showcaseVariant: 'direct',
          source: 'task_recording',
        },
      })
    );
  }, STUDIO_TITLE);
  const studio = visible(
    page.getByRole('dialog', { name: `Record ${STUDIO_TITLE}`, exact: true })
  );
  await studio.waitFor({ state: 'visible', timeout });
  await studio.getByTestId('teleprompter-studio-camera-blocked').waitFor({
    state: 'visible',
    timeout,
  });
  await studio
    .getByRole('heading', {
      name: 'Jovie needs your camera and mic',
      exact: true,
    })
    .waitFor({ state: 'visible', timeout });
  const record = studio.getByTestId('teleprompter-studio-record');
  await record.waitFor({ state: 'visible', timeout });
  if (
    (await record.isEnabled()) ||
    (await studio.getAttribute('data-phase')) !== 'ready'
  )
    throw new Error('Camera-denied Studio was shown as able to record');
  if (blockedMutations.length > 0)
    throw new Error('Host presentation attempted a mutating request');
  return {
    state: 'recording-host-camera-denied',
    title: STUDIO_TITLE,
    source: 'task_recording',
    camera: 'denied',
    recordingEnabled: false,
    blockedMutations,
    presentationOnly: true,
  };
}

export async function prepareTaskStateCapture(page, route, timeout = 30_000) {
  if (route === TASKS_CAPTURE_ROUTE)
    return preparePopulatedTasks(page, timeout);
  if (route === RECORDING_HOST_CAPTURE_ROUTE)
    return prepareRecordingHost(page, timeout);
  return null;
}

export function hasTaskStateCapture(route, observed) {
  if (route === TASKS_CAPTURE_ROUTE)
    return (
      observed?.state === 'tasks-populated-detail' &&
      observed.selectedTask === TASK_TITLE &&
      observed.presentationOnly === true
    );
  if (route === RECORDING_HOST_CAPTURE_ROUTE)
    return (
      observed?.state === 'recording-host-camera-denied' &&
      observed.title === STUDIO_TITLE &&
      observed.source === 'task_recording' &&
      observed.camera === 'denied' &&
      observed.recordingEnabled === false &&
      Array.isArray(observed.blockedMutations) &&
      observed.blockedMutations.length === 0 &&
      observed.presentationOnly === true
    );
  return true;
}
