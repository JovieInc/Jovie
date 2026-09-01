export const JOVIE_IMAGE_COLOR_POLICY_SCHEMA = 'jovie-image-color-policy/v1';
export const JOVIE_IMAGE_COLOR_POLICY_VERSION = 'scene-palette-v1';

export type JovieImageSceneColorRole = 'ion' | 'ultra' | 'pulse';
export type JovieImageColorSalience = 'low' | 'medium' | 'high';
export type JovieImageColorControl =
  | 'controllable-scene'
  | 'protected-truth'
  | 'source-reflection'
  | 'skin-material'
  | 'subject-separation'
  | 'grade';

export type JovieImageProtectedColorClass =
  | 'human-biology'
  | 'natural-world'
  | 'semantic-color'
  | 'safety-color'
  | 'cultural-color'
  | 'trademark-color'
  | 'creator-owned-identity'
  | 'identity-bearing-object'
  | 'customer-evidence'
  | 'product-screenshot'
  | 'documentary-material';

export type JovieImageColorFailureAction =
  | 'art-direct-before-capture'
  | 'reframe'
  | 'replace'
  | 'remove'
  | 'reduce-salience'
  | 'reject-shot';

export type JovieImageColorRequestedAction =
  | JovieImageColorFailureAction
  | 'truthful-source'
  | 'restrained-finish-grade'
  | 'post-hoc-recolor'
  | 'grade-recolor'
  | 'rewrite-material-response';

export interface JovieOklchColorSample {
  readonly lightness: number;
  readonly chroma: number;
  readonly hue: number;
}

export interface JovieOklchColorReference extends JovieOklchColorSample {
  readonly oklch: string;
  readonly hex: string;
}

export interface JovieUiColorAnchor {
  readonly oklch: string;
  readonly hex: string;
}

export interface JovieHueCorridor {
  readonly minHue: number;
  readonly maxHue: number;
}

export interface JovieNumericRange {
  readonly min: number;
  readonly max: number;
}

export interface JovieScenePaletteReference {
  readonly role: JovieImageSceneColorRole;
  readonly uiAnchor: JovieUiColorAnchor;
  readonly sceneReference: JovieOklchColorReference;
  readonly hueCorridor: JovieHueCorridor;
  readonly plausibility: {
    readonly lightnessRange: JovieNumericRange;
    readonly chromaRange: JovieNumericRange;
  };
  readonly materialGuidance: readonly string[];
}

export interface JovieForbiddenControllableHue {
  readonly name: string;
  readonly hueCorridor: JovieHueCorridor;
  readonly minChroma: number;
}

export interface JovieSubjectSeparationRequirement {
  readonly minLightnessDelta: number;
  readonly minChromaDelta: number;
  readonly minHueDelta: number;
  readonly alternateSupports: readonly string[];
}

export interface JovieImageColorPolicy {
  readonly schema: typeof JOVIE_IMAGE_COLOR_POLICY_SCHEMA;
  readonly version: typeof JOVIE_IMAGE_COLOR_POLICY_VERSION;
  readonly invariant: string;
  readonly founderApproval: {
    readonly approvedAt: string;
    readonly decisionRef: string;
  };
  readonly scope: {
    readonly appliesTo: readonly string[];
    readonly excludes: readonly string[];
  };
  readonly priority: readonly string[];
  readonly scenePalette: readonly JovieScenePaletteReference[];
  readonly neutralRule: {
    readonly maxChroma: number;
    readonly guidance: string;
  };
  readonly protectedClasses: readonly JovieImageProtectedColorClass[];
  readonly controllableSceneElements: readonly string[];
  readonly forbiddenControllableHues: readonly JovieForbiddenControllableHue[];
  readonly sourceReflectionConsistency: {
    readonly maxHueDelta: number;
    readonly requiresSinglePlausibleSource: boolean;
    readonly materials: readonly string[];
  };
  readonly subjectSeparation: JovieSubjectSeparationRequirement;
  readonly skinMaterialProtection: {
    readonly requiredTruths: readonly string[];
    readonly preventWith: readonly string[];
  };
  readonly grade: {
    readonly allowed: string;
    readonly forbidden: string;
  };
  readonly failureActions: readonly JovieImageColorFailureAction[];
  readonly postMergeValidation: {
    readonly sampleCount: number;
    readonly scenarios: readonly string[];
    readonly reconsiderHueAnchorsAtFailureRate: number;
  };
}

export interface JovieImageSubjectSeparationEvaluation {
  readonly lightnessDelta: number;
  readonly chromaDelta: number;
  readonly hueDelta: number;
  readonly wardrobeContrast?: boolean;
  readonly edgeLight?: boolean;
  readonly focusSeparation?: boolean;
  readonly compositionSeparation?: boolean;
}

export interface JovieImageSkinMaterialEvaluation {
  readonly clippedHighlights?: boolean;
  readonly oilyHighlights?: boolean;
  readonly texturePreserved?: boolean;
  readonly localSpecularBelievable?: boolean;
}

export interface JovieImageColorDecision {
  readonly control: JovieImageColorControl;
  readonly subject: string;
  readonly salience?: JovieImageColorSalience;
  readonly color?: JovieOklchColorSample;
  readonly protectedClass?: JovieImageProtectedColorClass;
  readonly requestedAction?: JovieImageColorRequestedAction;
  readonly sourceColor?: JovieOklchColorSample;
  readonly reflectedColor?: JovieOklchColorSample;
  readonly reflectionSourcePresent?: boolean;
  readonly separation?: JovieImageSubjectSeparationEvaluation;
  readonly skin?: JovieImageSkinMaterialEvaluation;
}

export interface JovieImageColorFinding {
  readonly code: string;
  readonly stage: 'asset-generation' | 'adversarial-review';
  readonly subject: string;
  readonly message: string;
}

const RECOLOR_ACTIONS = new Set<JovieImageColorRequestedAction>([
  'post-hoc-recolor',
  'grade-recolor',
  'rewrite-material-response',
]);

export const JOVIE_IMAGE_COLOR_POLICY = {
  schema: JOVIE_IMAGE_COLOR_POLICY_SCHEMA,
  version: JOVIE_IMAGE_COLOR_POLICY_VERSION,
  invariant: 'The camera must find the palette.',
  founderApproval: {
    approvedAt: '2026-08-21',
    decisionRef:
      'gbrain:design/jovie-imagery-color-harmony-proposal-2026-08-21',
  },
  scope: {
    appliesTo: [
      'Jovie-owned intentionally art-directed brand imagery',
      'Jovie-owned generated marketing imagery',
      'Jovie-owned social and campaign set pieces',
      'Jovie-owned vendor briefs for produced brand imagery',
    ],
    excludes: [
      'product screenshots',
      'customer evidence',
      'documentary material',
      'creator-owned identity',
      'creator-owned artwork',
      'album art',
      'merch artwork',
      'artist retouching',
    ],
  },
  priority: [
    'Reality and identity',
    'Subject separation',
    'Jovie harmony',
    'Finish and grade',
  ],
  scenePalette: [
    {
      role: 'ion',
      uiAnchor: {
        oklch: 'oklch(71.95% 0.1626 240.25)',
        hex: '#11AFFF',
      },
      sceneReference: {
        lightness: 72,
        chroma: 0.14,
        hue: 240,
        oklch: 'oklch(72% 0.14 240)',
        hex: '#3FAFF3',
      },
      hueCorridor: { minHue: 220, maxHue: 258 },
      plausibility: {
        lightnessRange: { min: 45, max: 82 },
        chromaRange: { min: 0.06, max: 0.18 },
      },
      materialGuidance: [
        'emitted screens and practicals',
        'painted metal',
        'cool glass',
        'controlled wardrobe accents',
      ],
    },
    {
      role: 'ultra',
      uiAnchor: {
        oklch: 'oklch(69.82% 0.1792 295.80)',
        hex: '#A982FF',
      },
      sceneReference: {
        lightness: 70,
        chroma: 0.15,
        hue: 296,
        oklch: 'oklch(70% 0.15 296)',
        hex: '#A789F0',
      },
      hueCorridor: { minHue: 276, maxHue: 314 },
      plausibility: {
        lightnessRange: { min: 42, max: 78 },
        chromaRange: { min: 0.06, max: 0.18 },
      },
      materialGuidance: [
        'gelled edge light',
        'fabric accents',
        'painted signage',
        'neon reflected through haze',
      ],
    },
    {
      role: 'pulse',
      uiAnchor: {
        oklch: 'oklch(70.73% 0.2552 339.69)',
        hex: '#FF48D2',
      },
      sceneReference: {
        lightness: 71,
        chroma: 0.19,
        hue: 340,
        oklch: 'oklch(71% 0.19 340)',
        hex: '#EB6AC6',
      },
      hueCorridor: { minHue: 322, maxHue: 358 },
      plausibility: {
        lightnessRange: { min: 45, max: 80 },
        chromaRange: { min: 0.08, max: 0.22 },
      },
      materialGuidance: [
        'magenta practical light',
        'high-chroma fabric',
        'painted props',
        'controlled reflective highlights',
      ],
    },
  ],
  neutralRule: {
    maxChroma: 0.04,
    guidance:
      'Low-chroma neutrals may carry any hue when they read as graphite, black, white, gray, glass, chrome, concrete, or shadow before capture.',
  },
  protectedClasses: [
    'human-biology',
    'natural-world',
    'semantic-color',
    'safety-color',
    'cultural-color',
    'trademark-color',
    'creator-owned-identity',
    'identity-bearing-object',
    'customer-evidence',
    'product-screenshot',
    'documentary-material',
  ],
  controllableSceneElements: [
    'wardrobe',
    'props',
    'furniture',
    'paint',
    'locations',
    'signage',
    'practical lights',
    'vehicles',
    'set dressing',
  ],
  forbiddenControllableHues: [
    {
      name: 'saturated green and yellow-green',
      hueCorridor: { minHue: 70, maxHue: 175 },
      minChroma: 0.08,
    },
    {
      name: 'saturated orange',
      hueCorridor: { minHue: 30, maxHue: 85 },
      minChroma: 0.1,
    },
    {
      name: 'saturated red',
      hueCorridor: { minHue: 355, maxHue: 25 },
      minChroma: 0.1,
    },
  ],
  sourceReflectionConsistency: {
    maxHueDelta: 18,
    requiresSinglePlausibleSource: true,
    materials: ['emitted light', 'spill', 'haze', 'glass', 'chrome', 'puddles'],
  },
  subjectSeparation: {
    minLightnessDelta: 12,
    minChromaDelta: 0.08,
    minHueDelta: 28,
    alternateSupports: [
      'wardrobe contrast',
      'edge light',
      'focus separation',
      'composition separation',
    ],
  },
  skinMaterialProtection: {
    requiredTruths: [
      'believable hue',
      'believable texture and pores',
      'local specular response',
      'complexion-specific exposure',
    ],
    preventWith: [
      'lighting',
      'exposure',
      'material and makeup choices',
      'restrained local correction',
    ],
  },
  grade: {
    allowed:
      'restrained finishing that preserves set design and material response',
    forbidden:
      'post-hoc recoloring, global orange-teal looks, literal triads, or material-response rewrites',
  },
  failureActions: [
    'art-direct-before-capture',
    'reframe',
    'replace',
    'remove',
    'reduce-salience',
    'reject-shot',
  ],
  postMergeValidation: {
    sampleCount: 30,
    scenarios: [
      'studio',
      'daylight',
      'night',
      'water',
      'architecture',
      'varied complexions',
      'wardrobe',
      'reflective surfaces',
      'creator-owned artwork',
    ],
    reconsiderHueAnchorsAtFailureRate: 0.2,
  },
} as const satisfies JovieImageColorPolicy;

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function hueDistance(a: number, b: number): number {
  const delta = Math.abs(normalizeHue(a) - normalizeHue(b));
  return Math.min(delta, 360 - delta);
}

function isWithinRange(value: number, range: JovieNumericRange): boolean {
  return value >= range.min && value <= range.max;
}

export function isHueInCorridor(
  hue: number,
  corridor: JovieHueCorridor
): boolean {
  const normalizedHue = normalizeHue(hue);
  if (corridor.minHue <= corridor.maxHue) {
    return normalizedHue >= corridor.minHue && normalizedHue <= corridor.maxHue;
  }
  return normalizedHue >= corridor.minHue || normalizedHue <= corridor.maxHue;
}

export function resolveJovieSceneColorRole(
  color: JovieOklchColorSample,
  policy: JovieImageColorPolicy = JOVIE_IMAGE_COLOR_POLICY
): JovieImageSceneColorRole | 'neutral' | null {
  if (color.chroma <= policy.neutralRule.maxChroma) {
    return 'neutral';
  }

  return (
    policy.scenePalette.find(
      entry =>
        isHueInCorridor(color.hue, entry.hueCorridor) &&
        isWithinRange(color.lightness, entry.plausibility.lightnessRange) &&
        isWithinRange(color.chroma, entry.plausibility.chromaRange)
    )?.role ?? null
  );
}

export function isForbiddenControllableSceneColor(
  color: JovieOklchColorSample,
  policy: JovieImageColorPolicy = JOVIE_IMAGE_COLOR_POLICY
): boolean {
  if (resolveJovieSceneColorRole(color, policy)) return false;
  return policy.forbiddenControllableHues.some(
    forbidden =>
      color.chroma >= forbidden.minChroma &&
      isHueInCorridor(color.hue, forbidden.hueCorridor)
  );
}

function isRecolorAction(action?: JovieImageColorRequestedAction): boolean {
  return action ? RECOLOR_ACTIONS.has(action) : false;
}

function formatSceneRoleLabel(role: JovieImageSceneColorRole): string {
  return `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

function finding(
  code: string,
  control: JovieImageColorControl,
  subject: string,
  message: string
): JovieImageColorFinding {
  return {
    code,
    stage:
      control === 'protected-truth' ? 'adversarial-review' : 'asset-generation',
    subject,
    message,
  };
}

export function auditJovieImageColorDecision(
  decision: JovieImageColorDecision,
  policy: JovieImageColorPolicy = JOVIE_IMAGE_COLOR_POLICY
): readonly JovieImageColorFinding[] {
  const findings: JovieImageColorFinding[] = [];

  if (
    (decision.control === 'controllable-scene' ||
      decision.control === 'grade') &&
    isRecolorAction(decision.requestedAction)
  ) {
    findings.push(
      finding(
        'forbidden-post-hoc-recoloring',
        decision.control,
        decision.subject,
        'Controllable scene color must be art-directed before capture or generation, not rescued with recoloring or grading.'
      )
    );
  }

  if (decision.control === 'controllable-scene') {
    if (!decision.color) {
      findings.push(
        finding(
          'missing-controllable-color',
          decision.control,
          decision.subject,
          'Controllable scene elements need a declared OKLCH scene hue or neutral.'
        )
      );
    } else if (!resolveJovieSceneColorRole(decision.color, policy)) {
      findings.push(
        finding(
          'forbidden-controllable-scene-color',
          decision.control,
          decision.subject,
          'High-salience controllable colors must resolve to Ion, Ultra, Pulse, or a low-chroma neutral.'
        )
      );
    }
  }

  if (decision.control === 'protected-truth') {
    if (!decision.protectedClass) {
      findings.push(
        finding(
          'missing-protected-class',
          decision.control,
          decision.subject,
          'Protected truth needs an explicit protected color class.'
        )
      );
    }
    if (isRecolorAction(decision.requestedAction)) {
      findings.push(
        finding(
          'protected-color-falsified',
          decision.control,
          decision.subject,
          'Protected real-world color stays truthful. Reframe, replace, remove, reduce salience, or reject instead of recoloring it.'
        )
      );
    }
  }

  if (decision.control === 'source-reflection') {
    if (!decision.reflectionSourcePresent) {
      findings.push(
        finding(
          'missing-reflection-source',
          decision.control,
          decision.subject,
          'Reflections, spill, haze, glass, chrome, and puddles require one visible or motivated plausible source.'
        )
      );
    }
    if (decision.sourceColor && decision.reflectedColor) {
      const sourceRole = resolveJovieSceneColorRole(
        decision.sourceColor,
        policy
      );
      const reflectedRole = resolveJovieSceneColorRole(
        decision.reflectedColor,
        policy
      );
      if (
        hueDistance(decision.sourceColor.hue, decision.reflectedColor.hue) >
          policy.sourceReflectionConsistency.maxHueDelta &&
        sourceRole !== reflectedRole
      ) {
        findings.push(
          finding(
            'reflection-source-mismatch',
            decision.control,
            decision.subject,
            'Emitted light and reflected color must agree with the same physically plausible source.'
          )
        );
      }
    }
  }

  if (decision.control === 'skin-material') {
    const skin = decision.skin;
    if (!skin) {
      findings.push(
        finding(
          'missing-skin-material-review',
          decision.control,
          decision.subject,
          'Skin and material renders require a highlight, texture, and specular-response review.'
        )
      );
    } else {
      if (skin.clippedHighlights) {
        findings.push(
          finding(
            'clipped-skin-highlights',
            decision.control,
            decision.subject,
            'Skin highlights must not clip; fix lighting, exposure, material, or local correction before approval.'
          )
        );
      }
      if (skin.oilyHighlights) {
        findings.push(
          finding(
            'oily-skin-highlights',
            decision.control,
            decision.subject,
            'Skin should keep believable local specular response, not oily or plastic highlights.'
          )
        );
      }
      if (skin.texturePreserved === false) {
        findings.push(
          finding(
            'skin-texture-lost',
            decision.control,
            decision.subject,
            'Skin must retain believable texture and pores.'
          )
        );
      }
      if (skin.localSpecularBelievable === false) {
        findings.push(
          finding(
            'skin-specular-unbelievable',
            decision.control,
            decision.subject,
            'Local specular response must match the lighting and material in the scene.'
          )
        );
      }
    }
  }

  if (decision.control === 'subject-separation') {
    const separation = decision.separation;
    if (!separation) {
      findings.push(
        finding(
          'missing-subject-separation-review',
          decision.control,
          decision.subject,
          'Subject/background separation must be evaluated before taste admission.'
        )
      );
    } else {
      const hasSeparation =
        separation.lightnessDelta >=
          policy.subjectSeparation.minLightnessDelta ||
        separation.chromaDelta >= policy.subjectSeparation.minChromaDelta ||
        separation.hueDelta >= policy.subjectSeparation.minHueDelta ||
        separation.wardrobeContrast === true ||
        separation.edgeLight === true ||
        separation.focusSeparation === true ||
        separation.compositionSeparation === true;

      if (!hasSeparation) {
        findings.push(
          finding(
            'weak-subject-separation',
            decision.control,
            decision.subject,
            'Subject/background separation needs OKLCH lightness, chroma, hue, wardrobe, edge light, focus, or composition support. No material is banned by default.'
          )
        );
      }
    }
  }

  return findings;
}

export function formatJovieImageColorPolicyForPrompt(
  policy: JovieImageColorPolicy = JOVIE_IMAGE_COLOR_POLICY
): string {
  const paletteLines = policy.scenePalette.map(entry => {
    const role = formatSceneRoleLabel(entry.role);
    const lightness = entry.plausibility.lightnessRange;
    const chroma = entry.plausibility.chromaRange;
    return `- ${role}: scene ${entry.sceneReference.oklch} ${entry.sceneReference.hex}, UI anchor ${entry.uiAnchor.oklch} ${entry.uiAnchor.hex}, hue corridor ${entry.hueCorridor.minHue}-${entry.hueCorridor.maxHue}, lightness ${lightness.min}-${lightness.max}, chroma ${chroma.min}-${chroma.max}.`;
  });

  return [
    `Jovie Image Color Policy ${policy.version} (${policy.schema})`,
    `Invariant: ${policy.invariant}`,
    `Priority: ${policy.priority.join(' > ')}.`,
    `Scope applies to ${policy.scope.appliesTo.join('; ')}. Excludes ${policy.scope.excludes.join('; ')}.`,
    'Scene references:',
    ...paletteLines,
    `Neutral exception: OKLCH chroma <= ${policy.neutralRule.maxChroma}. ${policy.neutralRule.guidance}`,
    `Controllable elements: choose ${policy.controllableSceneElements.join(', ')} in a scene hue or neutral before capture/generation.`,
    `Forbidden decorative controllable hues: ${policy.forbiddenControllableHues
      .map(hue => `${hue.name} at chroma >= ${hue.minChroma}`)
      .join(', ')}.`,
    `Protected truth: ${policy.protectedClasses.join(', ')} stay truthful. A conflict is reframed, replaced, removed, reduced in salience, or rejected.`,
    `Source/reflection consistency: ${policy.sourceReflectionConsistency.materials.join(', ')} must agree with one physically plausible source.`,
    `Subject separation: use OKLCH lightness, chroma, hue, wardrobe, edge light, focus, or composition. Do not use blanket material bans.`,
    `Skin/material: preserve ${policy.skinMaterialProtection.requiredTruths.join(', ')}; prevent oily or clipped highlights through ${policy.skinMaterialProtection.preventWith.join(', ')}.`,
    `Grade: ${policy.grade.allowed}. Forbidden: ${policy.grade.forbidden}.`,
    `Failure actions: ${policy.failureActions.join(', ')}. Never fix with post-hoc recoloring.`,
  ].join('\n');
}
