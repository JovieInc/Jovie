import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  hashPlateSpec,
  hashStageSpec,
} from '../../../apps/web/scripts/imagery/spec-hash.mjs';
import { check, loadStages, verdictFailures } from './imagery.mjs';
import { REPO_ROOT } from './paths.mjs';

const verdict = {
  pass: true,
  findings: [],
  judge: 'geometry+clef+dogfood',
  model: 'clef,m',
  at: '2026-10-29T00:00:00Z',
  imageHash: 'abc',
};

/** A repo-shaped tmp dir with the real stages, shots, and one fresh verified manifest. */
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'imagery-'));
  mkdirSync(join(root, 'apps/web/lib/imagery'), { recursive: true });
  mkdirSync(join(root, 'apps/web/lib/screenshots'), { recursive: true });
  mkdirSync(join(root, 'apps/web/public/assets/generated'), {
    recursive: true,
  });
  cpSync(
    join(REPO_ROOT, 'apps/web/lib/imagery/stages.ts'),
    join(root, 'apps/web/lib/imagery/stages.ts')
  );
  const shots = JSON.parse(
    readFileSync(
      join(REPO_ROOT, 'apps/web/lib/screenshots/product-shots.manifest.json'),
      'utf8'
    )
  );
  writeFileSync(
    join(root, 'apps/web/lib/screenshots/product-shots.manifest.json'),
    JSON.stringify(shots)
  );
  const stages = await loadStages(root);
  const manifest = { schema: 'jovie.imagery/v1', plates: {}, stages: {} };
  for (const stage of stages) {
    manifest.plates[stage.plate.id] = { specHash: hashPlateSpec(stage) };
    manifest.stages[stage.id] = {
      specHash: hashStageSpec(stage, shots.shots),
      verdicts: { desktop: verdict, mobile: verdict },
    };
    for (const format of ['avif', 'webp']) {
      const file = join(
        root,
        `apps/web/public/assets/generated/${stage.plate.id}.${format}`
      );
      writeFileSync(file, 'x');
      writeFileSync(
        `${file}.meta.json`,
        JSON.stringify({ accent: stage.plate.accent, subject: 'abstract' })
      );
    }
  }
  writeFileSync(
    join(root, 'apps/web/lib/imagery/imagery.manifest.json'),
    JSON.stringify(manifest)
  );
  return { root, manifest, stages, shots };
}

const save = (root, manifest) =>
  writeFileSync(
    join(root, 'apps/web/lib/imagery/imagery.manifest.json'),
    JSON.stringify(manifest)
  );

describe('imagery guard', () => {
  it('passes a fresh, verified, generated stage set', async () => {
    const { root } = await fixture();
    assert.deepEqual((await check(root)).failures, []);
  });

  it('fails an unverified stage (no verdicts)', async () => {
    const { root, manifest, stages } = await fixture();
    delete manifest.stages[stages[0].id].verdicts;
    save(root, manifest);
    const { failures } = await check(root);
    assert.ok(failures.some(f => /unverified, no verdict/.test(f)));
  });

  it('fails a stage whose shot was re-rendered after verification', async () => {
    const { root, shots, stages } = await fixture();
    const shotId = stages[0].layers[0].shotId;
    shots.shots[shotId].sourceHash = 'changed';
    writeFileSync(
      join(root, 'apps/web/lib/screenshots/product-shots.manifest.json'),
      JSON.stringify(shots)
    );
    const { failures } = await check(root);
    assert.ok(failures.some(f => /stale, the stage spec or a shot/.test(f)));
  });

  it('fails a stale plate and a missing plate file', async () => {
    const { root, manifest, stages } = await fixture();
    manifest.plates[stages[0].plate.id].specHash = 'old';
    save(root, manifest);
    writeFileSync(
      join(
        root,
        `apps/web/public/assets/generated/${stages[1].plate.id}.avif.meta.json`
      ),
      '{"accent":"pulse","subject":"abstract"}'
    );
    const { failures } = await check(root);
    assert.ok(failures.some(f => /plate is stale/.test(f)));
    assert.ok(failures.some(f => /must declare accent/.test(f)));
  });

  it('fails a failed, unjudged or incomplete verdict', () => {
    assert.match(
      verdictFailures('s', 'desktop', {
        ...verdict,
        pass: false,
        findings: ['x'],
      })[0],
      /verification failed: x/
    );
    assert.match(
      verdictFailures('s', 'mobile', { ...verdict, judge: 'geometry' })[0],
      /unjudged.*clef and dogfood/
    );
    assert.match(
      verdictFailures('s', 'mobile', { ...verdict, imageHash: '' })[0],
      /missing imageHash/
    );
  });

  it('fails orphans in the manifest', async () => {
    const { root, manifest } = await fixture();
    manifest.stages.ghost = { specHash: 'x' };
    manifest.plates.ghost = { specHash: 'x' };
    save(root, manifest);
    const { failures } = await check(root);
    assert.equal(
      failures.filter(f => /has no registered stage/.test(f)).length,
      2
    );
  });
});

describe('imagery guard on the committed repo', () => {
  it('runs against the real manifest without crashing', async () => {
    const { failures } = await check(REPO_ROOT);
    assert.ok(Array.isArray(failures));
  });
});
