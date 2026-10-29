import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = path =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const release = read('.github/workflows/production-release.yml');
const prebuildWorkflow = read('.github/workflows/production-prebuild.yml');
const staging = read('.github/workflows/staging-controller.yml');
const shared = read('.github/scripts/production-build-and-deploy.sh');

function job(text, name) {
  const start = text.indexOf(`\n  ${name}:\n`);
  expect(start, `${name} job`).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n/u);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe('production prebuild overlap', () => {
  it('only builds and stages an unpromoted deployment', () => {
    const prebuild = job(release, 'prebuild-production');
    expect(prebuild).toContain("inputs.release_mode == 'prebuild'");
    expect(prebuild).toContain('production_build_and_deploy');
    expect(prebuild).not.toContain('continue-on-error');
    expect(shared).toContain('--prebuilt --archive=tgz --prod --skip-domain');
    expect(prebuild).not.toMatch(
      /vercel (alias|promote)|drizzle|promote-production-deployment/u
    );
  });

  it('runs from its own workflow so it cannot change Staging Controller', () => {
    expect(prebuildWorkflow).toContain('release_mode: prebuild');
    expect(prebuildWorkflow).toContain('controller-hop-exception');
    expect(staging).not.toContain('prebuild');
  });

  it('keeps every promotion check on a reused deployment', () => {
    const promote = job(release, 'promote-production');
    expect(promote).toContain('id: prebuilt');
    expect(promote).toContain('production_build_and_deploy');
    for (const gate of [
      'production-input-provenance.mjs bind',
      'staged_production_canary_failed',
      'id: performance-gate',
      'id: journey-gate',
      'id: final-current',
      'id: promote',
    ]) {
      expect(promote, gate).toContain(gate);
    }
    // The lookup may only shorten a release: it must exit 0 on any miss.
    expect(promote).toContain('building in the promote job');
  });
});
