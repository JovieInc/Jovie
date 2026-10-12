/**
 * ESLint rule for the deterministic subset of "UI feel" (JOV-8196,
 * epic JOV-3371). Four checks, each with a narrow documented heuristic to
 * keep false positives out of non-applicable markup:
 *
 * 1. `missingTabularNums` — a leaf <span>/<div>/<p>/<output>/<data>/<td>/<th>
 *    whose children are ONLY numeric-looking expressions ({count},
 *    {value.toLocaleString()}, {Intl.NumberFormat…}, {n + 1}, {12}) renders
 *    changing numerals. Without `tabular-nums` the digits jitter as they
 *    update. Heuristic: every expression child must match a numeric cue
 *    (identifier containing Count|Total|Amount|Price|Score|Stat|Percent|
 *    Rate|Rank|Views|Plays|Fans|Followers|Duration|Balance|Quantity|
 *    Progress|Timer|Elapsed|Remaining|…, or contain a numeric literal /
 *    toLocaleString / toFixed / Intl.NumberFormat call) and no child may be
 *    a JSX element. Generic names (`value`, `size`, `age`, `index`) are
 *    deliberately excluded — they often render non-numeric strings.
 *    Fix: add `tabular-nums`
 *    (font-variant-numeric: tabular-nums).
 *
 * 2. `headingNeedsBalance` — <h1>–<h6> elements wrap; a single word on the
 *    last line is a design bug (.claude/rules/ui.md). Flag headings lacking
 *    `text-balance`, `text-pretty`, or `text-wrap: balance`. Single-line
 *    intents (`truncate`, `whitespace-nowrap`, `text-nowrap`, `sr-only`,
 *    `line-clamp-*`) and inline `style={{ textWrap }}` are exempt.
 *
 * 3. `undersizedHitArea` — interactive elements (<button>, <a>,
 *    role="button|link|menuitem*|option|tab|switch|checkbox|radio", or an
 *    onClick/onPress/onPointerDown handler) declaring BOTH axes below the
 *    40px floor (`size-9` and smaller, `h-9 w-9`, `size-[36px]`, h-[Npx] +
 *    w-[Npx] with N < 40). 40px = Tailwind scale 10; DESIGN.md prefers a
 *    44px hit container. Height-only undersized controls are already gated
 *    by scripts/lint-touch-target.ts (44px) — this rule only fires when the
 *    *whole* target is under 40x40. Rescues: a ≥40px `min-h-*`/`min-w-*`,
 *    `h-10+`/`w-10+`, or an invisible `before:`/`after:` hit container
 *    (before:h-10 / before:min-h-10 / before:size-10).
 *
 * 4. `nonConcentricRadius` — a JSX element with `rounded-<token>` whose
 *    DIRECT child element carries a LARGER `rounded-<token>` (inner radius
 *    must be smaller than outer: radius_inner = radius_outer − padding).
 *    Tokens ranked per the System B scale in apps/web/design/tokens.json
 *    (xs < default < sm < md < lg < xl < 2xl < 3xl < pill/full); arbitrary
 *    `rounded-[Npx]` compare numerically. Heuristic limits: only direct
 *    parent→child pairs, `rounded-full`/`rounded-pill` children are exempt
 *    (avatars/dots inside cards are intentionally circular), and
 *    corner-specific utilities (rounded-t-*) are ignored.
 *
 * Scoping: skips test/spec/story files, app/exp, styles, eslint-rules and
 * packages/ui sources (canonical DS internals own their appearance).
 * Runs at error severity (see eslint.config.js '@jovie/ui-feel'); CI lints
 * changed files, so this never retro-fails untouched legacy markup.
 */

const ALLOWED_PATH_FRAGMENTS = [
  '/apps/web/styles/',
  '/apps/web/design/',
  '/apps/web/eslint-rules/',
  '/app/exp/',
  '/packages/ui/',
  '.stories.',
  '.test.',
  '.spec.',
  '/tailwind.config.',
];

function isAllowedFile(filename) {
  const normalized = filename.replaceAll('\\', '/');
  return ALLOWED_PATH_FRAGMENTS.some(fragment => normalized.includes(fragment));
}

// ── shared className / style extraction ─────────────────────────────────────

function getStaticClassName(node) {
  // node: JSXOpeningElement. Returns a single string, or null when the
  // className is dynamic/non-declared (dynamic classes are out of scope —
  // we cannot reason about them deterministically).
  const attr = node.attributes?.find(
    a =>
      a.type === 'JSXAttribute' &&
      a.name?.type === 'JSXIdentifier' &&
      a.name.name === 'className'
  );
  if (!attr || !attr.value) return '';
  if (attr.value.type === 'Literal' && typeof attr.value.value === 'string') {
    return attr.value.value;
  }
  if (
    attr.value.type === 'JSXExpressionContainer' &&
    attr.value.expression.type === 'TemplateLiteral' &&
    attr.value.expression.expressions.length === 0
  ) {
    return attr.value.expression.quasis.map(q => q.value.cooked).join(' ');
  }
  return null;
}

function getStyleObject(node, sourceCode) {
  // Returns a map of camelCase style props -> static string value (or
  // 'true' for non-static) from style={{ ... }}.
  const attr = node.attributes?.find(
    a =>
      a.type === 'JSXAttribute' &&
      a.name?.type === 'JSXIdentifier' &&
      a.name.name === 'style'
  );
  const map = new Map();
  const expr =
    attr?.value?.type === 'JSXExpressionContainer'
      ? attr.value.expression
      : null;
  if (expr?.type !== 'ObjectExpression') return map;
  for (const prop of expr.properties) {
    if (prop.type !== 'Property') continue;
    const key =
      prop.key.type === 'Identifier'
        ? prop.key.name
        : prop.key.type === 'Literal'
          ? String(prop.key.value)
          : null;
    if (!key) continue;
    map.set(
      key,
      prop.value.type === 'Literal'
        ? String(prop.value.value)
        : sourceCode.getText(prop.value)
    );
  }
  return map;
}

function getTagName(node) {
  const name = node.name;
  return name?.type === 'JSXIdentifier' ? name.name : null;
}

// ── check 1: tabular-nums on changing numerals ──────────────────────────────

const NUMERIC_LEAF_TAGS = new Set([
  'span',
  'div',
  'p',
  'output',
  'data',
  'td',
  'th',
]);

// Identifier cues kept deliberately narrow: generic names like `value`,
// `size`, `age`, or `index` frequently render non-numeric strings (copyable
// IDs, dimensions labels) and produced false positives on existing markup.
const NUMERIC_CUE_REGEX =
  /(?:count|total|amount|price|score|stats?|percent|rate|rank|views?|plays?|fans|followers?|subscribers?|duration|balance|quantity|qty|progress|timer|elapsed|remaining|points|steps|reps|ratio|average|sum)\w*/i;

const NUMERIC_LITERAL_REGEX = /(?<![\w$])\d+(?:\.\d+)?/;
const NUMERIC_FORMAT_REGEX =
  /toLocaleString|toFixed|Intl\.NumberFormat|formatNumber|formatCompact|formatCurrency|formatPercent|numeral\(/;

function looksNumericExpression(expr, sourceCode) {
  const text = sourceCode.getText(expr);
  // Anything rendering markup is not a numeral.
  if (text.includes('<')) return false;
  return (
    NUMERIC_CUE_REGEX.test(text) ||
    NUMERIC_LITERAL_REGEX.test(text) ||
    NUMERIC_FORMAT_REGEX.test(text)
  );
}

function checkTabularNums(node, context, sourceCode) {
  const opening = node.openingElement;
  const tag = getTagName(opening);
  if (!tag || !NUMERIC_LEAF_TAGS.has(tag)) return;
  const children = node.children ?? [];
  const expressions = children.filter(c => c.type === 'JSXExpressionContainer');
  if (expressions.length === 0) return;
  // Every non-whitespace child must be an expression, and every expression
  // must look numeric — a leaf numeral display, not mixed prose.
  const onlyNumeric = children.every(
    c =>
      (c.type === 'JSXText' && !c.value.trim()) ||
      (c.type === 'JSXExpressionContainer' &&
        looksNumericExpression(c.expression, sourceCode))
  );
  if (!onlyNumeric) return;

  const className = getStaticClassName(opening);
  if (className === null) return; // dynamic className — can't reason
  const style = getStyleObject(opening, sourceCode);
  if (
    /\btabular-nums\b/.test(className) ||
    /\bfont-variant-numeric\b/.test(className ?? '') ||
    style.has('fontVariantNumeric') ||
    style.has('font-variant-numeric')
  ) {
    return;
  }
  context.report({ node: opening, messageId: 'missingTabularNums' });
}

// ── check 2: text-wrap balance on headings ──────────────────────────────────

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
// Single-line intents / already-balanced utilities that make text-wrap a
// no-op.
const BALANCE_EXEMPT_REGEX =
  /\b(?:text-balance|text-pretty|text-wrap|text-nowrap|truncate|sr-only|line-clamp-)\w*|\bwhitespace-nowrap\b/;

function checkHeadingBalance(node, context, sourceCode) {
  const opening = node.openingElement;
  const tag = getTagName(opening);
  if (!tag || !HEADING_TAGS.has(tag)) return;
  const className = getStaticClassName(opening);
  if (className === null) return; // dynamic className — can't reason
  const style = getStyleObject(opening, sourceCode);
  if (BALANCE_EXEMPT_REGEX.test(className) || style.has('textWrap')) return;
  context.report({ node: opening, messageId: 'headingNeedsBalance' });
}

// ── check 3: 40x40 hit-area floor ───────────────────────────────────────────

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'tab',
  'switch',
  'checkbox',
  'radio',
]);
const INTERACTION_HANDLERS = new Set(['onClick', 'onPress', 'onPointerDown']);

// Tailwind spacing scale: 1 unit = 4px → 40px floor = scale 10.
const HIT_AREA_FLOOR_PX = 40;
const SCALE_TO_PX = 4;
const SCALE_STEP_REGEX =
  /^(?:0|0\.5|1(?:\.5)?|2(?:\.5)?|3(?:\.5)?|4(?:\.5)?|5(?:\.5)?|6(?:\.5)?|7(?:\.5)?|8(?:\.5)?|9(?:\.5)?|10(?:\.5)?|1[1-9]|[2-9]\d|px)$/;

function utilityPx(token, axisPrefixes) {
  // token like 'h-8', 'before:min-w-[44px]', 'size-6'. Returns px or null.
  const bare = token.split(':').pop();
  for (const prefix of axisPrefixes) {
    if (!bare.startsWith(`${prefix}-`)) continue;
    const rest = bare.slice(prefix.length + 1);
    const arbitrary = rest.match(/^\[(\d+(?:\.\d+)?)px\]$/);
    if (arbitrary) return Number(arbitrary[1]);
    if (rest === 'px') return 1;
    if (SCALE_STEP_REGEX.test(rest)) return Number(rest) * SCALE_TO_PX;
    // h-full / w-screen / min-h-dvh etc. → unconstrained or non-px.
    return null;
  }
  return null;
}

function checkHitArea(node, context) {
  const opening = node.openingElement;
  const tag = getTagName(opening);
  const attrs = opening.attributes ?? [];
  const getAttr = name =>
    attrs.find(
      a =>
        a.type === 'JSXAttribute' &&
        a.name?.type === 'JSXIdentifier' &&
        a.name.name === name
    );
  const roleAttr = getAttr('role');
  const role =
    roleAttr?.value?.type === 'Literal' ? roleAttr.value.value : null;
  const interactive =
    tag === 'button' ||
    tag === 'a' ||
    (typeof role === 'string' && INTERACTIVE_ROLES.has(role)) ||
    attrs.some(
      a =>
        a.type === 'JSXAttribute' &&
        a.name?.type === 'JSXIdentifier' &&
        INTERACTION_HANDLERS.has(a.name.name)
    );
  if (!interactive) return;

  const className = getStaticClassName(opening);
  if (!className) return;
  const tokens = className.split(/\s+/).filter(Boolean);

  // Declared visual box: unprefixed h-*/w-*/size-* only (before:/after:
  // pseudo utilities describe the hit container, not the visible box).
  let height = null;
  let width = null;
  // Rescues on each axis: unprefixed min-h-*/min-w-* ≥40px, or a
  // before:/after: hit container ≥40px on that axis.
  let heightRescued = false;
  let widthRescued = false;
  for (const token of tokens) {
    const hitContainer = /^(?:before|after):/.test(token);
    const declaredH = utilityPx(token, ['h', 'size']);
    const declaredW = utilityPx(token, ['w', 'size']);
    if (!hitContainer) {
      if (declaredH !== null) {
        height = height === null ? declaredH : Math.min(height, declaredH);
      }
      if (declaredW !== null) {
        width = width === null ? declaredW : Math.min(width, declaredW);
      }
      if (utilityPx(token, ['min-h']) >= HIT_AREA_FLOOR_PX) {
        heightRescued = true;
      }
      if (utilityPx(token, ['min-w']) >= HIT_AREA_FLOOR_PX) {
        widthRescued = true;
      }
    } else {
      if (
        utilityPx(token, ['h', 'min-h', 'size']) !== null &&
        utilityPx(token, ['h', 'min-h', 'size']) >= HIT_AREA_FLOOR_PX
      ) {
        heightRescued = true;
      }
      if (
        utilityPx(token, ['w', 'min-w', 'size']) !== null &&
        utilityPx(token, ['w', 'min-w', 'size']) >= HIT_AREA_FLOOR_PX
      ) {
        widthRescued = true;
      }
    }
  }
  if (height === null || width === null) return; // axis not declared → skip
  if (height >= HIT_AREA_FLOOR_PX || width >= HIT_AREA_FLOOR_PX) return;
  if (heightRescued || widthRescued) return;

  context.report({
    node: opening,
    messageId: 'undersizedHitArea',
    data: { dims: `${height}x${width}` },
  });
}

// ── check 4: concentric border radii ────────────────────────────────────────

// System B radius order (apps/web/design/tokens.json). pill/full sort above
// everything and are handled separately (exempt as inner elements).
const RADIUS_ORDER = {
  none: 0,
  xs: 1,
  '': 2, // bare `rounded` = DEFAULT 4px
  sm: 3,
  md: 4,
  lg: 5,
  xl: 6,
  '2xl': 7,
  '3xl': 8,
};

const RADIUS_CLASS_REGEX =
  /\brounded-(xs|sm|md|lg|xl|2xl|3xl|pill|full|none|\[(\d+(?:\.\d+)?)px\])(?![\w-])|\brounded(?![-\w])/g;

function radiusRank(className) {
  // Returns { kind: 'none' | 'ranked' | 'round', rank, px } for the FIRST
  // whole-element radius token; null when absent.
  RADIUS_CLASS_REGEX.lastIndex = 0;
  const match = RADIUS_CLASS_REGEX.exec(className);
  if (!match) return null;
  const token = match[1] ?? '';
  if (token === 'pill' || token === 'full') return { kind: 'round' };
  if (match[2] !== undefined) {
    return { kind: 'ranked', px: Number(match[2]), label: `${match[2]}px` };
  }
  const rank = RADIUS_ORDER[token];
  if (rank === undefined || token === 'none') return null;
  const label = token === '' ? 'rounded' : `rounded-${token}`;
  return { kind: 'ranked', rank, label };
}

const RADIUS_PX_BY_RANK = {
  1: 2,
  2: 4,
  3: 8,
  4: 10,
  5: 12,
  6: 16,
  7: 20,
  8: 24,
};

function radiusGreater(inner, outer) {
  // inner/outer: { rank } or { px }. Returns true when inner is provably
  // larger (non-concentric).
  const innerPx = inner.px ?? RADIUS_PX_BY_RANK[inner.rank];
  const outerPx = outer.px ?? RADIUS_PX_BY_RANK[outer.rank];
  return innerPx > outerPx;
}

function checkConcentricRadius(node, context) {
  const opening = node.openingElement;
  const className = getStaticClassName(opening);
  if (!className) return;
  const outer = radiusRank(className);
  if (!outer || outer.kind === 'round') return;

  for (const child of node.children ?? []) {
    if (child.type !== 'JSXElement') continue;
    const childClass = getStaticClassName(child.openingElement);
    if (!childClass) continue;
    const inner = radiusRank(childClass);
    if (!inner || inner.kind !== 'ranked' || outer.kind !== 'ranked') continue;
    if (radiusGreater(inner, outer)) {
      context.report({
        node: child.openingElement,
        messageId: 'nonConcentricRadius',
        data: { inner: inner.label, outer: outer.label },
      });
    }
  }
}

// ── rule ────────────────────────────────────────────────────────────────────

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Deterministic UI-feel checks: tabular-nums on changing numerals, text-wrap balance on headings, 40x40 hit-area floor, concentric border radii (System B tokens).',
    },
    schema: [],
    messages: {
      missingTabularNums:
        'Numerals that change (counts, stats, timers, prices) need fixed-width digits — add `tabular-nums` (font-variant-numeric: tabular-nums) so updates don’t jitter. See DESIGN.md typography.',
      headingNeedsBalance:
        'Headings must not leave a single word on the last line — add `text-balance` (text-wrap: balance). Single-line intents may opt out with `truncate`, `whitespace-nowrap`, or `sr-only`. See .claude/rules/ui.md.',
      undersizedHitArea:
        'Interactive target is {{dims}}px — under the 40x40px floor. Enlarge the hit CONTAINER, not the visible control: `relative before:absolute before:h-10 before:min-w-10 before:content-[""]` (44px preferred per DESIGN.md touch-target contract).',
      nonConcentricRadius:
        'Inner radius `{{inner}}` is larger than outer `{{outer}}` — concentric radii shrink inward (inner = outer − padding). Step down to a smaller System B radius token (xs/sm/md/lg/xl per apps/web/design/tokens.json).',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isAllowedFile(filename)) return {};
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      JSXElement(node) {
        checkTabularNums(node, context, sourceCode);
        checkHeadingBalance(node, context, sourceCode);
        checkHitArea(node, context);
        checkConcentricRadius(node, context);
      },
    };
  },
};
