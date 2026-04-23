import { z } from 'zod';

export type Genre =
  | 'electronic'
  | 'pop'
  | 'rock'
  | 'hiphop'
  | 'country'
  | 'rnb'
  | 'classical'
  | 'jazz'
  | 'folk'
  | 'metal'
  | 'other';

export type Territory = 'US' | 'EU' | 'UK' | 'LATAM' | 'APAC' | 'GLOBAL';
export type DistributionModel = 'diy' | 'indie_label' | 'major_label';
export type Goal = 'streams' | 'radio' | 'press' | 'fanbase' | 'catalog';
export type ReleaseFormat = 'single' | 'ep' | 'album';

export type ReleaseContext = {
  genre: Genre;
  distribution: DistributionModel;
  territory: Territory[];
  hasPublisher: boolean;
  releaseFormat: ReleaseFormat;
  primaryGoal: Goal;
};

export type ApplicabilityPredicate =
  | { type: 'always' }
  | { type: 'genre'; op: 'in' | 'not_in'; values: Genre[] }
  | { type: 'distribution'; op: 'eq' | 'neq'; value: DistributionModel }
  | { type: 'territory'; op: 'includes'; values: Territory[] }
  | { type: 'hasPublisher'; value: boolean }
  | { type: 'releaseFormat'; op: 'in'; values: ReleaseFormat[] }
  | { type: 'primaryGoal'; op: 'in'; values: Goal[] }
  | { type: 'and'; rules: ApplicabilityPredicate[] }
  | { type: 'or'; rules: ApplicabilityPredicate[] }
  | { type: 'not'; rule: ApplicabilityPredicate };

const GenreEnum = z.enum([
  'electronic',
  'pop',
  'rock',
  'hiphop',
  'country',
  'rnb',
  'classical',
  'jazz',
  'folk',
  'metal',
  'other',
]);
const TerritoryEnum = z.enum(['US', 'EU', 'UK', 'LATAM', 'APAC', 'GLOBAL']);
const DistributionEnum = z.enum(['diy', 'indie_label', 'major_label']);
const GoalEnum = z.enum(['streams', 'radio', 'press', 'fanbase', 'catalog']);
const ReleaseFormatEnum = z.enum(['single', 'ep', 'album']);

export const ApplicabilityPredicateSchema: z.ZodType<ApplicabilityPredicate> =
  z.lazy(() =>
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('always') }),
      z.object({
        type: z.literal('genre'),
        op: z.enum(['in', 'not_in']),
        values: z.array(GenreEnum).min(1),
      }),
      z.object({
        type: z.literal('distribution'),
        op: z.enum(['eq', 'neq']),
        value: DistributionEnum,
      }),
      z.object({
        type: z.literal('territory'),
        op: z.literal('includes'),
        values: z.array(TerritoryEnum).min(1),
      }),
      z.object({
        type: z.literal('hasPublisher'),
        value: z.boolean(),
      }),
      z.object({
        type: z.literal('releaseFormat'),
        op: z.literal('in'),
        values: z.array(ReleaseFormatEnum).min(1),
      }),
      z.object({
        type: z.literal('primaryGoal'),
        op: z.literal('in'),
        values: z.array(GoalEnum).min(1),
      }),
      z.object({
        type: z.literal('and'),
        rules: z.array(ApplicabilityPredicateSchema).min(1),
      }),
      z.object({
        type: z.literal('or'),
        rules: z.array(ApplicabilityPredicateSchema).min(1),
      }),
      z.object({
        type: z.literal('not'),
        rule: ApplicabilityPredicateSchema,
      }),
    ])
  );

export type RuleEvaluation = {
  matched: boolean;
  reasons: string[];
};

export function compileRule(
  predicate: ApplicabilityPredicate
): (ctx: ReleaseContext) => RuleEvaluation {
  return (ctx: ReleaseContext) => evaluate(predicate, ctx);
}

function evaluate(
  predicate: ApplicabilityPredicate,
  ctx: ReleaseContext
): RuleEvaluation {
  switch (predicate.type) {
    case 'always':
      return { matched: true, reasons: ['always'] };

    case 'genre': {
      const inList = predicate.values.includes(ctx.genre);
      const matched = predicate.op === 'in' ? inList : !inList;
      return {
        matched,
        reasons: matched
          ? [`genre ${predicate.op} ${predicate.values.join(',')}`]
          : [],
      };
    }

    case 'distribution': {
      const eq = ctx.distribution === predicate.value;
      const matched = predicate.op === 'eq' ? eq : !eq;
      return {
        matched,
        reasons: matched
          ? [`distribution ${predicate.op} ${predicate.value}`]
          : [],
      };
    }

    case 'territory': {
      const matched = predicate.values.some(t => ctx.territory.includes(t));
      return {
        matched,
        reasons: matched
          ? [`territory includes ${predicate.values.join(',')}`]
          : [],
      };
    }

    case 'hasPublisher': {
      const matched = ctx.hasPublisher === predicate.value;
      return {
        matched,
        reasons: matched ? [`hasPublisher=${predicate.value}`] : [],
      };
    }

    case 'releaseFormat': {
      const matched = predicate.values.includes(ctx.releaseFormat);
      return {
        matched,
        reasons: matched
          ? [`releaseFormat in ${predicate.values.join(',')}`]
          : [],
      };
    }

    case 'primaryGoal': {
      const matched = predicate.values.includes(ctx.primaryGoal);
      return {
        matched,
        reasons: matched
          ? [`primaryGoal in ${predicate.values.join(',')}`]
          : [],
      };
    }

    case 'and': {
      const evals = predicate.rules.map(r => evaluate(r, ctx));
      const matched = evals.every(e => e.matched);
      return {
        matched,
        reasons: matched ? evals.flatMap(e => e.reasons) : [],
      };
    }

    case 'or': {
      const evals = predicate.rules.map(r => evaluate(r, ctx));
      const matched = evals.some(e => e.matched);
      return {
        matched,
        reasons: matched
          ? evals.filter(e => e.matched).flatMap(e => e.reasons)
          : [],
      };
    }

    case 'not': {
      const inner = evaluate(predicate.rule, ctx);
      return {
        matched: !inner.matched,
        reasons: inner.matched ? [] : ['not'],
      };
    }
  }
}

export function parseApplicabilityRule(raw: unknown): ApplicabilityPredicate {
  return ApplicabilityPredicateSchema.parse(raw);
}
