import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sameChecksum } from './checksum';
import type { AssetRecord, Checksum } from './types';

interface ManifestFile {
  assets: Record<string, AssetRecord>;
}

export interface TransferLogEntry {
  ts: string;
  action: 'ingested' | 'duplicate' | 'skipped' | 'verify-failed';
  sourcePath: string;
  libraryPath: string | null;
  checksum: Checksum;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/**
 * Persistent ingest state: manifest of ingested assets, an append-only
 * transfer log, a skip ledger (skipped checksums never reopen), and an
 * invariants log collecting session-end reject comments.
 */
export class Ledger {
  private manifest: ManifestFile = { assets: {} };
  private skipChecksums = new Set<string>();

  private constructor(private readonly stateDir: string) {}

  static async open(stateDir: string): Promise<Ledger> {
    const ledger = new Ledger(stateDir);
    await mkdir(stateDir, { recursive: true });
    ledger.manifest = await readJson<ManifestFile>(ledger.manifestPath, {
      assets: {},
    });
    const skips = await readJson<string[]>(ledger.skipsPath, []);
    for (const checksum of skips) ledger.skipChecksums.add(checksum);
    return ledger;
  }

  get manifestPath(): string {
    return join(this.stateDir, 'manifest.json');
  }

  get transfersPath(): string {
    return join(this.stateDir, 'transfers.jsonl');
  }

  get skipsPath(): string {
    return join(this.stateDir, 'skips.json');
  }

  get invariantsPath(): string {
    return join(this.stateDir, 'invariants.jsonl');
  }

  findAsset(checksum: Checksum): AssetRecord | null {
    for (const asset of Object.values(this.manifest.assets)) {
      if (sameChecksum(asset.checksum, checksum)) return asset;
    }
    return null;
  }

  isSkipped(checksum: Checksum): boolean {
    return this.skipChecksums.has(checksum.sha256);
  }

  async recordSkip(checksum: Checksum): Promise<void> {
    if (this.skipChecksums.has(checksum.sha256)) return;
    this.skipChecksums.add(checksum.sha256);
    await writeFile(
      this.skipsPath,
      `${JSON.stringify([...this.skipChecksums], null, 2)}\n`
    );
  }

  async recordAsset(asset: AssetRecord): Promise<void> {
    this.manifest.assets[asset.id] = asset;
    await writeFile(
      this.manifestPath,
      `${JSON.stringify(this.manifest, null, 2)}\n`
    );
  }

  async updateAsset(asset: AssetRecord): Promise<void> {
    this.manifest.assets[asset.id] = asset;
    await writeFile(
      this.manifestPath,
      `${JSON.stringify(this.manifest, null, 2)}\n`
    );
  }

  assets(): AssetRecord[] {
    return Object.values(this.manifest.assets);
  }

  async logTransfer(entry: TransferLogEntry): Promise<void> {
    await appendFile(this.transfersPath, `${JSON.stringify(entry)}\n`);
  }

  async appendInvariant(comment: string, context?: string): Promise<void> {
    await appendFile(
      this.invariantsPath,
      `${JSON.stringify({ ts: new Date().toISOString(), comment, context: context ?? null })}\n`
    );
  }
}
