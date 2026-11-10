import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const canonical = join(root, 'lib/stripe/price-ids.ts');
const sourceRoots = [
  join(root, 'app'),
  join(root, 'components'),
  join(root, 'lib'),
];
const envReference = /(?:env|process\.env)\.STRIPE_PRICE_[A-Z0-9_]+/g;
const priceIdPattern = /^price_[A-Za-z0-9]+$/;

function walk(directory) {
  if (!existsSync(directory)) return [];
  return [...BunGlob(directory)];
}

function BunGlob(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return BunGlob(path);
    return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

const violations = [];
for (const sourceRoot of sourceRoots) {
  for (const file of walk(sourceRoot)) {
    if (file === canonical || /\.test\.[^.]+$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (envReference.test(text)) {
      violations.push(relative(root, file));
    }
    envReference.lastIndex = 0;
  }
}

const configured = Object.entries(process.env).filter(([key]) =>
  /^STRIPE_PRICE_/.test(key)
);
const malformed = configured
  .filter(([, value]) => value && !priceIdPattern.test(value))
  .map(([key]) => key);

if (violations.length || malformed.length) {
  if (violations.length) {
    console.error(
      `Stripe price env vars must only be read by lib/stripe/price-ids.ts: ${violations.join(', ')}`
    );
  }
  if (malformed.length) {
    console.error(
      `Malformed configured Stripe price IDs: ${malformed.join(', ')}`
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    'Stripe price IDs are centralized and configured IDs are well-formed.'
  );
}
