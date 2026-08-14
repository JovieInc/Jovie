import type { MerchContentSubject } from './content-contract';

export type MerchContentFixtureExpectation = 'pass' | 'reject';

export interface MerchContentReviewFixture {
  readonly id: string;
  readonly family:
    | 'literal-people'
    | 'implied-people'
    | 'body-part'
    | 'false-positive';
  readonly subject: MerchContentSubject;
  readonly expected: MerchContentFixtureExpectation;
}

/**
 * Adversarial merch content fixtures (JOV-4740).
 *
 * Person fixtures must never become `ready` or publishable. Animal/mascot
 * graphics are the documented false-positive class and must pass.
 */
export const MERCH_CONTENT_REVIEW_FIXTURES: readonly MerchContentReviewFixture[] =
  [
    {
      id: 'literal-portrait-prompt',
      family: 'literal-people',
      subject: {
        prompt: 'Portrait of the artist on a black tee',
      },
      expected: 'reject',
    },
    {
      id: 'literal-generated-person',
      family: 'literal-people',
      subject: {
        prompt: 'Abstract merch for Static Bloom',
        labels: ['photoreal person', 'face', 'portrait'],
        imageDescription: 'A generated photoreal person looking at camera',
      },
      expected: 'reject',
    },
    {
      id: 'implied-crowd',
      family: 'implied-people',
      subject: {
        prompt: 'Stadium energy graphic',
        labels: ['crowd'],
        imageDescription: 'A packed crowd filling the print',
      },
      expected: 'reject',
    },
    {
      id: 'implied-model',
      family: 'implied-people',
      subject: {
        prompt: 'Fashion merch graphic',
        labels: ['model'],
        imageDescription: 'A runway model wearing the design',
      },
      expected: 'reject',
    },
    {
      id: 'implied-portrait-label',
      family: 'implied-people',
      subject: {
        prompt: 'Tour tee',
        labels: ['portrait'],
      },
      expected: 'reject',
    },
    {
      id: 'implied-face',
      family: 'implied-people',
      subject: {
        prompt: 'Signal field graphic',
        labels: ['face'],
        imageDescription: 'A faint face in the texture',
      },
      expected: 'reject',
    },
    {
      id: 'implied-hands',
      family: 'implied-people',
      subject: {
        prompt: 'Archive stamp merch',
        labels: ['hands'],
        imageDescription: 'Photoreal human hands reaching across the print',
      },
      expected: 'reject',
    },
    {
      id: 'body-part-artifact',
      family: 'body-part',
      subject: {
        prompt: 'Night transit graphic',
        labels: ['torso', 'fingers'],
        imageDescription: 'A stray torso and fingers in the corner',
      },
      expected: 'reject',
    },
    {
      id: 'person-like-silhouette',
      family: 'literal-people',
      subject: {
        prompt: 'Editorial cut merch',
        labels: ['human silhouette'],
        imageDescription: 'A person-like silhouette against the type',
      },
      expected: 'reject',
    },
    {
      id: 'fox-mascot-pass',
      family: 'false-positive',
      subject: {
        prompt: 'Illustrated fox mascot for Static Bloom',
        labels: ['fox mascot', 'illustrated animal'],
        imageDescription: 'A bold illustrated fox mascot, no human features',
      },
      expected: 'pass',
    },
    {
      id: 'wolf-animal-pass',
      family: 'false-positive',
      subject: {
        prompt: 'Wolf emblem merch',
        labels: ['wolf', 'animal graphic'],
        imageDescription: 'Geometric wolf mark, type-first, no people',
      },
      expected: 'pass',
    },
    {
      id: 'contract-boilerplate-pass',
      family: 'false-positive',
      subject: {
        prompt:
          'Print-ready artwork only. Do not depict people, faces, portraits, models, bodies, or human figures. Do not invent, imitate, or imply the artist likeness.',
        concept: 'Signal Field direction: abstract pulse lines',
      },
      expected: 'pass',
    },
  ];
