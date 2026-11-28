import {
  EXTERNAL_TASK_CAPTURE_ROUTE,
  RELEASE_ASSIGNEE_CAPTURE_ROUTE,
} from './pr-visual-capture-surfaces.mjs';

const visible = locator => locator.filter({ visible: true }).first();

/** Real task consumers, with only a reserved assignment presentation input. */
export async function prepareExternalCapture(page, route, timeout = 30_000) {
  if (route === RELEASE_ASSIGNEE_CAPTURE_ROUTE) {
    const fixture = page.getByTestId('external-assignee-render-fixture');
    await fixture.waitFor({ state: 'visible', timeout });
    await fixture
      .getByText('Agent', { exact: true })
      .waitFor({ state: 'visible', timeout });
    return {
      state: 'release-external-assignee',
      assignee: 'Agent',
      presentationOnly: true,
    };
  }
  if (route !== EXTERNAL_TASK_CAPTURE_ROUTE) return null;
  const workspace = visible(page.getByTestId('tasks-workspace'));
  await workspace.waitFor({ state: 'visible', timeout });
  const all = workspace
    .getByRole('tab', { name: /^All\b/ })
    .filter({ visible: true });
  if (await all.first().isVisible()) {
    await all.first().click({ timeout });
  } else {
    await visible(workspace.getByRole('button', { name: /^More tabs/ })).click({
      timeout,
    });
    await page
      .getByRole('menuitemradio', { name: /^All\b/ })
      .click({ timeout });
  }
  const selectedTask = 'Prepare the release script';
  const has = page.getByText(selectedTask, { exact: true });
  const row = visible(
    workspace
      .getByRole('row')
      .filter({ has })
      .or(workspace.getByTestId('mobile-task-row').filter({ has }))
  );
  await row.waitFor({ state: 'visible', timeout });
  await row
    .getByText('Agent', { exact: true })
    .waitFor({ state: 'visible', timeout });
  await row
    .getByText('Not Started', { exact: true })
    .waitFor({ state: 'visible', timeout });
  if (await row.getByText(/working/i).count())
    throw new Error('Assignment alone was shown as agent execution');
  await row.scrollIntoViewIfNeeded();
  return {
    state: 'task-external-assignee',
    selectedTask,
    assignee: 'Agent',
    execution: 'not-started',
    presentationOnly: true,
  };
}

export function hasExternalCaptureState(route, observed) {
  if (
    route !== EXTERNAL_TASK_CAPTURE_ROUTE &&
    route !== RELEASE_ASSIGNEE_CAPTURE_ROUTE
  )
    return true;
  if (observed?.assignee !== 'Agent' || observed.presentationOnly !== true)
    return false;
  return route === RELEASE_ASSIGNEE_CAPTURE_ROUTE
    ? observed.state === 'release-external-assignee'
    : observed.state === 'task-external-assignee' &&
        observed.selectedTask === 'Prepare the release script' &&
        observed.execution === 'not-started';
}
