import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadIconSource } from './icons';
import {
  type DocsInputs,
  type LegalInputs,
  PLATFORMS,
  type Platform,
  type ReadinessInputs,
  type ReceiptSet,
} from './readiness';

const RECEIPT_FILES = {
  agentPathCert: 'agent-path-cert.json',
  trustSurfaceVisual: 'trust-surface-visual.json',
  homepageTasteApproval: 'homepage-taste.json',
} as const;

const readText = (path: string) => readFile(path, 'utf8').catch(() => null);

async function readJson(path: string): Promise<unknown> {
  const text = await readText(path);
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { _unparseable: true };
  }
}

export async function readReceipts(
  receiptsDir: string
): Promise<Record<Platform, ReceiptSet>> {
  const entries = await Promise.all(
    PLATFORMS.map(async platform => {
      const set: Record<string, unknown> = {};
      for (const [gate, file] of Object.entries(RECEIPT_FILES))
        set[gate] = await readJson(join(receiptsDir, platform, file));
      return [platform, set as ReceiptSet] as const;
    })
  );
  return Object.fromEntries(entries) as Record<Platform, ReceiptSet>;
}

export async function readLegalInputs(webDir: string): Promise<LegalInputs> {
  const [
    footerSource,
    routesSource,
    privacyText,
    termsText,
    privacyPage,
    termsPage,
  ] = await Promise.all([
    readText(join(webDir, 'components/site/public-shell.constants.ts')),
    readText(join(webDir, 'constants/routes.ts')),
    readText(join(webDir, 'content/legal/privacy.md')),
    readText(join(webDir, 'content/legal/terms.md')),
    readText(join(webDir, 'app/(dynamic)/legal/privacy/page.tsx')),
    readText(join(webDir, 'app/(dynamic)/legal/terms/page.tsx')),
  ]);
  return {
    footerSource: footerSource ?? '',
    routesSource: routesSource ?? '',
    privacyText: privacyText ?? '',
    termsText: termsText ?? '',
    privacyPageExists: privacyPage !== null,
    termsPageExists: termsPage !== null,
  };
}

export async function readDocsInputs(webDir: string): Promise<DocsInputs> {
  const [pageSource, routesSource, snapshot] = await Promise.all([
    readText(join(webDir, 'app/(marketing)/developers/agents/page.tsx')),
    readText(join(webDir, 'constants/routes.ts')),
    readJson(
      join(webDir, 'lib/agent-distribution/generated/tools-list.snapshot.json')
    ),
  ]);
  const tools = (snapshot as { tools?: unknown } | undefined)?.tools;
  return {
    pageSource,
    routesSource: routesSource ?? '',
    snapshotTools: Array.isArray(tools) ? tools : null,
  };
}

export async function readReadinessInputs(
  webDir: string
): Promise<ReadinessInputs> {
  const [receipts, legal, docs, icons] = await Promise.all([
    readReceipts(join(webDir, 'lib/agent-distribution/receipts')),
    readLegalInputs(webDir),
    readDocsInputs(webDir),
    loadIconSource(resolve(webDir, '../..')),
  ]);
  return { receipts, legal, docs, icons: icons?.info ?? null };
}
