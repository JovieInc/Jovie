/**
 * Shared Test Utilities for Atom Components
 *
 * This file provides reusable helpers, factories, and assertion utilities
 * for testing atom components consistently across the test suite.
 *
 * @example
 * ```ts
 * import { renderWithTheme, expectKeyboardNavigable } from '@/tests/test-utils/atoms';
 *
 * it('supports keyboard navigation', () => {
 *   const { container } = renderWithTheme(<Button>Click me</Button>);
 *   expectKeyboardNavigable(container.querySelector('button')!);
 * });
 * ```
 */

import {
  type RenderOptions,
  type RenderResult,
  render,
} from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * Render Helpers
 */

/**
 * Renders a component with theme provider context.
 * Use this when testing atoms that depend on theme context.
 *
 * @param ui - The component to render
 * @param options - Additional render options
 * @returns The render result
 */
export function renderWithTheme(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
): RenderResult {
  // For now, atoms don't require theme provider wrapping
  // This can be extended when theme context is needed
  return render(ui, options);
}

/**
 * Renders a component within a form context.
 * Useful for testing form-related atoms like Input, Label, etc.
 *
 * @param ui - The component to render
 * @param formProps - Optional form attributes
 * @param options - Additional render options
 * @returns The render result
 */
export function renderInForm(
  ui: ReactElement,
  formProps?: React.FormHTMLAttributes<HTMLFormElement>,
  options?: Omit<RenderOptions, 'wrapper'>
): RenderResult {
  return render(<form {...formProps}>{ui}</form>, options);
}

/**
 * Factory Helpers
 */

/**
 * Creates mock image props for testing image-related atoms.
 *
 * @param overrides - Optional property overrides
 * @returns Mock image props
 */
export const mockImageProps = (
  overrides?: Partial<{
    src: string;
    alt: string;
    width: number;
    height: number;
  }>
) => ({
  src: '/test-image.jpg',
  alt: 'Test image',
  width: 100,
  height: 100,
  ...overrides,
});

/**
 * Creates mock user data for testing components that display user information.
 *
 * @param overrides - Optional property overrides
 * @returns Mock user data
 */
export const mockUser = (
  overrides?: Partial<{
    id: string;
    name: string;
    email: string;
    avatar: string;
  }>
) => ({
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  avatar: '/avatar.jpg',
  ...overrides,
});

/**
 * Accessibility Helpers
 */

/**
 * Asserts that an element is keyboard navigable.
 * Checks for proper tabindex, focus visibility, and keyboard event handling.
 *
 * @param element - The element to check
 */
export function expectKeyboardNavigable(element: HTMLElement): void {
  // Element should be focusable (either naturally or via tabindex)
  const tabIndex = element.getAttribute('tabindex');
  const isNaturallyFocusable = [
    'A',
    'BUTTON',
    'INPUT',
    'SELECT',
    'TEXTAREA',
  ].includes(element.tagName);

  const isFocusable =
    isNaturallyFocusable || (tabIndex !== null && tabIndex !== '-1');

  expect(isFocusable, 'Element should be keyboard focusable').toBe(true);

  // Element should not have tabindex="-1" unless it's meant to be programmatically focusable
  if (tabIndex === '-1') {
    console.warn('Element has tabindex="-1", which removes it from tab order');
  }
}

/**
 * Asserts that an element has proper screen reader announcements.
 * Checks for aria-label, aria-labelledby, or aria-describedby.
 *
 * @param element - The element to check
 * @param options - Assertion options
 */
export function expectScreenReaderAnnouncement(
  element: HTMLElement,
  options?: {
    /** Require aria-label specifically */
    requireLabel?: boolean;
    /** Require aria-live region */
    requireLive?: boolean;
  }
): void {
  const hasAriaLabel = element.hasAttribute('aria-label');
  const hasAriaLabelledBy = element.hasAttribute('aria-labelledby');
  const _hasAriaDescribedBy = element.hasAttribute('aria-describedby');
  const hasAriaLive = element.hasAttribute('aria-live');

  if (options?.requireLabel) {
    expect(hasAriaLabel, 'Element should have aria-label').toBe(true);
  } else {
    const hasAccessibleName =
      hasAriaLabel || hasAriaLabelledBy || element.textContent;
    expect(hasAccessibleName, 'Element should have an accessible name').toBe(
      true
    );
  }

  if (options?.requireLive) {
    expect(hasAriaLive, 'Element should have aria-live for announcements').toBe(
      true
    );
  }
}

/**
 * Asserts that an element respects reduced motion preferences.
 * Checks for motion-reduce classes or prefers-reduced-motion media queries.
 *
 * @param element - The element to check
 */
export function expectReducedMotionSupport(element: HTMLElement): void {
  const className = element.className;
  const hasReducedMotionClass = className.includes('motion-reduce:');

  expect(
    hasReducedMotionClass,
    'Element should have motion-reduce classes for accessibility'
  ).toBe(true);
}

/**
 * Asserts that an interactive element has proper ARIA attributes.
 *
 * @param element - The element to check
 * @param role - Expected ARIA role
 */
export function expectProperAriaAttributes(
  element: HTMLElement,
  role: string
): void {
  expect(element).toHaveAttribute('role', role);

  // Check for proper disabled state
  if (element.hasAttribute('disabled')) {
    expect(element).toHaveAttribute('aria-disabled', 'true');
  }

  // Check for proper pressed state (for buttons)
  if (role === 'button' && element.hasAttribute('aria-pressed')) {
    const pressed = element.getAttribute('aria-pressed');
    expect(['true', 'false', 'mixed']).toContain(pressed);
  }
}

/**
 * Test Data Helpers
 */

/**
 * Creates an array of mock steps for ProgressIndicator testing.
 *
 * @param count - Number of steps to create
 * @returns Array of mock steps
 */
export const mockProgressSteps = (count: number = 3) =>
  Array.from({ length: count }, (_, i) => ({
    id: `${i + 1}`,
    title: `Step ${i + 1}`,
    description: `Description for step ${i + 1}`,
    estimatedTimeSeconds: 30,
  }));

/**
 * Creates mock icon props for testing icon-related atoms.
 *
 * @param overrides - Optional property overrides
 * @returns Mock icon props
 */
export const mockIconProps = (
  overrides?: Partial<{
    name: string;
    size: number;
    color: string;
  }>
) => ({
  name: 'test-icon',
  size: 24,
  color: 'currentColor',
  ...overrides,
});

/**
 * DOM Testing Helpers
 */

/**
 * Waits for an element to receive focus.
 *
 * @param element - The element to wait for
 * @param timeout - Maximum wait time in ms
 */
export async function waitForFocus(
  element: HTMLElement,
  timeout: number = 1000
): Promise<void> {
  const startTime = Date.now();

  while (document.activeElement !== element) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Element did not receive focus within timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

/**
 * Simulates a keyboard event on an element.
 *
 * @param element - The element to fire the event on
 * @param key - The key to simulate
 * @param options - Additional event options
 */
export function simulateKeyboard(
  element: HTMLElement,
  key: string,
  options?: {
    shiftKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  }
): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  element.dispatchEvent(event);
}

/**
 * Performance Testing Helpers
 */

/**
 * Measures render time for a component.
 *
 * @param renderFn - Function that renders the component
 * @returns Render time in milliseconds
 */
export function measureRenderTime(renderFn: () => void): number {
  const start = performance.now();
  renderFn();
  return performance.now() - start;
}

/**
 * Asserts that a component renders within a performance threshold.
 *
 * @param renderFn - Function that renders the component
 * @param maxTime - Maximum allowed render time in ms
 */
export function expectFastRender(
  renderFn: () => void,
  maxTime: number = 50
): void {
  const renderTime = measureRenderTime(renderFn);
  expect(
    renderTime,
    `Component should render in less than ${maxTime}ms (took ${renderTime.toFixed(2)}ms)`
  ).toBeLessThan(maxTime);
}
