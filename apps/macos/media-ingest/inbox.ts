import { join } from 'node:path';
import type { Ledger, RejectInvariant } from './ledger';
import { readJsonFile, writeJsonAtomic } from './state-file';
import type { AssetRecord, InboxItem, InboxStatus } from './types';

interface InboxFile {
  readonly version: 1;
  readonly items: InboxItem[];
}

export class Inbox {
  private readonly itemsById = new Map<string, InboxItem>();

  private constructor(
    private readonly stateDir: string,
    private readonly ledger: Ledger,
    items: InboxItem[]
  ) {
    for (const item of items) this.itemsById.set(item.id, item);
  }

  static async open(stateDir: string, ledger: Ledger): Promise<Inbox> {
    const file = await readJsonFile<InboxFile>(join(stateDir, 'inbox.json'), {
      version: 1,
      items: [],
    });
    if (file.version !== 1) throw new Error('Unsupported inbox state version');
    return new Inbox(stateDir, ledger, file.items);
  }

  pending(): InboxItem[] {
    return [...this.itemsById.values()].filter(
      item => item.status === 'pending'
    );
  }

  get(id: string): InboxItem | null {
    return this.itemsById.get(id) ?? null;
  }

  async add(asset: AssetRecord): Promise<InboxItem> {
    const id = `inbox-${asset.id}`;
    const existing = this.itemsById.get(id);
    if (existing) {
      if (
        asset.objectType !== 'owned-media' &&
        (existing.retouchEligible || existing.contentEligible)
      ) {
        existing.retouchEligible = false;
        existing.contentEligible = false;
        await this.persist();
      }
      return existing;
    }
    const item: InboxItem = {
      id,
      assetId: asset.id,
      status: 'pending',
      retouchEligible: false,
      contentEligible: false,
      decidedAt: null,
    };
    this.itemsById.set(id, item);
    await this.persist();
    return item;
  }

  async swipeKeep(id: string): Promise<InboxItem> {
    const item = this.requirePendingOrSame(id, 'kept');
    if (item.status === 'kept') return item;
    const asset = this.requireAsset(item.assetId);
    item.status = 'kept';
    item.decidedAt = new Date().toISOString();
    item.retouchEligible = asset.objectType === 'owned-media';
    item.contentEligible = asset.objectType === 'owned-media';
    await this.persist();
    return item;
  }

  async swipeSkip(id: string): Promise<InboxItem> {
    const item = this.requirePendingOrSame(id, 'skipped');
    if (item.status === 'skipped') return item;
    const asset = this.requireAsset(item.assetId);
    await this.ledger.recordSkip(asset.checksum);
    item.status = 'skipped';
    item.decidedAt = new Date().toISOString();
    item.retouchEligible = false;
    item.contentEligible = false;
    await this.persist();
    return item;
  }

  async closeSession(rejects: readonly RejectInvariant[]): Promise<void> {
    for (const reject of rejects) {
      const comment = reject.comment.trim();
      if (!comment) continue;
      const item = this.itemsById.get(reject.itemId);
      if (!item || item.status !== 'skipped') {
        throw new Error(
          `Reject comment requires a skipped item: ${reject.itemId}`
        );
      }
      await this.ledger.appendRejectInvariant({
        itemId: reject.itemId,
        comment,
      });
    }
  }

  private requirePendingOrSame(id: string, next: InboxStatus): InboxItem {
    const item = this.itemsById.get(id);
    if (!item) throw new Error(`Unknown inbox item: ${id}`);
    if (item.status !== 'pending' && item.status !== next) {
      throw new Error(`${item.status} items cannot be changed to ${next}`);
    }
    return item;
  }

  private requireAsset(id: string): AssetRecord {
    const asset = this.ledger.asset(id);
    if (!asset) throw new Error(`Asset missing for inbox item: ${id}`);
    return asset;
  }

  private async persist(): Promise<void> {
    await writeJsonAtomic(join(this.stateDir, 'inbox.json'), {
      version: 1,
      items: [...this.itemsById.values()],
    } satisfies InboxFile);
  }
}
