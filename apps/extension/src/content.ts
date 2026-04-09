declare const chrome: ChromeGlobal | undefined;

import {
  buildPreviewResponse,
  findAdapterForHost,
  getActiveEditableElement,
  getMatchingTarget,
} from './content-adapters';
import { buildWorkflowPreviewResponse } from './distrokid-workflow';

export {};

type InsertMessage = {
  readonly type: 'jovie:insert-text';
  readonly value: string;
};

type PreviewMessage = {
  readonly type: 'jovie:get-insert-preview';
};

type WorkflowPreviewMessage = {
  readonly type: 'jovie:get-workflow-preview';
};

type RuntimeMessage = InsertMessage | PreviewMessage | WorkflowPreviewMessage;

function insertIntoInput(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  const nextValue =
    element.value.slice(0, start) + value + element.value.slice(end);

  element.value = nextValue;
  const caretPosition = start + value.length;
  element.selectionStart = caretPosition;
  element.selectionEnd = caretPosition;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
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

function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }

  return (
    value.type === 'jovie:get-workflow-preview' ||
    value.type === 'jovie:get-insert-preview' ||
    (value.type === 'jovie:insert-text' &&
      'value' in value &&
      typeof value.value === 'string')
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

    if (message.type === 'jovie:get-workflow-preview') {
      sendResponse(
        buildWorkflowPreviewResponse(window.location.hostname, document)
      );
      return true;
    }

    sendResponse(handleInsertMessage(message));
    return true;
  }
);
