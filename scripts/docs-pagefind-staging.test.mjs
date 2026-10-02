import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stagedHtmlRelativePath } from '../apps/docs/scripts/build-pagefind.mjs';

describe('docs pagefind staging', () => {
  it('maps Next 16 route-cache HTML onto the public pathname', () => {
    assert.equal(
      stagedHtmlRelativePath(
        'route-cache/APP_PAGE/abc/$$/docs/self-serve-guide/edit-smart-link.html'
      ),
      'docs/self-serve-guide/edit-smart-link.html'
    );
    assert.equal(
      stagedHtmlRelativePath('route-cache/APP_PAGE/abc/$$/index.html'),
      'index.html'
    );
  });

  it('keeps the older .next/server/app layout', () => {
    assert.equal(
      stagedHtmlRelativePath('app/docs/getting-started.html'),
      'docs/getting-started.html'
    );
  });

  it('drops paths that are not prerendered pages', () => {
    assert.equal(stagedHtmlRelativePath('pages/404.html'), null);
    assert.equal(
      stagedHtmlRelativePath('route-cache/APP_PAGE/abc/$$/../secret.html'),
      null
    );
    assert.equal(stagedHtmlRelativePath('app/docs/page.rsc'), null);
  });
});
