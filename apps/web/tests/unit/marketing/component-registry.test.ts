import fs from 'node:fs';
import path from 'node:path';
import {
  BUTTON_PEN_CONTRACT,
  BUTTON_SIZE_NAMES,
  BUTTON_VARIANT_NAMES,
} from '@jovie/ui';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  BUTTON_PEN_PROPAGATION_FIXTURES,
  DESIGN_SYSTEM_COMPONENT_IDS,
  DESIGN_SYSTEM_COMPONENT_REGISTRY,
  designSystemVariantKey,
  normalizeButtonPenRef,
  validateDesignSystemComponentRegistry,
} from '@/data/designSystem';
import {
  MARKETING_COMPONENT_REGISTRY,
  MARKETING_SECTION_IDS,
  MARKETING_SECTION_REGISTRY,
  MARKETING_SECTIONS,
  MARKETING_SHELL_REGISTRY,
  type MarketingRegistryEntry,
  marketingPenSelector,
  validateMarketingPenRegistry,
} from '@/data/marketing';

const repoRoot = path.resolve(__dirname, '../../../../..');

/**
 * Source exports whose root identity is covered by this registry test instead
 * of a component-local interaction test. Keep this list literal so the ship
 * gate can prove each @coverage-via directive targets the owning component.
 */
const CENTRAL_MARKETING_CONTRACT_COVERAGE = [
  'FaqSection',
  'MarketingContainer',
  'MarketingContentShell',
  'ArtistNotificationsLanding',
  'ArtistProfileCaptureSection',
  'ArtistProfileHowItWorks',
  'ArtistProfileLandingRoute',
  'ArtistProfileOutcomesCarousel',
  'ArtistProfileSectionShell',
  'ArtistProfileSocialProof',
  'ArtistProfileSpecWall',
  'HomepageV2Route',
  'MarketingFinalCTA',
  'MarketingTerminalCta',
] as const;

function countOccurrences(source: string, binding: string): number {
  return source.split(binding).length - 1;
}

function parseTsx(absolutePath: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    absolutePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
}

function countReturnedRootBindings(
  sourceFile: ts.SourceFile,
  binding: string
): number {
  let matches = 0;

  function visit(node: ts.Node): void {
    if (ts.isJsxAttribute(node) && node.getText(sourceFile) === binding) {
      const openingElement = node.parent.parent;
      const rootElement = ts.isJsxOpeningElement(openingElement)
        ? openingElement.parent
        : openingElement;
      let ancestor = rootElement.parent;
      let nestedInsideJsx = false;

      while (ancestor && !ts.isReturnStatement(ancestor)) {
        if (ts.isJsxElement(ancestor) || ts.isJsxFragment(ancestor)) {
          nestedInsideJsx = true;
          break;
        }
        ancestor = ancestor.parent;
      }

      if (ancestor && !nestedInsideJsx) matches += 1;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return matches;
}

function hasNamedExport(
  sourceFile: ts.SourceFile,
  exportName: string
): boolean {
  return sourceFile.statements.some(statement => {
    const exported = statement.modifiers?.some(
      modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
    );
    if (
      exported &&
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name?.text === exportName
    ) {
      return true;
    }
    if (exported && ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some(
        declaration =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === exportName
      );
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      return (
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.some(
          element => element.name.text === exportName
        )
      );
    }
    return false;
  });
}

function hasSourceBackedButtonFixture(
  fixture: (typeof BUTTON_PEN_PROPAGATION_FIXTURES)[number]
): boolean {
  const absolutePath = path.join(repoRoot, fixture.source);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = parseTsx(absolutePath, source);
  let importsSharedButton = false;
  let matchesButton = false;

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === '@jovie/ui' &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      importsSharedButton = node.importClause.namedBindings.elements.some(
        element => element.name.text === 'Button'
      );
    }

    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText() === 'Button'
    ) {
      const attributes = new Map(
        node.openingElement.attributes.properties
          .filter(ts.isJsxAttribute)
          .map(attribute => [
            attribute.name.getText(),
            attribute.initializer && ts.isStringLiteral(attribute.initializer)
              ? attribute.initializer.text
              : null,
          ])
      );
      const body = node.getText(sourceFile);
      // Fixtures with a labelSource receive the label through props or copy
      // data; the literal label is proved against the labelSource file below.
      const matchesLabel = fixture.labelSource
        ? true
        : body.includes(fixture.label);
      matchesButton ||=
        attributes.get('variant') === fixture.variant &&
        attributes.get('size') === fixture.size &&
        matchesLabel &&
        (!fixture.leadingIcon || body.includes(`<${fixture.leadingIcon}`));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (
    'labelSource' in fixture &&
    fixture.labelSource &&
    !fs
      .readFileSync(path.join(repoRoot, fixture.labelSource), 'utf8')
      .includes(`'${fixture.label}'`)
  ) {
    return false;
  }

  return importsSharedButton && matchesButton;
}

function variantSelections(
  axes: Readonly<Record<string, readonly string[]>>
): readonly Readonly<Record<string, string>>[] {
  return Object.entries(axes).reduce<Readonly<Record<string, string>>[]>(
    (selections, [axis, values]) =>
      selections.flatMap(selection =>
        values.map(value => ({ ...selection, [axis]: value }))
      ),
    [{}]
  );
}

describe('canonical marketing component registry', () => {
  it('projects normative sections, variants, defaults, and stories once', () => {
    expect(MARKETING_SECTION_REGISTRY).toHaveLength(
      MARKETING_SECTION_IDS.length
    );
    expect(MARKETING_SECTION_REGISTRY.map(entry => entry.sectionId)).toEqual(
      MARKETING_SECTION_IDS
    );
    expect(
      new Set(MARKETING_SECTION_REGISTRY.map(entry => entry.id)).size
    ).toBe(MARKETING_SECTION_REGISTRY.length);
    for (const section of MARKETING_SECTIONS) {
      const entry = MARKETING_SECTION_REGISTRY.find(
        candidate => candidate.sectionId === section.id
      );
      expect(entry, section.id).toMatchObject({
        variants: section.variants.map(variant => variant.id),
        defaultVariant: section.defaultVariant,
        storybookTitle: `Marketing/Sections/${section.id}`,
      });
    }
  });

  it('has one id per registered component and one shared shell set', () => {
    const ids = MARKETING_COMPONENT_REGISTRY.map(entry => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MARKETING_SHELL_REGISTRY.map(entry => entry.id)).toEqual([
      'shell.public-page',
      'shell.header',
      'shell.footer',
      'shell.footer-cta',
      'shell.final-cta',
      'shell.page',
      'shell.container',
      'shell.prose',
    ]);
  });

  it('resolves every shell entry to a real source file', () => {
    for (const entry of MARKETING_SHELL_REGISTRY) {
      expect(
        fs.existsSync(path.join(repoRoot, `${entry.source}.tsx`)),
        entry.id
      ).toBe(true);
    }
  });

  it('keeps one source concept and one canonical story per shell identity', () => {
    const sources = MARKETING_SHELL_REGISTRY.map(entry => entry.source);
    expect(new Set(sources).size, 'duplicate shell source ownership').toBe(
      sources.length
    );
    const storyTitles = MARKETING_SHELL_REGISTRY.map(
      entry => entry.storybookTitle
    );
    expect(
      new Set(storyTitles).size,
      'duplicate shell storybook identity'
    ).toBe(storyTitles.length);
  });

  it('anchors the prose taxonomy on MarketingContentShell, not a container alias', () => {
    const prose = MARKETING_SHELL_REGISTRY.find(
      entry => entry.id === 'shell.prose'
    );
    expect(prose).toMatchObject({
      source: 'apps/web/components/marketing/MarketingContentShell',
      storybookTitle: 'Marketing/Shells/MarketingContentShell',
    });
    const container = MARKETING_SHELL_REGISTRY.find(
      entry => entry.id === 'shell.container'
    );
    expect(container).toMatchObject({
      source: 'apps/web/components/marketing/MarketingContainer',
      storybookTitle: 'Marketing/Shells/MarketingContainer/page',
    });
  });

  it('limits compositions to one registered hero', () => {
    expect(
      MARKETING_SECTION_REGISTRY.find(entry => entry.sectionId === 'hero')
        ?.maxPerComposition
    ).toBe(1);
  });

  it('resolves every source-backed Pen root and wires its identity in source', () => {
    const coveredSourceNames = MARKETING_COMPONENT_REGISTRY.flatMap(entry => [
      entry.exportName,
      ...entry.rootProofs.map(proof => path.basename(proof.source, '.tsx')),
    ]).filter(Boolean);
    expect(coveredSourceNames).toEqual(
      expect.arrayContaining([...CENTRAL_MARKETING_CONTRACT_COVERAGE])
    );

    for (const entry of MARKETING_COMPONENT_REGISTRY) {
      if (!entry.sourceBacked) {
        expect(entry.penRootIds, entry.id).toEqual([]);
        expect(entry.unresolvedReason, entry.id).toBeTruthy();
        continue;
      }

      expect(entry.resolvedSource, entry.id).toBeTruthy();
      expect(entry.exportName, entry.id).toBeTruthy();
      expect(entry.penRootIds, entry.id).toHaveLength(1);
      expect(entry.rootProofs.length, entry.id).toBeGreaterThan(0);

      const resolvedPath = path.join(repoRoot, entry.resolvedSource as string);
      const resolvedSource = fs.readFileSync(resolvedPath, 'utf8');
      expect(
        hasNamedExport(
          parseTsx(resolvedPath, resolvedSource),
          entry.exportName as string
        ),
        entry.id
      ).toBe(true);

      for (const proof of entry.rootProofs) {
        const proofPath = path.join(repoRoot, proof.source);
        const source = fs.readFileSync(proofPath, 'utf8');
        const occurrences =
          proof.kind === 'source'
            ? countOccurrences(source, proof.binding)
            : countReturnedRootBindings(
                parseTsx(proofPath, source),
                proof.binding
              );
        expect(occurrences, `${entry.id}: ${proof.source}`).toBe(
          proof.occurrences
        );
      }
    }
  });

  it('keeps terminal CTA actions on the canonical Button atom', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'apps/web/components/site/MarketingTerminalCta.tsx'),
      'utf8'
    );

    expect(source).toContain("import { Button } from '@jovie/ui'");
    expect(source).toContain("variant='primary'");
    expect(source).toContain("variant='tertiary'");
    expect(source.match(/asChild/g)).toHaveLength(2);
    expect(source).not.toContain('public-action-primary');
    expect(source).not.toContain('focus-visible:ring-white/40');
  });

  it('keeps contract ids and Pen roots globally unique', () => {
    const ids = MARKETING_COMPONENT_REGISTRY.map(entry => entry.id);
    const roots = MARKETING_COMPONENT_REGISTRY.flatMap(entry => [
      ...entry.penRootIds,
      ...Object.values(entry.penVariantRoots ?? {}),
    ]);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(roots).size).toBe(roots.length);
    expect(roots.map(marketingPenSelector)).toEqual(
      roots.map(root => `[data-pen-contract="${root}"]`)
    );
    expect(validateMarketingPenRegistry()).toEqual([]);
  });

  it('rejects duplicate identities and unresolved production roots', () => {
    const resolved = MARKETING_COMPONENT_REGISTRY.find(
      entry => entry.sourceBacked
    ) as MarketingRegistryEntry;
    const anotherResolved = MARKETING_COMPONENT_REGISTRY.find(
      entry => entry.sourceBacked && entry.id !== resolved.id
    ) as MarketingRegistryEntry;
    const unresolved = MARKETING_COMPONENT_REGISTRY.find(
      entry => !entry.sourceBacked
    ) as MarketingRegistryEntry;

    const duplicate = {
      ...anotherResolved,
      id: resolved.id,
      penRootIds: resolved.penRootIds,
    } as MarketingRegistryEntry;
    const brokenResolution = {
      ...resolved,
      resolvedSource: null,
    } as MarketingRegistryEntry;
    const unresolvedWithRoot = {
      ...unresolved,
      penRootIds: resolved.penRootIds,
    } as MarketingRegistryEntry;

    expect(
      validateMarketingPenRegistry([
        resolved,
        duplicate,
        brokenResolution,
        unresolvedWithRoot,
      ]).map(issue => issue.code)
    ).toEqual(
      expect.arrayContaining([
        'duplicate-contract-id',
        'duplicate-pen-root',
        'unresolved-source-root',
        'unresolved-row-has-production-root',
      ])
    );
  });

  it('keeps section.cta unresolved until JOV-4954 converges the production shell root', () => {
    expect(
      MARKETING_COMPONENT_REGISTRY.find(entry => entry.id === 'section.cta')
    ).toMatchObject({
      sourceBacked: false,
      unresolvedReason:
        'A production shell root exists, but section.cta convergence is pending JOV-4954.',
    });
  });
});

describe('current-main Pen source contracts (JOV-4961)', () => {
  const sectionEntry = (sectionId: string) =>
    MARKETING_SECTION_REGISTRY.find(entry => entry.sectionId === sectionId);

  const variant = (sectionId: string, variantId: string) =>
    MARKETING_SECTIONS.find(section => section.id === sectionId)?.variants.find(
      candidate => candidate.id === variantId
    );

  it('feature-grid registers the shipped four-row ledger as the sole active body', () => {
    expect(sectionEntry('feature-grid')).toMatchObject({
      sourceBacked: true,
      resolvedSource:
        'apps/web/components/marketing/artist-profile/ArtistProfileOutcomesCarousel.tsx',
      exportName: 'ArtistProfileOutcomesCarousel',
      variants: ['4-ledger', '3-large', '4-equal', '6-compact', 'icon-list'],
      defaultVariant: '4-ledger',
      storybookTitle: 'Marketing/Sections/feature-grid',
    });
    expect(variant('feature-grid', '4-ledger')).toMatchObject({
      status: 'active',
      exemplar: { route: '/artist-profiles', section: 'outcomes' },
    });
    for (const unsupported of [
      '3-large',
      '4-equal',
      '6-compact',
      'icon-list',
    ]) {
      expect(variant('feature-grid', unsupported)?.status).toBe('unproven');
    }
  });

  it('feature-split resolves to the shared adaptive section with phone-right default', () => {
    expect(sectionEntry('feature-split')).toMatchObject({
      sourceBacked: true,
      resolvedSource:
        'apps/web/components/marketing/artist-profile/ArtistProfileAdaptiveSection.tsx',
      exportName: 'ArtistProfileAdaptiveSection',
      defaultVariant: 'phone-right',
      storybookTitle: 'Marketing/Sections/feature-split',
    });
    expect(variant('feature-split', 'phone-right')).toMatchObject({
      status: 'active',
      exemplar: { route: '/artist-profiles', section: 'adaptive' },
    });
    for (const demoted of ['screenshot-right', 'bordered-screenshot-left']) {
      const candidate = variant('feature-split', demoted);
      expect(candidate?.status).toBe('unproven');
      expect(candidate?.exemplar).toBeUndefined();
    }
  });

  it('spec-wall registers the shipped five-screenshot-tile production variant', () => {
    expect(sectionEntry('spec-wall')).toMatchObject({
      sourceBacked: true,
      resolvedSource:
        'apps/web/components/marketing/artist-profile/ArtistProfileSpecWall.tsx',
      exportName: 'ArtistProfileSpecWall',
      variants: ['5-screenshot-bento', 'bento', 'dense-compact-grid'],
      defaultVariant: '5-screenshot-bento',
      storybookTitle: 'Marketing/Sections/spec-wall',
    });
    expect(variant('spec-wall', '5-screenshot-bento')).toMatchObject({
      status: 'active',
      exemplar: { route: '/artist-notifications', section: 'spec-wall' },
    });
    const dense = variant('spec-wall', 'dense-compact-grid');
    expect(dense?.status).toBe('unproven');
    expect(dense?.exemplar).toBeUndefined();
  });

  it('mounts each canonical section body exactly once in the catalog stories', () => {
    const storySource = fs.readFileSync(
      path.join(
        repoRoot,
        'apps/web/components/marketing/storybook/MarketingSections.stories.tsx'
      ),
      'utf8'
    );

    // feature-split: one shared adaptive section body, no duplicate mounts.
    expect(countOccurrences(storySource, '<ArtistProfileAdaptiveSection')).toBe(
      1
    );
    expect(storySource).not.toContain('<ArtistProfileHeroAdaptiveIntro');
    expect(storySource).not.toContain('<ArtistProfileModeSwitcher');

    // feature-grid: the shipped outcomes ledger body.
    expect(
      countOccurrences(storySource, '<ArtistProfileOutcomesCarousel')
    ).toBe(1);

    // spec-wall: the exact /artist-notifications route fixture.
    expect(countOccurrences(storySource, '<ArtistProfileSpecWall')).toBe(1);
    expect(storySource).toContain('tiles={ARTIST_NOTIFICATIONS_SPEC_TILES}');
    expect(storySource).toContain(
      'specWall={ARTIST_NOTIFICATIONS_COPY.specWall}'
    );
    expect(storySource).not.toContain('truthTiles=');
  });
});

describe('canonical shared source atom registry', () => {
  it('resolves source, story, contract, and test ownership', () => {
    for (const entry of DESIGN_SYSTEM_COMPONENT_REGISTRY) {
      expect(fs.existsSync(path.join(repoRoot, entry.source)), entry.id).toBe(
        true
      );
      if (entry.contractSource) {
        expect(
          fs.existsSync(path.join(repoRoot, entry.contractSource)),
          entry.id
        ).toBe(true);
      }
      if (entry.storySource) {
        const storySource = fs.readFileSync(
          path.join(repoRoot, entry.storySource),
          'utf8'
        );
        expect(
          fs.existsSync(path.join(repoRoot, entry.storySource)),
          entry.id
        ).toBe(true);
        expect(storySource, entry.id).toContain(
          `title: '${entry.storybookTitle}'`
        );
        expect(storySource, entry.id).toContain(
          `export const ${entry.storyExport}`
        );
      }
      for (const testSource of entry.testSources) {
        expect(fs.existsSync(path.join(repoRoot, testSource)), entry.id).toBe(
          true
        );
      }
    }

    expect(
      DESIGN_SYSTEM_COMPONENT_REGISTRY.find(entry => entry.id === 'atom.button')
    ).toMatchObject({
      penRootId: null,
      penRootByVariantKey: BUTTON_PEN_CONTRACT.rootByVariantKey,
      referenceEligible: true,
      variantAxes: {
        destructive: ['false', 'true'],
        variant: BUTTON_VARIANT_NAMES,
        size: BUTTON_SIZE_NAMES,
      },
    });
    expect(DESIGN_SYSTEM_COMPONENT_REGISTRY.map(entry => entry.id)).toEqual(
      DESIGN_SYSTEM_COMPONENT_IDS
    );
    expect(validateDesignSystemComponentRegistry()).toEqual([]);
  });

  it('keeps atom.logo raw until it has a source-mapped Pen origin', () => {
    expect(
      DESIGN_SYSTEM_COMPONENT_REGISTRY.find(entry => entry.id === 'atom.logo')
    ).toMatchObject({
      penRootId: null,
      referenceEligible: false,
    });
  });

  it('gives every supported atom variant a deterministic unique address', () => {
    const keys = DESIGN_SYSTEM_COMPONENT_REGISTRY.flatMap(component =>
      variantSelections(component.variantAxes).map(selection =>
        designSystemVariantKey(component.id, selection)
      )
    );

    expect(new Set(keys).size).toBe(keys.length);
    expect(() =>
      designSystemVariantKey('atom.button', {
        destructive: 'false',
        size: 'lg',
        variant: 'primary',
        visualGuess: 'invented',
      })
    ).toThrow('Unsupported atom.button axis: visualGuess');
  });

  it('resolves Button imports to their exact Pen master and descendant slots', () => {
    const input = {
      componentId: 'atom.button',
      variant: 'primary',
      size: 'lg',
      label: 'Download for Mac',
    } as const;

    const master =
      BUTTON_PEN_CONTRACT.rootByVariantKey['button/primary/lg/idle'];
    expect(master).toBeDefined();

    const normalized = normalizeButtonPenRef(input);
    expect(normalizeButtonPenRef(input)).toEqual(normalized);
    expect(normalized).toEqual({
      componentId: 'atom.button',
      ref: master?.rootId,
      master,
      variantKey: 'button/primary/lg/idle',
      variant: { destructive: 'false', size: 'lg', variant: 'primary' },
      overrides: [
        {
          nodeId: master?.descendants.label,
          property: 'content',
          value: 'Download for Mac',
        },
      ],
    });
  });

  it('fails closed for leading-icon overrides without a verified Pen slot', () => {
    const master =
      BUTTON_PEN_CONTRACT.rootByVariantKey['button/primary/lg/idle'];

    // Live Pen readback shows master g3IC1 has no leading-icon descendant, so
    // an icon override must throw instead of claiming an unproven slot.
    expect(master?.descendants.leadingIcon).toBeUndefined();
    expect(() =>
      normalizeButtonPenRef({
        componentId: 'atom.button',
        variant: 'primary',
        size: 'lg',
        label: 'Download for Mac',
        leadingIcon: 'ArrowDownToLine',
      })
    ).toThrow(
      `Unsupported atom.button Pen override: button/primary/lg/idle master ${master?.rootId} has no leading-icon slot`
    );
  });

  it('fails closed for selections without a source-backed Pen master', () => {
    // The default primary/md selection has no mapped master; normalization
    // must throw instead of returning inert metadata on the primary master.
    expect(() =>
      normalizeButtonPenRef({ componentId: 'atom.button', label: 'Default' })
    ).toThrow(
      'Unsupported atom.button Pen selection: button/primary/md/idle has no source-backed master'
    );
    // Deprecated aliases normalize first, then resolve against the family map.
    expect(() =>
      normalizeButtonPenRef({
        componentId: 'atom.button',
        label: 'Delete',
        variant: 'destructive',
        size: 'hero',
      })
    ).toThrow(
      'Unsupported atom.button Pen selection: button/primary/lg/destructive has no source-backed master'
    );
  });

  it('normalizes deprecated aliases before resolving the exact master', () => {
    const normalized = normalizeButtonPenRef({
      componentId: 'atom.button',
      label: 'Get started',
      variant: 'whitePill',
      size: 'xl',
    });
    expect(normalized.variantKey).toBe('button/primary/lg/idle');
    expect(normalized.variant).toEqual({
      destructive: 'false',
      size: 'lg',
      variant: 'primary',
    });
    expect(normalized.ref).toBe(
      BUTTON_PEN_CONTRACT.rootByVariantKey['button/primary/lg/idle']?.rootId
    );
  });

  it('keeps two production CTAs on one Button master with label overrides', () => {
    for (const fixture of BUTTON_PEN_PROPAGATION_FIXTURES) {
      expect(hasSourceBackedButtonFixture(fixture), fixture.route).toBe(true);
    }

    const refs = BUTTON_PEN_PROPAGATION_FIXTURES.map(fixture =>
      normalizeButtonPenRef({ componentId: 'atom.button', ...fixture })
    );

    expect(new Set(refs.map(ref => ref.ref))).toEqual(
      new Set([
        BUTTON_PEN_CONTRACT.rootByVariantKey['button/primary/lg/idle']?.rootId,
      ])
    );
    expect(
      refs.map(
        ref =>
          ref.overrides.find(override => override.property === 'content')?.value
      )
    ).toEqual(['Download for Mac', 'Get started']);
    // Both instances carry only their independent label override; neither
    // claims a leading-icon slot the Pen master does not expose.
    expect(refs[0]?.overrides).toHaveLength(1);
    expect(refs[1]?.overrides).toHaveLength(1);
  });
});
