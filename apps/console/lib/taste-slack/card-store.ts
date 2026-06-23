import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TasteInboxLabel } from '../linear';

export interface TasteSlackCardRecord {
  readonly issueId: string;
  readonly identifier: string;
  readonly title: string;
  readonly label: TasteInboxLabel;
  readonly channel: string;
  readonly messageTs: string;
  readonly postedAt: string;
}

interface TasteSlackCardStoreFile {
  readonly cardsByIssueId: Record<string, TasteSlackCardRecord>;
  readonly issueIdByMessageTs: Record<string, string>;
}

const EMPTY_STORE: TasteSlackCardStoreFile = {
  cardsByIssueId: {},
  issueIdByMessageTs: {},
};

export function resolveTasteSlackCardStorePath(
  rootDir = path.resolve(process.cwd(), 'data')
): string {
  return path.join(rootDir, 'taste-slack-cards.json');
}

async function readStore(storePath: string): Promise<TasteSlackCardStoreFile> {
  try {
    const raw = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<TasteSlackCardStoreFile>;
    return {
      cardsByIssueId: parsed.cardsByIssueId ?? {},
      issueIdByMessageTs: parsed.issueIdByMessageTs ?? {},
    };
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return EMPTY_STORE;
    }
    throw error;
  }
}

async function writeStore(
  storePath: string,
  store: TasteSlackCardStoreFile
): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

export async function getTasteSlackCardByIssueId(
  issueId: string,
  storePath = resolveTasteSlackCardStorePath()
): Promise<TasteSlackCardRecord | null> {
  const store = await readStore(storePath);
  return store.cardsByIssueId[issueId] ?? null;
}

export async function getTasteSlackCardByMessageTs(
  messageTs: string,
  storePath = resolveTasteSlackCardStorePath()
): Promise<TasteSlackCardRecord | null> {
  const store = await readStore(storePath);
  const issueId = store.issueIdByMessageTs[messageTs];
  if (!issueId) return null;
  return store.cardsByIssueId[issueId] ?? null;
}

export async function saveTasteSlackCard(
  record: TasteSlackCardRecord,
  storePath = resolveTasteSlackCardStorePath()
): Promise<void> {
  const store = await readStore(storePath);
  const nextStore: TasteSlackCardStoreFile = {
    cardsByIssueId: {
      ...store.cardsByIssueId,
      [record.issueId]: record,
    },
    issueIdByMessageTs: {
      ...store.issueIdByMessageTs,
      [record.messageTs]: record.issueId,
    },
  };
  await writeStore(storePath, nextStore);
}
