import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(currentDir, '..');
const distDir = resolve(appDir, 'dist');

mkdirSync(distDir, { recursive: true });

const copies = [
  ['public/manifest.json', 'manifest.json'],
  ['public/sidepanel.html', 'sidepanel.html'],
  ['src/styles.css', 'styles.css'],
];

for (const [source, target] of copies) {
  const sourcePath = resolve(appDir, source);
  const targetPath = resolve(distDir, target);

  if (existsSync(sourcePath)) {
    cpSync(sourcePath, targetPath);
  }
}

const builtEntries = ['background.js', 'content.js', 'sidepanel.js'];

for (const entry of builtEntries) {
  const sourcePath = resolve(distDir, 'apps/extension/src', entry);
  const targetPath = resolve(distDir, entry);

  if (existsSync(sourcePath)) {
    cpSync(sourcePath, targetPath);
  }
}
