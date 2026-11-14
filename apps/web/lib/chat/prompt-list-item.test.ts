import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildDiscographySection,
  DISCOGRAPHY_PROMPT_ROW_LIMIT,
} from './discography-prompt';
import { promptListItem } from './prompt-list-item';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);

/**
 * Vite rewrites import.meta.url inside scripts/*.mjs, so the copy-leak
 * checker has to run in its own Node process. extract/detect ignore path
 * exclusions, which is the check Source Validation grades with main's scanner.
 */
function markdownHits(relativePath: string): string[] {
  const checker = resolve(repoRoot, 'scripts/invariants/copy-leak/check.mjs');
  const printed = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { readFileSync } from 'node:fs';
       import { pathToFileURL } from 'node:url';
       const root = pathToFileURL(process.env.COPY_LEAK_ROOT + '/');
       const { detect, extract } = await import(pathToFileURL(process.env.COPY_LEAK_CHECKER).href);
       const relativePath = process.env.COPY_LEAK_FILE;
       const source = readFileSync(new URL(relativePath, root), 'utf8');
       const hits = extract(relativePath, source).flatMap(row =>
         detect(row.text, row.context).includes('markdown')
           ? [relativePath + ':' + row.line + ' ' + row.text]
           : []
       );
       process.stdout.write(JSON.stringify(hits));`,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        COPY_LEAK_ROOT: repoRoot,
        COPY_LEAK_CHECKER: checker,
        COPY_LEAK_FILE: relativePath,
      },
    }
  );
  return JSON.parse(printed) as string[];
}

const now = new Date('2026-10-28T15:00:00Z');

describe('promptListItem', () => {
  it('renders a markdown list row without a literal marker in source', () => {
    expect(promptListItem('Named this turn')).toBe('- Named this turn');
    expect(markdownHits('apps/web/lib/chat/prompt-list-item.ts')).toEqual([]);
    expect(markdownHits('apps/web/lib/chat/discography-prompt.ts')).toEqual([]);
  });

  it('keeps catalog status lines explicit', () => {
    const release = {
      title: 'Night Swim',
      releaseType: 'single',
      releaseDate: '2026-10-30T00:00:00.000Z',
      totalTracks: 1,
    };
    expect(
      buildDiscographySection([], now, { status: 'unavailable', total: null })
    ).toBe(
      [
        promptListItem('The release catalog could not be read this turn.'),
        promptListItem(
          'Do not say the artist has no releases and do not guess a release count. If asked, say the catalog is temporarily unavailable and to try again shortly.'
        ),
      ].join('\n')
    );
    expect(buildDiscographySection([], now)).toBe(
      promptListItem('No releases found in the connected discography yet.')
    );
    expect(buildDiscographySection([release], now)).toBe(
      promptListItem(
        'Night Swim (single, 1 track; UPCOMING, out Friday 2026-10-30, in 2 days)'
      )
    );

    const shown = Array.from(
      { length: DISCOGRAPHY_PROMPT_ROW_LIMIT + 1 },
      (_, index) => ({
        title: `Track ${index + 1}`,
        releaseType: 'single',
        releaseDate: '2025-01-01T00:00:00.000Z',
        totalTracks: 1,
      })
    );
    const overflow = buildDiscographySection(shown, now, {
      status: 'ok',
      total: 40,
    });
    expect(overflow).toContain(
      promptListItem(
        `...and ${40 - DISCOGRAPHY_PROMPT_ROW_LIMIT} more releases in the catalog (40 total, ${DISCOGRAPHY_PROMPT_ROW_LIMIT} most recent shown).`
      )
    );
    expect(overflow).toContain(
      promptListItem(
        'This list is truncated. If the artist names a release that is not shown, never claim it is not theirs; tool calls resolve titles against the full catalog.'
      )
    );
    const named = buildDiscographySection(shown, now, undefined, [
      {
        title: 'Never Say A Word',
        releaseType: 'single',
        releaseDate: '2024-02-02T00:00:00.000Z',
        totalTracks: 1,
      },
    ]);
    expect(named).toContain(
      promptListItem(
        `...and ${shown.length - DISCOGRAPHY_PROMPT_ROW_LIMIT} more release in the catalog.`
      )
    );
    expect(named).toContain(
      promptListItem('Named this turn, resolved from the full catalog:')
    );
    expect(named).toContain('Never Say A Word');
  });
});
