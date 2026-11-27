import {
  hasExternalCaptureState,
  prepareExternalCapture,
} from './pr-visual-capture-external.mjs';
import {
  ACCOUNT_CAPTURE_ROUTE,
  RECORDING_HOST_CAPTURE_ROUTE,
  RECORDING_TAKES_CAPTURE_ROUTE,
  RECORDING_TASK_CAPTURE_ROUTE,
  TASKS_CAPTURE_ROUTE,
} from './pr-visual-capture-surfaces.mjs';
import {
  hasTaskStateCapture,
  prepareTaskStateCapture,
} from './pr-visual-capture-task-states.mjs';

const visible = locator => locator.filter({ visible: true }).first();
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Real app route, populated read-only provider presentation fixture. */
async function prepareAccount(page, timeout) {
  const summary = page.locator('summary').filter({ hasText: /^API Keys$/ });
  await visible(summary).click({ timeout });
  const card = visible(page.locator('details[open]').filter({ has: summary }));
  await card
    .getByLabel('Key name', { exact: true })
    .waitFor({ state: 'visible', timeout });
  const row = card.getByRole('listitem').filter({
    has: page.getByText('Release planning agent', { exact: true }),
  });
  await row.waitFor({ state: 'visible', timeout });
  await row
    .getByRole('button', { name: 'Revoke Release planning agent', exact: true })
    .waitFor({ state: 'visible', timeout });
  await card.scrollIntoViewIfNeeded();
  return {
    state: 'account-api-keys-loaded',
    selectedKey: 'Release planning agent',
    presentationOnly: true,
  };
}

/** Select the real task row and require the prepared action in its editor. */
async function prepareRecordingTask(page, timeout) {
  const workspace = visible(page.getByTestId('tasks-workspace'));
  await workspace.waitFor({ state: 'visible', timeout });
  const title = 'Record my release announcement';
  await workspace.getByText(title, { exact: true }).click({ timeout });
  const pane = visible(page.getByTestId('task-document-pane'));
  await pane.waitFor({ state: 'visible', timeout });
  const action = pane.getByRole('region', {
    name: 'Recording Action',
    exact: true,
  });
  await action.waitFor({ state: 'visible', timeout });
  const link = action.getByRole('link', { name: 'Review Script', exact: true });
  await link.waitFor({ state: 'visible', timeout });
  const href = await link.getAttribute('href');
  const document = new URL(href ?? '', 'http://capture.invalid');
  const documentId = document.searchParams.get('document');
  if (
    document.origin !== 'http://capture.invalid' ||
    document.pathname !== '/app/library' ||
    !UUID.test(documentId ?? '')
  )
    throw new Error('Prepared task has no revision-bound document link');
  const record = action.getByRole('button', { name: 'Record', exact: true });
  await record.waitFor({ state: 'visible', timeout });
  if (!(await record.isEnabled()))
    throw new Error('Prepared recording action is unavailable');
  await action.scrollIntoViewIfNeeded();
  return {
    state: 'task-recording-prepared',
    selectedTask: title,
    documentId,
    presentationOnly: true,
  };
}

/** Actual source component with explicit state inputs; never a media receipt. */
async function prepareTakes(page, timeout) {
  await page
    .getByTestId('recording-takes-render-fixture')
    .waitFor({ state: 'visible', timeout });
  const sheet = page.getByTestId('teleprompter-studio-takes');
  await sheet.waitFor({ state: 'visible', timeout });
  for (const name of ['Keeper', 'Saving…', 'Checking…', 'Retry Keep']) {
    const control = sheet.getByRole('button', { name, exact: true });
    await control.waitFor({ state: 'visible', timeout });
    const disabled = name === 'Saving…' || name === 'Checking…';
    if ((await control.isEnabled()) === disabled)
      throw new Error(`Incorrect take decision control state: ${name}`);
  }
  if (
    (await sheet
      .getByRole('button', { name: 'Retry Keep', exact: true })
      .getAttribute('aria-pressed')) !== 'mixed'
  )
    throw new Error('Unknown recording choice was shown as settled');
  return {
    state: 'recording-takes-decision-states',
    decisionStates: ['saved', 'saving', 'checking', 'unknown'],
    presentationOnly: true,
  };
}

export async function prepareLaunchCapture(
  page,
  route,
  { timeout = 30_000 } = {}
) {
  if (route === ACCOUNT_CAPTURE_ROUTE) return prepareAccount(page, timeout);
  if (route === TASKS_CAPTURE_ROUTE || route === RECORDING_HOST_CAPTURE_ROUTE)
    return prepareTaskStateCapture(page, route, timeout);
  if (route === RECORDING_TASK_CAPTURE_ROUTE)
    return prepareRecordingTask(page, timeout);
  if (route === RECORDING_TAKES_CAPTURE_ROUTE)
    return prepareTakes(page, timeout);
  return prepareExternalCapture(page, route, timeout);
}

export function hasLaunchCaptureState(route, observed) {
  if (route === ACCOUNT_CAPTURE_ROUTE)
    return (
      observed?.state === 'account-api-keys-loaded' &&
      observed.selectedKey === 'Release planning agent' &&
      observed.presentationOnly === true
    );
  if (route === RECORDING_TASK_CAPTURE_ROUTE)
    return (
      observed?.state === 'task-recording-prepared' &&
      observed.selectedTask === 'Record my release announcement' &&
      UUID.test(observed.documentId ?? '') &&
      observed.presentationOnly === true
    );
  if (route === RECORDING_TAKES_CAPTURE_ROUTE)
    return (
      observed?.state === 'recording-takes-decision-states' &&
      Array.isArray(observed.decisionStates) &&
      ['saved', 'saving', 'checking', 'unknown'].every(state =>
        observed.decisionStates.includes(state)
      ) &&
      observed.presentationOnly === true
    );
  return (
    hasTaskStateCapture(route, observed) &&
    hasExternalCaptureState(route, observed)
  );
}
