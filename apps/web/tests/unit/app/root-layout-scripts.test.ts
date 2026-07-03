import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = readFileSync(
  resolve(process.cwd(), 'app/layout.tsx'),
  'utf8'
);

describe('root layout scripts', () => {
  it('keeps global bootstrap scripts outside client-rendered script tags', () => {
    expect(layoutSource).not.toContain("import Script from 'next/script';");
    expect(layoutSource).toContain(
      "<script src='/electron-runtime-init.js' />"
    );
    expect(layoutSource).toContain("<script src='/theme-init.js' />");
    expect(layoutSource).not.toContain('beforeInteractive');
  });
});
