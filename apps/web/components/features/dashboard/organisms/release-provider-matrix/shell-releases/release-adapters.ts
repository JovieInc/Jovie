import type {
  DspAvatarItem,
  DspStatus,
} from '@/components/shell/DspAvatarStack';
import type { ReleaseStatus } from '@/components/shell/StatusBadge';
import type { ReleaseViewModel } from '@/lib/discography/types';

/**
 * Major DSPs surfaced in the shell-v1 release row's stacked avatars. Order
 * matches the visual sort: live providers come first regardless, but among
 * equal-status providers this is the tiebreaker.
 *
 * Glyph + colorClass per DSP — kept short (1 letter) so the 20px avatar
 * stays legible. Brand colors are ~70% saturation tokens shipped with
 * Tailwind so they harmonize with the dark surface.
 */
const SHELL_DSP_META: ReadonlyArray<{
  readonly id: string;
  readonly providerKey: 'spotify' | 'apple_music' | 'youtube_music' | 'tidal';
  readonly label: string;
  readonly glyph: string;
  readonly colorClass: string;
}> = [
  {
    id: 'spotify',
    providerKey: 'spotify',
    label: 'Spotify',
    glyph: 'S',
    colorClass: 'bg-emerald-500/90',
  },
  {
    id: 'apple_music',
    providerKey: 'apple_music',
    label: 'Apple Music',
    glyph: 'A',
    colorClass: 'bg-rose-400/90',
  },
  {
    id: 'youtube_music',
    providerKey: 'youtube_music',
    label: 'YouTube Music',
    glyph: 'Y',
    colorClass: 'bg-red-500/90',
  },
  {
    id: 'tidal',
    providerKey: 'tidal',
    label: 'TIDAL',
    glyph: 'T',
    colorClass: 'bg-sky-400/90',
  },
];

/**
 * Map production `release.providers[]` -> shell `DspAvatarItem[]`. Each major
 * DSP is rendered: links present -> live, links absent -> missing. We
 * intentionally drop the `pending`/`error` states because production has no
 * sync-state per provider here (see ProviderStatusDot for the cell-level
 * sync indicator that lives in the legacy matrix).
 */
export function releaseToDspItems(release: ReleaseViewModel): DspAvatarItem[] {
  const providersByKey = new Map<
    string,
    ReleaseViewModel['providers'][number]
  >();
  for (const p of release.providers) {
    providersByKey.set(p.key, p);
  }
  return SHELL_DSP_META.map(
    meta =>
      ({
        id: meta.id,
        label: meta.label,
        glyph: meta.glyph,
        colorClass: meta.colorClass,
        status: providersByKey.has(meta.providerKey) ? 'live' : 'missing',
      }) satisfies {
        id: string;
        label: string;
        glyph: string;
        colorClass: string;
        status: DspStatus;
      }
  );
}

/**
 * Map production `ReleaseViewModel['status']` -> shell `ReleaseStatus`. The
 * shell badge enum is the superset (live / scheduled / draft / announced /
 * hidden); production uses the three shipped today.
 */
export function releaseStatusToShell(
  status: ReleaseViewModel['status']
): ReleaseStatus {
  if (status === 'released') return 'live';
  return status; // 'draft' | 'scheduled' map 1:1
}
