'use client';

import { useCallback, useMemo, useState } from 'react';
import { PillSearch } from '@/components/shell/PillSearch';
import type {
  FilterField,
  FilterPill,
} from '@/components/shell/pill-search.types';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { releaseStatusToShell } from './release-adapters';
import { ShellReleaseRow } from './ShellReleaseRow';

/**
 * Match a release against a single filter value. Field-level operator
 * (`is`/`is not`) is applied by the caller; this returns whether the value
 * matches at all. Production data drops the `album` and `bpm`/`key` fields
 * (those are sandbox-only); we mirror the shell-v1 set otherwise.
 */
function releaseMatchesField(
  release: ReleaseViewModel,
  field: FilterField,
  value: string
): boolean {
  const v = value.toLowerCase();
  switch (field) {
    case 'artist':
      return (release.artistNames ?? []).some(name =>
        name.toLowerCase().includes(v)
      );
    case 'title':
      return release.title.toLowerCase().includes(v);
    case 'album':
      // Production model treats each release as the album-level entity.
      // Match against title so artists searching by album name still find it.
      return release.title.toLowerCase().includes(v);
    case 'status':
      return releaseStatusToShell(release.status) === value;
    case 'has':
      // 'video' = release has any short-form video provider links wired.
      // 'canvas' = release has Spotify Canvas attached.
      if (value === 'video') return Boolean(release.hasVideoLinks);
      if (value === 'canvas') {
        const status = release.canvasStatus;
        return status === 'generated' || status === 'uploaded';
      }
      return false;
  }
}

/**
 * Apply the pill list to a release. Pills are AND-combined across fields;
 * values within a single pill are OR-combined; the `op` flips the match.
 */
function applyPills(
  releases: readonly ReleaseViewModel[],
  pills: readonly FilterPill[]
): ReleaseViewModel[] {
  if (pills.length === 0) return [...releases];
  return releases.filter(r =>
    pills.every(pill => {
      const anyValueMatches = pill.values.some(v =>
        releaseMatchesField(r, pill.field, v)
      );
      return pill.op === 'is' ? anyValueMatches : !anyValueMatches;
    })
  );
}

/**
 * Distinct value lists fed to PillSearch's slash-menu suggestions. Cap at
 * a sane size so the suggestion popover stays scannable on artists with
 * deep catalogs.
 */
function distinctValues(
  releases: readonly ReleaseViewModel[],
  pick: (r: ReleaseViewModel) => string | string[] | undefined
): string[] {
  const seen = new Set<string>();
  for (const r of releases) {
    const picked = pick(r);
    if (Array.isArray(picked)) {
      for (const v of picked) if (v) seen.add(v);
    } else if (picked) {
      seen.add(picked);
    }
    if (seen.size >= 200) break;
  }
  return [...seen];
}

/**
 * Top-level Linear-style releases view, rendered behind DESIGN_V1_RELEASES.
 *
 * Replaces the legacy `ReleasesExperience` provider matrix with a thin
 * shell-row list + PillSearch header. Drawer wiring lands in a follow-up
 * wave; this PR ships the list + filter so the user can sanity-check the
 * row design before we spend a week on the drawer tabs.
 */
export function ShellReleasesView({
  releases,
}: {
  readonly releases: readonly ReleaseViewModel[];
}) {
  const [searchOpen, setSearchOpen] = useState(true);
  const [pills, setPills] = useState<FilterPill[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
    null
  );

  const visibleReleases = useMemo(
    () => applyPills(releases, pills),
    [releases, pills]
  );

  const artistOptions = useMemo(
    () => distinctValues(releases, r => r.artistNames),
    [releases]
  );
  const titleOptions = useMemo(
    () => distinctValues(releases, r => r.title),
    [releases]
  );
  const albumOptions = titleOptions; // production has no separate album field

  const handleSelect = useCallback((id: string) => {
    setSelectedReleaseId(prev => (prev === id ? null : id));
  }, []);

  return (
    <section
      aria-label='Releases'
      className='flex h-full flex-col focus:outline-none'
      data-design-v1-releases='true'
      data-testid='shell-releases-view'
    >
      <header className='shrink-0 px-4 pt-3 pb-2 border-b border-(--linear-app-shell-border)/60'>
        <div className='flex items-center gap-2'>
          <h1 className='text-[14px] font-caption tracking-[-0.01em] text-primary-token'>
            Releases
          </h1>
          <span className='text-[11px] tabular-nums text-quaternary-token'>
            {visibleReleases.length}
            {visibleReleases.length !== releases.length
              ? ` of ${releases.length}`
              : ''}
          </span>
        </div>
        <div className='mt-2'>
          <PillSearch
            active={searchOpen}
            pills={pills}
            onPillsChange={setPills}
            artistOptions={artistOptions}
            titleOptions={titleOptions}
            albumOptions={albumOptions}
            onClose={() => {
              setSearchOpen(false);
              setPills([]);
            }}
          />
        </div>
      </header>

      <div className='flex-1 min-h-0 overflow-y-auto'>
        {visibleReleases.length === 0 ? (
          <div className='py-12 grid place-items-center text-center'>
            <div>
              <div className='text-[13px] font-caption text-secondary-token'>
                {releases.length === 0
                  ? 'No releases yet'
                  : 'No releases match your filters'}
              </div>
              {pills.length > 0 ? (
                <button
                  type='button'
                  onClick={() => setPills([])}
                  className='mt-2 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors duration-150 ease-out'
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            role='listbox'
            aria-label='Releases'
            className='py-1.5 space-y-px px-2'
          >
            {visibleReleases.map(r => (
              <ShellReleaseRow
                key={r.id}
                release={r}
                isSelected={r.id === selectedReleaseId}
                onSelect={() => handleSelect(r.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
