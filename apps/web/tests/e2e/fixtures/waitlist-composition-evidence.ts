import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Locator, Page, TestInfo } from '@playwright/test';

export interface ComposingKeyObservation {
  key: string;
  isComposing: boolean;
  defaultPrevented: boolean;
}

export const WAITLIST_COMPOSING_KEYS = [
  'Enter',
  'ArrowDown',
  'ArrowUp',
  'Escape',
  'Tab',
] as const;

export async function focusWaitlistOption(
  page: Page,
  control: Locator,
  option: 'artist' | 'manual'
) {
  await control.focus();
  await page.keyboard.press('ArrowDown');
  if (option === 'manual') {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
  }
}

export function observeWaitlistProofErrors(page: Page) {
  const pageErrors: string[] = [];
  const resourceErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  page.on('requestfailed', request =>
    resourceErrors.push(`${request.url()}: ${request.failure()?.errorText}`)
  );
  page.on('response', response => {
    if (response.status() >= 400)
      resourceErrors.push(`${response.status()} ${response.url()}`);
  });
  return { pageErrors, resourceErrors };
}

export async function dispatchComposingKey(
  control: Locator,
  key: string
): Promise<ComposingKeyObservation> {
  return control.evaluate((element, composingKey) => {
    const keydown = new KeyboardEvent('keydown', {
      key: composingKey,
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(keydown);
    return {
      key: composingKey,
      isComposing: keydown.isComposing,
      defaultPrevented: keydown.defaultPrevented,
    };
  }, key);
}

export async function attachWaitlistDiagnostics(
  testInfo: Pick<TestInfo, 'attach'>,
  evidenceDir: string,
  name: string,
  evidence: {
    theme: 'light' | 'dark';
    option: 'artist' | 'manual';
    events: ComposingKeyObservation[];
    pageErrors: string[];
    resourceErrors: string[];
    failure: unknown;
    screenshotFailure: unknown;
  }
) {
  const retentionFailures: unknown[] = [];
  let serialized = '{"diagnosticSerializationFailed":true}';
  try {
    serialized = JSON.stringify(
      {
        ...evidence,
        failure:
          evidence.failure === undefined ? null : String(evidence.failure),
        screenshotFailure:
          evidence.screenshotFailure === undefined
            ? null
            : String(evidence.screenshotFailure),
      },
      null,
      2
    );
  } catch (error) {
    retentionFailures.push(error);
  }
  try {
    await testInfo.attach(`${name}.json`, {
      body: serialized,
      contentType: 'application/json',
    });
  } catch (error) {
    retentionFailures.push(error);
  }
  try {
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(join(evidenceDir, `${name}.json`), serialized);
  } catch (error) {
    retentionFailures.push(error);
  }
  const failures = [
    ...(evidence.failure === undefined ? [] : [evidence.failure]),
    ...(evidence.screenshotFailure === undefined
      ? []
      : [evidence.screenshotFailure]),
    ...retentionFailures,
  ];
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    const primary = failures[0];
    throw new AggregateError(
      failures,
      primary instanceof Error ? primary.message : 'Waitlist proof failed',
      { cause: primary }
    );
  }
}
