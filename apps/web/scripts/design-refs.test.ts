import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';

import { activeDirectionFor } from '@/lib/agent-os/design-reference-corpus/refs-context';
import {
  type DesignRefsDeps,
  paletteTags,
  parseFlags,
  refSlug,
  runDesignRefs,
} from './design-refs';
import { createUrlCapture } from './design-refs-capture';
import {
  designRefsDir,
  liveRefGuard,
  loadCorpus,
  loadDirections,
  writeCorpus,
} from './design-refs-store';

const CANON = designRefsDir(import.meta.dirname, {});

function svg(shape: string, background = '#07080a'): Promise<Buffer> {
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><rect width="1440" height="900" fill="${background}"/>${shape}</svg>`
    )
  )
    .png()
    .toBuffer();
}

const STREAK = '<polygon points="300,900 900,0 1100,0 500,900" fill="#36f"/>';
const ORB = '<circle cx="1100" cy="300" r="220" fill="#f3a"/>';
const BARS =
  '<rect x="100" y="100" width="300" height="700" fill="#fff"/><rect x="900" y="100" width="300" height="700" fill="#fff"/>';

let dir: string;
let deps: DesignRefsDeps;
let lines: string[];
let shots: Record<string, Buffer>;

beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), 'design-refs-cli-'));
  dir = join(root, 'design-refs');
  mkdirSync(join(dir, 'directions'), { recursive: true });
  writeFileSync(
    join(dir, 'corpus.json'),
    JSON.stringify({
      schema: 'jovie.design-reference-corpus/v1',
      references: {},
      candidates: {},
      critiques: [],
      updatedAt: '2026-10-03T00:00:00.000Z',
    })
  );
  cpSync(
    join(CANON, 'directions', 'composer-is-the-page.json'),
    join(dir, 'directions', 'composer-is-the-page.json')
  );
  writeFileSync(
    join(dir, 'scout-seeds.json'),
    JSON.stringify({
      schema: 'jovie.design-refs-scout-seeds/v1',
      seeds: [
        {
          url: 'https://streak.test/',
          surfaces: ['homepage'],
          weight: 0.9,
          mood: ['cinematic'],
          technique: ['glow'],
          why: 'One lit streak.',
        },
        {
          url: 'https://orb.test/',
          surfaces: ['golden-path'],
          weight: 0.5,
          mood: [],
          technique: ['single-input'],
          why: 'One glow.',
        },
        {
          url: 'https://down.test/',
          surfaces: ['homepage'],
          weight: 1,
          mood: [],
          technique: [],
          why: 'Unreachable.',
        },
      ],
    })
  );
  shots = {
    'streak.test': await svg(STREAK),
    'orb.test': await svg(ORB),
  };
  lines = [];
  deps = {
    dir,
    cacheDir: join(root, 'cache'),
    captureUrl: async url => {
      const png = shots[url.hostname];
      if (!png) throw new Error(`capture refused: ${url.hostname}`);
      return {
        jpeg: await sharp(png).jpeg().toBuffer(),
        via: 'playwright',
        title: url.hostname,
      };
    },
    now: () => new Date('2026-10-04T00:00:00.000Z'),
    log: line => lines.push(line),
  };
  mkdirSync(deps.cacheDir);
});

async function file(name: string, shape: string): Promise<string> {
  const path = join(dir, '..', name);
  writeFileSync(path, await svg(shape));
  return path;
}

describe('parseFlags and refSlug', () => {
  it('reads positional args, values, inline values and switches', () => {
    const flags = parseFlags([
      'a.png',
      '--surface',
      'homepage',
      '--limit=3',
      '--json',
    ]);
    expect(flags.positional).toEqual(['a.png']);
    expect(flags.values.get('surface')).toBe('homepage');
    expect(flags.values.get('limit')).toBe('3');
    expect(flags.switches.has('json')).toBe(true);
  });

  it('slugs URLs into stable ids', () => {
    expect(refSlug('https://www.Linear.app/signup')).toBe('linear-app-signup');
  });
});

describe('paletteTags', () => {
  it('names luminance and the dominant hue, or neutral', async () => {
    expect(await paletteTags(await svg('', '#1030c0'))).toEqual([
      'dark',
      'blue',
    ]);
    expect(await paletteTags(await svg('', '#f2f2f2'))).toEqual([
      'light',
      'neutral',
    ]);
  });
});

describe('design-refs add / pull / guard', () => {
  it('ingests a file with provenance and hash, then skips its duplicate', async () => {
    const shot = await file('streak.png', STREAK);
    const argv = [
      'add',
      shot,
      '--surface',
      'homepage,golden-path',
      '--mood',
      'cinematic',
      '--summary',
      'Lit streak',
    ];
    expect(await runDesignRefs(argv, deps)).toBe(0);
    const record = loadCorpus(dir).references.streak;
    expect(record.status).toBe('proposed');
    expect(record.reference.tags?.surfaces).toEqual([
      'homepage',
      'golden-path',
    ]);
    expect(record.reference.tags?.palette).toContain('dark');
    expect(record.reference.media).toMatchObject({
      capturedVia: 'file',
      file: 'streak.jpg',
    });
    expect(existsSync(join(deps.cacheDir, 'streak.jpg'))).toBe(true);

    expect(await runDesignRefs([...argv, '--id', 'again'], deps)).toBe(0);
    expect(lines.at(-1)).toMatch(/^skip: again duplicates streak/u);
  });

  it('captures URLs through the injected capture and rejects bad input', async () => {
    expect(
      await runDesignRefs(
        [
          'add',
          'https://orb.test/',
          '--surface',
          'golden-path',
          '--kind',
          'founder-work',
        ],
        deps
      )
    ).toBe(0);
    expect(
      loadCorpus(dir).references['orb-test'].reference.source
    ).toMatchObject({ kind: 'founder-work', url: 'https://orb.test/' });
    await expect(runDesignRefs(['add', 'x.png'], deps)).rejects.toThrow(
      /--surface/u
    );
    await expect(
      runDesignRefs(
        ['add', 'x.png', '--surface', 'a', '--variable', 'nope'],
        deps
      )
    ).rejects.toThrow(/--variable/u);
  });

  it('pulls a prompt block or JSON for a surface', async () => {
    await runDesignRefs(
      [
        'add',
        await file('orb.png', ORB),
        '--surface',
        'golden-path',
        '--technique',
        'single-input',
      ],
      deps
    );
    lines = [];
    await runDesignRefs(['pull', '--surface', 'golden-path'], deps);
    expect(lines[0]).toContain('Active direction: The Composer Is the Page');
    lines = [];
    await runDesignRefs(['pull', '--surface', 'golden-path', '--json'], deps);
    const json = JSON.parse(lines[0]);
    expect(json.direction).toBe('composer-is-the-page');
    expect(json.references[0]).toMatchObject({
      id: 'orb',
      image: join(deps.cacheDir, 'orb.jpg'),
    });
    await expect(runDesignRefs(['pull'], deps)).rejects.toThrow(/--surface/u);
  });

  it('guard exits 1 on a near-copy and 0 on original work', async () => {
    await runDesignRefs(
      ['add', await file('streak.png', STREAK), '--surface', 'homepage'],
      deps
    );
    expect(
      await runDesignRefs(['guard', await file('copy.png', STREAK)], deps)
    ).toBe(1);
    expect(lines.at(-1)).toMatch(/bits from streak$/u);
    expect(
      await runDesignRefs(['guard', await file('bars.png', BARS)], deps)
    ).toBe(0);
    expect(
      await runDesignRefs(
        ['guard', await file('bars2.png', BARS), '--max-distance', '256'],
        deps
      )
    ).toBe(1);
    await expect(runDesignRefs(['guard'], deps)).rejects.toThrow(
      /image paths/u
    );
  });
});

describe('design-refs scout', () => {
  it('ranks new captures, skips failures, and leaves unchanged sites out on re-run', async () => {
    expect(await runDesignRefs(['scout', '--limit', '1', '--dry'], deps)).toBe(
      0
    );
    expect(lines).toContain('would add streak-test score=0.900');
    expect(Object.keys(loadCorpus(dir).references)).toEqual([]);

    lines = [];
    await runDesignRefs(['scout'], deps);
    expect(
      lines.some(line => line.startsWith('skipped: https://down.test/'))
    ).toBe(true);
    expect(Object.keys(loadCorpus(dir).references).sort()).toEqual([
      'orb-test',
      'streak-test',
    ]);

    lines = [];
    await runDesignRefs(['scout'], deps);
    expect(lines.filter(line => line.startsWith('unchanged'))).toHaveLength(2);

    shots['orb.test'] = await svg(BARS);
    lines = [];
    await runDesignRefs(['scout'], deps);
    expect(lines.some(line => line.startsWith('added orb-test-20261004'))).toBe(
      true
    );
  });
});

describe('design-refs directions and usage', () => {
  it('lists directions and rejects unknown commands', async () => {
    await runDesignRefs(['directions'], deps);
    expect(lines[0]).toMatch(/^active +composer-is-the-page \[golden-path\]/u);
    expect(await runDesignRefs(['nope'], deps)).toBe(1);
    expect(await runDesignRefs([], deps)).toBe(0);
  });
});

describe('createUrlCapture', () => {
  const png = () => svg(ORB);
  function fetcher(contentType: string): typeof fetch {
    return (async (input: string | URL, init?: RequestInit) => {
      if (String(input).endsWith('/robots.txt'))
        return new Response('', { status: 404 });
      if (init?.method === 'HEAD')
        return new Response(null, { headers: { 'content-type': contentType } });
      return new Response(new Uint8Array(await png()));
    }) as typeof fetch;
  }

  it('fetches a direct image as a fold JPEG', async () => {
    const captured = await createUrlCapture(fetcher('image/png'))(
      new URL('https://img.test/art.png')
    );
    expect(captured).toMatchObject({ via: 'image-fetch', title: 'art.png' });
    expect((await sharp(captured.jpeg).metadata()).format).toBe('jpeg');
  });

  it('hands pages to the fold capture and refuses blocked hosts', async () => {
    const fold = async () => ({
      jpeg: Buffer.from(''),
      via: 'playwright' as const,
      title: 'page',
    });
    expect(
      (
        await createUrlCapture(
          fetcher('text/html'),
          fold
        )(new URL('https://site.test/'))
      ).via
    ).toBe('playwright');
    await expect(
      createUrlCapture(
        fetcher('text/html'),
        fold
      )(new URL('https://dribbble.com/shots/1'))
    ).rejects.toThrow(/capture refused/u);
  });
});

describe('design-refs store', () => {
  it('writes one reference per line and round-trips', async () => {
    await runDesignRefs(
      ['add', await file('orb.png', ORB), '--surface', 'golden-path'],
      deps
    );
    const corpus = loadCorpus(dir);
    writeCorpus(dir, corpus);
    const text = readFileSync(join(dir, 'corpus.json'), 'utf8');
    expect(
      text.split('\n').filter(line => line.startsWith('    "orb": {'))
    ).toHaveLength(1);
    expect(loadCorpus(dir)).toEqual(corpus);
  });

  it('honours DESIGN_REFS_DIR and fails loudly with no corpus', () => {
    expect(designRefsDir('/', { DESIGN_REFS_DIR: dir })).toBe(dir);
    expect(() => designRefsDir(tmpdir(), {})).toThrow(/No canon\/design-refs/u);
    expect(loadDirections(join(dir, 'missing'))).toEqual([]);
  });

  it('builds the factory guard from the corpus and the marketing direction', () => {
    const guard = liveRefGuard('marketing', CANON);
    expect(guard.references.length).toBeGreaterThan(0);
    expect(guard.direction?.id).toBe('one-light');
  });
});

describe('canon/design-refs', () => {
  const refs = loadCorpus(CANON);
  const directions = loadDirections(CANON);

  it('every direction cites references that exist', () => {
    for (const entry of directions) {
      for (const id of entry.referenceIds) {
        expect(refs.references[id], `${entry.id} -> ${id}`).toBeDefined();
      }
    }
  });

  it('has at most one active direction per surface, with homepage and golden path covered', () => {
    const surfaces = directions
      .filter(entry => entry.status === 'active')
      .flatMap(entry => entry.surfaces);
    expect(new Set(surfaces).size).toBe(surfaces.length);
    expect(activeDirectionFor(directions, 'homepage')).not.toBeNull();
    expect(activeDirectionFor(directions, 'golden-path')).not.toBeNull();
  });

  it('keeps third-party pixels out of git: every ref is hashed, no images committed', () => {
    for (const record of Object.values(refs.references)) {
      expect(record.reference.media?.dhash).toMatch(/^[0-9a-f]{64}$/u);
    }
    const files = readdirSync(CANON, { recursive: true }).map(String);
    expect(
      files.filter(name => /\.(jpe?g|png|webp|gif)$/iu.test(name))
    ).toEqual([]);
  });
});
