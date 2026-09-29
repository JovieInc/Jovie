import rawCharacterSystem from '../../../../canon/virtual-models.json';

export const JOVIE_MARKETING_CHARACTER_SYSTEM_SCHEMA =
  'jovie-marketing-character-system/v2';

export const MARKETING_CHARACTER_INDIVIDUALITY_AXES = [
  'mouth',
  'face',
  'hair',
  'build',
  'presence',
] as const;

export type MarketingCharacterIndividualityAxis =
  (typeof MARKETING_CHARACTER_INDIVIDUALITY_AXES)[number];

type SelectionGateVerdict = 'pass' | 'fail';
type BoardDecisionStatus = 'keep' | 'modify' | 'kill';
type CampaignEligibility =
  | 'eligible'
  | 'blocked-until-body-approved'
  | 'removed';

export interface MarketingCharacterPersona {
  readonly role: string;
  readonly scene: string;
  readonly lifestyleContext: string;
  readonly aestheticVocabulary: readonly string[];
  readonly likelyEnvironment: string;
  readonly aspiration: string;
}

export interface MarketingCharacterRecord {
  readonly id: string;
  readonly sex: string;
  readonly age: number;
  readonly heightCm: number;
  readonly build: string;
  readonly shoeEu: number;
  readonly hair: string;
  readonly eyes: string;
  readonly face: string;
  readonly traits: readonly string[];
  readonly status: 'active';
  readonly selectionGates: {
    readonly premiumAspirationalQuality: SelectionGateVerdict;
    readonly icpResonance: SelectionGateVerdict;
  };
  readonly icpTags: readonly string[];
  readonly persona: MarketingCharacterPersona;
  readonly individuality: Readonly<
    Record<MarketingCharacterIndividualityAxis, readonly string[]>
  >;
  readonly stylingConstraints: readonly string[];
}

export interface MarketingCharacterBoardDecision {
  readonly id: string;
  readonly status: BoardDecisionStatus;
  readonly face: string;
  readonly body: string;
  readonly modifications: readonly string[];
  readonly campaignEligibility: CampaignEligibility;
}

export interface MarketingCharacterSystem {
  readonly schema: typeof JOVIE_MARKETING_CHARACTER_SYSTEM_SCHEMA;
  readonly issue: string;
  readonly sourceCanon: readonly {
    readonly repository: string;
    readonly commit: string;
    readonly paths: readonly string[];
    readonly integrates: readonly string[];
  }[];
  readonly views: readonly string[];
  readonly castingBoard: {
    readonly status: string;
    readonly compCard: {
      readonly background: string;
      readonly lighting: string;
      readonly styling: string;
      readonly wardrobe: string;
      readonly grooming: string;
      readonly framing: readonly {
        readonly view: string;
        readonly requirement: string;
      }[];
      readonly reject: readonly string[];
    };
    readonly selectionGates: readonly {
      readonly id: string;
      readonly independent: boolean;
      readonly requirement: string;
    }[];
    readonly similarityReview: {
      readonly method: string;
      readonly axes: readonly string[];
      readonly nearDuplicateThreshold: number;
      readonly visualReview: string;
      readonly reviewedPairs: readonly string[];
      readonly requirement: string;
    };
    readonly groupScenes: {
      readonly priority: readonly string[];
      readonly allowedDifferentiators: readonly string[];
      readonly forbiddenDifferentiation: string;
      readonly uniqueHighSignalStyling: readonly string[];
    };
  };
  readonly generationPolicy: {
    readonly personaBriefOrder: string;
    readonly personaFields: readonly string[];
    readonly worldCoherence: {
      readonly requiredParts: readonly string[];
      readonly requirement: string;
    };
    readonly nosePiercing: string;
    readonly photography: {
      readonly qualityBar: string;
      readonly realismRule: string;
      readonly requirements: readonly string[];
    };
    readonly compositePhysics: {
      readonly directionalCoherence: string;
      readonly lightCoherence: string;
      readonly reflectionCoherence: string;
    };
  };
  readonly boardDecisions: readonly MarketingCharacterBoardDecision[];
  readonly models: readonly MarketingCharacterRecord[];
  readonly removed: readonly string[];
}

export const JOVIE_MARKETING_CHARACTER_SYSTEM =
  rawCharacterSystem as unknown as MarketingCharacterSystem;

export type MarketingCharacterLightDirection =
  | 'from-left'
  | 'from-right'
  | 'from-above'
  | 'from-below'
  | 'from-front'
  | 'from-behind';

export type MarketingCharacterShadowDirection =
  | 'to-left'
  | 'to-right'
  | 'to-above'
  | 'to-below'
  | 'to-front'
  | 'to-behind';

export interface MarketingCharacterGenerationBrief {
  readonly purpose: 'casting-board' | 'campaign';
  readonly modelIds: readonly string[];
  readonly persona: MarketingCharacterPersona & {
    readonly icpTags: readonly string[];
  };
  readonly world: {
    readonly character: string;
    readonly wardrobe: string;
    readonly environment: string;
    readonly props: string;
    readonly activity: string;
    readonly lighting: string;
    readonly coherenceStatement: string;
  };
  readonly nosePiercing?: string;
  readonly groupDifferentiators?: readonly {
    readonly modelId: string;
    readonly traits: readonly string[];
    readonly highSignalStyling: readonly string[];
  }[];
  readonly physics: {
    readonly camera: {
      readonly lensMm: number;
      readonly position: string;
      readonly perspective: string;
    };
    readonly lightSources: readonly {
      readonly id: string;
      readonly direction: MarketingCharacterLightDirection;
      readonly motivation: string;
    }[];
    readonly keyLightId: string;
    readonly shadowDirection: MarketingCharacterShadowDirection;
    readonly reflectionSourceIds: readonly string[];
    readonly materialBehavior: readonly string[];
    readonly vectorCoherenceStatement: string;
  };
}

export interface MarketingCharacterFinding {
  readonly code: string;
  readonly stage: 'asset-generation' | 'adversarial-review';
  readonly message: string;
}

export interface MarketingCharacterSimilarityResult {
  readonly leftId: string;
  readonly rightId: string;
  readonly score: number;
  readonly axisScores: Readonly<
    Record<MarketingCharacterIndividualityAxis, number>
  >;
}

const GENERIC_ENVIRONMENT = /\b(default|generic|random|stock|unspecified)\b/i;
const PROTECTED_DIFFERENTIATOR =
  /\b(age|disab(?:ility|led)|ethnic(?:ity)?|gender|national(?:ity| origin)?|race|religion|sex|sexual orientation|skin(?: tone| color)?)\b/i;

const EXPECTED_SHADOW_DIRECTION: Readonly<
  Record<MarketingCharacterLightDirection, MarketingCharacterShadowDirection>
> = {
  'from-left': 'to-right',
  'from-right': 'to-left',
  'from-above': 'to-below',
  'from-below': 'to-above',
  'from-front': 'to-behind',
  'from-behind': 'to-front',
};

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll(/\s+/g, ' ');
}

function jaccard(left: readonly string[], right: readonly string[]): number {
  const a = new Set(left.map(normalized));
  const b = new Set(right.map(normalized));
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  const overlap = [...a].filter(value => b.has(value)).length;
  return overlap / union.size;
}

export function scoreMarketingCharacterSimilarity(
  left: MarketingCharacterRecord,
  right: MarketingCharacterRecord
): MarketingCharacterSimilarityResult {
  const axisScores = Object.fromEntries(
    MARKETING_CHARACTER_INDIVIDUALITY_AXES.map(axis => [
      axis,
      jaccard(left.individuality[axis], right.individuality[axis]),
    ])
  ) as unknown as Readonly<Record<MarketingCharacterIndividualityAxis, number>>;
  const score =
    Object.values(axisScores).reduce((sum, value) => sum + value, 0) /
    MARKETING_CHARACTER_INDIVIDUALITY_AXES.length;

  return { leftId: left.id, rightId: right.id, score, axisScores };
}

export function findNearDuplicateMarketingCharacters(
  models: readonly MarketingCharacterRecord[],
  threshold = JOVIE_MARKETING_CHARACTER_SYSTEM.castingBoard.similarityReview
    .nearDuplicateThreshold
): readonly MarketingCharacterSimilarityResult[] {
  const results: MarketingCharacterSimilarityResult[] = [];
  for (let leftIndex = 0; leftIndex < models.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < models.length;
      rightIndex += 1
    ) {
      const left = models[leftIndex];
      const right = models[rightIndex];
      if (!left || !right) continue;
      const result = scoreMarketingCharacterSimilarity(left, right);
      if (result.score >= threshold) results.push(result);
    }
  }
  return results.toSorted((a, b) => b.score - a.score);
}

function finding(code: string, message: string): MarketingCharacterFinding {
  return { code, stage: 'asset-generation', message };
}

export function auditMarketingCharacterGenerationBrief(
  brief: MarketingCharacterGenerationBrief,
  system: MarketingCharacterSystem = JOVIE_MARKETING_CHARACTER_SYSTEM
): readonly MarketingCharacterFinding[] {
  const findings: MarketingCharacterFinding[] = [];
  const modelsById = new Map(system.models.map(model => [model.id, model]));
  const decisionsById = new Map(
    system.boardDecisions.map(decision => [decision.id, decision])
  );
  const selectedModels: MarketingCharacterRecord[] = [];

  if (brief.modelIds.length === 0) {
    findings.push(
      finding('missing-character', 'Select at least one character.')
    );
  }

  for (const modelId of new Set(brief.modelIds)) {
    const model = modelsById.get(modelId);
    const decision = decisionsById.get(modelId);
    if (
      !model ||
      system.removed.includes(modelId) ||
      decision?.status === 'kill'
    ) {
      findings.push(
        finding(
          'unavailable-character',
          `${modelId} is not an active character.`
        )
      );
      continue;
    }
    selectedModels.push(model);
    if (
      model.selectionGates.premiumAspirationalQuality !== 'pass' ||
      model.selectionGates.icpResonance !== 'pass'
    ) {
      findings.push(
        finding(
          'failed-selection-gate',
          `${modelId} must pass premium aspirational quality and ICP resonance independently.`
        )
      );
    }
    if (
      brief.purpose === 'campaign' &&
      decision?.campaignEligibility !== 'eligible'
    ) {
      findings.push(
        finding(
          'campaign-character-blocked',
          `${modelId} is blocked from campaign use until its board modification is approved.`
        )
      );
    }
  }

  const personaValues = [
    brief.persona.role,
    brief.persona.scene,
    brief.persona.lifestyleContext,
    brief.persona.likelyEnvironment,
    brief.persona.aspiration,
  ];
  if (
    personaValues.some(value => !value.trim()) ||
    brief.persona.aestheticVocabulary.length === 0 ||
    brief.persona.icpTags.length === 0
  ) {
    findings.push(
      finding(
        'incomplete-persona-brief',
        'Role, scene, lifestyle context, aesthetic vocabulary, likely environment, aspiration, and ICP tags are required before generation.'
      )
    );
  }

  const worldValues = [
    brief.world.character,
    brief.world.wardrobe,
    brief.world.environment,
    brief.world.props,
    brief.world.activity,
    brief.world.lighting,
    brief.world.coherenceStatement,
  ];
  if (worldValues.some(value => !value.trim())) {
    findings.push(
      finding(
        'incomplete-character-world',
        'Character, wardrobe, environment, props, activity, lighting, and a coherence statement must define one world.'
      )
    );
  }
  if (GENERIC_ENVIRONMENT.test(brief.world.environment)) {
    findings.push(
      finding(
        'generic-stock-environment',
        'Generic stock environments are rejected unless the persona brief specifically justifies one.'
      )
    );
  }

  if (brief.nosePiercing && /septum|bull[ -]?ring/i.test(brief.nosePiercing)) {
    findings.push(
      finding(
        'forbidden-nose-piercing',
        'Septum and bull-ring piercings are not allowed; use at most one subtle side-nostril piercing.'
      )
    );
  }

  const nearDuplicates = findNearDuplicateMarketingCharacters(selectedModels);
  for (const duplicate of nearDuplicates) {
    findings.push(
      finding(
        'sibling-characters',
        `${duplicate.leftId} and ${duplicate.rightId} score ${duplicate.score.toFixed(2)} across mouth, face, hair, build, and presence; differentiate or recast before generation.`
      )
    );
  }

  const highSignalStyling = new Map<string, string>();
  for (const entry of brief.groupDifferentiators ?? []) {
    for (const trait of entry.traits) {
      if (PROTECTED_DIFFERENTIATOR.test(trait)) {
        findings.push(
          finding(
            'protected-characteristic-differentiator',
            `${entry.modelId} uses a protected characteristic as a differentiation token.`
          )
        );
      }
    }
    for (const styling of entry.highSignalStyling) {
      const value = normalized(styling);
      const firstModelId = highSignalStyling.get(value);
      if (firstModelId) {
        findings.push(
          finding(
            'duplicate-high-signal-styling',
            `${entry.modelId} repeats high-signal styling from ${firstModelId}: ${styling}.`
          )
        );
      } else if (value) {
        highSignalStyling.set(value, entry.modelId);
      }
    }
  }

  const lightIds = new Set(brief.physics.lightSources.map(source => source.id));
  const keyLight = brief.physics.lightSources.find(
    source => source.id === brief.physics.keyLightId
  );
  if (!keyLight) {
    findings.push(
      finding(
        'missing-key-light',
        'The declared key light must resolve to a motivated light source.'
      )
    );
  } else if (
    EXPECTED_SHADOW_DIRECTION[keyLight.direction] !==
    brief.physics.shadowDirection
  ) {
    findings.push(
      finding(
        'incoherent-shadow-direction',
        `A key light ${keyLight.direction} requires shadows ${EXPECTED_SHADOW_DIRECTION[keyLight.direction]}.`
      )
    );
  }
  for (const sourceId of brief.physics.reflectionSourceIds) {
    if (!lightIds.has(sourceId)) {
      findings.push(
        finding(
          'unmotivated-reflection',
          `Reflection source ${sourceId} does not resolve to a declared light.`
        )
      );
    }
  }
  if (
    brief.physics.camera.lensMm < 14 ||
    brief.physics.camera.lensMm > 200 ||
    !brief.physics.camera.position.trim() ||
    !brief.physics.camera.perspective.trim()
  ) {
    findings.push(
      finding(
        'implausible-camera',
        'Declare a plausible 14-200mm lens, camera position, and perspective.'
      )
    );
  }
  if (
    brief.physics.materialBehavior.length === 0 ||
    !brief.physics.vectorCoherenceStatement.trim()
  ) {
    findings.push(
      finding(
        'incomplete-physical-world',
        'Material response and scene-vector coherence must be declared before compositing.'
      )
    );
  }

  return findings;
}

export function formatMarketingCharacterSystemForPrompt(
  modelIds: readonly string[] = JOVIE_MARKETING_CHARACTER_SYSTEM.models.map(
    model => model.id
  ),
  system: MarketingCharacterSystem = JOVIE_MARKETING_CHARACTER_SYSTEM
): string {
  const selected = system.models.filter(model => modelIds.includes(model.id));
  const compCard = system.castingBoard.compCard;
  const generation = system.generationPolicy;

  return [
    `Jovie Marketing Character System (${system.schema})`,
    `Source canon: ${system.sourceCanon
      .map(source => `${source.repository}@${source.commit}`)
      .join(
        '; '
      )}. Reuse its founder/studio wardrobe and premium documentary direction.`,
    `Casting board: ${system.castingBoard.status}. Use a ${compCard.background}; ${compCard.lighting}; ${compCard.styling}; ${compCard.wardrobe}; ${compCard.grooming}.`,
    `Comp-card frames: ${compCard.framing
      .map(frame => `${frame.view}: ${frame.requirement}`)
      .join('; ')}. Reject ${compCard.reject.join('; ')}.`,
    `Selection gates, independently required: ${system.castingBoard.selectionGates
      .map(gate => `${gate.id}: ${gate.requirement}`)
      .join('; ')}.`,
    `Similarity: inspect ${system.castingBoard.similarityReview.axes.join(', ')} and reject sibling candidates at ${system.castingBoard.similarityReview.nearDuplicateThreshold} or above; machine results never replace visual review.`,
    `Persona-first: ${generation.personaBriefOrder} Required fields: ${generation.personaFields.join(', ')}.`,
    `World coherence: ${generation.worldCoherence.requirement} Required parts: ${generation.worldCoherence.requiredParts.join(', ')}.`,
    `Group scenes: optimize ${system.castingBoard.groupScenes.priority.join(' then ')}. ${system.castingBoard.groupScenes.forbiddenDifferentiation} Keep these high-signal traits unique: ${system.castingBoard.groupScenes.uniqueHighSignalStyling.join(', ')}.`,
    `Nose piercing: ${generation.nosePiercing}`,
    `Photography: ${generation.photography.qualityBar}. ${generation.photography.realismRule} Require ${generation.photography.requirements.join('; ')}.`,
    `Composite physics: ${generation.compositePhysics.directionalCoherence}; ${generation.compositePhysics.lightCoherence}; ${generation.compositePhysics.reflectionCoherence}.`,
    ...selected.map(
      model =>
        `${model.id}: ${model.persona.role}; ${model.persona.scene}; ${model.persona.lifestyleContext}; aesthetic ${model.persona.aestheticVocabulary.join(', ')}; environment ${model.persona.likelyEnvironment}; aspiration ${model.persona.aspiration}; ICP ${model.icpTags.join(', ')}; fixed identity hair ${model.hair}, eyes ${model.eyes}, face ${model.face}; styling constraints ${model.stylingConstraints.join(', ') || 'none beyond global policy'}.`
    ),
  ].join('\n');
}
