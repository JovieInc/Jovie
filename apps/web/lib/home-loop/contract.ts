/**
 * Shared Home loop contract for the mirrored Jovie and Ovie shells
 * (founder decision 2026-10-20, canon/PRODUCT.md "Jovie and Ovie mirror one
 * shell").
 *
 * Both personas fill the same section skeleton: what matters (constraint and
 * pulse), blocked on you (asks), in flight (staged rows), done today, and
 * releases. Jovie supplies the creator's career loop; Ovie supplies the
 * company loop. Presentation components consume only this contract, so an
 * improvement to one Home lands in both.
 */

export const HOME_LOOP_NOT_MEASURED = 'Not measured' as const;

export type HomeLoopTone = 'good' | 'warn' | 'bad' | 'neutral';

/** The single highest-severity condition, always named in text. */
export interface HomeLoopConstraint {
  readonly tone: Exclude<HomeLoopTone, 'good' | 'neutral'>;
  readonly text: string;
}

export interface HomeLoopTile<Key extends string = string> {
  readonly key: Key;
  readonly label: string;
  /** Display value, or `HOME_LOOP_NOT_MEASURED`; never a fabricated zero. */
  readonly value: string;
  /** Previous value, from the source when it has one, else last observed. */
  readonly was: string | null;
  readonly tone: HomeLoopTone;
  readonly measured: boolean;
}

/** Why a row needs attention; `null` when it is moving normally. */
export type HomeLoopAttention = 'blocked' | 'retrying' | 'failing' | null;

export interface HomeLoopRow<Stage extends string = string> {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly url: string | null;
  readonly stage: Stage;
  /** Index into the loop's ordered stages; earlier stages are complete. */
  readonly stageIndex: number;
  /** True once the final stage itself is complete. */
  readonly complete: boolean;
  readonly attention: HomeLoopAttention;
  readonly updatedAt: string | null;
}

export interface HomeLoopDoneItem {
  readonly id: string;
  readonly label: string;
  readonly url: string | null;
  /** Reached the final, verified stage rather than an intermediate landing. */
  readonly verified: boolean;
}

export interface HomeLoopAsk {
  readonly id: string;
  readonly title: string;
  /** The recommended action, shown as the primary one-click answer. */
  readonly recommendation: string;
  /** Collapsed "why" body. */
  readonly why: string;
  /** The recommended answer can be sent in one click. */
  readonly decidable: boolean;
  /** A written reply (request changes) is accepted for this ask. */
  readonly canReply: boolean;
  readonly evidence: readonly string[];
}

/** Last observed tile values, used only to fill `was` when a source has none. */
export type HomeLoopTileMemory<Key extends string = string> = Readonly<
  Partial<Record<Key, { readonly value: string; readonly was: string | null }>>
>;

/**
 * Fill `was` for each tile. A source-provided comparison wins; otherwise the
 * last different measured value from `memory`. Unmeasured tiles get none.
 */
export function withTileHistory<Key extends string>(
  tiles: readonly Omit<HomeLoopTile<Key>, 'was'>[],
  memory: HomeLoopTileMemory<Key>,
  sourceWas: (key: Key) => string | null = () => null
): readonly HomeLoopTile<Key>[] {
  return tiles.map(tile => {
    const remembered = memory[tile.key];
    const fromMemory =
      remembered && tile.measured
        ? remembered.value !== tile.value
          ? remembered.value
          : remembered.was
        : null;
    return { ...tile, was: sourceWas(tile.key) ?? fromMemory };
  });
}

/** Advance tile memory with the latest measured observation. */
export function rememberTiles<Key extends string>(
  memory: HomeLoopTileMemory<Key>,
  tiles: readonly HomeLoopTile<Key>[]
): HomeLoopTileMemory<Key> {
  const next: Partial<
    Record<Key, { readonly value: string; readonly was: string | null }>
  > = { ...memory };
  for (const tile of tiles) {
    if (!tile.measured) continue;
    const previous = memory[tile.key];
    next[tile.key] =
      previous && previous.value !== tile.value
        ? { value: tile.value, was: previous.value }
        : { value: tile.value, was: previous?.was ?? null };
  }
  return next;
}
