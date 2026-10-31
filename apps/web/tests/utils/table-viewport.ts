import { afterAll, beforeAll } from 'vitest';

/**
 * Opt a DOM integration suite into a measured table viewport. jsdom has no
 * layout; virtual tables must not treat its zero-height elements as visible.
 * This leaves the real virtualizer and bounded row rendering in place.
 */
export function mockTableViewport() {
  function height(this: HTMLElement) {
    if (this.tagName !== 'TR') return 640;
    return Number.parseFloat(
      this.closest('table')?.style.getPropertyValue('--table-row-height') ||
        '40'
    );
  }
  const properties = [
    [HTMLElement.prototype, 'offsetHeight', height],
    [HTMLElement.prototype, 'offsetWidth', () => 1024],
    [Element.prototype, 'clientHeight', height],
    [Element.prototype, 'clientWidth', () => 1024],
  ] as const;
  const originals = properties.map(([prototype, property]) =>
    Object.getOwnPropertyDescriptor(prototype, property)
  );
  beforeAll(() => {
    for (const [prototype, property, get] of properties) {
      Object.defineProperty(prototype, property, { configurable: true, get });
    }
  });
  afterAll(() => {
    properties.forEach(([prototype, property], index) => {
      const descriptor = originals[index];
      if (descriptor) Object.defineProperty(prototype, property, descriptor);
      else Reflect.deleteProperty(prototype, property);
    });
  });
}
