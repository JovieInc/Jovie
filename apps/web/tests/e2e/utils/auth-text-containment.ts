import { expect, type Locator, type TestInfo } from '@playwright/test';

// Vertical scrolling is an intentional probe outside transition sampling.
// Prove every visual fragment reachable, then restore scroll, focus and selection.
export async function verifyAuthVerticalReachability(
  output: Locator,
  kind: 'settled' | 'pending'
) {
  return output.evaluate(async (element, kind) => {
    const failures: string[] = [];
    const targets: { parent: Element; rect: () => DOMRect | undefined }[] = [];
    const painted = (node: Element) =>
      node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    if (kind === 'pending') {
      for (const leaf of element.querySelectorAll('[data-slot="skeleton"]'))
        if (painted(leaf))
          targets.push({
            parent: leaf,
            rect: () => leaf.getBoundingClientRect(),
          });
    } else {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        const parent = text.parentElement;
        if (
          !text.textContent?.trim() ||
          !parent ||
          !painted(parent) ||
          parent.closest('.sr-only,[hidden],[aria-hidden="true"]')
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        const rects = [...range.getClientRects()];
        for (let index = 0; index < rects.length; index++) {
          if (rects[index].width > 0 && rects[index].height > 0)
            targets.push({ parent, rect: () => range.getClientRects()[index] });
        }
      }
    }
    const ancestors = (node: Element) => {
      const result: Element[] = [];
      for (
        let current: Element | null = node;
        current;
        current = current.parentElement
      )
        result.push(current);
      return result;
    };
    const root = document.scrollingElement;
    const scrollable = (node: Element) => {
      const overflow = getComputedStyle(node).overflowY;
      return (
        node.scrollHeight > node.clientHeight + 1 &&
        (['auto', 'scroll'].includes(overflow) ||
          (node === root &&
            !['hidden', 'clip'].includes(overflow) &&
            !['hidden', 'clip'].includes(
              getComputedStyle(document.body).overflowY
            )))
      );
    };
    const nodes = [
      ...new Set(
        targets.flatMap(target => ancestors(target.parent)).filter(scrollable)
      ),
    ];
    const before = nodes.map(node => ({
      node,
      top: node.scrollTop,
      left: node.scrollLeft,
    }));
    const focused = document.activeElement;
    const selection = () =>
      focused instanceof HTMLInputElement ||
      focused instanceof HTMLTextAreaElement
        ? [
            focused.selectionStart,
            focused.selectionEnd,
            focused.selectionDirection,
          ]
        : null;
    const selectionBefore = selection();
    const port = (node: Element) => {
      if (node === root) return { top: 0, bottom: innerHeight, scale: 1 };
      const rect = node.getBoundingClientRect();
      const scale =
        node instanceof HTMLElement && node.offsetHeight > 0
          ? rect.height / node.offsetHeight
          : 1;
      const top = rect.top + node.clientTop * scale;
      return { top, bottom: top + node.clientHeight * scale, scale };
    };
    const frame = () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    const observations: {
      target: number;
      top: number;
      bottom: number;
      left: number;
      right: number;
      painted: boolean;
      horizontalContained: boolean;
      ownerContained: boolean;
      reached: boolean;
      scrolls: { node: string; top: number; max: number }[];
    }[] = [];
    try {
      if (!targets.length) failures.push('no-visible-scroll-target');
      for (const [index, target] of targets.entries()) {
        const chain = ancestors(target.parent);
        for (const node of chain.filter(scrollable)) {
          const rect = target.rect();
          if (!rect) {
            failures.push('scroll-target-disappeared');
            break;
          }
          const bounds = port(node);
          const delta =
            ((rect.top + rect.bottom) / 2 - (bounds.top + bounds.bottom) / 2) /
            bounds.scale;
          node.scrollTo({
            top: node.scrollTop + delta,
            left: node.scrollLeft,
            behavior: 'instant',
          });
        }
        await frame();
        const rect = target.rect();
        if (!rect) {
          failures.push('scroll-target-disappeared');
          continue;
        }
        const transparent = (color: string) => {
          if (color === 'transparent') return true;
          const alpha = color.includes('/')
            ? color.slice(color.lastIndexOf('/') + 1)
            : color.startsWith('rgba(')
              ? (color.split(',')[3] ?? '1')
              : '1';
          return Number.parseFloat(alpha) === 0;
        };
        // Paint, ownership and both axes must agree at this same reached point.
        const paint = getComputedStyle(target.parent);
        const visiblyPainted =
          target.parent.isConnected &&
          painted(target.parent) &&
          (kind === 'settled'
            ? !target.parent.closest(
                '.sr-only,[hidden],[aria-hidden="true"]'
              ) &&
              !transparent(paint.color) &&
              !transparent(paint.webkitTextFillColor)
            : !transparent(paint.backgroundColor) ||
              paint.backgroundImage !== 'none');
        const withinX = (bounds: { left: number; right: number }) =>
          rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
        const owners = [
          element,
          element.parentElement,
          ...(kind === 'pending'
            ? [target.parent.parentElement?.parentElement]
            : []),
        ];
        const ownerContained = owners.every(owner => {
          if (!owner) return false;
          const bounds = owner.getBoundingClientRect();
          return (
            withinX(bounds) &&
            rect.top >= bounds.top - 1 &&
            rect.bottom <= bounds.bottom + 1
          );
        });
        let horizontalContained =
          rect.width > 0 &&
          withinX({ left: 0, right: innerWidth }) &&
          owners.every(
            owner => owner && withinX(owner.getBoundingClientRect())
          );
        const reachedChain = ancestors(target.parent);
        for (const node of reachedChain) {
          if (
            !['auto', 'scroll', 'hidden', 'clip'].includes(
              getComputedStyle(node).overflowX
            )
          )
            continue;
          const bounds = node.getBoundingClientRect();
          const scale =
            node instanceof HTMLElement && node.offsetWidth > 0
              ? bounds.width / node.offsetWidth
              : 1;
          const left = bounds.left + node.clientLeft * scale;
          if (!withinX({ left, right: left + node.clientWidth * scale }))
            horizontalContained = false;
        }
        let reached =
          visiblyPainted &&
          horizontalContained &&
          ownerContained &&
          rect.height > 0 &&
          rect.top >= -1 &&
          rect.bottom <= innerHeight + 1;
        for (const node of reachedChain) {
          if (
            node === root ||
            !['auto', 'scroll', 'hidden', 'clip'].includes(
              getComputedStyle(node).overflowY
            )
          )
            continue;
          const bounds = port(node);
          if (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)
            reached = false;
        }
        observations.push({
          target: index,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          painted: visiblyPainted,
          horizontalContained,
          ownerContained,
          reached,
          scrolls: chain.filter(scrollable).map(node => ({
            node: node.tagName,
            top: node.scrollTop,
            max: node.scrollHeight - node.clientHeight,
          })),
        });
        if (!reached) failures.push(`vertical-target-${index}-unreachable`);
      }
    } finally {
      for (const saved of before)
        saved.node.scrollTo({
          top: saved.top,
          left: saved.left,
          behavior: 'instant',
        });
      await frame();
    }
    const restoration = before.map(saved => ({
      node: saved.node.tagName,
      beforeTop: saved.top,
      afterTop: saved.node.scrollTop,
      beforeLeft: saved.left,
      afterLeft: saved.node.scrollLeft,
    }));
    if (
      restoration.some(
        saved =>
          Math.abs(saved.beforeTop - saved.afterTop) > 0.5 ||
          Math.abs(saved.beforeLeft - saved.afterLeft) > 0.5
      )
    )
      failures.push('scroll-offset-not-restored');
    const focusUnchanged = document.activeElement === focused;
    const selectionUnchanged =
      JSON.stringify(selection()) === JSON.stringify(selectionBefore);
    if (!focusUnchanged || !selectionUnchanged)
      failures.push('focus-or-selection-changed');
    return {
      failures,
      observations,
      restoration,
      focusUnchanged,
      selectionUnchanged,
    };
  }, kind);
}

// Extend the positioned-Range detector qualified by storybook-auth-targets.
// Status ownership is the intrinsic grid column, including when a grid child
// expands beyond it. Element intersection alone cannot establish this result.
export async function measureAuthStatusText(output: Locator) {
  return output.evaluate(element => {
    const serialize = (rect: DOMRect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    });
    const owner = element.parentElement;
    if (!owner) throw new Error('Status has no declared column owner');
    const ownerRect = owner.getBoundingClientRect();
    const fragments: { text: string; rect: ReturnType<typeof serialize> }[] =
      [];
    const failures: {
      kind: string;
      axes?: string[];
      text?: string;
      bounds?: ReturnType<typeof serialize>;
    }[] = [];
    const transparent = (color: string) => {
      if (color === 'transparent') return true;
      const alpha = color.includes('/')
        ? color.slice(color.lastIndexOf('/') + 1)
        : color.startsWith('rgba(')
          ? (color.split(',')[3] ?? '1')
          : '1';
      return Number.parseFloat(alpha) === 0;
    };
    const axes = (rect: DOMRect, bounds: DOMRect, x = true, y = true) => [
      ...(x && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
        ? ['x']
        : []),
      ...(y && (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)
        ? ['y']
        : []),
    ];
    const contained = (rect: DOMRect, bounds: DOMRect, x = true, y = true) =>
      (!x ||
        (rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1)) &&
      (!y || (rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1));
    const clipped = (value: string) =>
      ['hidden', 'clip', 'auto', 'scroll'].includes(value);
    const viewport = new DOMRect(0, 0, innerWidth, innerHeight);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!text.textContent?.trim()) continue;
      const parent = text.parentElement;
      if (!parent) throw new Error('Status text lost its element');
      const style = getComputedStyle(parent);
      if (
        !parent.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        }) ||
        parent.closest('.sr-only, [hidden], [aria-hidden="true"]') ||
        Number.parseFloat(style.fontSize) <= 0 ||
        transparent(style.color) ||
        transparent(style.webkitTextFillColor)
      ) {
        failures.push({ kind: 'unrendered-text', text: text.textContent });
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(text);
      const rects = [...range.getClientRects()].filter(
        rect => rect.width > 0 && rect.height > 0
      );
      if (!rects.length)
        failures.push({ kind: 'missing-glyphs', text: text.textContent });
      for (const rect of rects) {
        fragments.push({ text: text.textContent, rect: serialize(rect) });
        if (!contained(rect, ownerRect))
          failures.push({
            kind: 'outside-owner',
            axes: axes(rect, ownerRect),
            text: text.textContent,
            bounds: serialize(ownerRect),
          });
        if (!contained(rect, viewport))
          failures.push({
            kind: 'outside-viewport',
            axes: axes(rect, viewport),
            text: text.textContent,
            bounds: serialize(viewport),
          });
        for (
          let ancestor: Element | null = parent;
          ancestor;
          ancestor = ancestor.parentElement
        ) {
          const clipping = getComputedStyle(ancestor);
          if (!clipped(clipping.overflowX) && !clipped(clipping.overflowY))
            continue;
          const bounds = ancestor.getBoundingClientRect();
          if (
            !contained(
              rect,
              bounds,
              clipped(clipping.overflowX),
              clipped(clipping.overflowY)
            )
          ) {
            failures.push({
              kind: 'ancestor-clipped',
              axes: axes(
                rect,
                bounds,
                clipped(clipping.overflowX),
                clipped(clipping.overflowY)
              ),
              text: text.textContent,
              bounds: serialize(bounds),
            });
          }
        }
      }
    }
    if (!fragments.length) failures.push({ kind: 'no-visible-status-glyphs' });
    return {
      text: element.textContent,
      owner: serialize(ownerRect),
      fragments,
      failures,
    };
  });
}

export async function expectAuthStatusTextContained(
  output: Locator,
  info: TestInfo,
  label: string
) {
  const name = label.replace(/[^a-z0-9]+/gi, '-');
  try {
    expect(await output.count(), 'One settled live output must exist').toBe(1);
    await expect(output).toHaveAttribute('aria-busy', 'false');
    await expect(output).toBeVisible();
    // Intentional scrolling occurs after the zero-shift/focus measurement.
    const result = await measureAuthStatusText(output);
    const vertical = await verifyAuthVerticalReachability(output, 'settled');
    const blocking = result.failures.filter(
      failure =>
        !failure.axes ||
        failure.axes.includes('x') ||
        failure.kind === 'outside-owner'
    );
    await info.attach(`${name}-glyphs.json`, {
      body: JSON.stringify({
        ...result,
        blockingFailures: blocking,
        verticalReachability: vertical,
      }),
      contentType: 'application/json',
    });
    expect(
      [...blocking, ...vertical.failures],
      'Every settled status glyph must fit its column, viewport and clipping ancestors'
    ).toEqual([]);
  } catch (error) {
    await output
      .page()
      .screenshot({
        path: info.outputPath(`${name}-failure.png`),
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  }
}

// Pending lookup deliberately paints a skeleton and keeps its announcement
// screen-reader-only. Measure that visual leaf separately from settled glyphs.
export async function measureAuthPendingStatus(output: Locator) {
  return output.evaluate(element => {
    const serialize = (rect: DOMRect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    const failures: string[] = [];
    const violations: {
      kind: string;
      axes: string[];
      bounds: ReturnType<typeof serialize>;
    }[] = [];
    const wrappers = element.querySelectorAll('[data-slot="loading-skeleton"]');
    const leaves = element.querySelectorAll('[data-slot="skeleton"]');
    if (wrappers.length !== 1 || leaves.length !== 1)
      return {
        failures: ['missing-or-duplicate-skeleton'],
        wrapperCount: wrappers.length,
        leafCount: leaves.length,
      };
    const wrapper = wrappers[0];
    const leaf = leaves[0];
    const column = element.parentElement;
    const widthOwner = wrapper.parentElement;
    if (!column || !widthOwner || !wrapper.contains(leaf))
      throw new Error('Pending status lost its visual owners');
    const rect = leaf.getBoundingClientRect();
    const paint = getComputedStyle(leaf);
    const color = paint.backgroundColor;
    const alpha =
      color === 'transparent'
        ? '0'
        : color.includes('/')
          ? color.slice(color.lastIndexOf('/') + 1)
          : color.startsWith('rgba(')
            ? (color.split(',')[3] ?? '1')
            : '1';
    if (Number.parseFloat(alpha) === 0 && paint.backgroundImage === 'none')
      failures.push('unpainted-skeleton');
    const axes = (bounds: DOMRect, x = true, y = true) => [
      ...(x && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
        ? ['x']
        : []),
      ...(y && (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)
        ? ['y']
        : []),
    ];
    const contained = (bounds: DOMRect, x = true, y = true) =>
      (!x ||
        (rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1)) &&
      (!y || (rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1));
    for (const [name, node] of [
      ['wrapper', wrapper],
      ['leaf', leaf],
    ] as const) {
      const bounds = node.getBoundingClientRect();
      if (
        bounds.width <= 0 ||
        bounds.height <= 0 ||
        !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      )
        failures.push(`unrendered-${name}`);
    }
    for (const [name, bounds] of [
      ['width-owner', widthOwner.getBoundingClientRect()],
      ['column', column.getBoundingClientRect()],
      ['output', element.getBoundingClientRect()],
      ['viewport', new DOMRect(0, 0, innerWidth, innerHeight)],
    ] as const) {
      if (!contained(bounds)) {
        failures.push(`outside-${name}`);
        violations.push({
          kind: `outside-${name}`,
          axes: axes(bounds),
          bounds: serialize(bounds),
        });
      }
    }
    const clips = (value: string) =>
      ['hidden', 'clip', 'auto', 'scroll'].includes(value);
    for (
      let ancestor: Element | null = leaf;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      const style = getComputedStyle(ancestor);
      if (
        (clips(style.overflowX) || clips(style.overflowY)) &&
        !contained(
          ancestor.getBoundingClientRect(),
          clips(style.overflowX),
          clips(style.overflowY)
        )
      ) {
        failures.push('ancestor-clipped');
        violations.push({
          kind: 'ancestor-clipped',
          axes: axes(
            ancestor.getBoundingClientRect(),
            clips(style.overflowX),
            clips(style.overflowY)
          ),
          bounds: serialize(ancestor.getBoundingClientRect()),
        });
      }
    }
    const metrics = (node: Element) => {
      const style = getComputedStyle(node);
      return {
        rect: serialize(node.getBoundingClientRect()),
        gridTemplateColumns: style.gridTemplateColumns,
        minWidth: style.minWidth,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        scrollTop: node.scrollTop,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      };
    };
    return {
      failures,
      violations,
      output: metrics(element),
      columnMetrics: metrics(column),
      widthOwnerMetrics: metrics(widthOwner),
      wrapperCount: wrappers.length,
      leafCount: leaves.length,
      leaf: serialize(rect),
      widthOwner: serialize(widthOwner.getBoundingClientRect()),
      column: serialize(column.getBoundingClientRect()),
    };
  });
}

export async function expectAuthPendingStatusContained(
  output: Locator,
  info: TestInfo,
  handle: string,
  label: string
) {
  expect(await output.count()).toBe(1);
  await expect(output).toBeVisible();
  await expect(output).toHaveAttribute('aria-busy', 'true');
  await expect(output).toHaveAttribute('aria-live', 'polite');
  await expect(output).toHaveAttribute('aria-atomic', 'true');
  await expect(output).toHaveText(`Checking if @${handle} is available...`);
  expect(
    await output.ariaSnapshot(),
    'Pending announcement must remain in accessibility tree'
  ).toContain(`Checking if @${handle} is available...`);
  await expect(output.locator('[role="status"], [aria-live]')).toHaveCount(0);
  // Intentional reachability probing restores scroll/focus/selection before the existing frame sampling starts.
  const result = await measureAuthPendingStatus(output);
  const vertical = await verifyAuthVerticalReachability(output, 'pending');
  const structural = result.failures.filter(
    failure =>
      !/^outside-(width-owner|column|output|viewport)$|^ancestor-clipped$/.test(
        failure
      )
  );
  const blocking = (result.violations ?? []).filter(
    failure =>
      failure.axes.includes('x') ||
      !['outside-viewport', 'ancestor-clipped'].includes(failure.kind)
  );
  await info.attach(`${label}-pending-skeleton.json`, {
    body: JSON.stringify({
      ...result,
      blockingFailures: blocking,
      verticalReachability: vertical,
    }),
    contentType: 'application/json',
  });
  expect(
    [...structural, ...blocking, ...vertical.failures],
    'Pending skeleton must remain visible inside its owners, viewport and clipping ancestors'
  ).toEqual([]);
}
