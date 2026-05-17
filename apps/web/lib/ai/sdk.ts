import * as ai from 'ai';
import { wrapAISDK } from 'braintrust';

// wrapAISDK returns a Proxy. Defer the wrap and per-key access to call time
// so partial vi.mock('ai') in unit tests doesn't fault on sibling exports
// the test never invokes.
let cachedWrapped: typeof ai | null = null;
function getWrapped(): typeof ai {
  if (!cachedWrapped) cachedWrapped = wrapAISDK(ai);
  return cachedWrapped;
}

export const generateText: typeof ai.generateText = (...args) =>
  getWrapped().generateText(...args);

export const streamText: typeof ai.streamText = (...args) =>
  getWrapped().streamText(...args);

export const generateObject: typeof ai.generateObject = (...args) =>
  getWrapped().generateObject(...args);

export const streamObject: typeof ai.streamObject = (...args) =>
  getWrapped().streamObject(...args);

export type * from 'ai';
