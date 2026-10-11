import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fixturePacket } from './fixtures';
import {
  CERTIFICATION_PACKET_FILE_SCHEMA,
  type CertificationPacketFile,
  dedupeCertificationPacketFiles,
  parseCertificationPacketFile,
  readCertificationPacketFiles,
} from './packet-files.server';

function fileBody(overrides: Record<string, unknown> = {}) {
  return {
    schema: CERTIFICATION_PACKET_FILE_SCHEMA,
    domain: 'flows',
    surface: 'Golden Path',
    packetUpdatedAt: '2026-09-27T07:00:00Z',
    links: [
      {
        label: 'Transcript',
        href: 'https://example.test/t',
        kind: 'transcript',
      },
    ],
    packet: fixturePacket('signup'),
    ...overrides,
  };
}

describe('parseCertificationPacketFile', () => {
  it('accepts a valid packet file and normalizes its timestamp and links', () => {
    const parsed = parseCertificationPacketFile(
      fileBody({
        links: [
          {
            label: ' Shot ',
            href: ' https://example.test/s.png ',
            kind: 'nope',
          },
        ],
      }),
      'docs/certification/a.packet.json'
    );
    expect(parsed).toMatchObject({
      domain: 'flows',
      surface: 'Golden Path',
      packetUpdatedAt: '2026-09-27T07:00:00.000Z',
      links: [
        { label: 'Shot', href: 'https://example.test/s.png', kind: 'other' },
      ],
      file: 'docs/certification/a.packet.json',
    });
  });

  it.each([
    ['not an object', [], 'Packet file is not a JSON object.'],
    ['wrong schema', fileBody({ schema: 'v0' }), /Expected schema/],
    [
      'unknown domain',
      fileBody({ domain: 'billing' }),
      /Unknown domain "billing"/,
    ],
    ['blank surface', fileBody({ surface: ' ' }), 'Missing surface label.'],
    [
      'bad timestamp',
      fileBody({ packetUpdatedAt: 'yesterday' }),
      /ISO timestamp/,
    ],
    ['bad links', fileBody({ links: [{ label: 'x' }] }), /links must be/],
    [
      'invalid packet',
      fileBody({ packet: { contract: 'x' } }),
      /valid jovie.certification/,
    ],
    [
      'blank subject',
      fileBody({
        packet: {
          ...fixturePacket('x'),
          subject: { id: ' ', kind: 'flow', title: 'X' },
        },
      }),
      /subject.id must not be empty/,
    ],
  ])('rejects %s with a reportable message', (_label, raw, message) => {
    const parsed = parseCertificationPacketFile(raw, 'f.packet.json');
    expect(typeof parsed).toBe('string');
    expect(parsed).toMatch(message);
  });
});

describe('dedupeCertificationPacketFiles', () => {
  it('keeps the newest packet per domain subject and reports the superseded file', () => {
    const base = parseCertificationPacketFile(
      fileBody(),
      'docs/certification/old.packet.json'
    ) as CertificationPacketFile;
    const newer = {
      ...base,
      packetUpdatedAt: '2026-09-27T09:00:00.000Z',
      file: 'docs/certification/new.packet.json',
    };
    const otherDomain = {
      ...base,
      domain: 'lyb' as const,
      file: 'lyb.packet.json',
    };

    const result = dedupeCertificationPacketFiles([base, newer, otherDomain]);
    expect(result.files.map(file => file.file).sort()).toEqual([
      'docs/certification/new.packet.json',
      'lyb.packet.json',
    ]);
    expect(result.issues).toEqual([
      {
        domain: 'flows',
        source: 'docs/certification/old.packet.json',
        message:
          'Superseded by newer packet docs/certification/new.packet.json for signup.',
      },
    ]);
  });
});

describe('readCertificationPacketFiles', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0))
      rmSync(root, { recursive: true, force: true });
  });

  it('treats a missing directory as zero packets', async () => {
    await expect(
      readCertificationPacketFiles(['/definitely/not/here'])
    ).resolves.toEqual({
      root: null,
      files: [],
      issues: [],
    });
  });

  it('reads nested packet files and reports malformed ones without hiding the rest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cert-packets-'));
    roots.push(root);
    mkdirSync(join(root, '2026-09-27', 'flows'), { recursive: true });
    writeFileSync(
      join(root, '2026-09-27', 'flows', 'signup.packet.json'),
      JSON.stringify(fileBody())
    );
    writeFileSync(join(root, '2026-09-27', 'broken.packet.json'), '{nope');
    writeFileSync(
      join(root, '2026-09-27', 'wrong.packet.json'),
      JSON.stringify(fileBody({ domain: 'lyb', surface: '' }))
    );
    writeFileSync(join(root, '2026-09-27', 'notes.md'), '# not a packet');

    const result = await readCertificationPacketFiles([root]);
    expect(result.root).toBe(root);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      domain: 'flows',
      file: 'docs/certification/2026-09-27/flows/signup.packet.json',
    });
    expect(result.issues).toEqual([
      {
        domain: null,
        source: 'docs/certification/2026-09-27/broken.packet.json',
        message: 'Invalid JSON.',
      },
      {
        domain: 'lyb',
        source: 'docs/certification/2026-09-27/wrong.packet.json',
        message: 'Missing surface label.',
      },
    ]);
  });
});
