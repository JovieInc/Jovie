import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = readFileSync(
  resolve(process.cwd(), 'app/layout.tsx'),
  'utf8'
);

describe('root layout scripts', () => {
  it('keeps global bootstrap scripts outside client-rendered script tags', () => {
    expect(layoutSource).toContain("import Script from 'next/script';");
    expect(layoutSource).toContain(
      "<Script src='/electron-runtime-init.js' strategy='beforeInteractive' />"
    );
    expect(layoutSource).toContain(
      "<Script src='/theme-init.js' strategy='beforeInteractive' />"
    );
    expect(layoutSource).not.toContain(
      "<script src='/electron-runtime-init.js'"
    );
    expect(layoutSource).not.toContain("<script src='/theme-init.js'");
  });
});
