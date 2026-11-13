/**
 * Pixel values of System B radius tokens from `styles/design-system.css`.
 *
 * Prefer CSS vars (`var(--radius-3xl)`) in stylesheets and Tailwind named
 * utilities (`rounded-3xl`, `rounded-full`). Use these numeric constants only
 * when a runtime animation API (Motion/WAAPI) requires a number or when a
 * shared geometry helper must return a resolved px value.
 *
 * Choose outer radii through the shared surface owner. Derived inner radii
 * and dimension-resolved controls need not land on the token scale. `pill`
 * and `full` are CSS saturation values, never measured arc radii.
 */
export const SYSTEM_B_RADIUS_PX = {
  none: 0,
  xs: 2,
  default: 4,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  pill: 9999,
  full: 9999,
} as const;

export type SystemBRadiusToken = keyof typeof SYSTEM_B_RADIUS_PX;

/**
 * Shared inset distances that participate in System B's concentric-surface
 * rule. These values intentionally mirror `--space-*` in design-system.css.
 */
export const SYSTEM_B_SURFACE_INSET_PX = {
  1: 4,
} as const;

/**
 * System B surface geometry.
 *
 * These pairs describe circular corners with a uniform border-box inset.
 * They do not classify DOM children, adjacent rows, or floating previews as
 * concentric. For measured geometry use resolveSystemBRadiusPx below.
 *
 * Use the CSS aliases with the same names in `styles/design-system.css` for
 * classes. This typed representation exists for geometry helpers and tests.
 */
export const SYSTEM_B_CONCENTRIC_SURFACES = {
  card: {
    outer: 'xl',
    inner: 'lg',
    inset: 1,
  },
  overlay: {
    outer: 'xl',
    inner: 'lg',
    inset: 1,
  },
  panel: {
    outer: '3xl',
    inner: '2xl',
    inset: 1,
  },
} as const satisfies Record<
  string,
  {
    readonly outer: SystemBRadiusToken;
    readonly inner: SystemBRadiusToken;
    readonly inset: keyof typeof SYSTEM_B_SURFACE_INSET_PX;
  }
>;

/** Visible border-box dimensions in CSS px, excluding any invisible hit area. */
interface VisibleSize {
  readonly width: number;
  readonly height: number;
}

interface SurfaceInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

type Surface = keyof typeof SYSTEM_B_CONCENTRIC_SURFACES;

/**
 * Assigned by the shared component owner, never inferred from DOM ancestry.
 * A pinned viewport frame is square; a floating preview is a separate rounded
 * surface. Rows and controls inside either keep their own semantic roles.
 *
 * This helper is shadow geometry evidence until rendered consumers qualify it;
 * it does not add a delivery gate or change existing token/CSS consumers.
 */
export type SystemBRadiusRole =
  | { readonly role: 'edge-attached-frame' }
  | {
      readonly role: 'rounded-surface';
      readonly surface: Surface;
      readonly visibleSize: VisibleSize;
    }
  | {
      readonly role: 'inset-surface';
      readonly surface: Surface;
      readonly outerVisibleSize: VisibleSize;
      readonly relationship: 'nested-parallel' | 'adjacent' | 'uncontained';
      /** Outer border edge to inner border edge, including border + padding once. */
      readonly insetPx: SurfaceInsets;
    }
  | {
      readonly role: 'capsule-control' | 'circle-control';
      readonly visibleSize: VisibleSize;
    };

function halfShortSide(size: VisibleSize): number {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new RangeError(
      'Visible border-box dimensions must be finite and positive'
    );
  }
  return Math.min(size.width, size.height) / 2;
}

/**
 * Derive a uniform circular inner arc from resolved outer border-box geometry.
 * Elliptical corners and unequal axis/side insets are explicitly unsupported:
 * subtracting x/y independently does not produce a parallel elliptical curve.
 * Callers with mixed per-corner radii must use a qualified per-corner owner.
 */
export function deriveSystemBInnerRadiusPx(input: {
  readonly outerRadiusPx: { readonly x: number; readonly y: number };
  readonly insetPx: SurfaceInsets;
  readonly relationship: 'nested-parallel' | 'adjacent' | 'uncontained';
}): number {
  const { outerRadiusPx: radius, insetPx: inset, relationship } = input;
  const values = [
    radius.x,
    radius.y,
    inset.top,
    inset.right,
    inset.bottom,
    inset.left,
  ];
  if (values.some(value => !Number.isFinite(value) || value < 0)) {
    throw new RangeError('Radii and insets must be finite and nonnegative');
  }
  if (
    radius.x === SYSTEM_B_RADIUS_PX.full ||
    radius.y === SYSTEM_B_RADIUS_PX.full
  ) {
    throw new RangeError(
      'Resolve CSS saturation tokens from visible dimensions first'
    );
  }
  if (relationship !== 'nested-parallel') {
    throw new RangeError(
      'Only nested parallel surfaces have a concentric inset'
    );
  }
  if (
    radius.x !== radius.y ||
    inset.top !== inset.right ||
    inset.top !== inset.bottom ||
    inset.top !== inset.left
  ) {
    throw new RangeError(
      'Only circular corners with uniform insets are supported'
    );
  }
  return Math.max(0, radius.x - inset.top);
}

/** Resolve used circular radii, including CSS overlap clamping, in CSS px. */
export function resolveSystemBRadiusPx(input: SystemBRadiusRole): number {
  switch (input.role) {
    case 'edge-attached-frame':
      return SYSTEM_B_RADIUS_PX.none;
    case 'circle-control':
      if (input.visibleSize.width !== input.visibleSize.height) {
        throw new RangeError(
          'Circle controls require equal visible dimensions'
        );
      }
      return halfShortSide(input.visibleSize);
    case 'capsule-control':
      return halfShortSide(input.visibleSize);
    case 'rounded-surface':
      return Math.min(
        SYSTEM_B_RADIUS_PX[SYSTEM_B_CONCENTRIC_SURFACES[input.surface].outer],
        halfShortSide(input.visibleSize)
      );
    case 'inset-surface': {
      const outerRadius = resolveSystemBRadiusPx({
        role: 'rounded-surface',
        surface: input.surface,
        visibleSize: input.outerVisibleSize,
      });
      const innerRadius = deriveSystemBInnerRadiusPx({
        outerRadiusPx: { x: outerRadius, y: outerRadius },
        insetPx: input.insetPx,
        relationship: input.relationship,
      });
      // Reject collapsed or inverted children, even when their radius is zero.
      halfShortSide({
        width:
          input.outerVisibleSize.width -
          input.insetPx.left -
          input.insetPx.right,
        height:
          input.outerVisibleSize.height -
          input.insetPx.top -
          input.insetPx.bottom,
      });
      return innerRadius;
    }
  }
}
