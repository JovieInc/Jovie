import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Scanner behind tab-canon-ratchet.test.ts. Two detectable drawer/panel
 * regressions:
 *
 * 1. A tab UI that is not built from the canonical pill segmented control
 *    (TabBar / DrawerTabs / DrawerTabStrip / InspectorTabs share one set of
 *    pill classes). Hand-rolled `role="tab"` markup is an offender.
 * 2. The same field rendered twice in one panel: a fact row label that
 *    repeats, or a fact row whose label is also a section title in the file.
 */

export const CANONICAL_TAB_FILES: ReadonlySet<string> = new Set([
  'components/molecules/tab-bar/TabBar.tsx',
  'components/shell/DrawerTabStrip.tsx',
  'components/molecules/inspector/InspectorTabs.tsx',
]);

const SOURCE_EXT = /\.tsx$/;
const SKIP_FILE = /\.(stories|test|spec)\.tsx$/;
const TAB_ROLE =
  /(?<!\[)role=(?:'tab'|"tab"|\{'tab'\})|<Tabs\.Trigger\b|<TabsTrigger\b/;
const ROW =
  /<(?:MetadataRow|InspectorRow|DrawerPropertyRow|SettingsRow)\b[^>]*?\blabel=(?:'([^']+)'|"([^"]+)")/gs;
const SECTION =
  /<(?:InspectorSection|DrawerSection|DrawerSectionHeading)\b[^>]*?\btitle=(?:'([^']+)'|"([^"]+)")/gs;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry) && !SKIP_FILE.test(entry)) {
      out.push(full);
    }
  }
}

export function runtimeFiles(webRoot: string): string[] {
  const files: string[] = [];
  for (const dir of ['app', 'components']) walk(join(webRoot, dir), files);
  return files;
}

export function findTabOffenders(webRoot: string): string[] {
  return runtimeFiles(webRoot)
    .map(file => relative(webRoot, file))
    .filter(rel => !CANONICAL_TAB_FILES.has(rel))
    .filter(rel => TAB_ROLE.test(readFileSync(join(webRoot, rel), 'utf8')))
    .sort();
}

function matches(re: RegExp, source: string): string[] {
  return Array.from(source.matchAll(re), m =>
    (m[1] ?? m[2] ?? '').trim().toLowerCase()
  );
}

export function findDuplicateFields(webRoot: string): string[] {
  const out: string[] = [];
  for (const file of runtimeFiles(webRoot)) {
    const source = readFileSync(file, 'utf8');
    // `field-once-ok` marks rows that sit in mutually exclusive branches.
    if (source.includes('field-once-ok')) continue;
    const rows = matches(ROW, source);
    const sections = new Set(matches(SECTION, source));
    const seen = new Set<string>();
    for (const label of rows) {
      if (seen.has(label) || sections.has(label)) {
        out.push(`${relative(webRoot, file)}::${label}`);
      }
      seen.add(label);
    }
  }
  return Array.from(new Set(out)).sort();
}
