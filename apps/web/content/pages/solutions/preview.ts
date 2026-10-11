import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  definePage,
  type PageRecord,
} from '@/data/marketing/factory/pageRecord';

/**
 * Factory preview (JOV-7282): `FACTORY_PREVIEW_RECORD=<recordId>` lets the
 * factory's own local `next build` route one shadow record from
 * `runs/factory/<family>-<slug>/page-record.json`, so the render measurer
 * can measure a candidate before the ramp. The preview is always
 * noindex,nofollow and never in the sitemap.
 *
 * It is refused on every deploy, not only production: any Vercel build
 * (preview included, see lib/security/development-only.ts) and any CI
 * deploy ignores it.
 */

type Env = Readonly<Record<string, string | undefined>>;

export const FACTORY_PREVIEW_ROBOTS = { index: false, follow: false } as const;

/** The requested preview record id, or null when unset or on a deploy. */
export function factoryPreviewRecordId(env: Env = process.env): string | null {
  const id = env.FACTORY_PREVIEW_RECORD?.trim();
  if (!id) return null;
  if (env.VERCEL || env.VERCEL_ENV || env.CI_DEPLOY) return null;
  return id;
}

function defaultRunsDir(): string {
  return join(process.cwd(), '../../runs/factory');
}

/**
 * The preview record, routed as noindex, or null. Only a shadow record
 * qualifies; an id that is missing on disk fails the build loudly.
 */
export function loadFactoryPreviewRecord(
  env: Env = process.env,
  runsDir: string = env.FACTORY_PREVIEW_RUNS_DIR ?? defaultRunsDir()
): PageRecord | null {
  const id = factoryPreviewRecordId(env);
  if (!id) return null;
  const file = join(runsDir, id.replace('.', '-'), 'page-record.json');
  if (!existsSync(file)) {
    throw new Error(`FACTORY_PREVIEW_RECORD ${id}: no page record at ${file}`);
  }
  const record = definePage(JSON.parse(readFileSync(file, 'utf8')));
  if (record.id !== id || record.status !== 'shadow') {
    throw new Error(
      `FACTORY_PREVIEW_RECORD ${id}: ${file} holds ${record.id} (${record.status}); only a shadow record previews`
    );
  }
  return { ...record, status: 'noindex' };
}
