/**
 * jsdom has no layout: give fit items 100px rows inside a container of
 * `height` px so the "+N more" path is exercised.
 */
export function mockFitLayout(testId: string, height: number): () => void {
  const top = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetTop'
  );
  const tall = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight'
  );
  const client = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'clientHeight'
  );
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement
        ? Array.from(this.parentElement.children).indexOf(this) * 100
        : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 100,
  });
  Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true,
    get(this: Element) {
      return this.getAttribute('data-testid') === testId ? height : 0;
    },
  });
  return () => {
    if (top) Object.defineProperty(HTMLElement.prototype, 'offsetTop', top);
    if (tall)
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', tall);
    if (client)
      Object.defineProperty(Element.prototype, 'clientHeight', client);
  };
}
