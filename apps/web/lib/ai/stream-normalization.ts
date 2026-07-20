/**
 * WHATWG stream normalization for the `@/lib/ai` boundary.
 *
 * The AI SDK's `AsyncIterableStream<T>` contract is `ReadableStream<T> &
 * AsyncIterable<T>`: server response paths call `pipeThrough`/`tee` (WHATWG
 * half) while eval and mobile consumers use `for await` (iterable half).
 * Wrappers applied at this boundary (e.g. the output leak guard's guarded
 * streams in `lib/eval/leak-guard.ts`) must preserve BOTH halves. Handing a
 * bare async generator to `toUIMessageStreamResponse()` crashes inside the
 * SDK's `createUIMessageStreamResponse` with
 * `TypeError: stream.pipeThrough is not a function` (JOV-3694 / JOV-3693).
 */

/**
 * Normalizes any `AsyncIterable` into a genuine WHATWG `ReadableStream` that
 * stays async-iterable, restoring the full `AsyncIterableStream` contract.
 *
 * - Streams that already satisfy the WHATWG surface pass through untouched —
 *   no re-piping, no extra buffering.
 * - Bare async iterables (e.g. generator-based guarded streams) are pumped
 *   into a real `ReadableStream`; cancellation propagates to the source
 *   iterator so upstream generators and model streams clean up.
 */
export function toWhatwgReadableStream<T>(
  source: AsyncIterable<T>
): ReadableStream<T> & AsyncIterable<T> {
  const stream = isWhatwgReadableStream(source)
    ? source
    : pumpAsyncIterableIntoReadableStream(source);
  return ensureAsyncIterable(stream);
}

/**
 * Duck-typed WHATWG check instead of `instanceof ReadableStream`: streams can
 * cross module realms (Turbopack), where constructor identity differs.
 */
function isWhatwgReadableStream<T>(
  source: AsyncIterable<T>
): source is ReadableStream<T> & AsyncIterable<T> {
  const candidate = source as Partial<ReadableStream<T>>;
  return (
    typeof candidate.pipeThrough === 'function' &&
    typeof candidate.getReader === 'function' &&
    typeof candidate.tee === 'function'
  );
}

function pumpAsyncIterableIntoReadableStream<T>(
  source: AsyncIterable<T>
): ReadableStream<T> {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason);
    },
  });
}

/**
 * Node's `ReadableStream` is natively async-iterable; other runtimes' are
 * not. Attach the same reader-based iterator the AI SDK's own
 * `createAsyncIterableStream` uses when it is missing.
 */
function ensureAsyncIterable<T>(
  stream: ReadableStream<T>
): ReadableStream<T> & AsyncIterable<T> {
  const candidate = stream as ReadableStream<T> & Partial<AsyncIterable<T>>;
  if (typeof candidate[Symbol.asyncIterator] === 'function') {
    return candidate as ReadableStream<T> & AsyncIterable<T>;
  }

  // Patch through a loose alias: the DOM lib types the built-in
  // `[Symbol.asyncIterator]` as a richer `ReadableStreamAsyncIterator`, which
  // only exists where the native method is already present.
  const patchTarget = candidate as unknown as {
    [Symbol.asyncIterator]?: (this: ReadableStream<T>) => AsyncIterator<T>;
  };
  patchTarget[Symbol.asyncIterator] = function asyncIterator(
    this: ReadableStream<T>
  ): AsyncIterator<T> {
    const reader = this.getReader();
    return {
      async next(): Promise<IteratorResult<T>> {
        const { done, value } = await reader.read();
        if (done) {
          reader.releaseLock();
          return { done: true, value: undefined };
        }
        return { done: false, value };
      },
      async return(): Promise<IteratorResult<T>> {
        await reader.cancel();
        reader.releaseLock();
        return { done: true, value: undefined };
      },
    };
  };

  return candidate as ReadableStream<T> & AsyncIterable<T>;
}
