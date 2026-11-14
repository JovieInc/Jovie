// Bound browser memory while overlapping independent story/viewport checks.
export const LIVE_STORY_WORKERS = 2;

/**
 * @template TPage, TStory, TObservation
 * @param {{
 *   browser: { newContext: (options: { baseURL?: string }) => Promise<{ newPage: () => Promise<TPage>, close: () => Promise<void> }> },
 *   stories: readonly TStory[],
 *   viewports: readonly { id: string, width: number, height: number }[],
 *   baseURL?: string,
 *   axePath?: string,
 *   signal?: AbortSignal,
 *   concurrency?: number,
 *   measure: (page: TPage, story: TStory, viewport: { id: string, width: number, height: number }, axePath?: string) => Promise<TObservation>,
 * }} options
 * @returns {Promise<TObservation[]>}
 */
export async function collectStoryMatrix({
  browser,
  stories,
  viewports,
  baseURL,
  axePath,
  signal,
  concurrency = LIVE_STORY_WORKERS,
  measure,
}) {
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > LIVE_STORY_WORKERS
  ) {
    throw new Error(
      `live Storybook workers must be between 1 and ${LIVE_STORY_WORKERS}`
    );
  }
  if (signal?.aborted)
    throw new Error('live Storybook collect aborted; fail closed');
  const jobs = stories.flatMap(story =>
    viewports.map(viewport => ({ story, viewport }))
  );
  const observations = new Array(jobs.length);
  let next = 0;
  let failed = false;
  let failure;
  const recordFailure = error => {
    if (!failed) failure = error;
    failed = true;
  };
  const contexts = new Map();
  const closeContext = context => {
    if (!context) return;
    if (!contexts.get(context)) {
      contexts.set(
        context,
        Promise.resolve()
          .then(() => context.close())
          .catch(recordFailure)
      );
    }
    return contexts.get(context);
  };
  const onAbort = () => {
    recordFailure(new Error('live Storybook collect aborted; fail closed'));
    // Closing the context interrupts active goto/evaluate/axe operations;
    // checking the signal only between observations cannot bound a hung one.
    for (const context of contexts.keys()) closeContext(context);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  const worker = async () => {
    let context;
    try {
      context = await browser.newContext({ baseURL });
      contexts.set(context, null);
      if (failed) return;
      const page = await context.newPage();
      while (!failed && next < jobs.length) {
        const index = next++;
        const { story, viewport } = jobs[index];
        observations[index] = await measure(page, story, viewport, axePath);
      }
    } catch (error) {
      recordFailure(error);
    } finally {
      await closeContext(context);
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, jobs.length) }, worker)
    );
    if (failed) throw failure;
    return observations;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
