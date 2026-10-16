/** Serializable Playwright evaluate callback. This measures the real visual
 * viewport; it does not pretend a resize opens an OS keyboard or autofill UI.
 * App state, native occlusion and transition outcomes are asserted by the
 * journey runner/device operator, independently of the input's DOM value. */
export function captureInputGeometry({
  fieldSelector,
  actionSelector,
  role,
}: {
  fieldSelector: string;
  actionSelector: string;
  role: string;
}) {
  const field = document.querySelector(fieldSelector);
  const action = document.querySelector(actionSelector);
  if (!(field instanceof HTMLInputElement) || !(action instanceof HTMLElement))
    throw new Error('Critical field/action selector is missing');
  const rect = (element: Element) => {
    const box = element.getBoundingClientRect();
    return {
      top: box.top,
      bottom: box.bottom,
      left: box.left,
      right: box.right,
    };
  };
  const hit = (element: Element) => {
    const box = element.getBoundingClientRect();
    const target = document.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2
    );
    return target === element || element.contains(target);
  };
  const vv = globalThis.visualViewport;
  const top = vv?.offsetTop ?? 0;
  const left = vv?.offsetLeft ?? 0;
  return {
    fields: Array.from(document.querySelectorAll('input')).map(input => ({
      role: input === field ? role : null,
      type: input.type,
      name: input.name,
      autocomplete: input.autocomplete,
      inputmode: input.inputMode || 'text',
      label:
        input.getAttribute('aria-label') ||
        input.labels?.[0]?.textContent?.trim() ||
        '',
      visible:
        input.getClientRects().length > 0 &&
        getComputedStyle(input).visibility !== 'hidden' &&
        getComputedStyle(input).display !== 'none',
    })),
    layoutHeight: document.documentElement.clientHeight,
    visualHeight: vv?.height ?? globalThis.innerHeight,
    visualOffsetTop: top,
    viewport: {
      top,
      left,
      bottom: top + (vv?.height ?? globalThis.innerHeight),
      right: left + (vv?.width ?? globalThis.innerWidth),
    },
    scrollY: globalThis.scrollY,
    horizontalOverflow: Math.max(
      0,
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    ),
    field: rect(field),
    fieldHit: hit(field),
    focused: document.activeElement === field,
    action: rect(action),
    actionHit: hit(action),
  };
}

/** Browser-origin value commit (input then change), distinct from Playwright
 * fill/typing. The journey must compare the app's validation/submission result.
 * This is deterministic event equivalence, never native-autofill evidence. */
export function commitAutofillValue({
  selector,
  value,
}: {
  selector: string;
  value: string;
}) {
  const input = document.querySelector(selector);
  if (!(input instanceof HTMLInputElement)) throw new Error('Input missing');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
    input,
    value
  );
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
