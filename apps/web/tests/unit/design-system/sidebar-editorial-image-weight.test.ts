import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

// The sidebar editorial card paints this image on every app page, so its
// bytes count against each route's image budget in the exact-build
// performance gate (500KB on /app/library). Keep it small (JOV-7973).
const MAX_BYTES = 16 * 1024;

describe('sidebar editorial card image weight', () => {
  it('keeps the release card background under 16KB', () => {
    const { size } = statSync(
      resolve(appRoot, 'public/images/changelog/sidebar-announcement.webp')
    );
    expect(size).toBeLessThanOrEqual(MAX_BYTES);
  });
});
