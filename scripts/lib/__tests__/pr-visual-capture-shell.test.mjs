import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertAuthenticatedShell,
  waitForAuthenticatedShell,
} from '../../../.github/scripts/pr-visual-capture-shell.mjs';
import { ACCOUNT_CAPTURE_ROUTE } from '../../../.github/scripts/pr-visual-capture-surfaces.mjs';

// Minimal locator adapter over the actual shell DOM shapes. Visibility follows
// ancestors; aria-hidden affects role lookup, not a painted DOM locator.
function shellFixture(mobile = false) {
  const elements = new Map();
  const waits = [];
  const add = (id, parent, tag, attrs = {}, shown = true, text = '') => {
    elements.set(id, { id, parent, tag, attrs, shown, text });
  };
  add('page', null, 'body');
  add('frame', 'page', 'div', { 'data-app-shell-frame': 'true' });
  add('header', 'frame', 'header', { 'data-testid': 'dashboard-header' });
  add('desktop', 'frame', 'div', { 'data-sidebar': 'sidebar' }, !mobile);
  add('desktop-link', 'desktop', 'a', { href: '/app/chat' });
  add('mobile', 'frame', 'div', { 'data-mobile-navigation': 'true' }, mobile);
  add('tabs', 'mobile', 'nav', { 'aria-label': 'Dashboard Tabs' });
  add('mobile-link', 'tabs', 'a', { href: '/app' });
  add('greeting', 'frame', 'h2', {
    'data-testid': 'chat-empty-state-greeting-text',
  });
  add('error', 'page', 'div', { 'data-testid': 'dashboard-error' }, false);
  add(
    'settings',
    'frame',
    'div',
    { 'data-testid': 'settings-shell-content' },
    false
  );
  add('account', 'settings', 'section', { id: 'account' });
  add('account-title', 'account', 'h1', {}, true, 'Account');
  const isDescendant = (child, ancestor) => {
    for (
      let node = elements.get(child.parent);
      node;
      node = elements.get(node.parent)
    ) {
      if (node === ancestor) return true;
    }
    return false;
  };
  const isVisible = element => {
    for (let node = element; node; node = elements.get(node.parent)) {
      if (!node.shown || 'hidden' in node.attrs) return false;
    }
    return true;
  };
  const matches = (element, selector) =>
    selector.split(',').some(part => {
      const match = part
        .trim()
        .match(/^(\w+)?(?:\[([\w-]+)(?:="([^"]+)")?\])?$/);
      assert.ok(
        match && (match[1] || match[2]),
        `Unsupported fixture selector: ${part}`
      );
      const [, tag, attr, value] = match;
      return (
        (!tag || element.tag === tag) &&
        (!attr ||
          (attr in element.attrs &&
            (value === undefined || element.attrs[attr] === value)))
      );
    });
  const locator = resolve => ({
    resolve,
    locator: selector =>
      locator(() => {
        const roots = resolve();
        return [...elements.values()].filter(
          element =>
            roots.some(root => isDescendant(element, root)) &&
            matches(element, selector)
        );
      }),
    getByTestId: id => locator(resolve).locator(`[data-testid="${id}"]`),
    filter: ({ visible = false, has = null, hasText = null } = {}) =>
      locator(() => {
        const children = has?.resolve();
        return resolve().filter(
          element =>
            (!visible || isVisible(element)) &&
            (!hasText || hasText.test(element.text)) &&
            (!children || children.some(child => isDescendant(child, element)))
        );
      }),
    or: other =>
      locator(() => [...new Set([...resolve(), ...other.resolve()])]),
    and: other =>
      locator(() => {
        const candidates = other.resolve();
        return resolve().filter(element => candidates.includes(element));
      }),
    first: () => locator(() => resolve().slice(0, 1)),
    count: async () => resolve().length,
    waitFor: async ({ state, timeout }) => {
      assert.equal(state, 'visible');
      const found = resolve().filter(isVisible);
      waits.push({ ids: found.map(element => element.id), timeout });
      assert.ok(found.length > 0, 'Missing visible shell marker');
    },
  });
  return { page: locator(() => [elements.get('page')]), elements, waits };
}

async function assertRejectedByBoth(fixture, route = '/app/tasks') {
  await assert.rejects(waitForAuthenticatedShell(fixture.page, route));
  await assert.rejects(assertAuthenticatedShell(fixture.page, route));
}

test('desktop and mobile prove their actual visible navigation with unchanged waits', async () => {
  for (const mobile of [false, true]) {
    const fixture = shellFixture(mobile);
    await waitForAuthenticatedShell(fixture.page, '/app/tasks');
    await assertAuthenticatedShell(fixture.page, '/app/tasks');
    assert.deepEqual(fixture.waits, [
      { ids: ['header'], timeout: 30_000 },
      { ids: [mobile ? 'mobile-link' : 'desktop-link'], timeout: 30_000 },
    ]);
  }
});

test('a header or navigation outside the live frame cannot certify a shell', async () => {
  for (const change of [
    f => {
      f.elements.get('frame').attrs = { 'data-app-shell-placeholder': 'true' };
    },
    f => {
      f.elements.get('frame').shown = false;
    },
    f => {
      f.elements.get('header').shown = false;
    },
    f => {
      f.elements.get('header').parent = 'page';
    },
    f => {
      f.elements.get('mobile').parent = 'page';
    },
  ]) {
    const fixture = shellFixture(true);
    change(fixture);
    await assertRejectedByBoth(fixture);
  }
});

test('mobile needs owned populated Dashboard Tabs, not a label or hidden links', async () => {
  for (const change of [
    f => {
      f.elements.get('mobile').attrs = {};
    },
    f => {
      f.elements.get('tabs').attrs['aria-label'] = 'Unrelated navigation';
    },
    f => {
      f.elements.get('tabs').shown = false;
    },
    f => {
      f.elements.get('mobile-link').shown = false;
    },
    f => {
      f.elements.get('mobile-link').attrs = {};
    },
    f => {
      f.elements.get('mobile-link').parent = 'frame';
    },
  ]) {
    const fixture = shellFixture(true);
    change(fixture);
    await assertRejectedByBoth(fixture);
  }
});

test('registered Account uses its exact SettingsSection without a dashboard header', async () => {
  for (const mobile of [false, true]) {
    const fixture = shellFixture(mobile);
    fixture.elements.get('header').shown = false;
    fixture.elements.get('settings').shown = true;
    await waitForAuthenticatedShell(fixture.page, ACCOUNT_CAPTURE_ROUTE);
    await assertAuthenticatedShell(fixture.page, ACCOUNT_CAPTURE_ROUTE);
    assert.deepEqual(fixture.waits[0], {
      ids: ['account-title'],
      timeout: 30_000,
    });
    fixture.elements.get('frame').attrs['aria-hidden'] = 'true';
    await assertAuthenticatedShell(fixture.page, ACCOUNT_CAPTURE_ROUTE);
    for (const route of [
      '/app/tasks',
      '/app/settings/billing',
      `${ACCOUNT_CAPTURE_ROUTE}/unknown`,
    ]) {
      await assertRejectedByBoth(fixture, route);
    }
  }
});

test('Account refuses absent, wrong, hidden or detached section anchors', async () => {
  for (const change of [
    f => {
      f.elements.get('settings').shown = false;
    },
    f => {
      f.elements.get('settings').attrs = {};
    },
    f => {
      f.elements.get('settings').parent = 'page';
    },
    f => {
      f.elements.get('account').attrs.id = 'billing';
    },
    f => {
      f.elements.get('account-title').text = 'Billing';
    },
    f => {
      f.elements.get('account-title').shown = false;
    },
    f => {
      f.elements.get('account-title').tag = 'div';
    },
    f => {
      f.elements.get('account-title').parent = 'frame';
    },
  ]) {
    const fixture = shellFixture(true);
    fixture.elements.get('header').shown = false;
    fixture.elements.get('settings').shown = true;
    change(fixture);
    await assertRejectedByBoth(fixture, ACCOUNT_CAPTURE_ROUTE);
  }
});

test('operator mobile navigation requires the live OV workspace frame', async () => {
  const fixture = shellFixture(true);
  fixture.elements.get('tabs').attrs['aria-label'] = 'OV Mobile Navigation';
  await assertRejectedByBoth(fixture);
  fixture.elements.get('frame').attrs['data-app-shell-workspace'] = 'ov';
  await waitForAuthenticatedShell(fixture.page, '/app/tasks');
  await assertAuthenticatedShell(fixture.page, '/app/tasks');
  fixture.elements.get('frame').attrs['aria-hidden'] = 'true';
  await assertAuthenticatedShell(fixture.page, '/app/tasks');
  fixture.elements.get('tabs').shown = false;
  await assertRejectedByBoth(fixture);
});

test('the final assertion accepts a painted shell behind a producer dialog', async () => {
  for (const mobile of [false, true]) {
    const fixture = shellFixture(mobile);
    await waitForAuthenticatedShell(fixture.page, '/app/tasks');
    fixture.elements.get('frame').attrs['aria-hidden'] = 'true';
    fixture.elements.set('dialog', {
      id: 'dialog',
      parent: 'page',
      tag: 'div',
      attrs: { role: 'dialog', 'aria-modal': 'true' },
      shown: true,
    });
    await assertAuthenticatedShell(fixture.page, '/app/tasks');
    fixture.elements.get('frame').shown = false;
    await assert.rejects(assertAuthenticatedShell(fixture.page, '/app/tasks'));
  }
});

test('visible dashboard errors fail before and after the route producer', async () => {
  const fixture = shellFixture(true);
  await waitForAuthenticatedShell(fixture.page, '/app/tasks');
  fixture.elements.get('error').shown = true;
  await assertRejectedByBoth(fixture);
});

test('a loaded chat greeting stays required at either viewport and final assertion', async () => {
  for (const mobile of [false, true]) {
    for (const route of ['/app/chat', '/app/chat/new']) {
      const fixture = shellFixture(mobile);
      await waitForAuthenticatedShell(fixture.page, route);
      await assertAuthenticatedShell(fixture.page, route);
      assert.deepEqual(fixture.waits.at(-1), {
        ids: ['greeting'],
        timeout: 15_000,
      });
      fixture.elements.get('greeting').attrs['data-testid'] =
        'chat-empty-state-greeting-region';
      await assertRejectedByBoth(fixture, route);
    }
  }
});

test('final validation cannot reuse readiness after navigation disappears', async () => {
  const fixture = shellFixture(true);
  await waitForAuthenticatedShell(fixture.page, '/app/tasks');
  fixture.elements.get('mobile-link').shown = false;
  await assert.rejects(assertAuthenticatedShell(fixture.page, '/app/tasks'));
});

test('public capture does not require an authenticated shell', async () => {
  const fixture = shellFixture();
  fixture.elements.get('frame').shown = false;
  await waitForAuthenticatedShell(fixture.page, '/');
  await assertAuthenticatedShell(fixture.page, '/');
  assert.deepEqual(fixture.waits, []);
});

test('runner checks shell around strict state producers while retaining route and runtime guards', () => {
  const source = readFileSync(
    '.github/scripts/pr-visual-review-capture.mjs',
    'utf8'
  );
  const readiness = source.indexOf(
    'await waitForAuthenticatedShell(page, route)'
  );
  const producer = source.indexOf('await prepareLaunchCapture(page, route)');
  const final = source.indexOf('await assertAuthenticatedShell(page, route)');
  const screenshot = source.indexOf('await page.screenshot(');
  assert.ok(
    readiness >= 0 &&
      readiness < producer &&
      producer < final &&
      final < screenshot
  );
  assert.doesNotMatch(source, /\/Inbox\|Library\|New Chat\//);
  for (const guard of [
    'Test-auth handoff ended at',
    'final.origin !== expected.origin',
    'final.pathname !== expected.pathname',
    'Captured app route rendered sign-in shell',
    'Captured route did not render a meaningful surface',
    'blockingCaptureRuntimeFailures(runtimeFailures',
  ])
    assert.ok(source.includes(guard), guard);
});
