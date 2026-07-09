/**
 * ESLint rule to flag raw motion values that bypass the canonical
 * DS_FOUNDATION_V1 motion tokens, plus motion anti-patterns that make
 * UI feel sluggish or break on touch devices.
 *
 * Use the canonical Tailwind utilities instead:
 *   duration-subtle      -> --ds-motion-subtle-duration (150ms)
 *   duration-cinematic   -> --ds-motion-cinematic-duration (420ms)
 *   ease-subtle          -> --ds-motion-subtle-easing
 *   ease-cinematic       -> --ds-motion-cinematic-easing
 *
 * Bad:  className="transition-all duration-300"
 * Bad:  className="ease-in scale-0"
 * Bad:  style={{ transition: 'all 300ms ease-in' }}
 * Bad:  style={{ transitionDuration: '300ms' }}
 * Bad:  style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
 * Bad:  <motion.div animate={{ x: 10 }} transition={{ duration: 0.5 }} />
 * Good: className="transition-colors duration-subtle ease-subtle"
 *
 * Runs at error severity (see eslint.config.js '@jovie/no-raw-motion-values').
 */

const RAW_MS_DURATION_REGEX = /\b\d+ms\b/;
// Raw seconds durations (e.g. `0.6s`) bypass tokens exactly like raw ms.
// `150ms` does not match: the char before the final `s` must be a digit/dot.
const RAW_SECONDS_DURATION_REGEX = /(?<![\w.-])(\d*\.?\d+)s\b/;
const CUBIC_BEZIER_REGEX = /cubic-bezier\s*\(/;
const TRANSITION_ALL_REGEX = /\btransition-all\b/;
const NUMERIC_DURATION_CLASS_REGEX = /\bduration-\d+\b/;
const NUMERIC_EASE_CLASS_REGEX = /\bease-\[/;
// `ease-in` accelerates into its end state and reads as sluggish on UI.
// The lookahead excludes `ease-in-out`.
const EASE_IN_CLASS_REGEX = /\bease-in\b(?!-)/;
const EASE_IN_INLINE_REGEX = /\bease-in\b(?!-)/;
// `scale-0` entry animations pop from nothing; entrances should use
// scale(0.95) + opacity instead.
const SCALE_ZERO_CLASS_REGEX = /\bscale-0\b/;
const SCALE_ZERO_TRANSFORM_REGEX = /\bscale\(\s*0(?:\.0+)?\s*\)/;
// `transition: all` / `transitionProperty: 'all'` in inline styles.
const TRANSITION_ALL_INLINE_REGEX = /(?:^|[\s,])all(?:[\s,]|$)/;
// Keyframe animations bound to interruptible interaction states restart
// from frame 0 on every re-trigger; CSS transitions interpolate from the
// current value. Looping loaders (animate-spin, infinite keyframes) and
// one-shot open/close keyframes on menus/panels are intentionally allowed.
const INTERACTION_KEYFRAMES_REGEX =
  /\b(?:hover|group-hover|focus|focus-visible|active|group-active|data-\[[^\]]+\]):animate-\[/;
// Literal CSS `:hover` blocks (e.g. in <style> tags or css template strings)
// must be guarded so touch devices don't get sticky hover states. Tailwind v4
// `hover:` variants are already guarded by the framework.
const HOVER_BLOCK_REGEX = /:hover\s*[,{]/;
const HOVER_MEDIA_GUARD_REGEX = /@media[^{]*hover:\s*hover/;

// Framer Motion animation-target props scanned for `x`/`y` shorthands and
// `scale: 0` entries.
const FRAMER_TARGET_ATTRS = new Set([
  'initial',
  'animate',
  'exit',
  'whileHover',
  'whileTap',
  'whileInView',
  'whileFocus',
  'whileDrag',
]);
// UI motion should complete within 300ms; longer durations drag. The DS
// cinematic token (420ms) is reached via tokens, not raw Framer durations.
const FRAMER_MAX_DURATION_SECONDS = 0.3;

const ALLOWED_PATH_FRAGMENTS = [
  '/apps/web/styles/',
  '/apps/web/eslint-rules/',
  '/app/exp/',
  '.stories.',
  '.test.',
  '.spec.',
  '/tailwind.config.',
];

// Pre-existing violations of the checks added in the motion-lint extension
// (#13641). Decrementing ratchet: remove entries as files are migrated to
// tokens/transform strings — NEVER add new entries. Applies ONLY to the
// grandfathered checks (framerAxisShorthand, longFramerDuration,
// rawSecondsDuration, hoverWithoutMediaGuard); every other check still runs
// on these files.
const GRANDFATHERED_PATH_FRAGMENTS = [
  '/app/api/unsubscribe/claim-invites/route.ts',
  '/components/marketing/homepage-v2/HomepageV2Route.tsx',
  '/components/features/dashboard/molecules/phone-mockup-preview/PhoneMockupPreview.tsx',
  '/components/features/dashboard/release-tasks/ReleaseTaskChecklist.tsx',
  '/components/features/demo/ProductDemoCarousel.tsx',
  '/components/features/home/phone-showcase-primitives.tsx',
  '/components/features/home/demo/DashboardAnalyticsDemo.tsx',
  '/components/features/home/demo/DashboardAudienceDemo.tsx',
  '/components/features/home/demo/DashboardEarningsDemo.tsx',
  '/components/features/home/demo/DashboardLinksDemo.tsx',
  '/components/features/pricing/PricingCTA.tsx',
  '/components/features/profile/artist-notifications-cta/ProfileMobileNotificationsFlow.tsx',
  '/components/jovie/release-calendar/ReleaseCalendar.tsx',
  '/components/molecules/ArtistCard.tsx',
  '/components/molecules/FeatureCard.tsx',
  '/components/organisms/billing/BillingActionsSection.tsx',
  '/components/organisms/billing/BillingHeader.tsx',
  '/components/organisms/billing/BillingHistorySection.tsx',
  '/components/organisms/billing/CurrentPlanCard.tsx',
  '/components/organisms/billing/PlanComparisonSection.tsx',
];

// Decorative hover motion is banned (.claude/rules/ui.md → "No Decorative
// Hover Motion"). Press/click and menu/panel/sidebar open/close motion are allowed
// when intentional, so only hover-triggered translate/scale is flagged here.
// `scale-100` is a no-op reset and is intentionally exempt.
const DECORATIVE_LIFT_REGEX = /\b(?:hover|group-hover):-?translate(?:-[xy])?-/;
const DECORATIVE_SCALE_REGEX =
  /\b(?:hover|group-hover):scale-(?!100\b)(?:\[|\d)/;

function isAllowedFile(filename) {
  const normalized = filename.replaceAll('\\', '/');
  return ALLOWED_PATH_FRAGMENTS.some(fragment => normalized.includes(fragment));
}

function isGrandfatheredFile(filename) {
  const normalized = filename.replaceAll('\\', '/');
  return GRANDFATHERED_PATH_FRAGMENTS.some(fragment =>
    normalized.includes(fragment)
  );
}

function checkClassNameLiteral(node, value, context) {
  if (typeof value !== 'string') return;
  if (TRANSITION_ALL_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'transitionAll',
    });
  }
  if (NUMERIC_DURATION_CLASS_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'numericDurationClass',
      data: { value: value.match(NUMERIC_DURATION_CLASS_REGEX)?.[0] ?? '' },
    });
  }
  if (NUMERIC_EASE_CLASS_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'arbitraryEaseClass',
    });
  }
  if (EASE_IN_CLASS_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'easeInClass',
    });
  }
  if (SCALE_ZERO_CLASS_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'scaleZeroEntry',
    });
  }
  if (INTERACTION_KEYFRAMES_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'interruptibleKeyframes',
    });
  }
  if (DECORATIVE_LIFT_REGEX.test(value) || DECORATIVE_SCALE_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'decorativeHoverMotion',
    });
  }
}

function checkInlineStyleValue(node, value, context, options = {}) {
  if (typeof value !== 'string') return;
  if (CUBIC_BEZIER_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'rawCubicBezier',
    });
  }
  if (RAW_MS_DURATION_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'rawMsDuration',
      data: { value: value.match(RAW_MS_DURATION_REGEX)?.[0] ?? '' },
    });
  }
  if (!options.grandfathered && RAW_SECONDS_DURATION_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'rawSecondsDuration',
      data: { value: value.match(RAW_SECONDS_DURATION_REGEX)?.[0] ?? '' },
    });
  }
  if (EASE_IN_INLINE_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'easeInInline',
    });
  }
  if (options.checkTransitionAll && TRANSITION_ALL_INLINE_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'transitionAllInline',
    });
  }
}

function getScopeForNode(node, context) {
  const sourceCode = context.sourceCode || context.getSourceCode();
  if (typeof sourceCode.getScope === 'function') {
    return sourceCode.getScope(node);
  }
  if (typeof context.getScope === 'function') {
    return context.getScope();
  }
  return null;
}

function checkIdentifierInitializer(node, context, seen) {
  let scope = getScopeForNode(node, context);
  while (scope) {
    const variable = scope.variables.find(item => item.name === node.name);
    const definition = variable?.defs?.[0];
    const init = definition?.node?.init;
    if (init) {
      checkExpressionForClassNames(init, context, seen);
      return;
    }
    scope = scope.upper;
  }
}

function checkTemplateLiteral(node, context) {
  for (const quasi of node.quasis) {
    checkClassNameLiteral(quasi, quasi.value.cooked ?? '', context);
  }
}

function checkExpressionForClassNames(node, context, seen = new Set()) {
  if (!node || seen.has(node)) return;
  seen.add(node);

  switch (node.type) {
    case 'Literal':
      checkClassNameLiteral(node, node.value, context);
      return;
    case 'TemplateLiteral':
      checkTemplateLiteral(node, context);
      return;
    case 'TaggedTemplateExpression':
      checkExpressionForClassNames(node.quasi, context, seen);
      return;
    case 'CallExpression':
      for (const argument of node.arguments) {
        checkExpressionForClassNames(argument, context, seen);
      }
      return;
    case 'LogicalExpression':
    case 'BinaryExpression':
      checkExpressionForClassNames(node.left, context, seen);
      checkExpressionForClassNames(node.right, context, seen);
      return;
    case 'ConditionalExpression':
      checkExpressionForClassNames(node.consequent, context, seen);
      checkExpressionForClassNames(node.alternate, context, seen);
      return;
    case 'ArrayExpression':
      for (const element of node.elements) {
        checkExpressionForClassNames(element, context, seen);
      }
      return;
    case 'Identifier':
      checkIdentifierInitializer(node, context, seen);
      return;
    case 'ChainExpression':
    case 'TSAsExpression':
    case 'TSTypeAssertion':
    case 'TSNonNullExpression':
      checkExpressionForClassNames(node.expression, context, seen);
      return;
    default:
      return;
  }
}

function isJSXInlineStyleProperty(node) {
  const objectExpression = node.parent;
  const expressionContainer = objectExpression?.parent;
  const attribute = expressionContainer?.parent;

  return (
    objectExpression?.type === 'ObjectExpression' &&
    expressionContainer?.type === 'JSXExpressionContainer' &&
    attribute?.type === 'JSXAttribute' &&
    attribute.name?.name === 'style'
  );
}

function getPropertyKeyName(node) {
  if (!node.key) return null;
  if (node.key.type === 'Identifier') return node.key.name;
  if (node.key.type === 'Literal') return node.key.value;
  return null;
}

function isMotionComponentAttribute(attrNode) {
  const openingElement = attrNode.parent;
  if (openingElement?.type !== 'JSXOpeningElement') return false;
  const name = openingElement.name;
  if (name?.type !== 'JSXMemberExpression') return false;
  const objectName =
    name.object?.type === 'JSXIdentifier' ? name.object.name : null;
  return objectName === 'motion' || objectName === 'm';
}

function checkFramerTargetObject(objectExpression, context, options) {
  for (const property of objectExpression.properties) {
    if (property.type !== 'Property') continue;
    const keyName = getPropertyKeyName(property);
    if ((keyName === 'x' || keyName === 'y') && !options.grandfathered) {
      context.report({
        node: property,
        messageId: 'framerAxisShorthand',
        data: { axis: keyName },
      });
    }
    if (
      keyName === 'scale' &&
      property.value.type === 'Literal' &&
      property.value.value === 0
    ) {
      context.report({
        node: property,
        messageId: 'scaleZeroEntry',
      });
    }
  }
}

function checkFramerTransitionObject(objectExpression, context, options) {
  for (const property of objectExpression.properties) {
    if (property.type !== 'Property') continue;
    const keyName = getPropertyKeyName(property);
    if (
      keyName === 'duration' &&
      property.value.type === 'Literal' &&
      typeof property.value.value === 'number' &&
      property.value.value > FRAMER_MAX_DURATION_SECONDS &&
      !options.grandfathered
    ) {
      context.report({
        node: property,
        messageId: 'longFramerDuration',
        data: { value: String(property.value.value) },
      });
    }
    if (
      keyName === 'ease' &&
      property.value.type === 'Literal' &&
      property.value.value === 'easeIn'
    ) {
      context.report({
        node: property,
        messageId: 'easeInInline',
      });
    }
  }
}

function checkHoverBlockText(node, text, context) {
  if (typeof text !== 'string') return;
  if (!HOVER_BLOCK_REGEX.test(text)) return;
  if (HOVER_MEDIA_GUARD_REGEX.test(text)) return;
  context.report({
    node,
    messageId: 'hoverWithoutMediaGuard',
  });
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow raw motion values in TSX/TS — use canonical DS_FOUNDATION_V1 motion tokens instead',
      recommended: false,
    },
    messages: {
      transitionAll:
        'Avoid `transition-all` — it animates every property and ignores motion tokens. Use the explicit transition utility (e.g. `transition-colors`) and pair with `duration-subtle`/`ease-subtle` from DS_FOUNDATION_V1.',
      transitionAllInline:
        'Avoid `transition: all` in inline styles — it animates every property (including layout) and causes jank. List the specific properties instead (e.g. `opacity, transform`).',
      numericDurationClass:
        'Numeric duration class `{{value}}` bypasses the DS motion taxonomy. Use `duration-subtle` (150ms) or `duration-cinematic` (420ms) instead.',
      arbitraryEaseClass:
        'Arbitrary ease class bypasses the DS motion taxonomy. Use `ease-subtle` or `ease-cinematic` instead.',
      easeInClass:
        '`ease-in` accelerates into its end state and feels sluggish on UI. Use `ease-out` behavior via `ease-subtle`/`ease-cinematic`, or a custom decelerating curve through the DS tokens.',
      easeInInline:
        '`ease-in`/`easeIn` accelerates into its end state and feels sluggish on UI. Use an ease-out curve — `var(--ds-motion-subtle-easing)`/`var(--ds-motion-cinematic-easing)` — instead.',
      scaleZeroEntry:
        'Entering from `scale(0)` pops the element from nothing and reads as cartoonish. Enter from `scale(0.95)` combined with an opacity fade instead.',
      decorativeHoverMotion:
        'Decorative hover motion (translate/scale) is banned. Use color, border, shadow, or opacity feedback instead (see .claude/rules/ui.md → "No Decorative Hover Motion").',
      rawMsDuration:
        'Raw `{{value}}` duration in inline style bypasses the DS motion tokens. Use `var(--ds-motion-subtle-duration)` or `var(--ds-motion-cinematic-duration)`.',
      rawSecondsDuration:
        'Raw `{{value}}` duration in inline style bypasses the DS motion tokens (and UI motion should complete within 300ms). Use `var(--ds-motion-subtle-duration)` or `var(--ds-motion-cinematic-duration)`.',
      rawCubicBezier:
        'Raw `cubic-bezier(...)` bypasses the DS motion tokens. Use `var(--ds-motion-subtle-easing)` or `var(--ds-motion-cinematic-easing)`.',
      longFramerDuration:
        'Framer Motion duration {{value}}s exceeds the 300ms UI motion ceiling — long animations drag on interactive surfaces. Keep UI motion ≤0.3s; cinematic motion belongs on the DS cinematic token path.',
      framerAxisShorthand:
        'Framer Motion `{{axis}}` shorthand creates an independent transform channel that fights CSS transforms. Use a `transform` string (e.g. `transform: "translateX(8px)"`) so the transform stays composable and interruptible.',
      interruptibleKeyframes:
        'Keyframe animations bound to interaction states restart from frame 0 on every re-trigger. Use a CSS transition (which interpolates from the current value) for hover/focus/active/state-driven motion.',
      hoverWithoutMediaGuard:
        'CSS `:hover` blocks must be wrapped in `@media (hover: hover) and (pointer: fine)` so touch devices don’t get sticky hover states.',
    },
    schema: [],
  },
  create(context) {
    if (isAllowedFile(context.filename)) {
      return {};
    }
    const grandfathered = isGrandfatheredFile(context.filename);

    return {
      JSXAttribute(node) {
        if (!node.name) return;
        const attrName = node.name.name;

        // className="..." string literal
        if (
          attrName === 'className' &&
          node.value &&
          node.value.type === 'Literal'
        ) {
          checkClassNameLiteral(node.value, node.value.value, context);
          return;
        }

        // className={...} expression
        if (
          attrName === 'className' &&
          node.value &&
          node.value.type === 'JSXExpressionContainer'
        ) {
          checkExpressionForClassNames(node.value.expression, context);
          return;
        }

        // Framer Motion targets/transitions on motion.* / m.* components
        if (
          node.value?.type === 'JSXExpressionContainer' &&
          node.value.expression?.type === 'ObjectExpression' &&
          isMotionComponentAttribute(node)
        ) {
          if (FRAMER_TARGET_ATTRS.has(attrName)) {
            checkFramerTargetObject(node.value.expression, context, {
              grandfathered,
            });
          }
          if (attrName === 'transition') {
            checkFramerTransitionObject(node.value.expression, context, {
              grandfathered,
            });
          }
        }
      },

      // style={{ transitionDuration: '300ms', transitionTimingFunction: 'cubic-bezier(...)' }}
      Property(node) {
        if (!isJSXInlineStyleProperty(node)) return;
        if (!node.key || !node.value) return;
        const keyName = getPropertyKeyName(node);

        // transform: 'scale(0)' entry animations
        if (keyName === 'transform') {
          const transformValue =
            node.value.type === 'Literal'
              ? node.value.value
              : node.value.type === 'TemplateLiteral'
                ? node.value.quasis
                    .map(quasi => quasi.value.cooked ?? '')
                    .join(' ')
                : null;
          if (
            typeof transformValue === 'string' &&
            SCALE_ZERO_TRANSFORM_REGEX.test(transformValue)
          ) {
            context.report({
              node,
              messageId: 'scaleZeroEntry',
            });
          }
          return;
        }

        // transitionProperty: 'all'
        if (keyName === 'transitionProperty') {
          if (
            node.value.type === 'Literal' &&
            typeof node.value.value === 'string' &&
            TRANSITION_ALL_INLINE_REGEX.test(` ${node.value.value} `)
          ) {
            context.report({
              node,
              messageId: 'transitionAllInline',
            });
          }
          return;
        }

        if (
          keyName !== 'transitionDuration' &&
          keyName !== 'transitionTimingFunction' &&
          keyName !== 'transition' &&
          keyName !== 'animation' &&
          keyName !== 'animationDuration' &&
          keyName !== 'animationTimingFunction'
        ) {
          return;
        }
        const options = {
          grandfathered,
          checkTransitionAll: keyName === 'transition',
        };
        if (node.value.type === 'Literal') {
          checkInlineStyleValue(node.value, node.value.value, context, options);
        }
        if (node.value.type === 'TemplateLiteral') {
          for (const quasi of node.value.quasis) {
            checkInlineStyleValue(
              quasi,
              quasi.value.cooked ?? '',
              context,
              options
            );
          }
        }
      },

      // Literal CSS blocks (e.g. <style> children, css strings) with
      // unguarded :hover rules.
      TemplateLiteral(node) {
        if (grandfathered) return;
        const text = node.quasis
          .map(quasi => quasi.value.cooked ?? '')
          .join(' ');
        checkHoverBlockText(node, text, context);
      },
      Literal(node) {
        if (grandfathered) return;
        if (typeof node.value !== 'string') return;
        checkHoverBlockText(node, node.value, context);
      },
    };
  },
};
