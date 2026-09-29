import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import {
  BANNED_FOCAL_COMPETITORS,
  buildFocalEvaluation,
  buildIdentityEvaluation,
  evaluateArt,
  loadPassports,
  parseVerdict,
  resolvePassport,
  subscriptionVisionTransport,
} from './art-evaluator.mjs';

// JOV-6918: the vision evaluator gates focal-point discipline and virtual
// model identity. Judge output is scripted per fixture basename; live calls
// only run through the subscription CLIs, never raw API keys.
const FIXTURES = mkdtempSync(join(tmpdir(), 'vision-fixtures-'));
const MANIFEST = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/manifest.json', import.meta.url)),
    'utf8'
  )
);
const fixture = name => join(FIXTURES, name);

// Minimal deterministic PNG encoder — fixture images are synthesized at test
// time because the repo hygiene gate forbids binary additions under scripts/.
function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = px(x, y);
      const o = y * stride + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Green hero: quiet top-down falloff. Red hero: bright specular sphere
// center-frame. C05 comps/render share an icy palette; the drifted render
// uses a warm dark palette (a different person).
const SYNTH = {
  'clean-hero.png': png(64, 64, (_x, y) => {
    const v = 30 + Math.round(60 * (1 - y / 64));
    return [v - 6, v, v + 10];
  }),
  'glass-ball-hero.png': png(64, 64, (x, y) => {
    const d = Math.hypot(x - 32, y - 32);
    if (d < 10) {
      const s = 255 - Math.round(d * 14);
      return [s, s - 10, s - 30];
    }
    const v = 24 + Math.round(30 * (1 - y / 64));
    return [v, v, v + 8];
  }),
  'c05-comp-headshot.png': png(32, 48, (x, y) => [
    200 + Math.round((30 * x) / 32),
    205 + Math.round((20 * y) / 48),
    225,
  ]),
  'c05-comp-three-quarter.png': png(32, 48, () => [204, 210, 224]),
  'c05-comp-full-body-front.png': png(32, 48, () => [198, 206, 222]),
  'c05-comp-profile.png': png(32, 48, () => [206, 212, 226]),
  'c05-render-on-identity.png': png(32, 48, () => [198, 208, 222]),
  'c05-render-drifted.png': png(32, 48, () => [120, 70, 45]),
};
mkdirSync(FIXTURES, { recursive: true });
for (const [name, data] of Object.entries(SYNTH))
  writeFileSync(fixture(name), data);

const VERDICTS = new Map(
  [
    ...MANIFEST.focal.map(entry => entry),
    ...MANIFEST.identity.renders.map(entry => entry),
  ].map(entry => [entry.file, entry.verdict])
);

function scriptedTransport() {
  const calls = [];
  const transport = async request => {
    calls.push(request);
    const verdict = VERDICTS.get(basename(request.images.at(-1)));
    assert.ok(verdict, `no scripted verdict for ${request.images.at(-1)}`);
    return JSON.stringify(verdict);
  };
  return { transport, calls };
}

test('every manifest fixture is synthesized', () => {
  for (const name of [...VERDICTS.keys(), ...MANIFEST.identity.comps])
    assert.ok(SYNTH[name], `missing ${name}`);
});

test('focal evaluator passes a clean hero and fails the glass-ball red fixture', async () => {
  const { transport, calls } = scriptedTransport();
  const clean = await evaluateArt(
    buildFocalEvaluation({
      image: fixture('clean-hero.png'),
      brief: 'pricing hero: headline and CTA upper-left, product right',
    }),
    transport
  );
  assert.equal(clean.ok, true);
  assert.equal(clean.verdict.focalPoint, 'copy zone upper-left');

  const red = await evaluateArt(
    buildFocalEvaluation({
      image: fixture('glass-ball-hero.png'),
      brief: 'pricing hero: headline and CTA upper-left',
    }),
    transport
  );
  assert.equal(red.ok, false);
  assert.ok(red.verdict.competing.includes('literal-sphere-or-glass-ball'));
  assert.equal(calls.length, 2);
});

test('focal prompt asks the focal question and carries every banned category', () => {
  const request = buildFocalEvaluation({
    image: fixture('clean-hero.png'),
    brief: 'editorial section background',
  });
  assert.match(
    request.prompt,
    /what is the intended focal point[\s\S]*competing with it\?/i
  );
  for (const code of BANNED_FOCAL_COMPETITORS)
    assert.ok(request.prompt.includes(code), `missing ${code}`);
  assert.match(request.prompt, /85mm/);
  assert.match(request.prompt, /linear/);
});

test('identity evaluator passes an on-identity C05 render and fails the drifted red', async () => {
  const registry = loadPassports();
  const comps = MANIFEST.identity.comps.map(fixture);
  const { transport } = scriptedTransport();

  const green = await evaluateArt(
    buildIdentityEvaluation({
      modelId: 'C05',
      render: fixture('c05-render-on-identity.png'),
      comps,
      registry,
    }),
    transport
  );
  assert.equal(green.ok, true);
  assert.deepEqual(green.verdict.identityDrift, []);

  const red = await evaluateArt(
    buildIdentityEvaluation({
      modelId: 'C05',
      render: fixture('c05-render-drifted.png'),
      comps,
      registry,
    }),
    transport
  );
  assert.equal(red.ok, false);
  assert.ok(red.verdict.identityDrift.length >= 2);
  assert.match(red.verdict.identityDrift.join(' '), /ice blonde/);
});

test('identity evaluation binds to the passport and all four comp views', () => {
  const registry = loadPassports();
  const comps = MANIFEST.identity.comps.map(fixture);
  const request = buildIdentityEvaluation({
    modelId: 'C05',
    render: fixture('c05-render-on-identity.png'),
    comps,
    registry,
  });
  assert.equal(request.images.length, 5);
  const c05 = resolvePassport(registry, 'C05');
  for (const needle of [c05.hair, c05.eyes, String(c05.heightCm)])
    assert.ok(request.prompt.includes(needle), `prompt missing ${needle}`);
  for (const view of registry.views)
    assert.ok(request.prompt.includes(view), `prompt missing view ${view}`);
  assert.match(request.prompt, /Identity may not drift/);
  assert.throws(
    () =>
      buildIdentityEvaluation({
        modelId: 'C05',
        render: fixture('c05-render-on-identity.png'),
        comps: comps.slice(0, 3),
        registry,
      }),
    /4 comp views/
  );
  assert.throws(
    () =>
      buildIdentityEvaluation({
        modelId: 'C99',
        render: fixture('c05-render-on-identity.png'),
        comps,
        registry,
      }),
    /unknown virtual model/
  );
});

test('a wardrobe note in the verdict does not rescale identity drift', () => {
  const verdict = parseVerdict(
    '{"status":"pass","focalPoint":null,"competing":[],"identityDrift":["eye color reads brown, passport requires grey-blue"],"notes":"wardrobe fine"}'
  );
  assert.equal(verdict.status, 'fail');
});

test('verdict parsing fails closed on malformed judge output', () => {
  assert.throws(() => parseVerdict('not json'), /no JSON object/);
  assert.throws(() => parseVerdict('{"status": 1,,}'), /unparseable/);
  assert.throws(() => parseVerdict('{"status":"maybe"}'), /shape is invalid/);
  assert.throws(() => parseVerdict('{"status":"pass"}'), /shape is invalid/);
});

test('evaluation fails closed when the transport throws', async () => {
  const result = await evaluateArt(
    buildFocalEvaluation({
      image: fixture('clean-hero.png'),
      brief: 'hero',
    }),
    async () => {
      throw new Error('claude exited 1: unavailable');
    }
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /claude exited 1/);
});

test('subscription transport routes codex with -i images and claude with Read only', async () => {
  const spawned = [];
  const spawnImpl = (bin, args, options) => {
    spawned.push({ bin, args, options });
    if (args.includes('-o')) {
      const out = args[args.indexOf('-o') + 1];
      writeFileSync(
        out,
        '{"status":"pass","focalPoint":null,"competing":[],"identityDrift":[],"notes":""}'
      );
      return { status: 0, stdout: '', stderr: '' };
    }
    return {
      status: 0,
      stdout:
        '{"status":"pass","focalPoint":null,"competing":[],"identityDrift":[],"notes":""}',
      stderr: '',
    };
  };
  const transport = subscriptionVisionTransport({ spawnImpl });

  await transport({
    model: 'openai/gpt-5.5',
    system: 's',
    prompt: 'p',
    images: ['/a.png', '/b.png'],
  });
  const codex = spawned.at(-1);
  assert.equal(basename(codex.bin).startsWith('codex'), true);
  assert.deepEqual(
    codex.args.filter(arg => arg === '-i').length,
    2,
    'codex must attach every image with -i'
  );
  assert.ok(codex.args.includes('--skip-git-repo-check'));
  assert.equal(codex.options.env.AI_GATEWAY_API_KEY, undefined);

  await transport({
    model: 'anthropic/claude-opus-5.5',
    system: 's',
    prompt: 'p',
    images: ['/a.png'],
  });
  const claude = spawned.at(-1);
  assert.equal(claude.bin, 'claude');
  assert.ok(claude.args.includes('claude-opus-5-5'));
  assert.ok(claude.args.includes('Read'));
  assert.match(claude.options.input, /\/a\.png/);
});

test('subscription transport rejects raw-key and gateway lanes', async () => {
  const transport = subscriptionVisionTransport({
    spawnImpl: () => ({ status: 0, stdout: '', stderr: '' }),
  });
  await assert.rejects(
    transport({ model: 'zai/glm-5.3', system: 's', prompt: 'p', images: [] }),
    /subscription lane|raw API keys/
  );
  await assert.rejects(
    transport({ model: 'openai', system: 's', prompt: 'p', images: [] }),
    undefined
  );
});

test('request builders require real images on disk', () => {
  assert.throws(
    () => buildFocalEvaluation({ image: 'nope.png', brief: 'x' }),
    /image not found/
  );
  assert.throws(
    () =>
      buildFocalEvaluation({ image: fixture('clean-hero.png'), brief: ' ' }),
    /non-empty brief/
  );
});
