import assert from 'node:assert/strict';
import test from 'node:test';
import {
  excerptSegments,
  highlightedText,
  isEditableTarget,
  isSearchShortcut,
  relevantCategories,
  resultUrl,
  supportUrl,
} from './help-search.mjs';

test('global shortcuts respect editable controls and platform modifiers', () => {
  assert.equal(isEditableTarget({ tagName: 'INPUT' }), true);
  assert.equal(
    isEditableTarget({ tagName: 'DIV', isContentEditable: true }),
    true
  );
  assert.equal(isEditableTarget({ tagName: 'DIV' }), false);
  assert.equal(
    isSearchShortcut(
      { key: '/', altKey: false, ctrlKey: false, metaKey: false },
      'MacIntel'
    ),
    'slash'
  );
  assert.equal(
    isSearchShortcut(
      {
        key: 'k',
        altKey: false,
        ctrlKey: false,
        metaKey: true,
        shiftKey: false,
      },
      'MacIntel'
    ),
    'command'
  );
  assert.equal(
    isSearchShortcut(
      {
        key: 'k',
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
      },
      'Linux'
    ),
    'command'
  );
  assert.equal(
    isSearchShortcut(
      {
        key: 'k',
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      },
      'Linux'
    ),
    null
  );
});

test('excerpt rendering preserves only mark semantics', () => {
  assert.deepEqual(
    excerptSegments(
      '<img src=x onerror=alert(1)>Open <mark class="bad">billing</mark> settings<script>alert(1)</script>'
    ),
    [
      { value: 'Open ', highlighted: false, offset: 0 },
      { value: 'billing', highlighted: true, offset: 5 },
      { value: ' settingsalert(1)', highlighted: false, offset: 12 },
    ]
  );
});

test('canonical descriptions receive safe query highlighting', () => {
  assert.deepEqual(
    highlightedText('Manage billing and invoices.', 'billing invoice'),
    [
      { value: 'Manage ', highlighted: false, offset: 0 },
      { value: 'billing', highlighted: true, offset: 7 },
      { value: ' and ', highlighted: false, offset: 14 },
      { value: 'invoice', highlighted: true, offset: 19 },
      { value: 's.', highlighted: false, offset: 26 },
    ]
  );
});

test('zero-result recovery prioritizes query-relevant categories', () => {
  assert.equal(relevantCategories('cancel my invoice')[0].id, 'manage-jovie');
  assert.equal(
    relevantCategories('claim my profile')[0].id,
    'jovie-essentials'
  );
});

test('selection and support escalation preserve the original query', () => {
  assert.equal(
    resultUrl('/docs/billing.html#cancel', 'cancel plan'),
    '/docs/billing?search=cancel+plan#cancel'
  );
  const support = new URL(supportUrl('wrong artist'));
  assert.equal(support.searchParams.get('query'), 'wrong artist');
  assert.equal(support.searchParams.get('source'), 'help-search-zero-results');
});
