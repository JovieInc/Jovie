import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Ledger } from './ledger';
import type { AssetRecord, InboxItem } from './types';

interface InboxFile {
  items: InboxItem[];
}

/**
 * Swipe inbox: every ingested asset lands pending. Keep → retouch pipeline
 * and content-creation eligible (unless the asset is fan-sourced — fans are
 * presence objects, never retouch jobs). Skip → recorded in the skip ledger
 * so re-ingest never reopens it. Session-end reject comments append to the
 * invariants log.
 */
export class Inbox {
  private items = new Map<string, InboxItem>();

  private constructor(
    private readonly stateDir: string,
    private readonly ledger: Ledger
  ) {}

  static async open(stateDir: string, ledger: Ledger): Promise<Inbox> {
    const inbox = new Inbox(stateDir, ledger);
    await mkdir(stateDir, { recursive: true });
    try {
      const file = JSON.parse(await readFile(inbox.path, 'utf8')) as InboxFile;
      for (const item of file.items) inbox.items.set(item.id, item);
    } catch {
      // empty inbox
    }
    return inbox;
  }

  private get path(): string {
    return join(this.stateDir, 'inbox.json');
  }

  private async persist(): Promise<void> {
    const file: InboxFile = { items: [...this.items.values()] };
    await writeFile(this.path, `${JSON.stringify(file, null, 2)}\n`);
  }

  async add(asset: AssetRecord): Promise<InboxItem> {
    const existing = [...this.items.values()].find(
      item => item.assetId === asset.id
    );
    if (existing) return existing;
    const item: InboxItem = {
      id: `inbox-${asset.id}`,
      assetId: asset.id,
      status: 'pending',
      retouchEligible: false,
      contentEligible: false,
      decidedAt: null,
    };
    this.items.set(item.id, item);
    await this.persist();
    return item;
  }

  pending(): InboxItem[] {
    return [...this.items.values()].filter(item => item.status === 'pending');
  }

  get(id: string): InboxItem | null {
    return this.items.get(id) ?? null;
  }

  async swipeKeep(id: string, asset: AssetRecord): Promise<InboxItem> {
    const item = this.require(id);
    if (item.status === 'skipped') {
      throw new Error('skipped items cannot be reopened');
    }
    item.status = 'kept';
    item.decidedAt = new Date().toISOString();
    const isFan = asset.origin === 'fan';
    item.retouchEligible = !isFan;
    item.contentEligible = !isFan;
    await this.persist();
    return item;
  }

  async swipeSkip(id: string, asset: AssetRecord): Promise<InboxItem> {
    const item = this.require(id);
    item.status = 'skipped';
    item.decidedAt = new Date().toISOString();
    item.retouchEligible = false;
    item.contentEligible = false;
    await this.persist();
    await this.ledger.recordSkip(asset.checksum);
    return item;
  }

  /** Session end: owner comments on rejects become invariants. */
  async closeSession(rejectComments: string[]): Promise<void> {
    for (const comment of rejectComments) {
      await this.ledger.appendInvariant(comment, 'inbox-session-reject');
    }
  }

  private require(id: string): InboxItem {
    const item = this.items.get(id);
    if (!item) throw new Error(`unknown inbox item: ${id}`);
    return item;
  }
}
