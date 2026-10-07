import 'server-only';

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { CertificationReviewPacket } from '@/lib/agent-os/certification';
import { isCertificationReviewPacket } from '@/lib/agent-os/certification-adapter';
import type {
  OvieCertificationDomainId,
  OvieCertificationInventoryIssue,
  OvieCertificationLink,
  OvieCertificationLinkKind,
} from './types';

export const CERTIFICATION_PACKET_FILE_SCHEMA =
  'jovie.certification-packet-file/v1' as const;

/** Domains whose certification items arrive as committed packet files. */
export const PACKET_FILE_DOMAINS = [
  'flows',
  'public_profiles',
  'smart_links',
  'marketing',
  'lyb',
] as const satisfies readonly OvieCertificationDomainId[];

export type PacketFileDomain = (typeof PACKET_FILE_DOMAINS)[number];

const PACKET_FILE_SUFFIX = '.packet.json';
const LINK_KINDS = new Set<OvieCertificationLinkKind>([
  'screenshot',
  'test_run',
  'transcript',
  'pr',
  'doc',
  'other',
]);

export interface CertificationPacketFile {
  readonly domain: OvieCertificationDomainId;
  readonly surface: string;
  readonly packetUpdatedAt: string;
  readonly links: readonly OvieCertificationLink[];
  readonly packet: CertificationReviewPacket;
  /** Repo-relative path, for issue reporting and the rail's source line. */
  readonly file: string;
}

export interface CertificationPacketFileRead {
  readonly root: string | null;
  readonly files: readonly CertificationPacketFile[];
  readonly issues: readonly OvieCertificationInventoryIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPacketFileDomain(value: unknown): value is PacketFileDomain {
  return (PACKET_FILE_DOMAINS as readonly unknown[]).includes(value);
}

function parseLinks(value: unknown): OvieCertificationLink[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const links: OvieCertificationLink[] = [];
  for (const link of value) {
    if (
      !isRecord(link) ||
      typeof link.label !== 'string' ||
      link.label.trim().length === 0 ||
      typeof link.href !== 'string' ||
      link.href.trim().length === 0
    ) {
      return null;
    }
    const kind =
      typeof link.kind === 'string' &&
      LINK_KINDS.has(link.kind as OvieCertificationLinkKind)
        ? (link.kind as OvieCertificationLinkKind)
        : 'other';
    links.push({ label: link.label.trim(), href: link.href.trim(), kind });
  }
  return links;
}

/**
 * Parse one packet file. Returns an error message instead of throwing so one
 * malformed worker packet is reported, never allowed to hide the others.
 */
export function parseCertificationPacketFile(
  raw: unknown,
  file: string
): CertificationPacketFile | string {
  if (!isRecord(raw)) return 'Packet file is not a JSON object.';
  if (raw.schema !== CERTIFICATION_PACKET_FILE_SCHEMA) {
    return `Expected schema ${CERTIFICATION_PACKET_FILE_SCHEMA}.`;
  }
  if (!isPacketFileDomain(raw.domain)) {
    return `Unknown domain ${JSON.stringify(raw.domain)}; expected one of ${PACKET_FILE_DOMAINS.join(', ')}.`;
  }
  if (typeof raw.surface !== 'string' || raw.surface.trim().length === 0) {
    return 'Missing surface label.';
  }
  if (
    typeof raw.packetUpdatedAt !== 'string' ||
    Number.isNaN(Date.parse(raw.packetUpdatedAt))
  ) {
    return 'packetUpdatedAt must be an ISO timestamp.';
  }
  const links = parseLinks(raw.links);
  if (!links) return 'links must be an array of {label, href, kind}.';
  if (!isCertificationReviewPacket(raw.packet)) {
    return 'packet is not a valid jovie.certification/v1 review packet.';
  }
  if (raw.packet.subject.id.trim().length === 0) {
    return 'packet.subject.id must not be empty.';
  }
  return {
    domain: raw.domain,
    surface: raw.surface.trim(),
    packetUpdatedAt: new Date(raw.packetUpdatedAt).toISOString(),
    links,
    packet: raw.packet,
    file,
  };
}

/**
 * Newest packet wins per `domain:subject`; older duplicates are reported so
 * a worker's stale file never silently shadows or replaces the current one.
 */
export function dedupeCertificationPacketFiles(
  files: readonly CertificationPacketFile[]
): {
  readonly files: CertificationPacketFile[];
  readonly issues: OvieCertificationInventoryIssue[];
} {
  const byKey = new Map<string, CertificationPacketFile>();
  const issues: OvieCertificationInventoryIssue[] = [];
  const ordered = [...files].sort(
    (a, b) =>
      Date.parse(b.packetUpdatedAt) - Date.parse(a.packetUpdatedAt) ||
      a.file.localeCompare(b.file)
  );
  for (const file of ordered) {
    const key = `${file.domain}:${file.packet.subject.id}`;
    const kept = byKey.get(key);
    if (kept) {
      issues.push({
        domain: file.domain,
        source: file.file,
        message: `Superseded by newer packet ${kept.file} for ${file.packet.subject.id}.`,
      });
      continue;
    }
    byKey.set(key, file);
  }
  return { files: [...byKey.values()], issues };
}

function packetRootCandidates(): string[] {
  const cwd = process.cwd();
  return [
    resolve(/* turbopackIgnore: true */ cwd, 'runtime-data/docs/certification'),
    resolve(/* turbopackIgnore: true */ cwd, 'docs/certification'),
    resolve(/* turbopackIgnore: true */ cwd, '../../docs/certification'),
  ];
}

async function findPacketRoot(
  candidates: readonly string[]
): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      if ((await stat(/* turbopackIgnore: true */ candidate)).isDirectory()) {
        return candidate;
      }
    } catch {
      // try next
    }
  }
  return null;
}

/** Read every committed packet file. Missing directory = zero packets. */
export async function readCertificationPacketFiles(
  candidates: readonly string[] = packetRootCandidates()
): Promise<CertificationPacketFileRead> {
  const root = await findPacketRoot(candidates);
  if (!root) return { root: null, files: [], issues: [] };

  const parsed: CertificationPacketFile[] = [];
  const issues: OvieCertificationInventoryIssue[] = [];
  const entries = (
    await readdir(/* turbopackIgnore: true */ root, { recursive: true })
  )
    .map(String)
    .filter(entry => entry.endsWith(PACKET_FILE_SUFFIX))
    .sort();

  for (const entry of entries) {
    const file = `docs/certification/${relative(root, join(root, entry))}`;
    let raw: unknown;
    try {
      raw = JSON.parse(
        await readFile(/* turbopackIgnore: true */ join(root, entry), 'utf8')
      );
    } catch {
      issues.push({ domain: null, source: file, message: 'Invalid JSON.' });
      continue;
    }
    const result = parseCertificationPacketFile(raw, file);
    if (typeof result === 'string') {
      issues.push({
        domain:
          isRecord(raw) && isPacketFileDomain(raw.domain) ? raw.domain : null,
        source: file,
        message: result,
      });
      continue;
    }
    parsed.push(result);
  }

  const deduped = dedupeCertificationPacketFiles(parsed);
  return {
    root,
    files: deduped.files,
    issues: [...issues, ...deduped.issues],
  };
}
