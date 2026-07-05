import { describe, expect, it } from 'vitest';
import {
  cosmicGateFixtureSignal,
  founderDemoCatalogSnapshot,
  matchCollaboratorSignal,
  normalizeCollaboratorAlias,
  resolveCatalogCollaborator,
  theDeepEndFixtureReleaseId,
} from '@/lib/catalog';

describe('catalog collaborator alias normalization', () => {
  it('normalizes conjunctions, punctuation, and casing', () => {
    expect(normalizeCollaboratorAlias('  Cosmic Gate & Tim White ')).toBe(
      'cosmic gate and tim white'
    );
    expect(normalizeCollaboratorAlias('Tim White x Cosmic Gate.')).toBe(
      'tim white x cosmic gate'
    );
  });
});

describe('catalog collaborator resolver', () => {
  it('resolves Cosmic Gate by Spotify provider ID with high confidence', () => {
    const result = resolveCatalogCollaborator(
      founderDemoCatalogSnapshot,
      cosmicGateFixtureSignal
    );

    expect(result).not.toBeNull();
    expect(result?.collaborator.name).toBe('Cosmic Gate');
    expect(result?.matchMethod).toBe('provider_id');
    expect(result?.confidence).toBeGreaterThanOrEqual(0.94);
  });

  it('resolves Cosmic Gate from free-text festival signal mentions', () => {
    const result = resolveCatalogCollaborator(founderDemoCatalogSnapshot, {
      text: 'Cosmic Gate has festival attention this weekend.',
    });

    expect(result).not.toBeNull();
    expect(result?.collaborator.name).toBe('Cosmic Gate');
    expect(result?.matchMethod).toBe('alias_fuzzy');
    expect(result?.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('resolves Cosmic Gate from Tim White x alias formatting', () => {
    const result = resolveCatalogCollaborator(founderDemoCatalogSnapshot, {
      text: 'Tim White x Cosmic Gate',
    });

    expect(result).not.toBeNull();
    expect(result?.collaborator.name).toBe('Cosmic Gate');
    expect(result?.matchMethod).toBe('alias_exact');
  });
});

describe('catalog collaborator signal matching fixture', () => {
  it('matches Cosmic Gate signal to The Deep End release', () => {
    const result = matchCollaboratorSignal(
      founderDemoCatalogSnapshot,
      cosmicGateFixtureSignal
    );

    expect(result).not.toBeNull();
    expect(result?.resolver.collaborator.name).toBe('Cosmic Gate');

    const topMatch = result?.matches[0];
    expect(topMatch?.release.id).toBe(theDeepEndFixtureReleaseId);
    expect(topMatch?.release.title).toBe('The Deep End');
    expect(topMatch?.reason).toContain('Cosmic Gate');
    expect(topMatch?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('does not match unrelated collaborator signals', () => {
    const result = matchCollaboratorSignal(founderDemoCatalogSnapshot, {
      text: 'Steve Aoki is playing a festival this weekend.',
    });

    expect(result).toBeNull();
  });
});
