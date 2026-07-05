import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import type {
  DspAvatarItem,
  DspStatus,
} from '@/components/shell/DspAvatarStack';
import type { ReleaseStatus } from '@/components/shell/StatusBadge';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { DSP_CONFIGS } from '@/lib/dsp-registry';

/**
 * Neutral fallback avatar color for providers missing from both registries.
 * Points at a System B text token so no raw hex leaks into this adapter.
 */
const FALLBACK_DSP_COLOR = 'var(--linear-text-quaternary)';

/**
 * Major DSPs surfaced in the shell-v1 release row's stacked avatars. Order
 * matches the visual sort: live providers come first regardless, but among
 * equal-status providers this is the tiebreaker.
 *
 * Glyph + brand color per DSP — kept short (1 letter) so the 20px avatar
 * stays legible. Colors come from the canonical DSP registry.
 */
const SHELL_DSP_META: ReadonlyArray<{
  readonly id: string;
  readonly providerKey: 'spotify' | 'apple_music' | 'youtube_music' | 'tidal';
  readonly label: string;
  readonly glyph: string;
  readonly iconPath: string;
  readonly color: string;
}> = [
  {
    id: 'spotify',
    providerKey: 'spotify',
    label: 'Spotify',
    glyph: 'S',
    iconPath: DSP_LOGO_CONFIG.spotify.iconPath,
    color: DSP_CONFIGS.spotify.color,
  },
  {
    id: 'apple_music',
    providerKey: 'apple_music',
    label: 'Apple Music',
    glyph: 'A',
    iconPath: DSP_LOGO_CONFIG.apple_music.iconPath,
    color: DSP_CONFIGS.apple_music.color,
  },
  {
    id: 'youtube_music',
    providerKey: 'youtube_music',
    label: 'YouTube Music',
    glyph: 'Y',
    iconPath: DSP_LOGO_CONFIG.youtube_music.iconPath,
    color: DSP_CONFIGS.youtube_music.color,
  },
  {
    id: 'tidal',
    providerKey: 'tidal',
    label: 'TIDAL',
    glyph: 'T',
    iconPath: DSP_LOGO_CONFIG.tidal.iconPath,
    color: DSP_CONFIGS.tidal.color,
  },
];

/**
 * Map production `release.providers[]` -> shell `DspAvatarItem[]`.
 *
 * The four major DSPs (Spotify / Apple Music / YouTube Music / TIDAL) always
 * render as anchors: links present -> live, links absent -> missing. Every
 * OTHER provider the release actually has a link for is appended as `live`,
 * so the avatar stack + popover reflect the release's full provider coverage
 * instead of capping at the four hardcoded majors (JovieInc/Jovie#11493).
 *
 * We intentionally drop the `pending`/`error` states because production has
 * no sync-state per provider here (see ProviderStatusDot for the cell-level
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

  const majorKeys = new Set<string>(SHELL_DSP_META.map(m => m.providerKey));

  const majors = SHELL_DSP_META.map(
    meta =>
      ({
        id: meta.id,
        label: meta.label,
        glyph: meta.glyph,
        iconPath: meta.iconPath,
        color: meta.color,
        status: providersByKey.has(meta.providerKey) ? 'live' : 'missing',
      }) satisfies {
        id: string;
        label: string;
        glyph: string;
        iconPath: string;
        color: string;
        status: DspStatus;
      }
  );

  const rest: DspAvatarItem[] = release.providers
    .filter(p => !majorKeys.has(p.key))
    .map(p => {
      const config = DSP_CONFIGS[p.key];
      const logoConfig = DSP_LOGO_CONFIG[p.key];
      const label = config?.name ?? p.label;
      return {
        id: p.key,
        label,
        glyph: label.charAt(0).toUpperCase(),
        iconPath: logoConfig?.iconPath,
        color:
          config?.color ?? PROVIDER_CONFIG[p.key]?.accent ?? FALLBACK_DSP_COLOR,
        status: 'live' as const,
      };
    });

  return [...majors, ...rest];
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
