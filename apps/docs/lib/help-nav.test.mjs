import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHelpNav,
  HELP_FOCUSABLE_SELECTOR,
  nextFocusIndex,
} from './help-nav.mjs';

test('buildHelpNav converts a filtered page map into a nav tree', () => {
  const pageMap = [
    {
      name: 'index',
      route: '/',
      frontMatter: { title: 'Home' },
    },
    {
      name: 'docs',
      route: '/docs',
      title: 'Documentation',
      children: [
        {
          name: 'getting-started',
          route: '/docs/getting-started',
          title: 'Getting Started',
        },
        { name: 'features', route: '/docs/features', title: 'Features' },
      ],
    },
  ];

  const nav = buildHelpNav(pageMap);

  assert.equal(nav.length, 2);
  assert.deepEqual(nav[0], {
    key: '/',
    title: 'Home',
    route: '/',
    children: [],
  });
  assert.equal(nav[1].route, '/docs');
  assert.equal(nav[1].title, 'Documentation');
  assert.equal(nav[1].children.length, 2);
  assert.equal(nav[1].children[0].route, '/docs/getting-started');
});

test('buildHelpNav drops data nodes and entries without routes or children', () => {
  const pageMap = [
    { data: { frontmatter: 'x' } },
    { name: 'orphan' },
    { name: 'docs', route: '/docs', title: 'Documentation' },
  ];

  const nav = buildHelpNav(pageMap);

  assert.equal(nav.length, 1);
  assert.equal(nav[0].key, '/docs');
});

test('buildHelpNav keeps groups that only have navigable children', () => {
  const pageMap = [
    {
      name: 'features',
      children: [{ name: 'tips', route: '/docs/features/tips' }],
    },
  ];

  const nav = buildHelpNav(pageMap);

  assert.equal(nav.length, 1);
  assert.equal(nav[0].route, null);
  assert.equal(nav[0].title, 'Features');
  assert.equal(nav[0].children[0].title, 'Tips');
});

test('buildHelpNav returns an empty tree for non-array input', () => {
  assert.deepEqual(buildHelpNav(undefined), []);
  assert.deepEqual(buildHelpNav(null), []);
  assert.deepEqual(buildHelpNav('docs'), []);
});

test('nextFocusIndex wraps forward and backward inside the trap', () => {
  assert.equal(nextFocusIndex(2, 3, false), 0);
  assert.equal(nextFocusIndex(0, 3, true), 2);
  assert.equal(nextFocusIndex(0, 3, false), 1);
  assert.equal(nextFocusIndex(1, 3, true), 0);
});

test('nextFocusIndex focuses the first or last element when nothing is focused', () => {
  assert.equal(nextFocusIndex(-1, 4, false), 0);
  assert.equal(nextFocusIndex(-1, 4, true), 3);
  assert.equal(nextFocusIndex(-1, 0, false), -1);
});

test('focusable selector covers links, buttons and fields', () => {
  for (const token of ['a[href]', 'button', 'input', 'select', 'textarea']) {
    assert.ok(
      HELP_FOCUSABLE_SELECTOR.includes(token),
      `selector should include ${token}`
    );
  }
});
