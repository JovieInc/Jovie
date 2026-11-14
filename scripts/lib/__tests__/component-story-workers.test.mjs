import { describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_LIVE_STORIES,
  LIVE_VIEWPORTS,
} from '../../component-live-storybook-certification.mjs';
import {
  collectStoryMatrix,
  LIVE_STORY_WORKERS,
} from '../component-story-workers.mjs';

describe('bounded live Storybook observation matrix', () => {
  const deferred = () => {
    /** @type {(value?: unknown) => void} */
    let resolve = () => {};
    /** @type {(reason?: unknown) => void} */
    let reject = () => {};
    const promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  };
  const fixture = () => {
    const contexts = [];
    const browser = {
      newContext: async () => {
        const context = {
          page: { worker: contexts.length },
          close: vi.fn(async () => {}),
          newPage: async () => context.page,
        };
        contexts.push(context);
        return context;
      },
    };
    return { browser, contexts };
  };

  it('overlaps two isolated workers while preserving the complete story/viewport order', async () => {
    const { browser, contexts } = fixture();
    const releaseFirst = deferred();
    const overlap = deferred();
    const stories = CANONICAL_LIVE_STORIES.slice(0, 2);
    const observed = [];
    const run = collectStoryMatrix({
      viewports: LIVE_VIEWPORTS,
      browser,
      stories,
      measure: async (page, story, viewport) => {
        const id = `${story.id}@${viewport.id}`;
        observed.push({ id, worker: page.worker });
        if (observed.length === 1) await releaseFirst.promise;
        else overlap.resolve();
        return id;
      },
    });
    await overlap.promise;
    expect(contexts).toHaveLength(LIVE_STORY_WORKERS);
    expect(observed[0].worker).not.toBe(observed[1].worker);
    releaseFirst.resolve();
    expect(await run).toEqual(
      stories.flatMap(story => LIVE_VIEWPORTS.map(v => `${story.id}@${v.id}`))
    );
    expect(observed).toHaveLength(stories.length * LIVE_VIEWPORTS.length);
    for (const context of contexts)
      expect(context.close).toHaveBeenCalledOnce();
  });

  it('stops admitting checks on a failure, drains active work and closes both contexts', async () => {
    const { browser, contexts } = fixture();
    const first = deferred();
    const second = deferred();
    const started = deferred();
    let calls = 0;
    const run = collectStoryMatrix({
      viewports: LIVE_VIEWPORTS,
      browser,
      stories: CANONICAL_LIVE_STORIES,
      measure: async () => {
        const position = calls++;
        if (calls === 2) started.resolve();
        return position === 0 ? first.promise : second.promise;
      },
    });
    const result = expect(run).rejects.toThrow('measured failure');
    await started.promise;
    first.reject(new Error('measured failure'));
    // Drain the failed worker before releasing the other active observation.
    await vi.waitFor(() => expect(contexts[0].close).toHaveBeenCalledOnce());
    expect(contexts[1].close).not.toHaveBeenCalled();
    second.resolve('complete');
    await result;
    expect(calls).toBe(2);
    for (const context of contexts)
      expect(context.close).toHaveBeenCalledOnce();
  });

  it('fails closed on cancellation and context startup or cleanup failure', async () => {
    const { browser, contexts } = fixture();
    const controller = new AbortController();
    const measure = vi.fn(async () => {
      controller.abort();
      return 'observed';
    });
    await expect(
      collectStoryMatrix({
        viewports: LIVE_VIEWPORTS,
        browser,
        stories: CANONICAL_LIVE_STORIES,
        concurrency: 1,
        signal: controller.signal,
        measure,
      })
    ).rejects.toThrow('aborted');
    expect(measure).toHaveBeenCalledOnce();
    expect(contexts[0].close).toHaveBeenCalledOnce();
    const beforeLaunch = fixture();
    await expect(
      collectStoryMatrix({
        viewports: LIVE_VIEWPORTS,
        browser: beforeLaunch.browser,
        stories: CANONICAL_LIVE_STORIES,
        signal: controller.signal,
        measure: async () => undefined,
      })
    ).rejects.toThrow('aborted');
    expect(beforeLaunch.contexts).toHaveLength(0);
    const finalController = new AbortController();
    let completed = 0;
    await expect(
      collectStoryMatrix({
        viewports: LIVE_VIEWPORTS,
        browser,
        stories: CANONICAL_LIVE_STORIES.slice(0, 1),
        concurrency: 1,
        signal: finalController.signal,
        measure: async () => {
          if (++completed === LIVE_VIEWPORTS.length) finalController.abort();
          return 'observed';
        },
      })
    ).rejects.toThrow('aborted');
    const broken = fixture();
    await expect(
      collectStoryMatrix({
        viewports: LIVE_VIEWPORTS,
        browser: {
          newContext: async () => {
            const context = await broken.browser.newContext();
            context.close.mockRejectedValue(new Error('cleanup failed'));
            return context;
          },
        },
        stories: CANONICAL_LIVE_STORIES.slice(0, 1),
        concurrency: 1,
        measure: async () => 'observed',
      })
    ).rejects.toThrow('cleanup failed');
    await expect(
      collectStoryMatrix({
        viewports: LIVE_VIEWPORTS,
        browser: {
          newContext: async () => {
            throw new Error('startup failed');
          },
        },
        stories: CANONICAL_LIVE_STORIES,
        concurrency: 1,
        measure: async () => undefined,
      })
    ).rejects.toThrow('startup failed');
  });

  it('interrupts active observations on external abort and removes its listener after draining', async () => {
    const { browser, contexts } = fixture();
    const pending = [deferred(), deferred()];
    const started = deferred();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    let calls = 0;
    const run = collectStoryMatrix({
      viewports: LIVE_VIEWPORTS,
      browser,
      stories: CANONICAL_LIVE_STORIES,
      signal: controller.signal,
      measure: async page => {
        contexts[page.worker].close.mockImplementation(async () => {
          pending[page.worker].reject(new Error('Target closed'));
        });
        if (++calls === LIVE_STORY_WORKERS) started.resolve();
        return pending[page.worker].promise;
      },
    });
    const result = expect(run).rejects.toThrow('aborted');
    await started.promise;
    controller.abort();
    await result;
    expect(calls).toBe(LIVE_STORY_WORKERS);
    for (const context of contexts)
      expect(context.close).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('closes a context created after cancellation without starting an observation', async () => {
    const { browser, contexts } = fixture();
    const created = deferred();
    const controller = new AbortController();
    const measure = vi.fn();
    const run = collectStoryMatrix({
      viewports: LIVE_VIEWPORTS,
      browser: { newContext: () => created.promise },
      stories: CANONICAL_LIVE_STORIES,
      concurrency: 1,
      signal: controller.signal,
      measure,
    });
    const result = expect(run).rejects.toThrow('aborted');
    controller.abort();
    created.resolve(await browser.newContext());
    await result;
    expect(measure).not.toHaveBeenCalled();
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });

  it('rejects unbounded concurrency before launching a browser context', async () => {
    const { browser, contexts } = fixture();
    for (const concurrency of [0, -1, 1.5, LIVE_STORY_WORKERS + 1]) {
      await expect(
        collectStoryMatrix({
          viewports: LIVE_VIEWPORTS,
          browser,
          stories: CANONICAL_LIVE_STORIES,
          concurrency,
          measure: async () => undefined,
        })
      ).rejects.toThrow('workers must be between');
    }
    expect(contexts).toHaveLength(0);
  });
});
