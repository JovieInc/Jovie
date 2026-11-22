import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  resolve(process.cwd(), 'styles/system-b-app.css'),
  'utf8'
);

/** Root text size and viewport height of a start-entry-continuity row. */
const heightInRem = (viewportHeight: number, rootFontSize: number) =>
  viewportHeight / rootFontSize;

function roomQuery() {
  const match = styles.match(
    /@container onboarding-session \(height < ([\d.]+)rem\) \{([\s\S]*?)\n\}/
  );
  expect(match, 'onboarding-session room query').not.toBeNull();
  return { threshold: Number(match![1]), body: match![2]! };
}

// JOV-7771 / JOV-14243: jsdom has no layout, so this pins the CSS contract
// that keeps the /start composer on screen. The e2e row
// start-entry-continuity "390x615 with 32px root text" checks the pixels.
describe('/start room for large text (JOV-7771)', () => {
  it('makes the session column a size container', () => {
    const rule = styles.match(/\.system-b-onboarding-session \{[^}]*\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toContain('container: onboarding-session / size');
  });

  it('hides the step rail and the peek strip when the column is short in rem', () => {
    const { body } = roomQuery();
    expect(body).toContain('.system-b-onboarding-step-rail');
    expect(body).toContain('.system-b-onboarding-profile-peek');
    expect(body).toContain('display: none');
  });

  it('yields at 390x615 with 32px text and keeps the rail where it fits', () => {
    const { threshold } = roomQuery();
    // The failing matrix row: the rail pushed the send button off screen.
    expect(heightInRem(615, 32)).toBeLessThan(threshold);
    // Rows that pass with the rail showing keep it.
    expect(heightInRem(615, 24)).toBeGreaterThanOrEqual(threshold);
    expect(heightInRem(844, 32)).toBeGreaterThanOrEqual(threshold);
    expect(heightInRem(900, 32)).toBeGreaterThanOrEqual(threshold);
    expect(heightInRem(615, 16)).toBeGreaterThanOrEqual(threshold);
  });
});
