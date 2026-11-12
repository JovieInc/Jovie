import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findOrphanedOverlays, orphanKey } from './orphaned-overlays.mjs';

// jsdom is a devDependency of @jovie/web, not of the repo root.
const { JSDOM } = createRequire(
  fileURLToPath(new URL('../../apps/web/package.json', import.meta.url))
)('jsdom');

/**
 * jsdom has no layout, so each fixture element states its own box as
 * data-box="x,y,width,height"; anything without one is the 1024x768 page.
 */
function page(body) {
  const { window } = new JSDOM(`<!doctype html><body>${body}</body>`);
  window.Element.prototype.getBoundingClientRect = function () {
    const [x, y, width, height] = (
      this.getAttribute('data-box') ?? '0,0,1024,768'
    )
      .split(',')
      .map(Number);
    return {
      left: x,
      top: y,
      right: x + width,
      bottom: y + height,
      width,
      height,
    };
  };
  return window;
}

/** A Radix tooltip as it lands in the DOM: bubble in a fixed popper wrapper. */
const tooltip = (id, text, box = '300,200,120,28') => `
  <div data-radix-popper-content-wrapper style="position:fixed" data-box="${box}">
    <div data-state="delayed-open" data-testid="tip-${id}" data-box="${box}">${text}
      <span id="${id}" role="tooltip" data-box="0,0,1,1">${text}</span>
    </div>
  </div>`;
const trigger = (id, box = '180,200,100,28', extra = '') =>
  `<button aria-describedby="${id}" data-state="delayed-open" data-box="${box}" ${extra}>Trigger</button>`;

// The founder's bug: the sidebar collapsed to zero width with a tooltip up.
const ORPHANS = `
  <aside id="rail" style="overflow:hidden" data-box="0,0,0,768">
    ${trigger('tip-rail', '12,640,200,32')}
  </aside>
  <main data-box="0,0,1024,768"><p>Home</p></main>
  ${tooltip('tip-rail', "What's new", '220,640,90,28')}
  ${tooltip('tip-gone', 'Copy link')}`;

const CLEAN = `
  <aside id="rail" style="overflow:hidden" data-box="0,0,240,768">
    ${trigger('tip-ok', '12,640,200,32')}
    <button id="menu-trigger" aria-controls="menu" aria-expanded="true"
      aria-haspopup="menu" data-state="open" data-box="12,40,200,32">Account</button>
  </aside>
  ${tooltip('tip-ok', "What's new", '260,640,90,28')}
  <div data-radix-popper-content-wrapper style="position:fixed" data-box="12,80,220,160">
    <div id="menu" role="menu" aria-labelledby="menu-trigger" data-state="open"
      data-box="12,80,220,160">Settings</div>
  </div>
  <div role="dialog" aria-modal="true" style="position:fixed" data-box="262,184,500,400">Confirm</div>
  <ol style="position:fixed" data-box="700,700,300,48"><li>Saved</li></ol>
  <div data-radix-popper-content-wrapper style="position:fixed" data-box="300,300,80,28">
    <div data-state="closed" data-box="300,300,80,28">Closing
      <span id="tip-closing" role="tooltip" data-box="0,0,1,1">Closing</span></div>
  </div>`;

test('finds a tooltip whose anchor was removed and one whose anchor sits in a collapsed sidebar', () => {
  const found = findOrphanedOverlays(page(ORPHANS));
  assert.deepEqual(
    found.map(o => [o.kind, o.text, o.reason, o.anchor]),
    [
      ['tooltip', "What's new", 'anchor-clipped', 'button'],
      ['tooltip', 'Copy link', 'anchor-missing', null],
    ]
  );
  assert.equal(found[0].overlay, 'div[data-testid=tip-tip-rail]');
  assert.deepEqual(found[0].box, [220, 640, 90, 28]);
  assert.equal(new Set(found.map(orphanKey)).size, 2);
});

test('a page whose overlays all have a live anchor is clean', () => {
  // An anchored tooltip, an open menu, a modal dialog, a toast with no
  // anchor at all, and a tooltip already on its way out.
  assert.deepEqual(findOrphanedOverlays(page(CLEAN)), []);
});

test('names why the anchor no longer holds the overlay', () => {
  const reason = (attrs, box) =>
    findOrphanedOverlays(
      page(`${trigger('t', box, attrs)}${tooltip('t', 'Tip')}`)
    )[0]?.reason;
  assert.equal(reason('style="display:none"'), 'anchor-hidden');
  assert.equal(reason('style="visibility:hidden"'), 'anchor-hidden');
  assert.equal(reason('inert'), 'anchor-hidden');
  assert.equal(reason('', '180,200,0,28'), 'anchor-zero-size');
  assert.equal(reason('', '-400,200,100,28'), 'anchor-offscreen');
  assert.equal(reason('', '180,200,100,28'), undefined);
});

test('a parent that hides its content takes the anchor with it', () => {
  const inside = style =>
    findOrphanedOverlays(
      page(`<div style="${style}">${trigger('t')}</div>${tooltip('t', 'Tip')}`)
    )[0]?.reason;
  assert.equal(inside('display:none'), 'anchor-hidden');
  assert.equal(inside('opacity:0'), 'anchor-hidden');
  assert.equal(inside('opacity:1'), undefined);
});

test('a fixed anchor is not clipped by an overflow ancestor', () => {
  const body = `
    <div style="overflow:hidden" data-box="0,0,0,768">
      ${trigger('t', '12,40,100,28', 'style="position:fixed"')}
    </div>${tooltip('t', 'Tip')}`;
  assert.deepEqual(findOrphanedOverlays(page(body)), []);
});

test('menus, listboxes and popovers are judged by the trigger that controls them', () => {
  const layer = (role, triggerAttrs) => `
    <button aria-controls="layer" aria-expanded="true" ${triggerAttrs}
      data-box="20,20,80,28">Open</button>
    <div id="layer" role="${role}" style="position:absolute" data-state="open"
      data-box="20,52,200,120">Items</div>`;
  for (const role of ['menu', 'listbox', 'dialog']) {
    assert.deepEqual(findOrphanedOverlays(page(layer(role, ''))), [], role);
    const [orphan] = findOrphanedOverlays(page(layer(role, 'hidden')));
    assert.equal(orphan?.kind, role);
    assert.equal(orphan?.reason, 'anchor-hidden');
  }
});

test('a trigger with no id link still anchors its overlay by its open state', () => {
  const bubble = `<div data-radix-popper-content-wrapper style="position:fixed"
    data-box="300,200,120,28"><div data-state="instant-open" data-box="300,200,120,28">Tip</div></div>`;
  const open = `<button data-state="instant-open" data-box="180,200,100,28">T</button>`;
  assert.deepEqual(findOrphanedOverlays(page(open + bubble)), []);
  assert.equal(findOrphanedOverlays(page(bubble))[0]?.reason, 'anchor-missing');
  // A trigger that belongs to another live overlay is not borrowed.
  const other = `${trigger('tip-other')}${tooltip('tip-other', 'Other', '300,300,80,28')}`;
  assert.deepEqual(
    findOrphanedOverlays(page(other + bubble)).map(o => o.text),
    ['Tip']
  );
});

test('modal dialogs own the screen and are skipped', () => {
  const dialog = attrs =>
    `<div role="dialog" ${attrs} style="position:fixed" data-box="262,184,500,400">Sheet</div>`;
  assert.deepEqual(findOrphanedOverlays(page(dialog('aria-modal="true"'))), []);
  // Radix sets no aria-modal; it scroll-locks and aria-hides the page instead.
  const locked = page(`<div data-aria-hidden="true">App</div>${dialog('')}`);
  assert.deepEqual(findOrphanedOverlays(locked), []);
});

test('a missing anchor is reported only where the layer claims one', () => {
  const fixed = (attrs, text) =>
    `<div ${attrs} style="position:fixed" data-box="300,200,240,160">${text}</div>`;
  const reasons = body => findOrphanedOverlays(page(body)).map(o => o.reason);
  // Hand-rolled layers with no ARIA link at all cannot be judged.
  assert.deepEqual(reasons(fixed('role="tooltip"', 'Entity card')), []);
  assert.deepEqual(reasons(fixed('role="dialog"', 'Chat')), []);
  assert.deepEqual(reasons(fixed('role="menu"', 'Actions')), []);
  // A tooltip with an id exists to be described-by; nobody does any more.
  assert.deepEqual(reasons(fixed('role="tooltip" id="t"', 'Tip')), [
    'anchor-missing',
  ]);
  // A menu still labelled by a trigger that has left the page.
  assert.deepEqual(
    reasons(fixed('role="menu" aria-labelledby="gone"', 'Actions')),
    ['anchor-missing']
  );
  // Anything Radix positioned had an anchor by construction.
  const popper = `<div data-radix-popper-content-wrapper style="position:fixed"
    data-box="300,200,240,160"><div role="dialog" data-state="open"
    data-box="300,200,240,160">Popover</div></div>`;
  assert.deepEqual(reasons(popper), ['anchor-missing']);
});

test('a bare body portal is judged only once something names it', () => {
  const portal = `<div id="card" style="position:fixed" data-box="300,200,240,160">Card</div>`;
  assert.deepEqual(findOrphanedOverlays(page(portal)), []);
  const named = `<button aria-controls="card" hidden data-box="0,0,80,28">Card</button>${portal}`;
  const [orphan] = findOrphanedOverlays(page(named));
  assert.equal(orphan?.kind, 'portal');
  assert.equal(orphan?.reason, 'anchor-hidden');
});

test('an overlay that is itself off screen or invisible is not reported', () => {
  assert.deepEqual(
    findOrphanedOverlays(page(tooltip('gone', 'Tip', '-500,200,120,28'))),
    []
  );
  const hidden = `<div style="display:none">${tooltip('gone', 'Tip')}</div>`;
  assert.deepEqual(findOrphanedOverlays(page(hidden)), []);
});
