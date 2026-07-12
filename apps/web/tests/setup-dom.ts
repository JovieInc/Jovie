import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import './setup-common';
import './setup-browser';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
