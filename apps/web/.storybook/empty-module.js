// Empty module for Node.js compatibility in Storybook
// Stubs server-only APIs (next/cache, next/headers, node:async_hooks)
export const AsyncLocalStorage = class MockAsyncLocalStorage {
  constructor() {}
  run(store, callback, ...args) {
    return callback(...args);
  }
  getStore() {
    return undefined;
  }
};

// next/cache stubs
export function revalidatePath() {}
export function revalidateTag() {}
export function unstable_cache(fn) {
  return fn;
}
export function unstable_noStore() {}
export function updateTag() {}

// next/headers stubs
export function cookies() {
  return {
    get: () => undefined,
    getAll: () => [],
    set: () => {},
    delete: () => {},
    has: () => false,
  };
}
export function headers() {
  return new Map();
}
export function draftMode() {
  return { isEnabled: false, enable: () => {}, disable: () => {} };
}
