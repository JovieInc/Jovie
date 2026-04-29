#!/usr/bin/env tsx
/**
 * Print actual PNG dimensions for every published product screenshot.
 *
 * Output is the typed object literal expected by `PUBLIC_EXPORT_DIMENSIONS`
 * in `apps/web/lib/screenshots/registry.ts`. Width/height are read directly
 * from each PNG's IHDR chunk so the registry can advertise true aspect
 * ratios to next/image.
 *
 * Usage:
 *   pnpm tsx scripts/print-screenshot-dimensions.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PNG_DIR = join(process.cwd(), 'apps/web/public/product-screenshots');

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// PNG signature is 8 bytes; the IHDR chunk follows immediately:
//   bytes 8..12   chunk length (always 13 for IHDR)
//   bytes 12..16  chunk type "IHDR"
//   bytes 16..20  width  (uint32 big-endian)
//   bytes 20..24  height (uint32 big-endian)
function readPngDimensions(filePath: string): {
  width: number;
  height: number;
} {
  const buf = readFileSync(filePath);
  if (buf.length < 24) {
    throw new Error(`File too small to be a PNG: ${filePath}`);
  }
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Not a PNG (invalid signature): ${filePath}`);
  }
  const ihdr = buf.toString('ascii', 12, 16);
  if (ihdr !== 'IHDR') {
    throw new Error(`Not a PNG (missing IHDR): ${filePath}`);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function main(): void {
  const entries = readdirSync(PNG_DIR)
    .filter(name => name.endsWith('.png'))
    .sort();

  const lines: string[] = [];
  for (const name of entries) {
    const { width, height } = readPngDimensions(join(PNG_DIR, name));
    lines.push(`  '${name}': { width: ${width}, height: ${height} },`);
  }

  process.stdout.write(
    `const PUBLIC_EXPORT_DIMENSIONS: Record<\n  string,\n  { readonly width: number; readonly height: number }\n> = {\n${lines.join('\n')}\n};\n`
  );
}

main();
