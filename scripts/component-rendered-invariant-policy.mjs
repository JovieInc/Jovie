const BOX_TOLERANCE_PX = 0.5;

const CHECKMARK_OR_EMOJI =
  /[\u{1f000}-\u{1faff}\u2600-\u27bf]|\u2713|\u2714|\u2611|\u2705/u;

function pushIssue(issues, rule, detail, variant = null) {
  issues.push({ rule, detail, ...(variant ? { variant } : {}) });
}

function differs(left, right) {
  return Math.abs(Number(left) - Number(right)) > BOX_TOLERANCE_PX;
}

function boxesDiffer(left, right) {
  if (!left || !right) return false;
  return ['x', 'y', 'width', 'height'].some(key =>
    differs(left[key], right[key])
  );
}

function geometryDiffers(left, right) {
  if (!left || !right) return true;
  return Object.keys(left).some(key => differs(left[key], right[key]));
}

function isDecorativeCaps(value) {
  const letters = String(value ?? '').replace(/[^A-Za-z]/g, '');
  return letters.length >= 2 && letters === letters.toUpperCase();
}

/**
 * Evaluate computed browser evidence without reading component source.
 * The collector owns DOM access; this policy only receives rendered facts.
 */
export function evaluateRenderedFamily(snapshot) {
  const issues = [];
  const family = snapshot?.family ?? '(unknown family)';

  if (!snapshot?.declaredTheme || !snapshot?.actualTheme) {
    pushIssue(
      issues,
      'theme-contract-missing',
      `${family} must declare and render a theme`
    );
  } else if (snapshot.declaredTheme !== snapshot.actualTheme) {
    pushIssue(
      issues,
      'theme-surface-mismatch',
      `${snapshot.declaredTheme} treatment rendered in ${snapshot.actualTheme} context`
    );
  }

  if (!snapshot?.surfaceToken) {
    pushIssue(
      issues,
      'surface-token-missing',
      `${family} must name its approved surface token`
    );
  } else if (snapshot.surfaceMatchesToken !== true) {
    pushIssue(
      issues,
      'surface-token-mismatch',
      `${family} rendered surface does not resolve to ${snapshot.surfaceToken}`
    );
  }

  if (!snapshot?.canonicalOwner) {
    pushIssue(
      issues,
      'canonical-owner-missing',
      `${family} must name one canonical owner`
    );
  }

  for (const violation of snapshot?.axeViolations ?? []) {
    pushIssue(
      issues,
      'axe-violation',
      `${family} has rendered accessibility violation ${violation}`
    );
  }

  const variants = Array.isArray(snapshot?.variants) ? snapshot.variants : [];
  if (variants.length === 0) {
    pushIssue(
      issues,
      'rendered-variants-missing',
      `${family} has no rendered variants to evaluate`
    );
    return { ok: false, issues };
  }

  const reference = variants[0];
  for (const variant of variants) {
    const key = variant.key ?? '(unnamed)';

    if (!variant.owner || variant.owner !== snapshot.canonicalOwner) {
      pushIssue(
        issues,
        'split-component-owner',
        `${key} does not resolve to canonical owner ${snapshot.canonicalOwner}`,
        key
      );
    }

    if (!variant.anatomy || variant.anatomy !== reference.anatomy) {
      pushIssue(
        issues,
        'arbitrary-variant-anatomy',
        `${key} does not share one rendered anatomy with ${reference.key}`,
        key
      );
    }

    if (geometryDiffers(variant.geometry, reference.geometry)) {
      pushIssue(
        issues,
        'arbitrary-variant-geometry',
        `${key} does not share padding, radius, edge, type, and height geometry with ${reference.key}`,
        key
      );
    }

    if (variant.paddingTokenMatched !== true) {
      pushIssue(
        issues,
        'padding-token-mismatch',
        `${key} padding does not resolve to its declared shared token`,
        key
      );
    }

    if (variant.radiusTokenMatched !== true) {
      pushIssue(
        issues,
        'radius-token-mismatch',
        `${key} radius does not resolve to its declared shared token`,
        key
      );
    }

    if (variant.concentricRadius !== true) {
      pushIssue(
        issues,
        'nonconcentric-radius',
        `${key} inner and outer radii do not share concentric geometry`,
        key
      );
    }

    const hasExpectedTone =
      variant.expectedToneMapped === true || variant.expectedTone != null;
    if (!hasExpectedTone) {
      pushIssue(
        issues,
        'semantic-tone-missing',
        `${key} is missing from the semantic tone mapping`,
        key
      );
    } else if (variant.tone !== variant.expectedTone) {
      pushIssue(
        issues,
        'semantic-tone-mismatch',
        `${key} uses ${variant.tone ?? 'no tone'} instead of ${variant.expectedTone}`,
        key
      );
    }

    if (
      Number.isFinite(variant.requiredContrast) &&
      (!Number.isFinite(variant.textContrast) ||
        variant.textContrast < variant.requiredContrast)
    ) {
      pushIssue(
        issues,
        'contrast-below-aa',
        `${key} contrast ${variant.textContrast ?? 'unresolved'} is below ${variant.requiredContrast}`,
        key
      );
    }

    if (variant.overflowX || variant.overflowY || variant.zoomOverflow) {
      pushIssue(
        issues,
        'text-or-zoom-overflow',
        `${key} clips or overflows at the evaluated viewport/zoom`,
        key
      );
    }

    if (variant.interactive) {
      if (variant.keyboardReachable !== true) {
        pushIssue(
          issues,
          'keyboard-path-missing',
          `${key} is interactive but not keyboard reachable`,
          key
        );
      }
      if (boxesDiffer(variant.hoverBoxBefore, variant.hoverBoxAfter)) {
        pushIssue(
          issues,
          'hover-layout-shift',
          `${key} changes geometry on hover`,
          key
        );
      }
    } else if ((variant.tabbableCount ?? 0) > 0) {
      pushIssue(
        issues,
        'noninteractive-tab-stop',
        `${key} is a status display but enters the keyboard tab order`,
        key
      );
    }

    if (CHECKMARK_OR_EMOJI.test(variant.text ?? '')) {
      pushIssue(
        issues,
        'emoji-or-checkmark',
        `${key} contains emoji/checkmark UI`,
        key
      );
    }
    if (isDecorativeCaps(variant.text)) {
      pushIssue(
        issues,
        'decorative-caps',
        `${key} uses decorative all-caps copy`,
        key
      );
    }
  }

  return { ok: issues.length === 0, issues };
}

export function evaluateRenderedSnapshots(snapshots) {
  const results = (snapshots ?? []).map(snapshot => ({
    family: snapshot?.family ?? '(unknown family)',
    storyId: snapshot?.storyId ?? null,
    viewport: snapshot?.viewport ?? null,
    zoom: snapshot?.zoom ?? null,
    ...evaluateRenderedFamily(snapshot),
  }));
  return {
    ok: results.length > 0 && results.every(result => result.ok),
    results,
  };
}
