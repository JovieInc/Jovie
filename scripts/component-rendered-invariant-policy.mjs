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
  if (!left && !right) return false;
  if (!left || !right) return true;
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
  const fail = (rule, detail, variant = null) =>
    pushIssue(issues, rule, detail, variant);
  if (!snapshot?.declaredTheme || !snapshot?.actualTheme) {
    fail('theme-contract-missing', `${family} missing theme contract`);
  } else if (snapshot.declaredTheme !== snapshot.actualTheme) {
    fail(
      'theme-surface-mismatch',
      `${snapshot.declaredTheme} treatment rendered in ${snapshot.actualTheme} context`
    );
  }
  if (!snapshot?.surfaceToken) {
    fail('surface-token-missing', `${family} missing surface token`);
  } else if (snapshot.surfaceMatchesToken !== true) {
    fail('surface-token-mismatch', `${family} surface token mismatch`);
  }
  if (!snapshot?.canonicalOwner) {
    fail('canonical-owner-missing', `${family} missing owner`);
  }
  for (const violation of snapshot?.axeViolations ?? []) {
    fail('axe-violation', `${family} axe violation ${violation}`);
  }
  const variants = Array.isArray(snapshot?.variants) ? snapshot.variants : [];
  if (variants.length === 0) {
    fail('rendered-variants-missing', `${family} missing variants`);
    return { ok: false, issues };
  }
  const reference = variants[0];
  for (const variant of variants) {
    const key = variant.key ?? '(unnamed)';
    if (!variant.owner || variant.owner !== snapshot.canonicalOwner) {
      fail('split-component-owner', `${key} owner mismatch`, key);
    }
    if (!variant.anatomy || variant.anatomy !== reference.anatomy) {
      fail('arbitrary-variant-anatomy', `${key} anatomy drift`, key);
    }
    if (geometryDiffers(variant.geometry, reference.geometry)) {
      fail('arbitrary-variant-geometry', `${key} geometry drift`, key);
    }
    if (variant.paddingTokenMatched !== true) {
      fail('padding-token-mismatch', `${key} padding token mismatch`, key);
    }
    if (variant.radiusTokenMatched !== true) {
      fail('radius-token-mismatch', `${key} radius token mismatch`, key);
    }
    if (variant.concentricRadius !== true) {
      fail('nonconcentric-radius', `${key} nonconcentric radius`, key);
    }
    const hasExpectedTone =
      variant.expectedToneMapped === true || variant.expectedTone != null;
    if (!hasExpectedTone) {
      fail('semantic-tone-missing', `${key} missing semantic tone`, key);
    } else if (variant.tone !== variant.expectedTone) {
      fail(
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
      fail(
        'contrast-below-aa',
        `${key} contrast ${variant.textContrast ?? 'unresolved'} is below ${variant.requiredContrast}`,
        key
      );
    }
    if (variant.overflowX || variant.overflowY || variant.zoomOverflow) {
      fail('text-or-zoom-overflow', `${key} text or zoom overflow`, key);
    }
    if (variant.interactive) {
      if (variant.keyboardReachable !== true) {
        fail('keyboard-path-missing', `${key} no keyboard path`, key);
      }
      if (variant.keyboardActivatable !== true) {
        fail(
          'keyboard-activation-missing',
          `${key} no keyboard activation`,
          key
        );
      }
      if (
        boxesDiffer(variant.hoverBoxBefore, variant.hoverBoxAfter) ||
        boxesDiffer(variant.hoverRootBoxBefore, variant.hoverRootBoxAfter)
      ) {
        fail('hover-layout-shift', `${key} hover geometry shift`, key);
      }
    } else if ((variant.tabbableCount ?? 0) > 0) {
      fail('noninteractive-tab-stop', `${key} noninteractive tab stop`, key);
    }
    if (CHECKMARK_OR_EMOJI.test(variant.text ?? '')) {
      fail('emoji-or-checkmark', `${key} emoji/checkmark UI`, key);
    }
    if (isDecorativeCaps(variant.text)) {
      fail('decorative-caps', `${key} decorative caps`, key);
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
