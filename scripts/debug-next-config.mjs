// Debug script to test if next.config.js can be loaded
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.join(__dirname, '..', 'apps', 'web');

console.log('[v0] Testing next.config.js loading from:', webDir);
console.log('[v0] Node version:', process.version);

// Test each require individually
const require = createRequire(path.join(webDir, 'package.json'));

try {
  console.log('[v0] Testing require("path")...');
  require('path');
  console.log('[v0] OK: path');
} catch (e) {
  console.error('[v0] FAIL: path -', e.message);
}

try {
  console.log('[v0] Testing require("@codecov/webpack-plugin")...');
  require('@codecov/webpack-plugin');
  console.log('[v0] OK: @codecov/webpack-plugin');
} catch (e) {
  console.error('[v0] FAIL: @codecov/webpack-plugin -', e.message);
}

try {
  console.log('[v0] Testing require("../../version.json")...');
  const v = require('../../version.json');
  console.log('[v0] OK: version.json -', v);
} catch (e) {
  console.error('[v0] FAIL: version.json -', e.message);
}

try {
  console.log('[v0] Testing require("@next/bundle-analyzer")...');
  require('@next/bundle-analyzer');
  console.log('[v0] OK: @next/bundle-analyzer');
} catch (e) {
  console.error('[v0] FAIL: @next/bundle-analyzer -', e.message);
}

try {
  console.log('[v0] Testing require("@sentry/nextjs")...');
  require('@sentry/nextjs');
  console.log('[v0] OK: @sentry/nextjs');
} catch (e) {
  console.error('[v0] FAIL: @sentry/nextjs -', e.message);
}

try {
  console.log('[v0] Testing require("@vercel/toolbar/plugins/next")...');
  require('@vercel/toolbar/plugins/next');
  console.log('[v0] OK: @vercel/toolbar/plugins/next');
} catch (e) {
  console.error('[v0] FAIL: @vercel/toolbar/plugins/next -', e.message);
}

// Try loading the actual next.config.js
try {
  console.log('[v0] Testing full next.config.js load...');
  process.chdir(webDir);
  const config = require('./next.config.js');
  console.log('[v0] OK: next.config.js loaded successfully');
  console.log('[v0] Config type:', typeof config);
} catch (e) {
  console.error('[v0] FAIL: next.config.js -', e.message);
  console.error('[v0] Stack:', e.stack?.split('\n').slice(0, 5).join('\n'));
}
