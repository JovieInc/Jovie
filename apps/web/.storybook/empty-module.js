// Empty module for Node.js compatibility in Storybook
export const AsyncLocalStorage = class MockAsyncLocalStorage {
  constructor() {}
  run(store, callback, ...args) {
    return callback(...args);
  }
  getStore() {
    return undefined;
  }
};
