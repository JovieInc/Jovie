import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { checksumKey } from './checksum';
import { readJsonFile, writeJsonAtomic } from './state-file';
import type { AssetRecord, Checksum, MediaObjectType } from './types';

interface ManifestFile {
  readonly version: 1;
  readonly assets: Record<string, AssetRecord>;
}

interface SkipFile {
  readonly version: 1;
  readonly checksums: string[];
}

export interface TransferLogEntry {
  readonly at: string;
  readonly action: 'ingested' | 'duplicate' | 'skipped' | 'verify-failed';
  readonly sourcePath: string;
  readonly libraryPath: string | null;
  readonly checksum: Checksum;
  readonly objectType: MediaObjectType | null;
}

export interface RejectInvariant {
  readonly itemId: string;
  readonly comment: string;
}

export class Ledger {
  private readonly assetsById: Record<string, AssetRecord>;
  private readonly assetIdsByChecksum = new Map<string, string>();
  private readonly skippedChecksums: Set<string>;

  private constructor(
    private readonly stateDir: string,
    manifest: ManifestFile,
    skips: SkipFile
  ) {
    this.assetsById = manifest.assets;
    this.skippedChecksums = new Set(skips.checksums);
    for (const asset of Object.values(this.assetsById)) {
      this.assetIdsByChecksum.set(checksumKey(asset.checksum), asset.id);
    }
  }

  static async open(stateDir: string): Promise<Ledger> {
    await mkdir(stateDir, { recursive: true });
    const manifest = await readJsonFile<ManifestFile>(
      join(stateDir, 'manifest.json'),
      { version: 1, assets: {} }
    );
    const skips = await readJsonFile<SkipFile>(join(stateDir, 'skips.json'), {
      version: 1,
      checksums: [],
    });
    if (manifest.version !== 1 || skips.version !== 1) {
      throw new Error('Unsupported media ingest state version');
    }
    return new Ledger(stateDir, manifest, skips);
  }

  get transfersPath(): string {
    return join(this.stateDir, 'transfers.jsonl');
  }

  get invariantsPath(): string {
    return join(this.stateDir, 'invariants.jsonl');
  }

  assets(): AssetRecord[] {
    return Object.values(this.assetsById);
  }

  asset(id: string): AssetRecord | null {
    return this.assetsById[id] ?? null;
  }

  findAsset(checksum: Checksum): AssetRecord | null {
    const id = this.assetIdsByChecksum.get(checksumKey(checksum));
    return id ? this.assetsById[id] : null;
  }

  isSkipped(checksum: Checksum): boolean {
    return this.skippedChecksums.has(checksumKey(checksum));
  }

  async recordAsset(asset: AssetRecord): Promise<void> {
    const key = checksumKey(asset.checksum);
    if (this.assetIdsByChecksum.has(key)) {
      throw new Error(`Asset checksum already recorded: ${key}`);
    }
    this.assetsById[asset.id] = asset;
    this.assetIdsByChecksum.set(key, asset.id);
    await this.persistManifest();
  }

  async updateAsset(asset: AssetRecord): Promise<void> {
    if (!this.assetsById[asset.id]) {
      throw new Error(`Cannot update unknown asset: ${asset.id}`);
    }
    this.assetsById[asset.id] = asset;
    this.assetIdsByChecksum.set(checksumKey(asset.checksum), asset.id);
    await this.persistManifest();
  }

  private async persistManifest(): Promise<void> {
    await writeJsonAtomic(join(this.stateDir, 'manifest.json'), {
      version: 1,
      assets: this.assetsById,
    } satisfies ManifestFile);
  }

  async recordSkip(checksum: Checksum): Promise<void> {
    const key = checksumKey(checksum);
    if (this.skippedChecksums.has(key)) return;
    this.skippedChecksums.add(key);
    await writeJsonAtomic(join(this.stateDir, 'skips.json'), {
      version: 1,
      checksums: [...this.skippedChecksums].sort(),
    } satisfies SkipFile);
  }

  async logTransfer(entry: TransferLogEntry): Promise<void> {
    await appendFile(this.transfersPath, `${JSON.stringify(entry)}\n`);
  }

  async appendRejectInvariant(invariant: RejectInvariant): Promise<void> {
    await appendFile(
      this.invariantsPath,
      `${JSON.stringify({ ...invariant, at: new Date().toISOString() })}\n`
    );
  }
}
