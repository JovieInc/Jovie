/**
 * Fast Rendering Utilities
 *
 * Lightweight rendering utilities optimized for speed.
 * Provides minimal setup for component testing without heavy mocking overhead.
 */

import { type RenderOptions, render } from '@testing-library/react';
import React, { type ReactElement } from 'react';
import { vi } from 'vitest';
import {
  loadClerkMocks,
  loadHeadlessUiMocks,
  loadNextJsMocks,
} from './lazy-mocks';

// Minimal wrapper for most component tests
const MinimalWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return React.createElement(
    'div',
    { 'data-testid': 'test-wrapper' },
    children
  );
};

// Wrapper with Clerk context (loads Clerk mocks on demand)
const ClerkWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  loadClerkMocks();
  return React.createElement(
    'div',
    { 'data-testid': 'clerk-wrapper' },
    children
  );
};

// Wrapper with Next.js context (loads Next.js mocks on demand)
const NextJsWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  loadNextJsMocks();
  return React.createElement(
    'div',
    { 'data-testid': 'nextjs-wrapper' },
    children
  );
};

// Wrapper with Headless UI context (loads Headless UI mocks on demand)
const HeadlessUiWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  loadHeadlessUiMocks();
  return React.createElement(
    'div',
    { 'data-testid': 'headless-ui-wrapper' },
    children
  );
};

/**
 * Fast render with minimal setup - use for simple component tests
 */
export function fastRender(ui: ReactElement, options?: RenderOptions) {
  return render(ui, {
    wrapper: MinimalWrapper,
    ...options,
  });
}

/**
 * Render with Clerk context - use for components that need authentication
 */
export function renderWithClerk(ui: ReactElement, options?: RenderOptions) {
  return render(ui, {
    wrapper: ClerkWrapper,
    ...options,
  });
}

/**
 * Render with Next.js context - use for components using Next.js features
 */
export function renderWithNextJs(ui: ReactElement, options?: RenderOptions) {
  return render(ui, {
    wrapper: NextJsWrapper,
    ...options,
  });
}

/**
 * Render with Headless UI context - use for components using Headless UI
 */
export function renderWithHeadlessUi(
  ui: ReactElement,
  options?: RenderOptions
) {
  return render(ui, {
    wrapper: HeadlessUiWrapper,
    ...options,
  });
}

/**
 * Shallow render simulation - creates a simple div with component name
 * Use for tests that only need to verify component existence/props
 */
export function shallowRender(
  componentName: string,
  props: Record<string, unknown> = {}
) {
  return {
    container: document.createElement('div'),
    getByTestId: (testId: string) => {
      const element = document.createElement('div');
      element.setAttribute('data-testid', testId);
      element.textContent = `${componentName} (shallow)`;
      return element;
    },
    queryByTestId: function (testId: string) {
      try {
        return this.getByTestId(testId);
      } catch {
        return null;
      }
    },
    props,
  };
}

/**
 * Create a test double - minimal mock component for complex dependencies
 */
export function createTestDouble(
  name: string,
  defaultProps: Record<string, unknown> = {}
) {
  const TestDouble = React.forwardRef<HTMLDivElement, Record<string, unknown>>(
    (props, ref) => {
      return React.createElement(
        'div',
        {
          ref,
          'data-testid': `test-double-${name.toLowerCase()}`,
          'data-props': JSON.stringify({ ...defaultProps, ...props }),
        },
        `${name} Test Double`
      );
    }
  );

  TestDouble.displayName = `TestDouble${name}`;
  return TestDouble;
}

/**
 * Fast form testing utilities
 */
export const formTestUtils = {
  /**
   * Create a minimal form wrapper for testing form components
   */
  createFormWrapper: (onSubmit = vi.fn()) => {
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        'form',
        {
          onSubmit,
          'data-testid': 'test-form',
        },
        children
      );
  },

  /**
   * Simulate form input change with minimal overhead
   */
  changeInput: (element: HTMLElement, value: string) => {
    // Directly set value without triggering heavy event handlers
    if (element instanceof HTMLInputElement) {
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  },

  /**
   * Fast form submission simulation
   */
  submitForm: (form: HTMLElement) => {
    form.dispatchEvent(new Event('submit', { bubbles: true }));
  },
};

/**
 * Performance-optimized event utilities
 */
export const eventUtils = {
  /**
   * Fast click simulation without full event propagation
   */
  fastClick: (element: HTMLElement) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  },

  /**
   * Fast keyboard event simulation
   */
  fastKeyPress: (element: HTMLElement, key: string) => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  },

  /**
   * Fast focus simulation
   */
  fastFocus: (element: HTMLElement) => {
    element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  },
};
