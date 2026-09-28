import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadArticleRegistry } from './article-registry.mjs';

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(docsRoot, path), 'utf8');

test('contact page exists and exposes a contextual support destination', () => {
  assert.ok(existsSync(join(docsRoot, 'app/contact/page.tsx')));
  const meta = read('app/_meta.ts');
  assert.match(meta, /contact/);
});

test('contact panel collects page, referrer, and search context only', () => {
  const source = read('components/ContactSupport.tsx');
  assert.match(source, /document\.referrer/);
  assert.match(source, /support@jov\.ie/);
  assert.match(source, /Article or referring page/);
  assert.match(source, /Search query/);
  assert.doesNotMatch(source, /token|secret|password|authorization/i);
});

test('every page exposes contextual escalation to contact support', () => {
  const layout = read('app/layout.tsx');
  assert.match(layout, /ContactSupportLink/);
  const link = read('components/ContactSupportLink.tsx');
  assert.match(link, /from/);
  assert.match(link, /usePathname/);
});

test('rehomed support FAQs live in a canonical troubleshooting article', () => {
  const { articles, consumers } = loadArticleRegistry();
  const article = articles.find(
    entry => entry.route === '/docs/manage-jovie/troubleshooting'
  );
  assert.ok(article, 'troubleshooting article is missing from the registry');
  assert.ok(
    consumers.navigation.some(
      entry => entry.route === '/docs/manage-jovie/troubleshooting'
    ),
    'troubleshooting article must be a primary navigation entry'
  );
  const body = read('app/docs/manage-jovie/troubleshooting/page.mdx');
  assert.match(body, /Settings → Billing/);
  assert.doesNotMatch(body, /one business day/i);
});
