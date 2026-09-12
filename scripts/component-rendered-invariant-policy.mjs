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
    if (variant.variantKeyMissing === true || !variant.key) {
      fail('variant-key-missing', `${key} missing variant key`, key);
    }
    if (variant.variantKeyDuplicate === true) {
      fail('variant-key-duplicate', `${key} duplicate variant key`, key);
    }
    if (variant.targetVisible !== true) {
      fail('variant-target-hidden', `${key} target hidden`, key);
    }
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

const GRID_TOLERANCE_PX = 2;
const ACCEPTANCE_CONTEXT_KEYS = [
  'candidateRevision',
  'route',
  'viewport',
  'state',
  'theme',
];
function contextLabel(snapshot) {
  const width = snapshot?.viewport?.width ?? snapshot?.viewport;
  return [
    snapshot?.route ?? 'unknown-route',
    width != null ? `${width}w` : 'unknown-viewport',
    snapshot?.state ?? 'unknown-state',
    snapshot?.theme ?? 'unknown-theme',
  ].join('/');
}
function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
function hasViewport(value) {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (value != null && Number.isFinite(value.width))
  );
}
function failClosed(rule, detail) {
  return { ok: false, issues: [{ rule, detail }] };
}

export function evaluateAcceptanceEvidence(receipt) {
  if (!receipt || typeof receipt !== 'object') {
    return failClosed('acceptance-receipt-missing', 'receipt required');
  }
  const issues = [];
  const fail = (rule, detail) => issues.push({ rule, detail });
  for (const key of ACCEPTANCE_CONTEXT_KEYS) {
    const present =
      key === 'viewport'
        ? hasViewport(receipt[key])
        : hasText(String(receipt[key] ?? ''));
    if (!present) {
      fail('acceptance-context-missing', `${key} required`);
    }
  }
  const rendered = receipt.rendered;
  if (!rendered || typeof rendered !== 'object') {
    fail(
      'rendered-evidence-missing',
      'exact-candidate rendered evidence required'
    );
  } else if (rendered.aligned !== true) {
    fail(
      'rendered-evidence-rejected',
      `rendered candidate is not aligned at ${contextLabel(receipt)}`
    );
  }
  if (receipt.sourceTokensPass === true && rendered?.aligned !== true) {
    fail(
      'source-only-acceptance',
      'token strings passed while rendered geometry is not accepted'
    );
  }
  if (
    receipt.screenshotBaselineUpdated === true &&
    rendered?.aligned !== true
  ) {
    fail(
      'baseline-bump-is-not-acceptance',
      'screenshot baseline updates are not acceptance; Taste owns optical/art'
    );
  }
  if (hasText(receipt.tasteNote) && rendered?.aligned !== true) {
    fail(
      'taste-note-is-not-acceptance',
      'taste notes cannot mint a rendered pass'
    );
  }
  return { ok: issues.length === 0, issues };
}

export function evaluateRelationalGrid(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return failClosed('grid-snapshot-missing', 'snapshot required');
  }
  const issues = [];
  const fail = (rule, detail) => issues.push({ rule, detail });
  if (
    !hasText(snapshot.route) ||
    !hasViewport(snapshot.viewport) ||
    !hasText(snapshot.state) ||
    !hasText(snapshot.theme)
  ) {
    fail(
      'grid-context-missing',
      'route, viewport, state, and theme are required'
    );
  }
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  if (elements.length === 0) {
    fail('grid-elements-missing', 'rendered column boxes are required');
    return { ok: false, issues };
  }
  const groups = new Map();
  for (const element of elements) {
    const key = `${element?.column ?? ''}::${element?.align ?? ''}::${element?.role ?? 'copy'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(element);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const xs = group.map(element => Number(element?.box?.x));
    if (xs.some(value => !Number.isFinite(value))) {
      fail(
        'grid-box-missing',
        `${key} missing rendered x at ${contextLabel(snapshot)}`
      );
      continue;
    }
    const spread = Math.max(...xs) - Math.min(...xs);
    if (spread > GRID_TOLERANCE_PX) {
      fail(
        'column-assignment-drift',
        `${key} rendered x spread ${spread}px exceeds ${GRID_TOLERANCE_PX}px at ${contextLabel(snapshot)}`
      );
    }
  }
  if (
    snapshot.sourceTokensPass === true &&
    issues.some(issue => issue.rule === 'column-assignment-drift')
  ) {
    fail(
      'source-tokens-without-rendered-alignment',
      'token strings passed while assigned columns are misaligned'
    );
  }
  return { ok: issues.length === 0, issues };
}

export function evaluateSharedSearchGeometry(snapshot) {
  const issues = [];
  const fail = (rule, detail) => issues.push({ rule, detail });
  const hero = snapshot?.hero;
  const close = snapshot?.close;
  if (!hero || !close) {
    return failClosed(
      'shared-search-missing',
      'hero and close search required'
    );
  }
  if (hero.treatment !== 'editorial' || close.treatment !== 'editorial') {
    fail(
      'shared-search-treatment-drift',
      `hero=${hero.treatment ?? 'none'} close=${close.treatment ?? 'none'}`
    );
  }
  if (hero.consumerAuraPierce === true || close.consumerAuraPierce === true) {
    fail(
      'shared-search-aura-pierce',
      'consumer descendant selectors into aura internals are forbidden'
    );
  }
  if (differs(hero.fieldHeight, close.fieldHeight)) {
    fail(
      'shared-search-geometry-drift',
      `hero field ${hero.fieldHeight}px vs close ${close.fieldHeight}px`
    );
  }
  if (
    hero.fieldBackground &&
    close.fieldBackground &&
    hero.fieldBackground !== close.fieldBackground
  ) {
    fail(
      'shared-search-surface-drift',
      'hero and close search interiors do not match'
    );
  }
  return { ok: issues.length === 0, issues };
}
