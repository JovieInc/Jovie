export const LARGE_PASTE_THRESHOLD = 4096;
export const LARGE_PASTE_CHUNK_SIZE = 2048;

export interface InsertLargeTextAtCaretOptions {
  readonly textarea: HTMLTextAreaElement;
  readonly pastedText: string;
  readonly currentValue: string;
  readonly onValueChange: (value: string) => void;
  readonly maxLength?: number;
  readonly chunkSize?: number;
  readonly schedule?: (work: () => void) => void;
}

function defaultSchedule(work: () => void): void {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(work);
    return;
  }
  globalThis.setTimeout(work, 0);
}

function selectionBounds(
  textarea: HTMLTextAreaElement,
  currentValue: string
): { start: number; end: number } {
  const start = textarea.selectionStart ?? currentValue.length;
  const end = textarea.selectionEnd ?? start;
  return { start, end };
}

/**
 * Insert very large pasted text in chunks so React state updates do not block
 * the main thread in a single synchronous paste handler.
 */
export function insertLargeTextAtCaret({
  textarea,
  pastedText,
  currentValue,
  onValueChange,
  maxLength = Number.POSITIVE_INFINITY,
  chunkSize = LARGE_PASTE_CHUNK_SIZE,
  schedule = defaultSchedule,
}: InsertLargeTextAtCaretOptions): void {
  if (!pastedText) return;

  const { start, end } = selectionBounds(textarea, currentValue);
  const replacedLength = end - start;
  const availableLength = Math.max(
    0,
    maxLength - currentValue.length + replacedLength
  );
  const textToInsert = pastedText.slice(0, availableLength);
  if (textToInsert.length === 0) return;

  const prefix = currentValue.slice(0, start);
  const suffix = currentValue.slice(end);
  const chunks: string[] = [];
  for (let index = 0; index < textToInsert.length; index += chunkSize) {
    chunks.push(textToInsert.slice(index, index + chunkSize));
  }

  let workingValue = `${prefix}${suffix}`;
  let insertAt = start;

  const finish = () => {
    schedule(() => {
      textarea.setSelectionRange(insertAt, insertAt);
    });
  };

  const applyChunk = (chunkIndex: number) => {
    const chunk = chunks[chunkIndex];
    if (!chunk) {
      finish();
      return;
    }

    workingValue =
      workingValue.slice(0, insertAt) + chunk + workingValue.slice(insertAt);
    insertAt += chunk.length;
    onValueChange(workingValue);

    if (chunkIndex + 1 >= chunks.length) {
      finish();
      return;
    }

    schedule(() => applyChunk(chunkIndex + 1));
  };

  schedule(() => applyChunk(0));
}

export function shouldChunkLargePaste(textLength: number): boolean {
  return textLength >= LARGE_PASTE_THRESHOLD;
}
