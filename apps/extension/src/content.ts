declare const chrome: ChromeGlobal | undefined;

import {
  buildPreviewResponse,
  findAdapterForHost,
  getActiveEditableElement,
  getMatchingTarget,
} from './content-adapters';

export {};

type InsertMessage = {
  readonly type: 'jovie:insert-text';
  readonly value: string;
};

type PreviewMessage = {
  readonly type: 'jovie:get-insert-preview';
};

type BulkInsertField = {
  readonly selector: string;
  readonly value: string;
};

type BulkInsertMessage = {
  readonly type: 'jovie:bulk-insert';
  readonly fields: readonly BulkInsertField[];
};

type AutofillField = {
  readonly label: string;
  readonly value: string;
};

type AutofillMessage = {
  readonly type: 'jovie:autofill';
  readonly fields: readonly AutofillField[];
};

type RuntimeMessage =
  | InsertMessage
  | PreviewMessage
  | BulkInsertMessage
  | AutofillMessage;

function setInputValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function insertIntoInput(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  const nextValue =
    element.value.slice(0, start) + value + element.value.slice(end);
  setInputValue(element, nextValue);
  const caretPosition = start + value.length;
  element.selectionStart = caretPosition;
  element.selectionEnd = caretPosition;
}

function insertIntoContentEditable(element: HTMLElement, value: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    element.focus();
    document.execCommand('insertText', false, value);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(value));
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function isReactSelectInput(element: HTMLElement): boolean {
  return (
    element instanceof HTMLInputElement &&
    (element.id.startsWith('react-select-') ||
      !!element.closest(
        '[class*="AsyncDropdown"], [class*="react-select"], [class*="__control"]'
      ))
  );
}

async function fillReactSelect(
  container: HTMLElement,
  value: string
): Promise<boolean> {
  const input =
    container instanceof HTMLInputElement
      ? container
      : container.querySelector<HTMLInputElement>('input[id^="react-select"]');

  if (!input) return false;

  input.focus();
  setInputValue(input, value);

  await new Promise(resolve => setTimeout(resolve, 600));

  const menu = document.querySelector<HTMLElement>(
    '[class*="__menu"] [class*="__option"]'
  );

  if (menu) {
    menu.click();
    return true;
  }

  return false;
}

function handleInsertMessage(message: InsertMessage) {
  const adapter = findAdapterForHost(window.location.hostname);
  if (!adapter) {
    return {
      ok: false,
      error: 'This page is not wired for Jovie inserts yet.',
    };
  }

  const targetElement = getActiveEditableElement(document);
  const target = getMatchingTarget(adapter, targetElement);

  if (!target || !targetElement) {
    return {
      ok: false,
      error: 'Focus a supported field before inserting.',
    };
  }

  if (
    targetElement instanceof HTMLInputElement ||
    targetElement instanceof HTMLTextAreaElement
  ) {
    insertIntoInput(targetElement, message.value);
  } else {
    insertIntoContentEditable(targetElement, message.value);
  }

  return {
    ok: true,
    adapterId: adapter.id,
    targetLabel: target.label,
  };
}

interface BulkInsertFieldResult {
  readonly selector: string;
  readonly previousValue: string | null;
  readonly nextValue: string;
  readonly applied: boolean;
}

async function handleBulkInsertMessage(message: BulkInsertMessage) {
  const adapter = findAdapterForHost(window.location.hostname);
  if (!adapter) {
    return {
      ok: false,
      error: 'This page is not wired for Jovie inserts yet.',
    };
  }

  const results: BulkInsertFieldResult[] = [];
  let appliedCount = 0;
  const failedTargets: string[] = [];

  for (const field of message.fields) {
    const element = document.querySelector<HTMLElement>(field.selector);

    if (!element) {
      failedTargets.push(field.selector);
      results.push({
        selector: field.selector,
        previousValue: null,
        nextValue: field.value,
        applied: false,
      });
      continue;
    }

    if (isReactSelectInput(element)) {
      const previousValue = '';
      const filled = await fillReactSelect(element, field.value);
      if (filled) {
        appliedCount += 1;
        results.push({
          selector: field.selector,
          previousValue,
          nextValue: field.value,
          applied: true,
        });
      } else {
        failedTargets.push(field.selector);
        results.push({
          selector: field.selector,
          previousValue: null,
          nextValue: field.value,
          applied: false,
        });
      }
    } else if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      const previousValue = element.value;
      setInputValue(element, field.value);
      appliedCount += 1;
      results.push({
        selector: field.selector,
        previousValue,
        nextValue: field.value,
        applied: true,
      });
    } else if (element.isContentEditable) {
      const previousValue = element.textContent;
      insertIntoContentEditable(element, field.value);
      appliedCount += 1;
      results.push({
        selector: field.selector,
        previousValue,
        nextValue: field.value,
        applied: true,
      });
    } else {
      failedTargets.push(field.selector);
      results.push({
        selector: field.selector,
        previousValue: null,
        nextValue: field.value,
        applied: false,
      });
    }
  }

  return {
    ok: true,
    adapterId: adapter.id,
    appliedCount,
    failedTargets,
    undoSnapshot: results,
  };
}

const LABEL_ALIASES: ReadonlyMap<string, readonly string[]> = new Map([
  ['project name', ['release title']],
  ['project code', ['release title']],
  ['project artist', ['display name']],
  ['song title', ['release title']],
]);

function slugifyForCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
}

function findFieldForTarget(
  targetLabel: string,
  fields: readonly AutofillField[]
): AutofillField | null {
  const lower = targetLabel.toLowerCase();
  const direct = fields.find(f => f.label.toLowerCase() === lower);
  if (direct) return direct;

  const aliases = LABEL_ALIASES.get(lower);
  if (!aliases) return null;

  for (const alias of aliases) {
    const match = fields.find(f => f.label.toLowerCase() === alias);
    if (match) return match;
  }
  return null;
}

async function handleAutofillMessage(message: AutofillMessage) {
  const adapter = findAdapterForHost(window.location.hostname);
  if (!adapter) {
    return {
      ok: false,
      error: 'This page is not wired for Jovie inserts yet.',
    };
  }

  const selectorFields: BulkInsertField[] = [];
  for (const target of adapter.targets) {
    const field = findFieldForTarget(target.label, message.fields);
    if (field) {
      const value =
        target.label.toLowerCase() === 'project code'
          ? slugifyForCode(field.value)
          : field.value;
      selectorFields.push({ selector: target.selector, value });
    }
  }

  if (selectorFields.length === 0) {
    return {
      ok: false,
      error: 'No matching form fields found on this page.',
    };
  }

  return handleBulkInsertMessage({
    type: 'jovie:bulk-insert',
    fields: selectorFields,
  });
}

function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }

  return (
    value.type === 'jovie:get-insert-preview' ||
    (value.type === 'jovie:insert-text' &&
      'value' in value &&
      typeof value.value === 'string') ||
    (value.type === 'jovie:bulk-insert' &&
      'fields' in value &&
      Array.isArray(value.fields)) ||
    (value.type === 'jovie:autofill' &&
      'fields' in value &&
      Array.isArray(value.fields))
  );
}

chrome?.runtime?.onMessage.addListener(
  (
    message: unknown,
    _sender: ChromeRuntimeMessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    if (!isRuntimeMessage(message)) {
      return;
    }

    if (message.type === 'jovie:get-insert-preview') {
      sendResponse(buildPreviewResponse(window.location.hostname, document));
      return true;
    }

    if (message.type === 'jovie:bulk-insert') {
      handleBulkInsertMessage(message)
        .then(sendResponse)
        .catch(() => sendResponse({ ok: false, error: 'Bulk insert failed.' }));
      return true;
    }

    if (message.type === 'jovie:autofill') {
      handleAutofillMessage(message)
        .then(sendResponse)
        .catch(() => sendResponse({ ok: false, error: 'Autofill failed.' }));
      return true;
    }

    sendResponse(handleInsertMessage(message));
    return true;
  }
);
